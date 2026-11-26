import { fullShelfPosition, placeAt } from './shelf';

/**
 * 홈 서가 자유 배치(#240). 카드는 서가 격자(+ 마크 사이 칸) 어디에나 놓을 수 있다.
 * 칸은 (col, row) 로 센다. (0, 0) 은 늘 "+ Project" 칸이라 카드가 들어가지 않는다.
 * 자리는 서버에 칸 좌표를 둘 곳이 없어서 이 브라우저(localStorage)에 만든 사람별로 남긴다.
 * 서버에는 자리의 읽는 순서(위→아래, 왼→오른쪽)를 서가 순서(shelfPosition)로 계속 저장한다.
 */

/** 서가 격자의 한 칸. col 은 왼쪽부터, row 는 위부터 0. */
export interface Cell {
  col: number;
  row: number;
}

/** 프로젝트 id → 칸 */
export type CellMap = ReadonlyMap<string, Cell>;

/** + Project 칸. 카드는 이 칸에 놓을 수 없다. */
export const NEW_PROJECT_CELL: Cell = { col: 0, row: 0 };

/** 칸 번호의 상한(이 수 미만). 서가는 최대 50개라 이 정도면 넉넉하다. */
export const MAX_COLUMNS = 64;
export const MAX_ROWS = 64;

/** 서가 폭을 재지 못할 때(첫 그리기 전·테스트) 쓰는 한 줄 칸 수. 기준 화면 1728 폭의 칸 수다. */
export const BASE_COLUMNS = 13;

export const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;
const keyOf = (cell: Cell) => `${cell.col}:${cell.row}`;
const isReserved = (cell: Cell) => sameCell(cell, NEW_PROJECT_CELL);

/** 읽는 순서(위 줄 먼저, 같은 줄은 왼쪽 먼저)로 비교한다. */
export function compareCells(a: Cell, b: Cell): number {
  return a.row - b.row || a.col - b.col;
}

/** start 칸부터 읽는 순서로 훑어 처음 만나는 빈 칸. */
function firstFree(occupied: ReadonlySet<string>, start: Cell, columns: number): Cell {
  for (let row = start.row; row < MAX_ROWS * 4; row += 1) {
    for (let col = row === start.row ? start.col : 0; col < columns; col += 1) {
      const cell = { col, row };
      if (!isReserved(cell) && !occupied.has(keyOf(cell))) return cell;
    }
  }
  return { col: 0, row: MAX_ROWS * 4 };
}

/**
 * 화면에 그릴 칸 배치. ids 는 서가 순서(보이는 카드만), saved 는 저장해 둔 자리.
 * 1) 저장한 자리가 있으면 그 칸에 놓는다. 한 줄 칸 수가 줄어 오른쪽 끝을 넘으면 그 줄 마지막 칸으로 당긴다
 *    (당긴 카드는 제자리 카드보다 나중에 놓는다).
 * 2) 당긴 칸이 이미 찼으면 그 칸 다음의 첫 빈 칸(읽는 순서)으로 보낸다.
 * 3) 자리가 없는 카드(새 프로젝트)는 서가 순서대로 맨 위부터 첫 빈 칸에 놓는다.
 * 저장한 자리는 바꾸지 않으므로, 창을 다시 넓히면 원래 자리로 돌아온다.
 */
export function resolveLayout(
  ids: readonly string[],
  saved: CellMap,
  columns: number,
): Map<string, Cell> {
  const cols = Math.max(1, Math.min(columns, MAX_COLUMNS));
  const occupied = new Set<string>([keyOf(NEW_PROJECT_CELL)]);
  const placed = new Map<string, Cell>();
  const displaced: [string, Cell][] = [];
  // 저장한 칸이 지금 폭에 그대로 들어가는 카드를 먼저, 오른쪽 끝으로 당겨야 하는 카드를 나중에 놓는다
  // (좁은 폭에서 옮겨 놓은 카드가 당겨진 카드에 밀려나지 않게).
  const fits = ids.filter((id) => (saved.get(id)?.col ?? cols) < cols);
  const pulled = ids.filter((id) => (saved.get(id)?.col ?? -1) >= cols);
  for (const id of [...fits, ...pulled]) {
    const at = saved.get(id) as Cell;
    const cell = { col: Math.min(at.col, cols - 1), row: at.row };
    if (occupied.has(keyOf(cell))) {
      displaced.push([id, cell]);
      continue;
    }
    occupied.add(keyOf(cell));
    placed.set(id, cell);
  }
  for (const [id, hint] of displaced) {
    const cell = firstFree(occupied, hint, cols);
    occupied.add(keyOf(cell));
    placed.set(id, cell);
  }
  for (const id of ids) {
    if (placed.has(id)) continue;
    const cell = firstFree(occupied, NEW_PROJECT_CELL, cols);
    occupied.add(keyOf(cell));
    placed.set(id, cell);
  }
  // 서가 순서대로 돌려준다(쓰는 쪽이 읽는 순서가 필요하면 readingOrder 를 쓴다).
  return new Map(ids.map((id) => [id, placed.get(id) as Cell]));
}

/** 칸 배치를 읽는 순서(위→아래, 왼→오른쪽)로 늘어놓은 id. */
export function readingOrder(cells: CellMap): string[] {
  return [...cells].sort(([, a], [, b]) => compareCells(a, b)).map(([id]) => id);
}

/** 가장 아래 카드의 줄 번호(카드가 없으면 0 = + Project 줄). */
export function lastRow(cells: CellMap): number {
  let last = 0;
  for (const cell of cells.values()) last = Math.max(last, cell.row);
  return last;
}

/** 칸을 놓을 수 있는 범위로 자른다. + Project 칸이면 null. */
export function clampCell(cell: Cell, columns: number, maxRow: number): Cell | null {
  const clamped = {
    col: Math.min(Math.max(Math.round(cell.col), 0), Math.max(columns, 1) - 1),
    row: Math.min(Math.max(Math.round(cell.row), 0), Math.min(maxRow, MAX_ROWS - 1)),
  };
  return isReserved(clamped) ? null : clamped;
}

/**
 * id 카드를 target 칸에 놓은 새 배치. 빈 칸이면 그 칸으로 옮기고,
 * 다른 카드가 있으면 두 카드의 자리를 맞바꾼다(그 카드는 옮긴 카드가 있던 칸으로 간다).
 * 맞바꾸면 다른 카드가 줄줄이 밀리지 않아 손대지 않은 카드 자리가 그대로 남는다.
 * 옮길 수 없으면(같은 칸·+ Project 칸·모르는 id) 원래 배치를 그대로 돌려준다.
 */
export function placeCard(cells: CellMap, id: string, target: Cell): CellMap {
  const from = cells.get(id);
  if (from === undefined || isReserved(target) || sameCell(from, target)) return cells;
  const next = new Map(cells);
  for (const [other, cell] of cells) {
    if (other !== id && sameCell(cell, target)) next.set(other, from);
  }
  next.set(id, target);
  return next;
}

export type MoveDirection = 'left' | 'right' | 'up' | 'down';

/** 한 칸 옆 칸. 서가 밖·+ Project 칸이면 null. 아래로는 maxRow 까지 내려간다. */
export function stepCell(
  cell: Cell,
  direction: MoveDirection,
  columns: number,
  maxRow: number,
): Cell | null {
  const next = {
    col: cell.col + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0),
    row: cell.row + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0),
  };
  if (next.col < 0 || next.col >= columns || next.row < 0) return null;
  if (next.row > Math.min(maxRow, MAX_ROWS - 1) || isReserved(next)) return null;
  return next;
}

/**
 * 카드 하나가 오른쪽으로 넓어지면(넓은 카드 3칸, Figma Home_hover) 같은 줄에서 바로 뒤에 붙은 카드만 비켜 선다.
 * 넓어진 카드 끝 다음 칸부터 차례로 밀고, 빈 칸을 만나 더 밀 필요가 없으면 거기서 멈춘다.
 * 돌려주는 값은 카드별로 밀리는 칸 수(밀리지 않는 카드는 빠진다).
 */
export function pushShifts(
  cells: CellMap,
  openId: string | null,
  span: number,
  opensLeft: boolean,
): Map<string, number> {
  const shifts = new Map<string, number>();
  const open = openId === null ? undefined : cells.get(openId);
  if (open === undefined || opensLeft) return shifts;
  const sameRow = [...cells]
    .filter(([id, cell]) => id !== openId && cell.row === open.row && cell.col > open.col)
    .sort(([, a], [, b]) => a.col - b.col);
  let need = open.col + span;
  for (const [id, cell] of sameRow) {
    if (cell.col >= need) break;
    shifts.set(id, need - cell.col);
    need += 1;
  }
  return shifts;
}

/**
 * 서버 서가 순서를 current 에서 next 로 바꾸려면 옮겨야 하는 카드(옮길 차례대로).
 * 순서가 그대로인 가장 긴 무리(LIS)는 두고 나머지만 옮겨 저장 요청 수를 줄인다.
 * prefer 를 주면 같은 수로 끝날 때 그 카드를 옮기는 쪽을 고른다(사람이 옮긴 카드).
 * 차례는 next 의 뒤에서부터라, 각 카드를 "next 에서 바로 뒤 카드 앞" 에 끼우면 된다.
 */
export function orderMoves(
  current: readonly string[],
  next: readonly string[],
  prefer?: string,
): string[] {
  const rank = new Map(next.map((id, index) => [id, index]));
  const shared = current.filter((id) => rank.has(id));
  const keepAll = longestIncreasing(shared, rank);
  const keepOthers = longestIncreasing(
    shared.filter((id) => id !== prefer),
    rank,
  );
  const keep = keepOthers.size >= keepAll.size ? keepOthers : keepAll;
  return [...next].reverse().filter((id) => !keep.has(id));
}

/**
 * 서버 서가 순서(full, 숨긴 빈 프로젝트 포함)에서 보이는 카드 순서를 current 에서 next 로 바꾸는 저장 목록.
 * 옮길 카드마다 [id, 서가 전체 순번] 을 차례대로 돌려주고, 다 적용한 서가 전체 순서도 돌려준다.
 * 각 카드는 next 에서 바로 뒤 카드 앞에 끼운다. 뒤 카드가 없으면(맨 끝) 바로 앞 카드가 그대로면 그 뒤에,
 * 앞 카드도 옮길 카드면 서가 맨 끝에 둔다(앞 카드는 나중에 그 앞으로 들어온다).
 */
export function planShelfWrites(
  full: readonly string[],
  current: readonly string[],
  next: readonly string[],
  prefer?: string,
): { order: string[]; writes: [string, number][] } {
  const moves = orderMoves(current, next, prefer);
  const moving = new Set(moves);
  let order = [...full];
  const writes: [string, number][] = [];
  for (const id of moves) {
    const at = next.indexOf(id);
    const previous = at > 0 ? next[at - 1] : undefined;
    const last = at === next.length - 1;
    const position =
      last && previous !== undefined && moving.has(previous)
        ? order.length - 1
        : fullShelfPosition(order, next, id);
    order = placeAt(order, id, position);
    writes.push([id, position]);
  }
  return { order, writes };
}

/** ids 를 rank 순서로 봤을 때 가장 긴 오름차순 부분열의 id 묶음. */
function longestIncreasing(ids: readonly string[], rank: ReadonlyMap<string, number>): Set<string> {
  const values = ids.map((id) => rank.get(id) ?? 0);
  const tails: number[] = [];
  const parent: number[] = new Array<number>(values.length).fill(-1);
  values.forEach((value, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((values[tails[mid] as number] as number) < value) low = mid + 1;
      else high = mid;
    }
    if (low > 0) parent[index] = tails[low - 1] as number;
    tails[low] = index;
  });
  const keep = new Set<string>();
  let at = tails.length > 0 ? (tails[tails.length - 1] as number) : -1;
  while (at >= 0) {
    keep.add(ids[at] as string);
    at = parent[at] as number;
  }
  return keep;
}

// ---- 브라우저 저장(localStorage) ----

export const LAYOUT_STORAGE_PREFIX = 'tome.home.layout.';
export const LAYOUT_STORAGE_VERSION = 1;
/** 남기는 카드 자리 수. 서가는 최대 50개라 넉넉하게 둔다. */
export const LAYOUT_ENTRIES_MAX = 200;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

interface StoredLayout {
  v: typeof LAYOUT_STORAGE_VERSION;
  cells: Record<string, [number, number]>;
}

export function layoutStorageKey(creatorId: string): string {
  return `${LAYOUT_STORAGE_PREFIX}${creatorId}`;
}

const validCell = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isInteger(value[0]) &&
  Number.isInteger(value[1]) &&
  (value[0] as number) >= 0 &&
  (value[0] as number) < MAX_COLUMNS &&
  (value[1] as number) >= 0 &&
  (value[1] as number) < MAX_ROWS &&
  !(value[0] === 0 && value[1] === 0);

/** 저장한 글을 칸 배치로 되돌린다. 버전·모양이 다르거나 이상한 값은 버린다(같은 칸이 겹치면 앞의 것만). */
export function parseLayout(raw: string | null): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  if (!raw) return cells;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return cells;
  }
  if (
    typeof stored !== 'object' ||
    stored === null ||
    (stored as Partial<StoredLayout>).v !== LAYOUT_STORAGE_VERSION
  )
    return cells;
  const entries = (stored as Partial<StoredLayout>).cells;
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) return cells;
  const taken = new Set<string>();
  for (const [id, value] of Object.entries(entries)) {
    if (cells.size >= LAYOUT_ENTRIES_MAX) break;
    if (!ID.test(id) || !validCell(value)) continue;
    const cell = { col: value[0], row: value[1] };
    if (taken.has(keyOf(cell))) continue;
    taken.add(keyOf(cell));
    cells.set(id, cell);
  }
  return cells;
}

/** 저장할 글. known 을 주면 그 id(지금 있는 프로젝트)만 남긴다. */
export function serializeLayout(cells: CellMap, known?: ReadonlySet<string>): string {
  const kept: Record<string, [number, number]> = {};
  let count = 0;
  for (const [id, cell] of cells) {
    if (count >= LAYOUT_ENTRIES_MAX) break;
    if (known !== undefined && !known.has(id)) continue;
    if (!ID.test(id) || !validCell([cell.col, cell.row])) continue;
    kept[id] = [cell.col, cell.row];
    count += 1;
  }
  const stored: StoredLayout = { v: LAYOUT_STORAGE_VERSION, cells: kept };
  return JSON.stringify(stored);
}

/** 저장한 자리 읽기. 저장소를 못 쓰면(사생활 보호 창·차단) 빈 배치. */
export function readLayout(creatorId: string | null): Map<string, Cell> {
  if (creatorId === null) return new Map();
  try {
    return parseLayout(window.localStorage.getItem(layoutStorageKey(creatorId)));
  } catch {
    return new Map();
  }
}

/** 자리 저장. 저장소를 못 쓰면 조용히 넘어간다(화면 배치는 그대로). */
export function writeLayout(
  creatorId: string | null,
  cells: CellMap,
  known?: ReadonlySet<string>,
): void {
  if (creatorId === null) return;
  try {
    window.localStorage.setItem(layoutStorageKey(creatorId), serializeLayout(cells, known));
  } catch {
    // 저장소가 가득 찼거나 막혔다. 이번 화면에서는 옮긴 자리가 그대로 보인다.
  }
}
