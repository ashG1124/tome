import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type AdvanceJobResponse,
  type JobStage,
  type Node,
  NodeSchema,
  NodeSnapshotSchema,
  VerificationSchema,
} from '@tome/shared';
import { AI_PROVIDER, type AiProvider, type AiResult } from '../../ai';
import { AppError } from '../../common';
import type { Prisma } from '../../generated/prisma/client';
import { OBJECT_STORAGE, type ObjectStorage, answerImageKey, makeThumbnail } from '../../storage';
import type { AuthContext } from '../session/auth.decorators';
import { assemblePrompt } from './assemble';
import { toAnswer, toJob, toStepResponse, type TextStepOutput } from './generation.mappers';
import { GenerationRepository, type JobRow, type StepRow } from './generation.repository';
import { LEASE_MS, MAX_STEP_ATTEMPTS, nextStageOf } from './stages';
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

const metaOf = (result: AiResult<unknown>) => ({
  provider: result.provider,
  model: result.model,
  fallbackUsed: result.fallbackUsed,
  neuronsEst: result.neurons ?? null,
});

@Injectable()
export class AdvanceService {
  constructor(
    private readonly repo: GenerationRepository,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

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
      const result = await this.execute(auth, job, stage);
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

  /** analyze~draft 중 앞 단계까지 succeeded 인 노드 누적. */
  private collectNodes(job: JobRow, upTo: readonly JobStage[]): Node[] {
    return upTo.flatMap((stage) => this.outputOf(job, stage).nodes);
  }

  private async execute(auth: AuthContext, job: JobRow, stage: JobStage): Promise<StageResult> {
    switch (stage) {
      case 'analyze':
      case 'research':
      case 'evidence':
      case 'draft':
        return this.runText(job, stage);
      case 'assemble':
        return this.runAssemble(job);
      case 'image':
        return this.runImage(auth, job);
      case 'verify':
        return this.runVerify(job);
    }
  }

  private async runText(
    job: JobRow,
    stage: 'analyze' | 'research' | 'evidence' | 'draft',
  ): Promise<StageResult> {
    const before = (['analyze', 'research', 'evidence', 'draft'] as const).slice(
      0,
      ['analyze', 'research', 'evidence', 'draft'].indexOf(stage),
    );
    const prior = this.collectNodes(job, before);
    const input = { prompt: job.set.prompt, nodes: prior };

    const output: TextStepOutput = { nodes: [] };
    let meta: AiResult<unknown>;
    if (stage === 'analyze') {
      const result = await this.ai.analyze(input);
      const { subjectTemplate, nodes } = result.value;
      if (typeof subjectTemplate !== 'string' || subjectTemplate.trim() === '') {
        throw new AppError('AI_OUTPUT_INVALID');
      }
      output.nodes = nodes;
      output.subjectTemplate = subjectTemplate;
      meta = result;
    } else {
      const result = await this.ai[stage](input);
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

  private runAssemble(job: JobRow): StageResult {
    const nodes = this.collectNodes(job, ['analyze', 'research', 'evidence', 'draft']);
    const { subjectTemplate } = this.outputOf(job, 'analyze');
    return {
      output: asJson(assemblePrompt(subjectTemplate ?? '', nodes)),
      ...NO_AI,
    };
  }

  private async runImage(auth: AuthContext, job: JobRow): Promise<StageResult> {
    const nodes = this.collectNodes(job, ['analyze', 'research', 'evidence', 'draft']);
    const { subjectTemplate } = this.outputOf(job, 'analyze');
    const assembled = job.steps.find((s) => s.stage === 'assemble' && s.status === 'succeeded');
    const { assembledPrompt, phrases, excluded } = (assembled?.output ?? {}) as {
      assembledPrompt?: string;
      phrases?: unknown;
      excluded?: unknown;
    };
    if (assembledPrompt === undefined) throw new AppError('INTERNAL');

    const snapshot = NodeSnapshotSchema.safeParse({
      schemaVersion: 1,
      subjectTemplate: subjectTemplate ?? '',
      nodes,
    });
    if (!snapshot.success) throw new AppError('AI_OUTPUT_INVALID');

    const generated = await this.ai.image({ assembledPrompt, mode: 'generate' });
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
      if (result.answer) {
        // 그 사이 취소된 job 의 답변은 서가에 보이지 않게 discarded 로 둔다(번호도 쓰지 않는다).
        const number = active ? (await this.repo.maxAcceptedNumber(tx, job.setId)) + 1 : null;
        await this.repo.createAnswer(tx, {
          ...result.answer.data,
          status: active ? 'accepted' : 'discarded',
          number,
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
