/** Workers AI 모델 ID. 바꾸려면 여기만 고친다. */
export const MODELS = {
  textPrimary: '@cf/qwen/qwen3-30b-a3b-fp8',
  textFallback: '@cf/google/gemma-4-26b-a4b-it',
  imagePrimary: '@cf/black-forest-labs/flux-2-klein-4b',
  imageFallback: '@cf/black-forest-labs/flux-1-schnell',
} as const;

/** 한 단계(재시도·폴백 포함)에 쓸 수 있는 전체 시간. */
export const STAGE_BUDGET_MS = 25_000;
