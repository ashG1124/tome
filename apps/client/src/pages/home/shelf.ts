import type { ProjectSummary } from '@tome/shared';

/** 서가 카드 종류. 디자인의 my work / Remix / Derive 변형에 맞춘다. */
export type ShelfCardType = 'my-work' | 'remix' | 'derive';

/** 카드 위 태그 종류. */
export type ShelfTag = 'finished' | 'posted';

/** 서가 순서(shelfPosition)대로 정렬한 새 배열. 원본은 바꾸지 않는다. */
export function sortShelf(projects: readonly ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((a, b) => a.shelfPosition - b.shelfPosition);
}

/** 가장 최근에 편집한 프로젝트 하나. 프로젝트가 없으면 null. */
export function latestEdited(projects: readonly ProjectSummary[]): ProjectSummary | null {
  let latest: ProjectSummary | null = null;
  for (const project of projects) {
    if (latest === null || Date.parse(project.lastEditedAt) > Date.parse(latest.lastEditedAt)) {
      latest = project;
    }
  }
  return latest;
}

/** 파생작이면 derive, 리믹스 상대가 있으면 remix, 나머지는 my-work. */
export function shelfCardType(project: ProjectSummary): ShelfCardType {
  if (project.kind === 'derive') return 'derive';
  if (project.remixPartner !== undefined) return 'remix';
  return 'my-work';
}

/** 완료했으면 finished, 게시했으면 posted 를 붙인다. 게시한 프로젝트는 둘 다 붙는다. */
export function shelfTags(project: ProjectSummary): ShelfTag[] {
  const tags: ShelfTag[] = [];
  if (project.status === 'finished') tags.push('finished');
  if (project.posted) tags.push('posted');
  return tags;
}

/**
 * 마지막 편집일을 절대 날짜로 바꾼다("6d ago" 같은 상대 표기는 쓰지 않는다).
 * locale·timeZone 을 안 주면 기기 설정을 따른다. 테스트에서만 고정 값을 넘긴다.
 */
export function formatEditedDate(iso: string, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(new Date(iso));
}

/**
 * 화면에서 바꾼 순서(id 목록)를 목록에 적용한다. order 가 없으면 받은 순서 그대로.
 * 순서에 없는 프로젝트(새로 생긴 것)는 맨 앞에 둔다.
 */
export function applyOrder(
  projects: readonly ProjectSummary[],
  order: readonly string[] | null,
): ProjectSummary[] {
  if (order === null) return [...projects];
  const byId = new Map(projects.map((project) => [project.id, project]));
  const ordered = order.flatMap((id) => {
    const project = byId.get(id);
    return project === undefined ? [] : [project];
  });
  const added = projects.filter((project) => !order.includes(project.id));
  return [...added, ...ordered];
}

/**
 * 서가에 카드로 놓을 프로젝트인지. 확정한 답변이 하나도 없는(아무 작업도 하지 않은) 프로젝트는
 * 썸네일을 만들지 않고 서가에서 뺀다(#227). 서버·가짜 응답 모두 확정 답변이 없으면 coverThumbUrl 이 null 이다.
 */
export function hasWork(project: ProjectSummary): boolean {
  return project.coverThumbUrl !== null;
}

/**
 * 보이는 카드 순서(visibleIds)에서 movedId 가 놓인 자리를, 서가 전체(fullIds, 숨긴 빈 프로젝트 포함) 순번으로 바꾼다.
 * 서버의 shelfPosition 은 전체 순번이라서, 바로 뒤 카드 앞(없으면 바로 앞 카드 뒤)에 끼우는 자리를 돌려준다.
 */
export function fullShelfPosition(
  fullIds: readonly string[],
  visibleIds: readonly string[],
  movedId: string,
): number {
  const rest = fullIds.filter((id) => id !== movedId);
  const at = visibleIds.indexOf(movedId);
  const next = visibleIds[at + 1];
  const nextAt = next === undefined ? -1 : rest.indexOf(next);
  if (nextAt >= 0) return nextAt;
  const prev = at > 0 ? visibleIds[at - 1] : undefined;
  const prevAt = prev === undefined ? -1 : rest.indexOf(prev);
  return prevAt >= 0 ? prevAt + 1 : 0;
}

/** movedId 를 target 순번(범위를 넘으면 맨 끝)에 넣은 새 id 순서. 서버 planShelfOrder 와 같다. */
export function placeAt(ids: readonly string[], movedId: string, target: number): string[] {
  const rest = ids.filter((id) => id !== movedId);
  const index = Math.min(Math.max(target, 0), rest.length);
  return [...rest.slice(0, index), movedId, ...rest.slice(index)];
}

/** from 칸의 카드를 to 칸으로 옮긴 새 순서. 칸 번호가 범위를 벗어나면 순서를 그대로 둔다. */
export function moveCard<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || to < 0 || to >= list.length) return next;
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...list];
  next.splice(to, 0, moved);
  return next;
}
