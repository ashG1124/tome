/** 루트 안에서 요소를 찾는 작은 도우미(MY WORK·REMIX 연출 공용) */

/** 없으면 만드는 쪽 실수라서 바로 알린다. */
export function must<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`landing chapter: ${selector} not found`);
  return found;
}

export const all = (root: ParentNode, selector: string): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(selector));

/** className 이름들을 공백으로 잇는다(거짓 값은 건너뜀) */
export const cx = (...names: Array<string | false | undefined>): string =>
  names.filter(Boolean).join(' ');
