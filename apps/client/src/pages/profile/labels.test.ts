import { describe, expect, it } from 'vitest';
import { COPY } from '../../shared/copy';
import type { ChartKey, Quadrant } from './identity';
import { bubbleText } from './labels';

const QUADRANTS: readonly Quadrant[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

describe('bubbleText', () => {
  it('좌표 2장 × 사분면 4개, 8개 모두 문구가 있고 서로 다르다', () => {
    const texts = (['ai', 'decision'] as ChartKey[]).flatMap((chart) =>
      QUADRANTS.map((quadrant) => bubbleText(chart, quadrant)),
    );
    expect(texts.every((text) => typeof text === 'string' && text.length > 0)).toBe(true);
    expect(new Set(texts).size).toBe(8);
  });

  it('사분면별 문구 ID 가 맞다(리드 확정 표)', () => {
    expect(bubbleText('ai', 'top-right')).toBe(COPY['P-18-ai-top-right']);
    expect(bubbleText('ai', 'bottom-left')).toBe(COPY['P-18-ai-bottom-left']);
    expect(bubbleText('decision', 'top-left')).toBe(COPY['P-18-decision-top-left']);
    expect(bubbleText('decision', 'bottom-right')).toBe(COPY['P-18-decision-bottom-right']);
  });

  it('사분면이 없으면(축 위·점수 없음) 말풍선도 없다', () => {
    expect(bubbleText('ai', null)).toBeNull();
  });
});
