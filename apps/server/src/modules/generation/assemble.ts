import type { Excluded, Node, Phrases } from '@tome/shared';

/** 프롬프트 최대 길이(Answer.assembledPrompt 컬럼 크기와 같다). */
export const ASSEMBLED_PROMPT_MAX = 2048;

const DEFAULT_WEIGHT = 5;

export interface AssembleResult {
  assembledPrompt: string;
  phrases: Phrases;
  excluded: Excluded;
}

type Axis = readonly [string, string];

function strength(weight: number, text: string): string {
  if (weight >= 7) return `strongly emphasized ${text}`;
  if (weight >= 4) return text;
  return `a subtle touch of ${text}`;
}

function padAdjective(value: number, axis: Axis): string | null {
  if (!value) return null;
  const label = value < 0 ? axis[0] : axis[1];
  const magnitude = Math.abs(value);
  if (magnitude >= 5) return `extremely ${label}`;
  if (magnitude >= 3) return label;
  return `slightly ${label}`;
}

/** 켜진 keyword·attribute 한 개의 문구(강도 + keyword 는 패드 형용사). */
export function phraseOf(node: Node): string {
  let phrase = strength(node.weight ?? DEFAULT_WEIGHT, node.text);
  if (node.kind === 'keyword' && node.pad) {
    const adjectives = [
      padAdjective(node.pad.x, node.pad.xAxis),
      padAdjective(node.pad.y, node.pad.yAxis),
    ].filter((a): a is string => a !== null);
    if (adjectives.length > 0) phrase += ` (${adjectives.join(', ')})`;
  }
  return phrase;
}

/** 자리를 지운 문장의 빈 괄호·겹친 공백·앞뒤 쉼표를 정리한다. */
export function tidySubject(text: string): string {
  return text
    .replace(/\(\s*[,;]?\s*\)/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;])(\s*[,;])+/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;.]+/, '')
    .replace(/[\s,;.]+$/, '')
    .trim();
}

function build(subject: string, phrases: readonly string[]): string {
  const sentences = [subject, phrases.join(', ')].filter((part) => part !== '');
  return sentences.map((s) => `${s}.`).join(' ');
}

/**
 * 켜진 노드로 이미지 프롬프트를 만든다(AI 호출 없음, 같은 입력이면 같은 결과).
 * - 주제: subjectTemplate 의 {kN} 을 켜진 keyword 글로 채우고 꺼진 keyword 자리는 지운다.
 * - 문구: 켜지고 weight>0 인 keyword·attribute 를 weight 큰 순서(같으면 keyword 먼저, id 순)로 잇는다.
 * - evidence 는 프롬프트에 넣지 않고 excluded 에 적는다. dataType·priority 는 아예 다루지 않는다.
 * - 길이를 넘으면 뒤에서부터 문구를 뺀다(length).
 */
export function assemblePrompt(subjectTemplate: string, nodes: readonly Node[]): AssembleResult {
  const keywords = new Map(nodes.filter((n) => n.kind === 'keyword').map((n) => [n.id, n]));
  const subject = tidySubject(
    subjectTemplate.replace(/\{([a-z]\d+)\}/g, (_match, id: string) => {
      const keyword = keywords.get(id);
      return keyword?.enabled ? keyword.text : '';
    }),
  );

  const skipped: Excluded = []; // off·weight0 (노드 순서)
  const evidence: Excluded = [];
  const length: Excluded = [];
  const active: Node[] = [];
  for (const node of nodes) {
    if (node.kind === 'evidence') {
      evidence.push({ id: node.id, reason: 'evidence-excluded' });
    } else if (node.kind === 'keyword' || node.kind === 'attribute') {
      if (!node.enabled) skipped.push({ id: node.id, reason: 'off' });
      else if ((node.weight ?? DEFAULT_WEIGHT) <= 0)
        skipped.push({ id: node.id, reason: 'weight0' });
      else active.push(node);
    }
  }
  active.sort(
    (a, b) =>
      (b.weight ?? DEFAULT_WEIGHT) - (a.weight ?? DEFAULT_WEIGHT) ||
      (a.kind === b.kind ? 0 : a.kind === 'keyword' ? -1 : 1) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const items = active.map((node) => ({ id: node.id, phrase: phraseOf(node) }));
  let prompt = build(
    subject,
    items.map((i) => i.phrase),
  );
  while (prompt.length > ASSEMBLED_PROMPT_MAX && items.length > 0) {
    length.push({ id: items.pop()!.id, reason: 'length' });
    prompt = build(
      subject,
      items.map((i) => i.phrase),
    );
  }

  return {
    assembledPrompt: prompt.slice(0, ASSEMBLED_PROMPT_MAX),
    phrases: Object.fromEntries(items.map((i) => [i.id, i.phrase])),
    excluded: [...skipped, ...evidence, ...length],
  };
}
