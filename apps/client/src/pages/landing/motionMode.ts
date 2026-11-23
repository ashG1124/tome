/**
 * 연출을 켤지(motion) 걷어 내고 정지 화면으로 보여 줄지(static) 정하는 순수 함수들.
 * 판정 기준(전시 운영 문서가 아니라 구현 값): 스토리 영역이 처음 화면에 들어올 때 약 1초간 잰
 * requestAnimationFrame 간격의 평균이 40ms(≈25fps)보다 길면 느린 PC 로 본다.
 */

export type StoryMode = 'motion' | 'static';

/** 평균 프레임 시간이 이 값(ms)보다 길면 느린 PC 로 본다(≈25fps). */
export const SLOW_FRAME_MS = 40;
/** 프레임 간격을 재는 시간(ms) */
export const MEASURE_MS = 1000;
/** 표본이 이보다 적으면 판단하지 않는다(탭이 멈춰 있었던 경우 등) */
export const MIN_SAMPLES = 10;
/** 이보다 긴 간격은 렌더가 아니라 탭 정지·절전으로 보고 표본에서 뺀다(ms) */
const PAUSE_GAP_MS = 500;

/** 연속한 프레임 시각(ms) 목록 → 프레임 간격 목록. 탭 정지로 보이는 긴 간격은 뺀다. */
export function frameDeltas(timestamps: readonly number[]): number[] {
  const deltas: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = (timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0);
    if (gap > 0 && gap <= PAUSE_GAP_MS) deltas.push(gap);
  }
  return deltas;
}

/** 프레임 간격(ms) 목록의 평균. 비어 있으면 0 */
export function averageFrameMs(deltas: readonly number[]): number {
  if (deltas.length === 0) return 0;
  return deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
}

/** 프레임 간격(ms) 목록이 "연출을 걷어 낼 만큼 느린지" */
export function isSlowDevice(
  deltas: readonly number[],
  options: { thresholdMs?: number; minSamples?: number } = {},
): boolean {
  const { thresholdMs = SLOW_FRAME_MS, minSamples = MIN_SAMPLES } = options;
  if (deltas.length < minSamples) return false;
  return averageFrameMs(deltas) > thresholdMs;
}

/** 주소의 `?motion=off`(전시 운영자용)인지 */
export function isMotionOff(search: string): boolean {
  return new URLSearchParams(search).get('motion') === 'off';
}

/**
 * 주소의 `?motion=on`(전시 운영자용)인지.
 * 켜져 있으면 느린 PC 판정(프레임 간격 재기)을 하지 않고 연출 모드로 고정한다.
 * 단, 움직임 줄이기와 `?motion=off` 가 더 먼저다.
 */
export function isMotionOn(search: string): boolean {
  return new URLSearchParams(search).get('motion') === 'on';
}

/**
 * 최종 판정. 우선순위: 움직임 줄이기 > ?motion=off > ?motion=on > 느린 PC.
 * `?motion=on` 이면 느린 PC 여부(slow)는 보지 않는다.
 */
export function decideStoryMode(input: {
  search: string;
  reducedMotion: boolean;
  slow: boolean;
}): StoryMode {
  if (input.reducedMotion || isMotionOff(input.search)) return 'static';
  if (isMotionOn(input.search)) return 'motion';
  return input.slow ? 'static' : 'motion';
}

/** 한 번 느리다고 판정되면 이 방문(페이지를 다시 열기 전) 동안 유지한다. */
let slowRemembered = false;
export const wasSlow = () => slowRemembered;
export const rememberSlow = () => {
  slowRemembered = true;
};
/** 테스트용: 느림 판정 기억을 지운다 */
export const resetSlowDetection = () => {
  slowRemembered = false;
};
