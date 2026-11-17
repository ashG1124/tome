/** Workers AI 모델 ID. 바꾸려면 여기만 고친다. */
export const MODELS = {
  textPrimary: '@cf/qwen/qwen3-30b-a3b-fp8',
  textFallback: '@cf/google/gemma-4-26b-a4b-it',
  imagePrimary: '@cf/black-forest-labs/flux-2-klein-4b',
  imageFallback: '@cf/black-forest-labs/flux-1-schnell',
  inputGuard: '@cf/meta/llama-guard-3-8b',
} as const;

/** 한 단계(재시도·폴백 포함)에 쓸 수 있는 전체 시간. */
export const STAGE_BUDGET_MS = 25_000;

/** 입력 안전 검사 1회의 시간 제한. 넘으면 검사 없이 통과시킨다. */
export const INPUT_GUARD_BUDGET_MS = 5_000;

/**
 * 입력 안전 검사의 neurons 추정 근거(공식 가격표: 입력 100만 토큰당 44003, 출력 100만 토큰당 2730).
 * 응답에 cf-ai-neurons 헤더가 없을 때만 쓴다. 입력 토큰은 글자 수/4 로 어림한다.
 */
export const INPUT_GUARD_PRICING = {
  neuronsPerMillionInputTokens: 44_003,
  neuronsPerMillionOutputTokens: 2_730,
  charsPerToken: 4,
  /** 출력은 "safe" 또는 "unsafe
S1,S10" 정도라 작게 어림한다. */
  outputTokens: 8,
} as const;

export function estimateInputGuardNeurons(textLength: number): number {
  const p = INPUT_GUARD_PRICING;
  const inputTokens = Math.ceil(textLength / p.charsPerToken);
  return (
    (inputTokens * p.neuronsPerMillionInputTokens +
      p.outputTokens * p.neuronsPerMillionOutputTokens) /
    1_000_000
  );
}
