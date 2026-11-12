import { PROMPT_PRESETS, type WorkspaceResponse } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { canSubmitPrompt, presetKeyFor, promptBarInfo } from './prompt';

const PAGE_ID = 'c4a1e7d2-8b5f-4e39-a6c0-2f1d3b4a5c6e';

function workspace(setCount: number, generating = false): WorkspaceResponse {
  return {
    project: {
      id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c',
      title: 'Neon street at night',
      status: 'building',
      posted: false,
      coverThumbUrl: null,
      lastEditedAt: '2026-11-03T10:30:00.000Z',
      shelfPosition: 0,
      kind: 'original',
    },
    pages: [{ id: PAGE_ID, index: 0, setCount }],
    currentPageId: PAGE_ID,
    sets: [],
    ...(generating
      ? {
          activeJob: {
            id: '7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d',
            status: 'running' as const,
            startStage: 'analyze' as const,
            nextStage: 'research' as const,
            steps: [],
          },
        }
      : {}),
  };
}

describe('promptBarInfo', () => {
  it('세트가 없으면 입력 가능 + 빈 페이지', () => {
    expect(promptBarInfo(workspace(0))).toEqual({ state: 'ready', emptyPage: true });
  });

  it('세트가 있으면 빈 페이지가 아니다', () => {
    expect(promptBarInfo(workspace(1))).toEqual({ state: 'ready', emptyPage: false });
  });

  it('세트 3개면 비활성', () => {
    expect(promptBarInfo(workspace(3)).state).toBe('full');
  });

  it('진행 중 생성이 있으면 세트 수보다 먼저 잠긴다', () => {
    expect(promptBarInfo(workspace(3, true)).state).toBe('generating');
  });
});

describe('canSubmitPrompt', () => {
  it('빈 글·공백만 있으면 보낼 수 없다', () => {
    expect(canSubmitPrompt('')).toBe(false);
    expect(canSubmitPrompt('   \n ')).toBe(false);
  });

  it('1~500자는 보낼 수 있고 501자는 안 된다', () => {
    expect(canSubmitPrompt('a')).toBe(true);
    expect(canSubmitPrompt('a'.repeat(500))).toBe(true);
    expect(canSubmitPrompt('a'.repeat(501))).toBe(false);
  });
});

describe('presetKeyFor', () => {
  const first = PROMPT_PRESETS[0];

  it('프리셋 문장 그대로면 그 키', () => {
    expect(presetKeyFor(first.prompt)).toBe(first.key);
    expect(presetKeyFor(`  ${first.prompt}  `)).toBe(first.key);
  });

  it('조금이라도 고치면 키 없음', () => {
    expect(presetKeyFor(`${first.prompt} at dawn`)).toBeUndefined();
  });
});
