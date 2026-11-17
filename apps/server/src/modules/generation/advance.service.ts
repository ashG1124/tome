import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AdvanceJobResponse,
  type JobStage,
  type Node,
  NodeSchema,
  PhrasesSchema,
  type Phrases,
  type NodeSnapshot,
  NodeSnapshotSchema,
  VerificationSchema,
} from '@tome/shared';
import { AI_PROVIDER, type AiProvider, type AiResult } from '../../ai';
import { AppError } from '../../common';
import type { Prisma } from '../../generated/prisma/client';
import type { SampleResult } from '../../generated/prisma/client';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  answerImageKey,
  makeEditBase,
  makeThumbnail,
} from '../../storage';
import type { AuthContext } from '../session/auth.decorators';
import { UsageService } from '../usage/usage.service';
import { emptyTally, estimateNeurons, matchPreset, type UsageTally } from '../usage/usage.rules';
import { assemblePrompt } from './assemble';
import { editInstruction } from './edit-instruction';
import { toAnswer, toJob, toStepResponse, type TextStepOutput } from './generation.mappers';
import { GenerationRepository, type JobRow, type StepRow } from './generation.repository';
import { LEASE_MS, MAX_STEP_ATTEMPTS, nextStageOf, stageIndex } from './stages';
import { buildVerification } from './verify';

interface StageResult {
  output: Prisma.InputJsonValue;
  provider: string | null;
  model: string | null;
  fallbackUsed: boolean;
  neuronsEst: number | null;
  /** image 단계에서 같이 저장할 답변 */
  answer?: { id: string; data: Prisma.AnswerUncheckedCreateInput };
  /** verify 단계에서 검증을 붙일 답변 */
  verifyAnswerId?: string;
}

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

/** assemble·verify 처럼 AI 를 부르지 않은 단계의 메타. */
const NO_AI = { provider: null, model: null, fallbackUsed: false, neuronsEst: null } as const;

/** 대체 결과로 채운 단계의 메타. 사용량에 세지 않는다. */
const SAMPLE_META = {
  provider: 'sample',
  model: 'sample',
  fallbackUsed: false,
  neuronsEst: 0,
} as const;

/** 한도 확인과 사용량 집계 대상(AI 를 부르는 단계). */
const AI_STAGES: readonly JobStage[] = ['analyze', 'research', 'evidence', 'draft', 'image'];

/** 재시도·폴백 뒤에도 실패했을 때 대체 결과로 메울 수 있는 오류. SAFETY_BLOCKED 는 대체하지 않는다. */
const SAMPLE_FALLBACK_CODES: readonly string[] = [
  'AI_UNAVAILABLE',
  'AI_TIMEOUT',
  'AI_OUTPUT_INVALID',
];

const metaOf = (result: AiResult<unknown>) => ({
  provider: result.provider,
  model: result.model,
  fallbackUsed: result.fallbackUsed,
  // 헤더 값이 없으면 사용량 집계와 같은 모델별 추정값을 남긴다(mock 은 비용이 없어 그대로 비움).
  neuronsEst:
    result.neurons ??
    (result.provider === 'mock' ? null : estimateNeurons(result.provider, result.model)),
});

@Injectable()
export class AdvanceService {
  constructor(
    private readonly repo: GenerationRepository,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly usage: UsageService,
  ) {}

  private readonly logger = new Logger(AdvanceService.name);

  /** 세트가 프리셋 문장 그대로일 때만 그 프리셋의 대체 결과를 돌려준다. */
  private async findSampleFor(job: JobRow): Promise<SampleResult | null> {
    // 편집 재생성은 프리셋 원문 그대로가 아니므로 대체 결과를 쓰지 않는다.
    if (job.kind === 'revise') return null;
    const key = matchPreset(job.set.presetKey, job.set.prompt);
    return key === null ? null : this.usage.findSample(key);
  }

  /** 사용량 기록 실패가 사용자 요청을 깨뜨리지 않게 한다(이미 나간 호출 비용은 로그로만 남긴다). */
  private async recordUsage(tally: UsageTally): Promise<void> {
    try {
      await this.usage.record(tally);
    } catch {
      this.logger.error('usage record failed');
    }
  }

  async advance(auth: AuthContext, jobId: string, stage: JobStage): Promise<AdvanceJobResponse> {
    const job = await this.repo.findJob(this.repo.client, jobId);
    if (
      !job ||
      job.project.ownerId !== auth.creatorId ||
      job.project.deletedAt !== null ||
      job.project.hiddenAt !== null
    ) {
      throw new AppError('NOT_FOUND');
    }

    // 이미 끝난 단계는 job 상태와 상관없이 저장된 결과를 그대로 돌려준다.
    const done = job.steps.find((s) => s.stage === stage && s.status === 'succeeded');
    if (done) return this.replay(job.id, done);

    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
      throw new AppError('JOB_CLOSED');
    }
    if (stage !== job.nextStage) {
      throw new AppError('STAGE_OUT_OF_ORDER', undefined, { expected: job.nextStage });
    }

    // AI 를 부르는 단계는 실행 전에 상한을 본다. 이미 대체 결과로 채우는 job 은 AI 를 안 부르므로 건너뛴다.
    let sample: SampleResult | null = null;
    const sampleMode = job.steps.some((s) => s.status === 'succeeded' && s.provider === 'sample');
    if (sampleMode) {
      sample = await this.findSampleFor(job);
      if (!sample) throw new AppError('INTERNAL');
    } else if (AI_STAGES.includes(stage)) {
      const limit = (await this.usage.checkLimits()).code;
      if (limit) {
        sample = await this.findSampleFor(job);
        if (!sample) throw new AppError(limit);
      }
    }

    const startedAt = new Date();
    const claim = await this.repo.claimStep(
      job.id,
      stage,
      startedAt,
      new Date(startedAt.getTime() + LEASE_MS),
    );
    if (claim.kind === 'succeeded') return this.replay(job.id, claim.step!);
    if (claim.kind === 'busy') {
      throw new AppError('STEP_IN_PROGRESS', undefined, { retryAfterMs: claim.retryAfterMs });
    }
    await this.repo.markJobRunning(job.id);

    // 요청 연결(abort)과 분리: 여기서 끝까지 실행·저장한다. 클라이언트가 끊겨도 멈추지 않는다.
    try {
      const result = await this.executeOrSample(auth, job, stage, sample);
      await this.save(job, stage, result, startedAt);
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'AI_UNAVAILABLE';
      const now = new Date();
      await this.repo.failStep(job.id, stage, code, now, now.getTime() - startedAt.getTime());
      if ((claim.attempt ?? 1) >= MAX_STEP_ATTEMPTS) await this.repo.failJob(job.id, code, now);
      if (error instanceof AppError) throw error;
      throw new AppError('AI_UNAVAILABLE');
    }

    const fresh = (await this.repo.findJob(this.repo.client, job.id))!;
    const step = fresh.steps.find((s) => s.stage === stage)!;
    return this.respond(fresh, step);
  }

  private replay(jobId: string, step: StepRow): Promise<AdvanceJobResponse> {
    return this.repo.findJob(this.repo.client, jobId).then((job) => this.respond(job!, step));
  }

  private async respond(job: JobRow, step: StepRow): Promise<AdvanceJobResponse> {
    let answer;
    if (step.stage === 'image' && step.status === 'succeeded') {
      const answerId = (step.output as { answerId?: string } | null)?.answerId;
      const row = answerId ? await this.repo.findAnswer(this.repo.client, answerId) : null;
      if (row) answer = toAnswer(row);
    }
    return { job: toJob(job), step: toStepResponse(step, answer ? { answer } : {}) };
  }

  // ---- 단계 실행 ----

  private outputOf(job: JobRow, stage: JobStage): TextStepOutput {
    const step = job.steps.find((s) => s.stage === stage && s.status === 'succeeded');
    if (!step?.output) throw new AppError('INTERNAL');
    return step.output as unknown as TextStepOutput;
  }

  /** revise job 이 요청한 노드 스냅샷(저장할 때 이미 검증한 값). */
  private requestedSnapshot(job: JobRow): NodeSnapshot | null {
    if (job.kind !== 'revise') return null;
    const parsed = NodeSnapshotSchema.safeParse(job.requestedNodes);
    if (!parsed.success) throw new AppError('INTERNAL');
    return parsed.data;
  }

  /** analyze~draft 중 앞 단계까지의 노드 누적. revise 는 시작 단계 앞 단계를 요청 노드에서 가져온다. */
  private collectNodes(job: JobRow, upTo: readonly JobStage[]): Node[] {
    const requested = this.requestedSnapshot(job);
    return upTo.flatMap((stage) =>
      requested && stageIndex(stage) < stageIndex(job.startStage)
        ? requested.nodes.filter((n) => n.stage === stage)
        : this.outputOf(job, stage).nodes,
    );
  }

  private subjectTemplateOf(job: JobRow): string {
    const requested = this.requestedSnapshot(job);
    if (requested) return requested.subjectTemplate;
    return this.outputOf(job, 'analyze').subjectTemplate ?? '';
  }

  /**
   * 대체 결과를 쓰기로 했으면 그 값으로 채운다. 아니면 AI 단계를 실행하고, 재시도·폴백 뒤에도
   * 실패하면(SAFETY_BLOCKED 제외) 프리셋 그대로인 세트에 한해 대체 결과로 메운다.
   */
  private async executeOrSample(
    auth: AuthContext,
    job: JobRow,
    stage: JobStage,
    sample: SampleResult | null,
  ): Promise<StageResult> {
    if (sample) return this.executeSample(auth, job, stage, sample);

    const tally = emptyTally(stage === 'image' ? 'image' : 'text');
    let result: StageResult | null = null;
    let failure: unknown;
    try {
      result = await this.execute(auth, job, stage, tally);
    } catch (error) {
      failure = error;
    }
    // AI 를 이미 부른 뒤라면 성공이든 실패든 비용이 나갔다.
    await this.recordUsage(tally);
    if (result) return result;

    if (failure instanceof AppError && SAMPLE_FALLBACK_CODES.includes(failure.code)) {
      const fallback = await this.findSampleFor(job);
      if (fallback) return this.executeSample(auth, job, stage, fallback);
    }
    throw failure;
  }

  private async execute(
    auth: AuthContext,
    job: JobRow,
    stage: JobStage,
    tally: UsageTally,
  ): Promise<StageResult> {
    switch (stage) {
      case 'analyze':
      case 'research':
      case 'evidence':
      case 'draft':
        return this.runText(job, stage, tally);
      case 'assemble':
        return this.runAssemble(job);
      case 'image':
        return this.runImage(auth, job, tally);
      case 'verify':
        return this.runVerify(job);
    }
  }

  // ---- 대체 결과 ----

  private executeSample(
    auth: AuthContext,
    job: JobRow,
    stage: JobStage,
    sample: SampleResult,
  ): StageResult {
    const snapshot = NodeSnapshotSchema.safeParse(sample.nodes);
    if (!snapshot.success) throw new AppError('INTERNAL');
    const snap = snapshot.data;
    switch (stage) {
      case 'analyze':
      case 'research':
      case 'evidence':
      case 'draft': {
        const nodes = snap.nodes.filter((n) => n.stage === stage);
        if (nodes.length === 0) throw new AppError('INTERNAL');
        const output: TextStepOutput = { nodes };
        if (stage === 'analyze') output.subjectTemplate = snap.subjectTemplate;
        return { output: asJson(output), ...SAMPLE_META };
      }
      case 'assemble':
        return {
          output: asJson(assemblePrompt(snap.subjectTemplate, snap.nodes)),
          ...SAMPLE_META,
        };
      case 'image':
        return this.sampleImage(auth, job, sample, snap);
      case 'verify': {
        if (!job.resultAnswerId) throw new AppError('INTERNAL');
        const parsed =
          sample.verification === null ? null : VerificationSchema.safeParse(sample.verification);
        const verification = parsed?.success
          ? parsed.data
          : VerificationSchema.parse(buildVerification(snap.nodes));
        return {
          output: asJson({ verification }),
          ...SAMPLE_META,
          verifyAnswerId: job.resultAnswerId,
        };
      }
    }
  }

  /** 새 이미지를 올리지 않고 대체 결과의 이미지 키를 그대로 가리키는 답변을 만든다. */
  private sampleImage(
    auth: AuthContext,
    job: JobRow,
    sample: SampleResult,
    snap: ReturnType<typeof NodeSnapshotSchema.parse>,
  ): StageResult {
    const assembled = job.steps.find((s) => s.stage === 'assemble' && s.status === 'succeeded');
    const { assembledPrompt, phrases, excluded } = (assembled?.output ?? {}) as {
      assembledPrompt?: string;
      phrases?: unknown;
      excluded?: unknown;
    };
    if (assembledPrompt === undefined) throw new AppError('INTERNAL');
    const id = randomUUID();
    return {
      output: { answerId: id },
      ...SAMPLE_META,
      answer: {
        id,
        data: {
          id,
          setId: job.setId,
          status: 'accepted',
          number: null,
          origin: 'sample',
          imageMode: 'generate',
          imageKey: sample.imageKey,
          thumbKey: sample.thumbKey,
          assembledPrompt,
          phrases: asJson(phrases ?? {}),
          excluded: asJson(excluded ?? []),
          nodes: asJson(snap),
          verification: undefined,
          provider: 'sample',
          model: 'sample',
          isSample: true,
          sampleResultId: sample.id,
          createdById: auth.creatorId,
          jobId: job.id,
        },
      },
    };
  }

  private async runText(
    job: JobRow,
    stage: 'analyze' | 'research' | 'evidence' | 'draft',
    tally: UsageTally,
  ): Promise<StageResult> {
    const before = (['analyze', 'research', 'evidence', 'draft'] as const).slice(
      0,
      ['analyze', 'research', 'evidence', 'draft'].indexOf(stage),
    );
    const prior = this.collectNodes(job, before);
    const input = { prompt: job.set.prompt, nodes: prior };

    const output: TextStepOutput = { nodes: [] };
    let meta: AiResult<unknown>;
    // 공급자가 재시도·폴백 횟수를 알려 주지 않아 단계당 호출 1회로 센다.
    tally.called = true;
    tally.textCalls = 1;
    if (stage === 'analyze') {
      const result = await this.ai.analyze(input);
      this.tallyResult(tally, result);
      const { subjectTemplate, nodes } = result.value;
      if (typeof subjectTemplate !== 'string' || subjectTemplate.trim() === '') {
        throw new AppError('AI_OUTPUT_INVALID');
      }
      output.nodes = nodes;
      output.subjectTemplate = subjectTemplate;
      meta = result;
    } else {
      const result = await this.ai[stage](input);
      this.tallyResult(tally, result);
      output.nodes = result.value;
      meta = result;
    }

    const parsed = NodeSchema.array().safeParse(output.nodes);
    // 노드 0개는 실패로 보고 다시 시도한다. id 는 단계를 넘어서도 겹치면 안 된다.
    const ids = new Set([...prior, ...(parsed.success ? parsed.data : [])].map((n) => n.id));
    if (
      !parsed.success ||
      parsed.data.length === 0 ||
      ids.size !== prior.length + parsed.data.length
    ) {
      throw new AppError('AI_OUTPUT_INVALID');
    }
    output.nodes = parsed.data;
    return { output: asJson(output), ...metaOf(meta) };
  }

  private tallyResult(tally: UsageTally, result: AiResult<unknown>): void {
    if (result.fallbackUsed) tally.fallbackCount = 1;
    tally.neurons = estimateNeurons(result.provider, result.model, result.neurons);
  }

  private runAssemble(job: JobRow): StageResult {
    const nodes = this.collectNodes(job, ['analyze', 'research', 'evidence', 'draft']);
    const subjectTemplate = this.subjectTemplateOf(job);
    return {
      output: asJson(assemblePrompt(subjectTemplate, nodes)),
      ...NO_AI,
    };
  }

  private async runImage(auth: AuthContext, job: JobRow, tally: UsageTally): Promise<StageResult> {
    const nodes = this.collectNodes(job, ['analyze', 'research', 'evidence', 'draft']);
    const subjectTemplate = this.subjectTemplateOf(job);
    const assembled = job.steps.find((s) => s.stage === 'assemble' && s.status === 'succeeded');
    const { assembledPrompt, phrases, excluded } = (assembled?.output ?? {}) as {
      assembledPrompt?: string;
      phrases?: unknown;
      excluded?: unknown;
    };
    if (assembledPrompt === undefined) throw new AppError('INTERNAL');

    const snapshot = NodeSnapshotSchema.safeParse({
      schemaVersion: 1,
      subjectTemplate,
      nodes,
    });
    if (!snapshot.success) throw new AppError('AI_OUTPUT_INVALID');

    if (job.kind === 'revise') {
      return this.runEditImage(auth, job, {
        assembledPrompt,
        phrases: (phrases ?? {}) as Phrases,
        excluded,
        snapshot: snapshot.data,
        tally,
      });
    }

    tally.called = true;
    tally.imageCount = 1;
    const generated = await this.ai.image({ assembledPrompt, mode: 'generate' });
    this.tallyResult(tally, generated);
    const image = generated.value;
    // 원본은 받은 바이트 그대로, 썸네일은 긴 변 512px JPEG. 디코드할 수 없는 이미지는 출력 위반이다.
    let thumb: Uint8Array;
    try {
      thumb = await makeThumbnail(image.bytes);
    } catch {
      throw new AppError('AI_OUTPUT_INVALID');
    }
    const id = randomUUID();
    const imageKey = answerImageKey(id, 'full', image.mimeType);
    const thumbKey = answerImageKey(id, 'thumb');
    // 업로드 → DB 순서. DB 가 실패하면 객체만 남지만(고아) 허용한다.
    await this.storage.put(imageKey, image.bytes, image.mimeType);
    await this.storage.put(thumbKey, thumb, 'image/jpeg');

    return {
      output: { answerId: id },
      ...metaOf(generated),
      answer: {
        id,
        data: {
          id,
          setId: job.setId,
          status: 'accepted',
          number: null, // 저장할 때 정한다
          origin: 'generated',
          imageMode: 'generate',
          imageKey,
          thumbKey,
          assembledPrompt,
          phrases: asJson(phrases ?? {}),
          excluded: asJson(excluded ?? []),
          nodes: asJson(snapshot.data),
          verification: undefined,
          provider: generated.provider,
          model: generated.model,
          isSample: false,
          createdById: auth.creatorId,
          jobId: job.id,
        },
      },
    };
  }

  /**
   * revise 의 image 단계: base 이미지를 편집한다. 지시문이 비면 AI 를 부르지 않고 base 이미지를
   * 새 키로 복사해 쓴다(나중에 base 객체가 지워져도 이 답변은 그대로 보이도록).
   */
  private async runEditImage(
    auth: AuthContext,
    job: JobRow,
    built: {
      assembledPrompt: string;
      phrases: Phrases;
      excluded: unknown;
      snapshot: NodeSnapshot;
      tally: UsageTally;
    },
  ): Promise<StageResult> {
    const base = job.baseAnswerId
      ? await this.repo.findAnswer(this.repo.client, job.baseAnswerId)
      : null;
    if (!base) throw new AppError('INTERNAL');

    const edit = editInstruction(PhrasesSchema.parse(base.phrases), built.phrases);
    const id = randomUUID();
    let imageKey: string;
    let thumbKey: string;
    let meta: ReturnType<typeof metaOf> | typeof NO_AI;
    let provider: string;
    let model: string;

    if (edit.instruction === null) {
      const fullBytes = await this.storage.get(base.imageKey);
      const mimeType = base.imageKey.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
      imageKey = answerImageKey(id, 'full', mimeType);
      thumbKey = answerImageKey(id, 'thumb');
      const thumbBytes = base.thumbKey
        ? await this.storage.get(base.thumbKey)
        : await makeThumbnail(fullBytes);
      await this.storage.put(imageKey, fullBytes, mimeType);
      await this.storage.put(thumbKey, thumbBytes, 'image/jpeg');
      meta = NO_AI;
      provider = base.provider;
      model = base.model;
    } else {
      let baseImage: Uint8Array;
      try {
        baseImage = await makeEditBase(await this.storage.get(base.imageKey));
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('INTERNAL');
      }
      // 지시문이 있어 실제로 편집 호출을 하는 경우에만 사용량에 센다.
      built.tally.called = true;
      built.tally.imageCount = 1;
      const generated = await this.ai.image({
        assembledPrompt: built.assembledPrompt,
        mode: 'edit',
        baseImage,
        editInstruction: edit.instruction,
      });
      this.tallyResult(built.tally, generated);
      const image = generated.value;
      let thumb: Uint8Array;
      try {
        thumb = await makeThumbnail(image.bytes);
      } catch {
        throw new AppError('AI_OUTPUT_INVALID');
      }
      imageKey = answerImageKey(id, 'full', image.mimeType);
      thumbKey = answerImageKey(id, 'thumb');
      await this.storage.put(imageKey, image.bytes, image.mimeType);
      await this.storage.put(thumbKey, thumb, 'image/jpeg');
      meta = metaOf(generated);
      provider = generated.provider;
      model = generated.model;
    }

    return {
      output: { answerId: id },
      ...meta,
      answer: {
        id,
        data: {
          id,
          setId: job.setId,
          status: 'draft',
          number: null,
          origin: 'edited',
          baseAnswerId: base.id,
          imageMode: 'edit',
          imageKey,
          thumbKey,
          editInstruction: edit.instruction,
          assembledPrompt: built.assembledPrompt,
          phrases: asJson(built.phrases),
          excluded: asJson(built.excluded ?? []),
          nodes: asJson(built.snapshot),
          verification: undefined,
          provider,
          model,
          isSample: false,
          createdById: auth.creatorId,
          jobId: job.id,
        },
      },
    };
  }

  private runVerify(job: JobRow): StageResult {
    const nodes = this.collectNodes(job, ['analyze', 'research', 'evidence', 'draft']);
    const verification = VerificationSchema.parse(buildVerification(nodes));
    if (!job.resultAnswerId) throw new AppError('INTERNAL');
    return {
      output: asJson({ verification }),
      ...NO_AI,
      verifyAnswerId: job.resultAnswerId,
    };
  }

  // ---- 저장 ----

  private async save(
    job: JobRow,
    stage: JobStage,
    result: StageResult,
    startedAt: Date,
  ): Promise<void> {
    const now = new Date();
    await this.repo.transaction(async (tx) => {
      const active = await this.repo.completeStep(tx, {
        jobId: job.id,
        stage,
        output: result.output,
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        neuronsEst: result.neuronsEst,
        latencyMs: now.getTime() - startedAt.getTime(),
        now,
        nextStage: nextStageOf(stage),
        ...(result.answer ? { resultAnswerId: result.answer.id } : {}),
      });
      if (result.answer && job.kind === 'revise') {
        // 취소된 job 의 미리보기는 discarded. 살아 있으면 draft 로 두고 이전 draft 를 민다.
        await this.repo.createAnswer(tx, {
          ...result.answer.data,
          status: active ? 'draft' : 'discarded',
          number: null,
        });
        if (active) await this.repo.discardOtherDrafts(tx, job.setId, result.answer.id);
      } else if (result.answer) {
        // 그 사이 취소된 job 의 답변은 서가에 보이지 않게 discarded 로 둔다(번호도 쓰지 않는다).
        const number = active ? (await this.repo.maxAcceptedNumber(tx, job.setId)) + 1 : null;
        await this.repo.createAnswer(tx, {
          ...result.answer.data,
          status: active ? 'accepted' : 'discarded',
          number,
          acceptedAt: active ? now : null,
        });
      }
      if (result.verifyAnswerId) {
        const verification = (result.output as { verification: Prisma.InputJsonValue })
          .verification;
        await this.repo.setAnswerVerification(tx, result.verifyAnswerId, verification);
      }
    });
  }
}
