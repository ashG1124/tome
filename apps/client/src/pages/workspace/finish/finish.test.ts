import {
  FinishProjectRequestSchema,
  LIMITS,
  type AnswerSummary,
  type PromptSet,
  type WorkspaceResponse,
} from '@tome/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, NetworkError } from '../../../shared/api';
import {
  checkFinishForm,
  finishAvailability,
  finishFailure,
  finishThenPost,
  pickCover,
  scrollThumb,
  tryPost,
} from './finish';

const PAGE_1 = 'c4a1e7d2-8b5f-4e39-a6c0-2f1d3b4a5c6e';
const PAGE_2 = 'd5b2f8e3-9c6a-4f4a-b7d1-3a2e4c5b6d7f';
const ANSWER_1 = '3f2b8a1e-5c4d-4e6f-8a7b-9c0d1e2f3a4b';
const ANSWER_2 = '7d9e1c2a-6b5f-4a3e-9d8c-1b2a3c4d5e6f';
const MISSING = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function answer(id: string, number: number): AnswerSummary {
  return {
    id,
    number,
    pinned: true,
    isSample: false,
    thumbUrl: `/assets/answers/${id}/thumb`,
    createdAt: '2026-11-03T10:30:00.000Z',
  };
}

function set(answers: AnswerSummary[]): PromptSet {
  return {
    id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c',
    position: 1,
    prompt: 'A neon-lit street at night',
    latestAnswer: null,
    answers,
  };
}

type WorkspaceParts = Pick<WorkspaceResponse, 'pages' | 'currentPageId' | 'sets'>;

function workspace(sets: PromptSet[], otherPageSets = 0): WorkspaceParts {
  return {
    pages: [
      { id: PAGE_1, index: 0, setCount: sets.length },
      { id: PAGE_2, index: 1, setCount: otherPageSets },
    ],
    currentPageId: PAGE_1,
    sets,
  };
}

function apiError(code: 'VALIDATION_FAILED' | 'NOT_FINISHABLE' | 'INTERNAL', retryable: boolean) {
  return new ApiRequestError(code === 'INTERNAL' ? 500 : 409, {
    code,
    message: code,
    retryable,
  });
}

describe('finishAvailability', () => {
  it('답변이 하나도 없으면 끄고 G1 이유를 준다', () => {
    expect(finishAvailability(workspace([]))).toEqual({ enabled: false, reason: 'G1' });
  });

  it('세트는 있어도 답변이 없으면 끈다', () => {
    expect(finishAvailability(workspace([set([])]))).toEqual({ enabled: false, reason: 'G1' });
  });

  it('지금 페이지에 답변이 있으면 켠다', () => {
    expect(finishAvailability(workspace([set([answer(ANSWER_1, 1)])]))).toEqual({
      enabled: true,
      reason: null,
    });
  });

  it('지금 페이지가 비어도 다른 페이지에 세트가 있으면 켠다', () => {
    expect(finishAvailability(workspace([], 2))).toEqual({ enabled: true, reason: null });
  });
});

describe('pickCover', () => {
  const candidates = [answer(ANSWER_1, 1), answer(ANSWER_2, 2)];

  it('처음에는 첫 번째 버전을 고른다', () => {
    expect(pickCover(candidates, null)).toBe(ANSWER_1);
  });

  it('고른 버전이 목록에 있으면 그대로 둔다', () => {
    expect(pickCover(candidates, ANSWER_2)).toBe(ANSWER_2);
  });

  it('고른 버전이 목록에서 사라지면 첫 번째로 돌아간다', () => {
    expect(pickCover(candidates, MISSING)).toBe(ANSWER_1);
  });

  it('목록이 비면 null', () => {
    expect(pickCover([], ANSWER_1)).toBeNull();
  });
});

describe('checkFinishForm', () => {
  it('제목이 비었거나 공백뿐이면 E-04', () => {
    expect(checkFinishForm({ title: '', coverAnswerId: ANSWER_1, reason: '' })).toEqual({
      ok: false,
      error: 'E-04',
    });
    expect(checkFinishForm({ title: '   ', coverAnswerId: ANSWER_1, reason: '' })).toEqual({
      ok: false,
      error: 'E-04',
    });
  });

  it('고른 버전이 없으면 G1, 제목 오류가 먼저다', () => {
    expect(checkFinishForm({ title: 'Neon', coverAnswerId: null, reason: '' })).toEqual({
      ok: false,
      error: 'G1',
    });
    expect(checkFinishForm({ title: ' ', coverAnswerId: null, reason: '' })).toEqual({
      ok: false,
      error: 'E-04',
    });
  });

  it('제목·이유의 앞뒤 공백을 빼고, 빈 이유는 보내지 않는다', () => {
    const withReason = checkFinishForm({
      title: '  Neon street  ',
      coverAnswerId: ANSWER_1,
      reason: '  The light feels right.  ',
    });
    expect(withReason).toEqual({
      ok: true,
      request: { title: 'Neon street', coverAnswerId: ANSWER_1, reason: 'The light feels right.' },
    });

    const withoutReason = checkFinishForm({ title: 'Neon', coverAnswerId: ANSWER_1, reason: ' ' });
    expect(withoutReason).toEqual({
      ok: true,
      request: { title: 'Neon', coverAnswerId: ANSWER_1 },
    });
  });

  it('만든 본문은 API 계약 스키마를 통과하고 길이 상한을 넘지 않는다', () => {
    const result = checkFinishForm({
      title: 'a'.repeat(LIMITS.TITLE_MAX + 5),
      coverAnswerId: ANSWER_1,
      reason: 'b'.repeat(LIMITS.REASON_MAX + 5),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.title).toHaveLength(LIMITS.TITLE_MAX);
    expect(result.request.reason).toHaveLength(LIMITS.REASON_MAX);
    expect(FinishProjectRequestSchema.safeParse(result.request).success).toBe(true);
  });
});

describe('finishThenPost', () => {
  const request = { title: 'Neon', coverAnswerId: ANSWER_1 };

  it('게시를 끄면 완료만 보낸다', async () => {
    const steps = { finish: vi.fn().mockResolvedValue({}), post: vi.fn() };
    await expect(finishThenPost(steps, request, false)).resolves.toBe('finished');
    expect(steps.finish).toHaveBeenCalledWith(request);
    expect(steps.post).not.toHaveBeenCalled();
  });

  it('게시를 켜면 완료가 끝난 뒤 게시한다', async () => {
    const order: string[] = [];
    const steps = {
      finish: vi.fn(async () => {
        order.push('finish');
      }),
      post: vi.fn(async () => {
        order.push('post');
      }),
    };
    await expect(finishThenPost(steps, request, true)).resolves.toBe('posted');
    expect(order).toEqual(['finish', 'post']);
  });

  it('게시만 실패하면 post-failed 를 돌려준다(완료는 유지)', async () => {
    const steps = {
      finish: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockRejectedValue(new NetworkError()),
    };
    await expect(finishThenPost(steps, request, true)).resolves.toBe('post-failed');
  });

  it('완료가 실패하면 오류를 던지고 게시하지 않는다', async () => {
    const error = apiError('NOT_FINISHABLE', false);
    const steps = { finish: vi.fn().mockRejectedValue(error), post: vi.fn() };
    await expect(finishThenPost(steps, request, true)).rejects.toBe(error);
    expect(steps.post).not.toHaveBeenCalled();
  });
});

describe('tryPost', () => {
  it('성공하면 true, 실패하면 false', async () => {
    await expect(tryPost(vi.fn().mockResolvedValue({ postedAt: null }))).resolves.toBe(true);
    await expect(tryPost(vi.fn().mockRejectedValue(new Error('x')))).resolves.toBe(false);
  });
});

describe('finishFailure', () => {
  it('제목 검사 실패는 제목 칸 아래 E-04', () => {
    expect(finishFailure(apiError('VALIDATION_FAILED', false))).toEqual({
      place: 'title',
      copy: 'E-04',
    });
  });

  it('완료할 수 없으면 G1, 다시 시도 버튼은 없다', () => {
    expect(finishFailure(apiError('NOT_FINISHABLE', false))).toEqual({
      place: 'form',
      copy: 'G1',
      retry: false,
    });
  });

  it('연결이 끊기면 E-03 과 다시 시도', () => {
    expect(finishFailure(new NetworkError())).toEqual({ place: 'form', copy: 'E-03', retry: true });
  });

  it('서버 오류는 E-01a, 다시 시도 여부는 서버가 준 값을 따른다', () => {
    expect(finishFailure(apiError('INTERNAL', true))).toEqual({
      place: 'form',
      copy: 'E-01a',
      retry: true,
    });
    expect(finishFailure(apiError('INTERNAL', false))).toEqual({
      place: 'form',
      copy: 'E-01a',
      retry: false,
    });
  });

  it('알 수 없는 오류는 E-01a 와 다시 시도', () => {
    expect(finishFailure(new Error('boom'))).toEqual({ place: 'form', copy: 'E-01a', retry: true });
  });
});

describe('scrollThumb', () => {
  it('넘치지 않으면 막대를 그리지 않는다', () => {
    expect(scrollThumb({ scrollLeft: 0, scrollWidth: 500, clientWidth: 650 })).toEqual({
      visible: false,
      offset: 0,
      size: 1,
    });
  });

  it('맨 앞과 맨 끝에서 위치·길이를 비율로 준다', () => {
    expect(scrollThumb({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 500 })).toEqual({
      visible: true,
      offset: 0,
      size: 0.5,
    });
    expect(scrollThumb({ scrollLeft: 500, scrollWidth: 1000, clientWidth: 500 })).toEqual({
      visible: true,
      offset: 0.5,
      size: 0.5,
    });
  });

  it('범위를 벗어난 스크롤 값은 끝에 맞춘다', () => {
    expect(scrollThumb({ scrollLeft: -20, scrollWidth: 1000, clientWidth: 500 }).offset).toBe(0);
    expect(scrollThumb({ scrollLeft: 900, scrollWidth: 1000, clientWidth: 500 }).offset).toBe(0.5);
  });
});
