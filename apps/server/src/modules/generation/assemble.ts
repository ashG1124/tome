import type { Excluded, Node, Phrases } from '@tome/shared';

/** 프롬프트 최대 길이(Answer.assembledPrompt 컬럼 크기와 같다). */
export const ASSEMBLED_PROMPT_MAX = 2048;

export interface AssembleResult {
  assembledPrompt: string;
  phrases: Phrases;
  excluded: Excluded;
}

/**
 * 켜진 노드로 이미지 프롬프트를 만든다(AI 호출 없음, 같은 입력이면 같은 결과).
 * - subjectTemplate 의 {kN} 을 켜진 keyword 글로 바꾸고, 꺼진 keyword 는 지운다(off).
 * - 켜진 attribute 중 weight>0 만 weight 큰 순서로 ", " 로 잇는다(weight 0 은 weight0, 꺼진 것은 off).
 * - 길이를 넘으면 뒤에서부터 attribute 를 뺀다(length).
 */
export function assemblePrompt(subjectTemplate: string, nodes: readonly Node[]): AssembleResult {
  const phrases: Phrases = {};
  const off: Excluded = [];
  const weight0: Excluded = [];
  const length: Excluded = [];

  const keywords = new Map(nodes.filter((n) => n.kind === 'keyword').map((n) => [n.id, n]));
  for (const node of keywords.values()) {
    if (!node.enabled) off.push({ id: node.id, reason: 'off' });
  }

  const subject = subjectTemplate
    .replace(/\{([a-z]\d+)\}/g, (_match, id: string) => {
      const keyword = keywords.get(id);
      if (!keyword || !keyword.enabled) return '';
      phrases[id] = keyword.text;
      return keyword.text;
    })
    .replace(/\s+/g, ' ')
    .trim();

  const usable: Node[] = [];
  for (const node of nodes) {
    if (node.kind !== 'attribute') continue;
    if (!node.enabled) off.push({ id: node.id, reason: 'off' });
    else if ((node.weight ?? 0) <= 0) weight0.push({ id: node.id, reason: 'weight0' });
    else usable.push(node);
  }
  // 정렬은 안정적이라 같은 weight 는 원래 순서를 지킨다.
  usable.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  const join = (attrs: readonly Node[]) =>
    [subject, ...attrs.map((a) => a.text)].filter((part) => part !== '').join(', ');

  const kept = [...usable];
  while (kept.length > 0 && join(kept).length > ASSEMBLED_PROMPT_MAX) {
    const dropped = kept.pop()!;
    length.push({ id: dropped.id, reason: 'length' });
  }
  for (const node of kept) phrases[node.id] = node.text;

  return {
    assembledPrompt: join(kept).slice(0, ASSEMBLED_PROMPT_MAX),
    phrases,
    excluded: [...off, ...weight0, ...length],
  };
}
