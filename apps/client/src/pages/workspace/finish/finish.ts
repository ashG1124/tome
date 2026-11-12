import {
  LIMITS,
  type AnswerSummary,
  type FinishProjectRequest,
  type Id,
  type WorkspaceResponse,
} from '@tome/shared';
import { ApiRequestError, errorCopyKey } from '../../../shared/api';
import type { CopyKey } from '../../../shared/copy';

export interface FinishAvailability {
  /** 끝내기(save) 버튼을 누를 수 있으면 true */
  enabled: boolean;
  /** 꺼져 있을 때 버튼 옆에 한 줄로 보여 줄 이유 문구 */
  reason: 'G1' | null;
}

/**
 * 끝내기 버튼을 켤지 정한다. 답변이 하나도 없으면 G1 이유와 함께 끈다.
 * 다른 페이지는 세트 수만 알 수 있어서, 세트가 있으면 답변도 있다고 보고 켠다.
 * 그래도 답변이 없으면 서버가 거절하고 화면은 G1을 보여 준다.
 */
export function finishAvailability(
  workspace: Pick<WorkspaceResponse, 'pages' | 'currentPageId' | 'sets'>,
): FinishAvailability {
  const answersHere = workspace.sets.some(
    (set) => set.answers.length > 0 || set.latestAnswer !== null,
  );
  const setsElsewhere = workspace.pages.some(
    (page) => page.id !== workspace.currentPageId && page.setCount > 0,
  );
  const enabled = answersHere || setsElsewhere;
  return { enabled, reason: enabled ? null : 'G1' };
}

/** 고른 버전이 아직 목록에 있으면 그대로 두고, 없으면 첫 번째 버전을 고른다. 목록이 비면 null. */
export function pickCover(candidates: readonly AnswerSummary[], current: Id | null): Id | null {
  if (current !== null && candidates.some((answer) => answer.id === current)) return current;
  return candidates[0]?.id ?? null;
}

export interface FinishForm {
  title: string;
  coverAnswerId: Id | null;
  reason: string;
}

export type FinishFormCheck =
  { ok: true; request: FinishProjectRequest } | { ok: false; error: 'E-04' | 'G1' };

/**
 * Next 를 눌렀을 때 입력을 검사해 완료 요청 본문을 만든다.
 * 제목은 앞뒤 공백을 빼고 1자 이상이어야 하고(E-04), 고른 버전이 있어야 한다(G1).
 * 이유는 비어 있으면 보내지 않는다. 길이는 입력칸 maxLength 가 먼저 막고, 여기서 한 번 더 자른다.
 */
export function checkFinishForm(form: FinishForm): FinishFormCheck {
  const title = form.title.trim();
  if (title.length === 0) return { ok: false, error: 'E-04' };
  if (form.coverAnswerId === null) return { ok: false, error: 'G1' };
  const reason = form.reason.trim();
  return {
    ok: true,
    request: {
      title: title.slice(0, LIMITS.TITLE_MAX),
      coverAnswerId: form.coverAnswerId,
      ...(reason.length > 0 ? { reason: reason.slice(0, LIMITS.REASON_MAX) } : {}),
    },
  };
}

export interface FinishSteps {
  /** 완료 요청(POST /projects/:id/finish) */
  finish: (request: FinishProjectRequest) => Promise<unknown>;
  /** 게시 요청(PUT /projects/:id/post, posted: true) */
  post: () => Promise<unknown>;
}

/** finished = 완료만 함, posted = 완료 + 게시, post-failed = 완료는 됐고 게시만 실패 */
export type FinishResult = 'finished' | 'posted' | 'post-failed';

/** 게시를 한 번 시도한다. 성공하면 true. 게시만 다시 할 때도 쓴다. */
export async function tryPost(post: FinishSteps['post']): Promise<boolean> {
  try {
    await post();
    return true;
  } catch {
    return false;
  }
}

/**
 * 완료를 먼저 보내고, 게시를 켰으면 그다음 게시한다.
 * 완료가 실패하면 오류를 그대로 던진다(게시는 보내지 않는다).
 */
export async function finishThenPost(
  steps: FinishSteps,
  request: FinishProjectRequest,
  post: boolean,
): Promise<FinishResult> {
  await steps.finish(request);
  if (!post) return 'finished';
  return (await tryPost(steps.post)) ? 'posted' : 'post-failed';
}

/** 완료 요청이 실패했을 때 보여 줄 자리와 문구 */
export type FinishFailure =
  { place: 'title'; copy: 'E-04' } | { place: 'form'; copy: CopyKey; retry: boolean };

/**
 * 제목 오류(E-04)는 제목 입력칸 바로 아래에, 나머지는 모달 안 버튼 위에 보여 준다.
 * Retry 는 서버가 다시 시도해도 된다고 한 오류와 연결 끊김에만 보여 준다.
 */
export function finishFailure(error: unknown): FinishFailure {
  const copy = errorCopyKey(error);
  if (copy === 'E-04') return { place: 'title', copy };
  const retry = error instanceof ApiRequestError ? error.retryable : true;
  return { place: 'form', copy, retry };
}

export interface ScrollBox {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface ScrollThumb {
  /** 넘치는 부분이 없으면 false(막대를 그리지 않음) */
  visible: boolean;
  /** 막대 시작 위치, 전체 길이에 대한 비율(0~1) */
  offset: number;
  /** 막대 길이, 전체 길이에 대한 비율(0~1) */
  size: number;
}

/** 버전 썸네일 가로 스크롤 아래 진행 막대의 위치와 길이 */
export function scrollThumb({ scrollLeft, scrollWidth, clientWidth }: ScrollBox): ScrollThumb {
  if (scrollWidth <= 0 || scrollWidth <= clientWidth) {
    return { visible: false, offset: 0, size: 1 };
  }
  const maxLeft = scrollWidth - clientWidth;
  const left = Math.min(Math.max(scrollLeft, 0), maxLeft);
  return { visible: true, offset: left / scrollWidth, size: clientWidth / scrollWidth };
}
