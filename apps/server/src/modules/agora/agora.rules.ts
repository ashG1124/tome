/** 아고라 순위 규칙(순수 함수). 데이터 읽기는 repository, 이 파일은 정렬만 한다. */

export const RECOMMENDED_LIMIT = 12;
export const RISING_LIMIT = 8;
export const HOT_TOPIC_LIMIT = 5;
export const HOT_TOPIC_PROJECT_LIMIT = 6;
export const TOPIC_PROJECT_LIMIT = 50;
export const DERIVATIVE_LIMIT = 12;

export interface ScoredProject {
  id: string;
  postedAt: Date;
  score: number;
}

export interface StatCounts {
  viewCount: number;
  remixCount: number;
  deriveCount: number;
}

/** 집계 점수 = 조회 + 리믹스 + 파생. 집계 행이 없으면 0. */
export function scoreOf(stat: StatCounts | null | undefined): number {
  return stat ? stat.viewCount + stat.remixCount + stat.deriveCount : 0;
}

/** 점수 내림차순, 동점이면 최근 게시 먼저, 그래도 같으면 id 로 안정 정렬. */
export function rankProjects<T extends ScoredProject>(projects: readonly T[]): T[] {
  return [...projects].sort(
    (a, b) =>
      b.score - a.score ||
      b.postedAt.getTime() - a.postedAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface CreatorScore {
  creatorId: string;
  seedOrder: number | null;
  /** 이 창작자 공개 프로젝트 점수의 합 */
  score: number;
  /** 이 창작자 공개 프로젝트 중 가장 최근 게시 시각 */
  latestPostedAt: Date;
}

const seedKey = (order: number | null): number => order ?? Number.MAX_SAFE_INTEGER;

/**
 * 라이징 순서: 점수 합 내림차순 → 가장 최근 게시 순. 모두 0점이면 seedOrder 오름차순(null 은 뒤).
 */
export function rankCreators<T extends CreatorScore>(creators: readonly T[]): T[] {
  const allZero = creators.every((c) => c.score === 0);
  const byId = (a: T, b: T) => (a.creatorId < b.creatorId ? -1 : a.creatorId > b.creatorId ? 1 : 0);
  return [...creators].sort((a, b) =>
    allZero
      ? seedKey(a.seedOrder) - seedKey(b.seedOrder) || byId(a, b)
      : b.score - a.score ||
        b.latestPostedAt.getTime() - a.latestPostedAt.getTime() ||
        seedKey(a.seedOrder) - seedKey(b.seedOrder) ||
        byId(a, b),
  );
}

/** 오늘(UTC) 0시와 내일 0시. 조회 하루 1회 판정에 쓴다. */
export function utcDayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

const MIME_BY_EXT: Record<string, 'image/png' | 'image/jpeg'> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** 저장 키의 확장자로 이미지 형식을 알아낸다(모르면 png). */
export function mimeOfKey(key: string): 'image/png' | 'image/jpeg' {
  return MIME_BY_EXT[(key.split('.').pop() ?? '').toLowerCase()] ?? 'image/png';
}
