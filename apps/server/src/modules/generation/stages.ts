import type { JobStage } from '@tome/shared';

/** advance 가 도는 단계 순서. */
export const STAGE_ORDER: readonly JobStage[] = [
  'analyze',
  'research',
  'evidence',
  'draft',
  'assemble',
  'image',
  'verify',
];

/** 한 단계를 잡고 있는 시간(이 시간이 지나면 다른 요청이 같은 단계를 이어받는다). */
export const LEASE_MS = 60_000;

/** 같은 단계 시도 횟수 상한(첫 시도 + 재시도 3회). 이 횟수째 실패하면 job 이 failed 가 된다. */
export const MAX_STEP_ATTEMPTS = 4;

/** 다음 단계. 마지막(verify) 뒤에는 null. */
export function nextStageOf(stage: JobStage): JobStage | null {
  const index = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[index + 1] ?? null;
}

/** 단계 순서(job 응답의 steps 정렬용). */
export function stageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage as JobStage);
}
