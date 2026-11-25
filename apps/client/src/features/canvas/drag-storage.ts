import type { Point } from './drag-model';

/**
 * 끌어 옮긴 노드 자리(#237). 새로고침해도 남도록 프로젝트·페이지별로 브라우저(localStorage)에 둔다.
 * 서버에 저장하지 않으므로 같은 브라우저에서만 이어진다(전시장 PC처럼 여러 사람이 한 브라우저를 쓰면 함께 쓴다).
 * 저장소를 못 쓰는 환경(사생활 보호 창·차단)에서는 조용히 저장하지 않고, 읽은 값이 이상하면 버린다.
 */
export const DRAG_STORAGE_PREFIX = 'tome.canvas.drag.';
export const DRAG_STORAGE_VERSION = 1;
/** 한 페이지에 남기는 단위 수. 넘치면 오래 전에 끈 것부터 버린다. */
export const DRAG_UNITS_MAX = 300;
/** 남기는 페이지 수. 넘치면 오래 전에 저장한 페이지부터 지운다. */
export const DRAG_PAGES_MAX = 40;
/** 이보다 멀리 끈 값은 잘못된 값으로 본다(캔버스 좌표). */
const OFFSET_LIMIT = 100_000;

const STAGE = '(?:analyze|research|evidence|draft|verify)';
/** drag-model.ts dragUnits 가 만드는 단위 id 모양만 받는다. */
const UNIT = new RegExp(
  `^([A-Za-z0-9_-]{1,64}):(?:prompt|origin|answer|column:[1-5]|group:${STAGE}-\\d{1,4})$`,
);

interface StoredDrag {
  v: typeof DRAG_STORAGE_VERSION;
  savedAt: number;
  offsets: Record<string, [number, number]>;
}

export function dragStorageKey(projectId: string, pageId: string): string {
  return `${DRAG_STORAGE_PREFIX}${projectId}.${pageId}`;
}

/** 단위 id 의 세트 id. 모양이 다르면 undefined. */
export function dragUnitSet(unit: string): string | undefined {
  return UNIT.exec(unit)?.[1];
}

const validOffset = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) &&
  value.every((entry) => Math.abs(entry as number) <= OFFSET_LIMIT);

/** 저장한 글을 단위별 거리로 되돌린다. 버전·모양이 다르거나 모르는 단위·이상한 값은 버린다. */
export function parseDragOffsets(raw: string | null): Map<string, Point> {
  const offsets = new Map<string, Point>();
  if (!raw) return offsets;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return offsets;
  }
  if (
    typeof stored !== 'object' ||
    stored === null ||
    (stored as Partial<StoredDrag>).v !== DRAG_STORAGE_VERSION
  )
    return offsets;
  const entries = (stored as Partial<StoredDrag>).offsets;
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) return offsets;
  for (const [unit, value] of Object.entries(entries)) {
    if (offsets.size >= DRAG_UNITS_MAX) break;
    if (!dragUnitSet(unit) || !validOffset(value)) continue;
    if (value[0] === 0 && value[1] === 0) continue;
    offsets.set(unit, { x: value[0], y: value[1] });
  }
  return offsets;
}

/**
 * 저장할 글. sets 를 주면 그 세트의 단위만 남긴다(지운 세트의 자리는 버린다). 넘치면 뒤(최근)의 것만 남긴다.
 * 남길 것이 없으면 undefined.
 */
export function serializeDragOffsets(
  offsets: ReadonlyMap<string, Point>,
  sets?: ReadonlySet<string>,
  savedAt = Date.now(),
): string | undefined {
  const kept = [...offsets].filter(([unit, offset]) => {
    const set = dragUnitSet(unit);
    return (
      !!set &&
      (!sets || sets.has(set)) &&
      validOffset([offset.x, offset.y]) &&
      (offset.x !== 0 || offset.y !== 0)
    );
  });
  if (kept.length === 0) return undefined;
  const stored: StoredDrag = {
    v: DRAG_STORAGE_VERSION,
    savedAt,
    offsets: Object.fromEntries(
      kept.slice(-DRAG_UNITS_MAX).map(([unit, { x, y }]) => [unit, [x, y]]),
    ),
  };
  return JSON.stringify(stored);
}

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readDragOffsets(key: string): Map<string, Point> {
  try {
    return parseDragOffsets(storage()?.getItem(key) ?? null);
  } catch {
    return new Map();
  }
}

/** 다른 페이지 자리가 너무 많이 쌓이면 오래 전에 저장한 것부터 지운다. */
function prunePages(store: Storage, keep: string) {
  const pages: { key: string; savedAt: number }[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key?.startsWith(DRAG_STORAGE_PREFIX) || key === keep) continue;
    let savedAt = 0;
    try {
      const value: unknown = JSON.parse(store.getItem(key) ?? '');
      const at = (value as Partial<StoredDrag> | null)?.savedAt;
      if (typeof at === 'number' && Number.isFinite(at)) savedAt = at;
    } catch {
      // 못 읽는 값은 가장 오래된 것으로 본다.
    }
    pages.push({ key, savedAt });
  }
  const extra = pages.length + 1 - DRAG_PAGES_MAX;
  if (extra <= 0) return;
  pages.sort((a, b) => a.savedAt - b.savedAt);
  for (const page of pages.slice(0, extra)) store.removeItem(page.key);
}

/** 끈 자리를 저장한다. 끈 것이 하나도 없으면 지운다. */
export function writeDragOffsets(
  key: string,
  offsets: ReadonlyMap<string, Point>,
  sets?: ReadonlySet<string>,
): void {
  try {
    const store = storage();
    if (!store) return;
    const value = serializeDragOffsets(offsets, sets);
    if (value === undefined) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, value);
    prunePages(store, key);
  } catch {
    // 저장소가 가득 찼거나 막혀 있으면 이번 자리는 저장하지 않는다(화면은 그대로 둔다).
  }
}
