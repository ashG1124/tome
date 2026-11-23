import {
  LIMITS,
  type AgoraComment,
  type AgoraHomeResponse,
  type AgoraProjectCard,
  type DerivedFrom,
  type TopicResponse,
} from '@tome/shared';
import { ApiRequestError, errorCopyKey, NetworkError } from '../../shared/api';
import type { CopyKey } from '../../shared/copy';

// 아고라(홈·핫토픽 목록·프로젝트 상세)가 같이 쓰는 계산. 화면 없이 테스트한다.

/**
 * 좋아요·댓글 수 표시. 1000 이상은 시안처럼 "1.2k", 100만 이상은 "1.2m".
 * 실제보다 크게 보이지 않게 소수 첫째 자리 아래는 버린다(1250 → "1.2k").
 */
export function formatCount(count: number): string {
  const value = Math.max(0, Math.floor(count));
  if (value < 1000) return String(value);
  const [unit, size]: [string, number] = value < 1_000_000 ? ['k', 1000] : ['m', 1_000_000];
  // 정수끼리 먼저 계산해서 소수 오차 없이 소수 첫째 자리까지 남긴다.
  const shown = Math.floor((value * 10) / size) / 10;
  return `${shown}${unit}`;
}

/** 핫토픽 타일에 보이는 표지 수(2×2) */
export const TOPIC_TILE_COUNT = 4;

export interface TopicTiles {
  /** 앞의 표지 최대 4장. 표지가 없는 프로젝트는 null(빈 칸) */
  covers: (string | null)[];
}

/** 핫토픽 타일: 앞의 프로젝트 4개의 표지 */
export function topicTiles(projects: readonly AgoraProjectCard[]): TopicTiles {
  return {
    covers: projects.slice(0, TOPIC_TILE_COUNT).map((project) => project.coverThumbUrl),
  };
}

/** 파생작의 출처 표시. 원작 제목이 비어 있으면(원작 삭제·숨김) "Deleted original"(S-06)을 보여 준다. */
export type DerivedFromView =
  { kind: 'source'; projectId: string; title: string } | { kind: 'deleted' };

export function derivedFromView(derivedFrom: DerivedFrom | undefined): DerivedFromView | null {
  if (derivedFrom === undefined) return null;
  if (derivedFrom.title === null) return { kind: 'deleted' };
  return { kind: 'source', projectId: derivedFrom.projectId, title: derivedFrom.title };
}

// ---- 댓글

export type CommentCheck = { ok: true; body: string } | { ok: false; reason: 'empty' | 'too-long' };

/** 댓글 본문 검사: 앞뒤 공백을 빼고 1~300자일 때만 보낸다. */
export function checkCommentBody(text: string): CommentCheck {
  const body = text.trim();
  if (body.length === 0) return { ok: false, reason: 'empty' };
  if (body.length > LIMITS.COMMENT_MAX) return { ok: false, reason: 'too-long' };
  return { ok: true, body };
}

/** 내 댓글만 지울 수 있다(신고·차단은 없다). */
export function canDeleteComment(comment: AgoraComment): boolean {
  return comment.mine;
}

/**
 * 댓글 시각은 상대 표기("1day ago") 없이 절대 날짜로 보여 준다.
 * locale·timeZone 을 안 주면 기기 설정을 따른다. 테스트에서만 고정 값을 넘긴다.
 */
export function formatCommentDate(iso: string, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(new Date(iso));
}

// ---- Go to derive

export interface DeriveFailure {
  copy: CopyKey;
  /** 다시 시도할 수 있는 실패(연결 끊김·서버 일시 오류)일 때만 Retry 를 둔다. */
  retry: boolean;
}

/**
 * Go to derive 가 실패했을 때 보여 줄 문구.
 * 원작이 지워졌거나 숨겨져 복사할 수 없으면(DERIVE_SOURCE_UNAVAILABLE·NOT_FOUND) "Deleted original"(S-06),
 * 연결이 끊기면 E-03, 그 밖은 공통 오류 문구를 쓴다.
 */
export function deriveFailure(error: unknown): DeriveFailure {
  if (error instanceof NetworkError) return { copy: 'E-03', retry: true };
  if (error instanceof ApiRequestError) {
    if (error.code === 'DERIVE_SOURCE_UNAVAILABLE' || error.code === 'NOT_FOUND') {
      return { copy: 'S-06', retry: false };
    }
    return { copy: errorCopyKey(error), retry: error.retryable };
  }
  return { copy: errorCopyKey(error), retry: false };
}

// ---- 빈 상태

/** 아고라에 게시된 프로젝트가 하나도 없으면 S-02 를 보여 준다(크리에이터만 있는 경우도 빈 것으로 본다). */
export function isAgoraEmpty(home: AgoraHomeResponse): boolean {
  return home.recommended.length === 0 && home.hotTopics.every((t) => t.projects.length === 0);
}

/** 핫토픽에 프로젝트가 없으면 목록 대신 S-02 를 보여 준다. */
export function isTopicEmpty(topic: TopicResponse): boolean {
  return topic.projects.length === 0;
}
