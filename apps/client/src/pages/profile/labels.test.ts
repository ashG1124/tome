import type { CompareEntry, CreatorSummary, IdentityAxes } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { COPY } from '../../shared/copy';
import { axisName, creatorDescription, quadrantName } from './labels';

const MILLA: CreatorSummary = {
  id: 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f',
  kind: 'seed',
  displayName: 'Milla',
  bio: null,
  avatarUrl: null,
};

const entry = (axes: IdentityAxes, bio: string | null = null): CompareEntry => ({
  creator: { ...MILLA, bio },
  axes,
  provisional: false,
});

describe('creatorDescription', () => {
  it('한 줄 소개가 있으면 그대로 쓴다', () => {
    const axes = { scaleIntensity: -40, aiRelation: 60, decisionBasis: -20, direction: 80 };
    expect(creatorDescription(entry(axes, 'Keeps the evidence nodes.'))).toBe(
      'Keeps the evidence nodes.',
    );
  });

  it('소개가 없으면 사분면 조각을 이어 Figma 꼴(4181:35656)로 만든다', () => {
    // ai: 위(가볍게)·오른쪽(내가 주도) / decision: 아래(넓게)·오른쪽(직관, 근거 점수 −)
    const axes = { scaleIntensity: -40, aiRelation: 60, decisionBasis: -20, direction: 80 };
    expect(creatorDescription(entry(axes))).toBe(
      'Takes the lead and nudges gently — trusts gut, explores far.',
    );
    // ai: 위·왼쪽 / decision: 위(좁힘)·왼쪽(근거)
    const mina = { scaleIntensity: -40, aiRelation: -60, decisionBasis: 30, direction: -50 };
    expect(creatorDescription(entry(mina))).toBe(
      'Lets the AI lead and nudges gently — trusts data, narrows down.',
    );
  });

  it('한쪽 좌표만 있으면 그 조각만, 아무 점수도 없으면 null', () => {
    const none = { scaleIntensity: null, aiRelation: null, decisionBasis: null, direction: null };
    expect(creatorDescription(entry({ ...none, aiRelation: 50, scaleIntensity: 50 }))).toBe(
      'Takes the lead and edits boldly.',
    );
    expect(creatorDescription(entry({ ...none, decisionBasis: 50, direction: 50 }))).toBe(
      'Trusts data, explores far.',
    );
    expect(creatorDescription(entry(none))).toBeNull();
  });
});

describe('quadrantName', () => {
  it('필터 칸 이름은 "세로 쪽, 가로 쪽" 축 이름이다', () => {
    expect(quadrantName('ai', 'bottom-left')).toBe(`${COPY['P-31b']}, ${COPY['P-31c']}`);
    expect(quadrantName('decision', 'top-right')).toBe(`${COPY['P-31e']}, ${COPY['P-32b']}`);
  });
});

describe('axisName', () => {
  it('숨김 표의 축 이름은 − 쪽 – + 쪽(판단 근거는 + 가 Evidence)', () => {
    expect(axisName('aiRelation')).toBe(`${COPY['P-13c']} – ${COPY['P-13d']}`);
    expect(axisName('decisionBasis')).toBe(`${COPY['P-13h']} – ${COPY['P-13g']}`);
  });
});
