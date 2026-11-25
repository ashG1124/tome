/** 누른 채 이만큼(px) 넘게 움직여야 끌기로 본다. 그보다 적게 움직이고 떼면 클릭(프로젝트 열기)이다. */
export const DRAG_THRESHOLD = 6;

/** 카드 칸 자리(서가 기준 좌표, 변형 전 배치). */
export interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 누른 자리에서 움직인 거리가 끌기 기준을 넘었는지. */
export function passedThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/** (x, y) 에서 가운데가 가장 가까운 칸 번호. 칸이 없으면 -1. */
export function nearestSlot(slots: readonly Slot[], x: number, y: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  slots.forEach((slot, index) => {
    const distance = Math.hypot(slot.x + slot.width / 2 - x, slot.y + slot.height / 2 - y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * 끌고 있는 카드(from)를 over 칸에 놓는다고 할 때, index 칸 카드가 미리 비켜 설 칸 번호.
 * 끄는 카드 자신은 그대로 돌려준다(포인터를 따라간다).
 */
export function previewIndex(index: number, from: number, over: number): number {
  if (index === from) return index;
  if (from < over && index > from && index <= over) return index - 1;
  if (over < from && index >= over && index < from) return index + 1;
  return index;
}

/** from 칸에서 to 칸까지 옮겨 그리는 거리. */
export function slotDelta(
  slots: readonly Slot[],
  from: number,
  to: number,
): { x: number; y: number } {
  const a = slots[from];
  const b = slots[to];
  if (a === undefined || b === undefined) return { x: 0, y: 0 };
  return { x: b.x - a.x, y: b.y - a.y };
}
