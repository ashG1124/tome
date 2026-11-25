import { Logger } from '@nestjs/common';
import type { Node } from '@tome/shared';
import type {
  AiImage,
  AiProvider,
  AiResult,
  AnalyzeResult,
  ImageInput,
  InputCheck,
  StageInput,
} from '../ai-provider';
import {
  estimateInputGuardNeurons,
  IMAGE_STAGE_BUDGET_MS,
  INPUT_GUARD_BUDGET_MS,
  MODELS,
  STAGE_BUDGET_MS,
} from '../models';
import { evaluateStage, OutputViolation, type TextStage } from './normalize';
import { STAGE1_PROMPT, STAGE2_PROMPT, STAGE3_PROMPT, STAGE4_PROMPT } from './prompts';
import { JSON_SCHEMAS } from './raw-schemas';
import {
  CallFailure,
  type PlanStep,
  runPlan,
  type RunLog,
  type RunResult,
  type StepOutcome,
} from './runner';

export interface WorkersAiOptions {
  accountId: string;
  apiToken: string;
  /** 테스트용 가짜 fetch. 기본은 Node 내장 fetch. */
  fetch?: typeof fetch;
  /** 한 단계의 전체 시간 예산(ms). 기본 25초. 주면 그림 단계 예산도 이 값이 된다(테스트용). */
  stageBudgetMs?: number;
  /** 그림 단계의 전체 시간 예산(ms). 기본 50초(#222). */
  imageBudgetMs?: number;
  /** 입력 안전 검사 1회의 시간 제한(ms). 기본 5초. */
  guardBudgetMs?: number;
  /** 호출 기록(단계·모델·상태·지연·폴백 여부만). 기본은 Nest 로거. */
  log?: (entry: RunLog) => void;
}

const SYSTEM_PROMPTS: Record<TextStage, string> = {
  analyze: STAGE1_PROMPT,
  research: STAGE2_PROMPT,
  evidence: STAGE3_PROMPT,
  draft: STAGE4_PROMPT,
};
const STAGE_NUMBER: Record<TextStage, number> = { analyze: 1, research: 2, evidence: 3, draft: 4 };

const MAX_TOKENS = 2048;
const IMAGE_SIZE = 1024;
/** flux-1-schnell 의 prompt 상한(모델 입력 스키마 기준). */
const SCHNELL_PROMPT_MAX = 2048;
const KLEIN_PROMPT_MAX = 2048;

/**
 * 안전 필터 거부로 보는 응답 오류 메시지. Workers AI 이미지 모델은 필터에 걸리면 4xx 와
 * 함께 NSFW·safety 류 문구를 담은 errors[].message 를 돌려준다(S1 실측에서 같은 패턴을 썼다).
 * 응답의 오류 메시지에만 적용하며, 사용자 입력에는 쓰지 않는다.
 */
const SAFETY_MESSAGE = /nsfw|safety|unsafe|flagged|blocked/i;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/** 이미지 바이트를 시그니처로 판별한다. 둘 다 아니면 null. */
export function sniffImageType(bytes: Uint8Array): AiImage['mimeType'] | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(PNG_SIGNATURE)) return 'image/png';
  if (starts(JPEG_SIGNATURE)) return 'image/jpeg';
  return null;
}

function stripFence(content: string): string {
  const match = content.trim().match(/^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```\s*$/);
  return match ? match[1]!.trim() : content.trim();
}

function neuronsOf(res: Response): number | undefined {
  const header = res.headers.get('cf-ai-neurons');
  if (header === null) return undefined;
  const n = Number(header);
  return Number.isFinite(n) ? n : undefined;
}

/** 응답 본문에서 오류 메시지들만 뽑는다. */
function errorMessages(text: string): string {
  try {
    const json = JSON.parse(text) as { errors?: Array<{ message?: unknown }> };
    return (json.errors ?? [])
      .map((e) => (typeof e.message === 'string' ? e.message : ''))
      .join(' ');
  } catch {
    return '';
  }
}

function httpFailure(status: number, text: string, neurons?: number): CallFailure {
  const kind = SAFETY_MESSAGE.test(errorMessages(text)) ? 'safety' : 'unavailable';
  return new CallFailure(kind, { status, ...(neurons === undefined ? {} : { neurons }) });
}

export class WorkersAiProvider implements AiProvider {
  readonly name = 'workers-ai';
  private readonly fetchImpl: typeof fetch;
  private readonly budgetMs: number;
  private readonly imageBudgetMs: number;
  private readonly guardBudgetMs: number;
  private readonly logEntry: (entry: RunLog) => void;
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor(options: WorkersAiOptions) {
    this.accountId = options.accountId;
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.budgetMs = options.stageBudgetMs ?? STAGE_BUDGET_MS;
    this.imageBudgetMs = options.imageBudgetMs ?? options.stageBudgetMs ?? IMAGE_STAGE_BUDGET_MS;
    this.guardBudgetMs = options.guardBudgetMs ?? INPUT_GUARD_BUDGET_MS;
    const logger = new Logger('WorkersAi');
    this.logEntry =
      options.log ??
      ((e) =>
        logger.log(
          `stage=${e.stage} model=${e.model} status=${e.status ?? '-'} ms=${e.ms} outcome=${e.outcome} fallback=${e.fallbackUsed}`,
        ));
  }

  // ---- 텍스트 단계 ----

  async analyze(input: StageInput): Promise<AiResult<AnalyzeResult>> {
    const run = await this.runText('analyze', input);
    return this.wrap(run, {
      subjectTemplate: run.value.subjectTemplate!,
      nodes: run.value.nodes,
    });
  }

  async research(input: StageInput): Promise<AiResult<Node[]>> {
    const run = await this.runText('research', input);
    return this.wrap(run, run.value.nodes);
  }

  async evidence(input: StageInput): Promise<AiResult<Node[]>> {
    const run = await this.runText('evidence', input);
    return this.wrap(run, run.value.nodes);
  }

  async draft(input: StageInput): Promise<AiResult<Node[]>> {
    const run = await this.runText('draft', input);
    return this.wrap(run, run.value.nodes);
  }

  private wrap<T>(run: RunResult<unknown>, value: T): AiResult<T> {
    return {
      value,
      provider: 'workers-ai',
      model: run.model,
      fallbackUsed: run.fallbackUsed,
      ...(run.neurons === undefined ? {} : { neurons: run.neurons }),
    };
  }

  private runText(stage: TextStage, input: StageInput) {
    const user = buildUserMessage(stage, input);
    const prior = input.nodes;
    const step = (model: string): PlanStep<ReturnType<typeof evaluateStage>> => ({
      model,
      call: (signal) => this.callText(model, stage, user, prior, signal),
    });
    // 1순위(gemma) → 1순위 재시도 → 예비(glm)
    return runPlan(
      [step(MODELS.textPrimary), step(MODELS.textPrimary), step(MODELS.textFallback)],
      { stage, budgetMs: this.budgetMs, log: this.logEntry },
    );
  }

  private async callText(
    model: string,
    stage: TextStage,
    user: string,
    prior: readonly Node[],
    signal: AbortSignal,
  ): Promise<StepOutcome<ReturnType<typeof evaluateStage>>> {
    const isQwen = isQwenModel(model);
    const body: Record<string, unknown> = {
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[stage] },
        { role: 'user', content: isQwen ? `${user}\n\n/no_think` : user },
      ],
      max_tokens: MAX_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: `stage${STAGE_NUMBER[stage]}`,
          strict: true,
          schema: JSON_SCHEMAS[stage],
        },
      },
    };
    if (!isQwen) body.chat_template_kwargs = { enable_thinking: false };

    return this.request(
      signal,
      model,
      { 'content-type': 'application/json' },
      JSON.stringify(body),
      async (res, neurons) => {
        const text = await res.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new CallFailure('output', { status: res.status, neurons });
        }
        const failure = (kind: 'output' | 'safety' | 'unavailable') =>
          new CallFailure(kind, {
            status: res.status,
            ...(neurons === undefined ? {} : { neurons }),
          });
        const envelope = json as {
          success?: boolean;
          errors?: unknown;
          result?: {
            response?: unknown;
            choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
          };
        };
        if (envelope.success === false) {
          throw failure(SAFETY_MESSAGE.test(errorMessages(text)) ? 'safety' : 'unavailable');
        }
        const choice = envelope.result?.choices?.[0];
        if (choice?.finish_reason === 'length') throw failure('output');
        // 응답 본문은 choices[0].message.content 이거나 result.response 이고, 문자열이거나 이미 객체다.
        const content = choice?.message?.content ?? envelope.result?.response;
        let raw: unknown = content;
        if (typeof content === 'string') {
          try {
            raw = JSON.parse(stripFence(content));
          } catch {
            throw failure('output');
          }
        }
        if (raw === null || typeof raw !== 'object') throw failure('output');
        try {
          const evaluated = evaluateStage(stage, raw, prior);
          return {
            value: evaluated,
            soft: evaluated.axisFixes > 0,
            status: res.status,
            ...(neurons === undefined ? {} : { neurons }),
          };
        } catch (error) {
          if (error instanceof OutputViolation) throw failure('output');
          throw error;
        }
      },
    );
  }

  // ---- 입력 안전 검사 ----

  /**
   * Llama Guard 를 1회 부른다(재시도 없음). 네트워크 오류·비200·해석 불가·시간 초과면
   * 던지지 않고 safe 로 통과시키며, 기록에는 모델·상태·지연·사유 코드만 남긴다(프롬프트 원문 금지).
   */
  async checkInput(text: string): Promise<AiResult<InputCheck>> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.guardBudgetMs);
    let status: number | undefined;
    let neurons: number | undefined;
    let verdict: InputCheck | null = null;
    let reason = 'ok';
    try {
      const res = await this.fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${MODELS.inputGuard}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiToken}`,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: text }],
            temperature: 0,
            max_tokens: 32,
          }),
          signal: controller.signal,
        },
      );
      status = res.status;
      // 응답이 왔으면 비용이 든 것으로 본다(헤더가 없으면 추정).
      neurons = neuronsOf(res) ?? estimateInputGuardNeurons(text.length);
      if (res.status !== 200) {
        reason = 'http';
      } else {
        verdict = parseGuardResponse(await res.text());
        if (verdict === null) reason = 'unparseable';
      }
    } catch {
      reason = controller.signal.aborted ? 'timeout' : 'unavailable';
    } finally {
      clearTimeout(timer);
    }
    this.logEntry({
      stage: 'input-safety',
      model: MODELS.inputGuard,
      ...(status === undefined ? {} : { status }),
      ms: Date.now() - started,
      outcome: verdict ? 'ok' : `failed:${reason}`,
      fallbackUsed: false,
    });
    return {
      value: verdict ?? { safe: true, categories: [] },
      provider: 'workers-ai',
      model: MODELS.inputGuard,
      fallbackUsed: false,
      ...(neurons === undefined ? {} : { neurons }),
    };
  }

  // ---- 이미지 ----

  async image(input: ImageInput): Promise<AiResult<AiImage>> {
    const klein = (): PlanStep<AiImage> => ({
      model: MODELS.imagePrimary,
      call: (signal) => this.callKlein(input, signal),
    });
    const plan: PlanStep<AiImage>[] =
      input.mode === 'edit'
        ? [klein(), klein()] // 편집: 재시도 1회, 폴백 없음
        : [
            klein(),
            klein(),
            {
              model: MODELS.imageFallback,
              call: (signal) => this.callSchnell(input.assembledPrompt, signal),
            },
          ];
    const run = await runPlan(plan, {
      stage: 'image',
      budgetMs: this.imageBudgetMs,
      log: this.logEntry,
    });
    return this.wrap(run, run.value);
  }

  private callKlein(input: ImageInput, signal: AbortSignal): Promise<StepOutcome<AiImage>> {
    const edit = input.mode === 'edit';
    const form = new FormData();
    form.append(
      'prompt',
      (edit ? (input.editInstruction ?? '') : input.assembledPrompt).slice(0, KLEIN_PROMPT_MAX),
    );
    form.append('width', String(IMAGE_SIZE));
    form.append('height', String(IMAGE_SIZE));
    if (edit && input.baseImage) {
      form.append('input_image_0', new Blob([input.baseImage], { type: 'image/png' }), 'base.png');
    }
    // Content-Type(boundary 포함)은 fetch 가 FormData 에서 만든다.
    return this.request(signal, MODELS.imagePrimary, {}, form, readImage);
  }

  private callSchnell(prompt: string, signal: AbortSignal): Promise<StepOutcome<AiImage>> {
    // seed 를 보내면 400 이 난다. 보내지 않는다.
    const body = JSON.stringify({ prompt: prompt.slice(0, SCHNELL_PROMPT_MAX), steps: 4 });
    return this.request(
      signal,
      MODELS.imageFallback,
      { 'content-type': 'application/json' },
      body,
      readImage,
    );
  }

  // ---- HTTP ----

  /** 한 번 호출한다. 비200·네트워크 오류·시간 초과는 CallFailure 로 바꿔 던진다. */
  private async request<T>(
    signal: AbortSignal,
    model: string,
    headers: Record<string, string>,
    body: string | FormData,
    handle: (res: Response, neurons: number | undefined) => Promise<StepOutcome<T>>,
  ): Promise<StepOutcome<T>> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { ...headers, authorization: `Bearer ${this.apiToken}` },
        body,
        signal,
      });
    } catch {
      throw new CallFailure(signal.aborted ? 'timeout' : 'unavailable');
    }
    const neurons = neuronsOf(res);
    try {
      if (res.status !== 200) {
        throw httpFailure(res.status, await res.text().catch(() => ''), neurons);
      }
      return await handle(res, neurons);
    } catch (error) {
      if (error instanceof CallFailure) throw error;
      // 본문을 읽다가 끊긴 경우 등
      throw new CallFailure(signal.aborted ? 'timeout' : 'unavailable', { status: res.status });
    }
  }
}

/** 안전 검사 응답의 result.response(객체 또는 문자열)를 해석한다. 해석할 수 없으면 null. */
export function parseGuardResponse(text: string): InputCheck | null {
  let json: { success?: unknown; result?: { response?: unknown } };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    return null;
  }
  if (json === null || typeof json !== 'object' || json.success === false) return null;
  const response = json.result?.response;
  if (response !== null && typeof response === 'object') {
    const { safe, categories } = response as { safe?: unknown; categories?: unknown };
    if (typeof safe !== 'boolean') return null;
    return {
      safe,
      categories: Array.isArray(categories)
        ? categories.filter((c): c is string => typeof c === 'string')
        : [],
    };
  }
  if (typeof response !== 'string') return null;
  const [first = '', ...rest] = response.trim().split(/\r?\n/);
  const head = first.trim().toLowerCase();
  if (head === 'safe') return { safe: true, categories: [] };
  if (head !== 'unsafe') return null;
  const categories = rest
    .join(',')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^S\d{1,2}$/.test(c));
  return { safe: false, categories };
}

/** 이미지 응답: JSON 의 result.image(base64) 이거나 이미지 바이너리. */
async function readImage(
  res: Response,
  neurons: number | undefined,
): Promise<StepOutcome<AiImage>> {
  const extra = neurons === undefined ? {} : { neurons };
  const bad = (kind: 'output' | 'safety' | 'unavailable') =>
    new CallFailure(kind, { status: res.status, ...extra });
  let bytes: Uint8Array;
  if (/^image\//i.test(res.headers.get('content-type') ?? '')) {
    bytes = new Uint8Array(await res.arrayBuffer());
  } else {
    const text = await res.text();
    let json: { success?: boolean; result?: { image?: unknown } };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw bad('output');
    }
    if (json.success === false) {
      throw bad(SAFETY_MESSAGE.test(errorMessages(text)) ? 'safety' : 'unavailable');
    }
    const image = json.result?.image;
    if (typeof image !== 'string' || image === '') throw bad('output');
    bytes = new Uint8Array(Buffer.from(image, 'base64'));
  }
  const mimeType = sniffImageType(bytes);
  if (!mimeType) throw bad('output');
  return { value: { mimeType, bytes }, status: res.status, ...extra };
}

/** qwen 계열만 `/no_think` 를 붙이고 chat_template_kwargs 를 빼는 방식을 쓴다. */
export function isQwenModel(model: string): boolean {
  return model.startsWith('@cf/qwen/');
}

/** 단계별 user 메시지: 원문 + 앞 단계 출력(JSON). */
export function buildUserMessage(stage: TextStage, input: StageInput): string {
  const parts = [`User request:\n${input.prompt}`];
  const enabled = input.nodes.filter((n) => n.enabled);
  const of = (kind: Node['kind']) => enabled.filter((n) => n.kind === kind);
  if (stage !== 'analyze') {
    const stage1 = {
      keywords: of('keyword').map((n) => ({ id: n.id, text: n.text, weight: n.weight ?? 5 })),
    };
    const prior: Record<string, unknown> = { stage1 };
    if (stage !== 'research') {
      prior.stage2 = {
        data_types: of('dataType').map((n) => n.text),
        priorities: of('priority')
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((n) => ({ id: n.id, text: n.text, parent_ids: n.parentIds })),
      };
    }
    if (stage === 'draft') {
      prior.stage3 = {
        evidence: of('evidence').map((n) => ({ id: n.id, text: n.text, parent_ids: n.parentIds })),
      };
    }
    parts.push(`Earlier stage outputs (JSON):\n${JSON.stringify(prior)}`);
  }
  return parts.join('\n\n');
}
