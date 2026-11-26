/**
 * 펼친 노드 안에서 값을 고치거나 무언가를 하는 곳. 여기를 누르는 것은 노드를 접는 누르기가 아니다.
 * 숫자 휠·좌표 판은 둘레의 여백까지(.node-edit-control) 넣어, 살짝 빗나간 누름으로 노드가 접히지 않게 한다.
 */
const CONTROLS = [
  'button',
  'input',
  'label',
  'a',
  '[role="slider"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[role="tablist"]',
  '.node-edit-control',
  '.node-open-tool',
].join(', ');

/**
 * 펼친 노드를 다시 누른 것인가(#261). 그러면 그 노드를 접는다.
 * 안의 단추·스위치·숫자 휠을 누른 것, 글자를 긁어 고른 뒤 뗀 것은 아니다.
 */
export function isCloseClick(event: { target: EventTarget | null; currentTarget: Element }) {
  if (event.target instanceof Element && event.target.closest(CONTROLS)) return false;
  const picked = typeof window === 'undefined' ? null : window.getSelection();
  if (picked && !picked.isCollapsed && event.currentTarget.contains(picked.anchorNode))
    return false;
  return true;
}
