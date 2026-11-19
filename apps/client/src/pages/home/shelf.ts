import type { ProjectSummary } from '@tome/shared';

/** 서가 카드 종류. 디자인의 my work / Remix / Derive 변형에 맞춘다. */
export type ShelfCardType = 'my-work' | 'remix' | 'derive';

/** 카드 위 태그 종류. */
export type ShelfTag = 'finished' | 'posted';

/** 서가 순서(shelfPosition)대로 정렬한 새 배열. 원본은 바꾸지 않는다. */
export function sortShelf(projects: readonly ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((a, b) => a.shelfPosition - b.shelfPosition);
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

/** from 칸의 카드를 to 칸으로 옮긴 새 순서. 칸 번호가 범위를 벗어나면 순서를 그대로 둔다. */
export function moveCard<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || to < 0 || to >= list.length) return next;
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...list];
  next.splice(to, 0, moved);
  return next;
}
