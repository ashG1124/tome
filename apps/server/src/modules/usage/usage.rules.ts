import { PROMPT_PRESETS, presetPrompts, type PresetKey } from '@tome/shared';
import { MODELS } from '../../ai';

/** 하루 무료 neurons 와 그 위 단가(Workers AI 공식 가격표). */
export const FREE_NEURONS_PER_DAY = 10_000;
export const USD_PER_1000_NEURONS = 0.011;

/** AppSetting 행이 없을 때 쓰는 상한. */
export const DEFAULT_CAPS = { dailyNeuronCap: 50_000, monthlyCostCapUsd: 20 } as const;

export const SETTING_KEYS = {
  dailyNeuronCap: 'dailyNeuronCap',
  monthlyCostCapUsd: 'monthlyCostCapUsd',
} as const;

/** 그 날 neurons 합에서 달러 비용을 다시 계산한다(하루 무료분 이하는 0). */
export function costUsdFromNeurons(neurons: number): number {
  return (Math.max(0, neurons - FREE_NEURONS_PER_DAY) * USD_PER_1000_NEURONS) / 1000;
}

/**
 * 응답 헤더에 neurons 가 없을 때 쓰는 호출 1회당 추정값(공식 가격표 기준).
 * - 텍스트: 입력 약 2,000토큰·출력 약 1,500토큰(JSON 노드 한 단계)을 가정한다.
 *   gemma-4: 2000×9091/1e6 + 1500×27273/1e6 ≈ 59(→60)
 *   glm-4.7-flash: 2000×5500/1e6 + 1500×36364/1e6 ≈ 66
 *   (가격 근거: 100만 토큰당 USD 입력 0.0605·출력 0.4 → neurons 5500·36364, USD 0.011/1000 neurons)
 * - 이미지(1024×1024 = 512 타일 4개): klein 출력 4×26.05 = 104.2 / schnell 4×4.8 + 4스텝×9.6 = 57.6
 */
export const NEURON_ESTIMATES: Readonly<Record<string, number>> = {
  [MODELS.textPrimary]: 60,
  [MODELS.textFallback]: 66,
  [MODELS.imagePrimary]: 104.2,
  [MODELS.imageFallback]: 57.6,
};

/** mock 공급자는 비용이 없다. 모르는 모델은 0 으로 센다. */
export function estimateNeurons(provider: string, model: string, reported?: number): number {
  if (reported !== undefined) return reported;
  if (provider === 'mock') return 0;
  return NEURON_ESTIMATES[model] ?? 0;
}

export type LimitCode = 'BUDGET_REACHED' | 'DAILY_LIMIT_REACHED';

/** 이번 달 비용이 월 상한 이상이면 BUDGET, 아니면 오늘 neurons 가 하루 상한 이상이면 DAILY. */
export function decideLimit(
  usage: { todayNeurons: number; monthCostUsd: number },
  caps: { dailyNeuronCap: number; monthlyCostCapUsd: number },
): { budgetReached: boolean; dailyLimitReached: boolean; code: LimitCode | null } {
  const budgetReached = usage.monthCostUsd >= caps.monthlyCostCapUsd;
  const dailyLimitReached = usage.todayNeurons >= caps.dailyNeuronCap;
  const code = budgetReached ? 'BUDGET_REACHED' : dailyLimitReached ? 'DAILY_LIMIT_REACHED' : null;
  return { budgetReached, dailyLimitReached, code };
}

/** 정규화: 앞뒤 공백 제거, 연속 공백을 1개로, 소문자. 그 밖의 변환은 하지 않는다. */
export function normalizePrompt(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 세트의 presetKey 가 있고 prompt 가 그 프리셋 문장과 정규화 후 같을 때만 그 키를 돌려준다.
 * 프리셋 문장을 바꾸기 전에 만든 세트도 알아보도록 예전 문장도 같은 것으로 본다(#264).
 */
export function matchPreset(
  presetKey: string | null | undefined,
  prompt: string,
): PresetKey | null {
  if (!presetKey) return null;
  const preset = PROMPT_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return null;
  const wanted = normalizePrompt(prompt);
  return presetPrompts(preset.key).some((text) => normalizePrompt(text) === wanted)
    ? preset.key
    : null;
}

/** 오늘(UTC)의 YYYY-MM-DD. */
export const utcDateString = (now: Date): string => now.toISOString().slice(0, 10);

export interface UsageTally {
  /** AI 를 실제로 부른 단계인지 */
  called: boolean;
  kind: 'text' | 'image';
  /** 텍스트 호출 횟수(공급자가 재시도 수를 알려 주지 않아 단계당 1) */
  textCalls: number;
  imageCount: number;
  fallbackCount: number;
  neurons: number;
}

export const emptyTally = (kind: 'text' | 'image'): UsageTally => ({
  called: false,
  kind,
  textCalls: 0,
  imageCount: 0,
  fallbackCount: 0,
  neurons: 0,
});
