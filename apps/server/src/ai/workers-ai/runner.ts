import { AppError } from '../../common';

/**
 * 호출 한 번이 실패한 이유.
 * - output: 응답은 왔지만 쓸 수 없음(JSON 파싱·스키마·의미 위반, 길이 초과, 이미지 없음)
 * - timeout: 시간 예산 초과
 * - safety: 안전 필터 거부
 * - unavailable: 그 밖(네트워크 오류, 429, 5xx, 그 밖의 HTTP 오류)
 */
export type FailureKind = 'output' | 'timeout' | 'safety' | 'unavailable';

export class CallFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly detail: { status?: number; neurons?: number } = {},
  ) {
    // 메시지에는 종류만 넣는다(응답 원문·토큰이 새지 않게).
    super(`ai call failed: ${kind}`);
    this.name = 'CallFailure';
  }
}

export interface StepOutcome<T> {
  value: T;
  /** 축 이름만 틀린 출력처럼 "쓸 수는 있지만 한 번 더 시도해 볼" 결과. 마지막 시도라면 그대로 받아들인다. */
  soft?: boolean;
  status?: number;
  neurons?: number;
}

export interface PlanStep<T> {
  model: string;
  call(signal: AbortSignal): Promise<StepOutcome<T>>;
}

export interface RunLog {
  stage: string;
  model: string;
  status?: number;
  ms: number;
  outcome: string;
  fallbackUsed: boolean;
}

export interface RunOptions {
  stage: string;
  budgetMs: number;
  log: (entry: RunLog) => void;
}

export interface RunResult<T> {
  value: T;
  model: string;
  fallbackUsed: boolean;
  neurons?: number;
}

const ERROR_CODES = {
  output: 'AI_OUTPUT_INVALID',
  timeout: 'AI_TIMEOUT',
  safety: 'SAFETY_BLOCKED',
  unavailable: 'AI_UNAVAILABLE',
} as const;

/** 호출을 남은 시간 안에서만 기다린다. 넘으면 요청을 끊고 timeout 으로 실패시킨다. */
async function withDeadline<T>(call: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CallFailure('timeout'));
    }, ms);
  });
  try {
    return await Promise.race([call(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 계획(모델 호출 순서)을 앞에서부터 실행한다. 첫 성공을 돌려준다.
 * - 전체 시간 예산(재시도·폴백 포함) 안에서만 실행한다. 예산이 떨어지면 AI_TIMEOUT.
 * - 시간 초과가 난 모델은 같은 모델의 남은 시도를 건너뛴다.
 * - 계획 첫 모델이 아닌 모델로 성공하면 fallbackUsed.
 * - 마지막으로 받은 결과가 soft 이면 그것을 받아들인다. 아니면 마지막 실패 종류로 오류를 던진다.
 */
export async function runPlan<T>(
  plan: readonly PlanStep<T>[],
  options: RunOptions,
): Promise<RunResult<T>> {
  const deadline = Date.now() + options.budgetMs;
  const primary = plan[0]?.model;
  const timedOut = new Set<string>();
  let neurons: number | undefined;
  let lastKind: FailureKind = 'unavailable';
  let lastSoft: { step: PlanStep<T>; outcome: StepOutcome<T> } | null = null;

  const addNeurons = (n: number | undefined) => {
    if (n !== undefined) neurons = (neurons ?? 0) + n;
  };
  const result = (step: PlanStep<T>, value: T): RunResult<T> => ({
    value,
    model: step.model,
    fallbackUsed: step.model !== primary,
    ...(neurons === undefined ? {} : { neurons }),
  });

  for (const step of plan) {
    if (timedOut.has(step.model)) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      lastKind = 'timeout';
      lastSoft = null;
      break;
    }
    const started = Date.now();
    const entry = (outcome: string, status?: number): RunLog => ({
      stage: options.stage,
      model: step.model,
      ...(status === undefined ? {} : { status }),
      ms: Date.now() - started,
      outcome,
      fallbackUsed: step.model !== primary,
    });
    try {
      const outcome = await withDeadline(step.call, remaining);
      addNeurons(outcome.neurons);
      if (!outcome.soft) {
        options.log(entry('ok', outcome.status));
        return result(step, outcome.value);
      }
      options.log(entry('soft', outcome.status));
      lastKind = 'output';
      lastSoft = { step, outcome };
    } catch (error) {
      const failure = error instanceof CallFailure ? error : new CallFailure('unavailable');
      addNeurons(failure.detail.neurons);
      options.log(entry(`failed:${failure.kind}`, failure.detail.status));
      lastKind = failure.kind;
      lastSoft = null;
      if (failure.kind === 'timeout') timedOut.add(step.model);
    }
  }

  if (lastSoft) return result(lastSoft.step, lastSoft.outcome.value);
  throw new AppError(ERROR_CODES[lastKind]);
}
