import { describe, expect, it } from 'vitest';
import { openMatch, openRole, selectionCovers, selectionKey } from './navigation';

describe('openRole', () => {
  const selected = { setId: 's1', nodeId: 'k1', kind: 'keyword' };
  it('펼친 노드만 open 이고, 다른 세트·다른 노드는 아무것도 아니다', () => {
    expect(openRole(selected, 's1', { id: 'k1', kind: 'keyword' }, 'only')).toBe('open');
    expect(openRole(selected, 's1', { id: 'k2', kind: 'keyword' }, 'only')).toBeNull();
    expect(openRole(selected, 's2', { id: 'k1', kind: 'keyword' }, 'only')).toBeNull();
    expect(openRole(undefined, 's1', { id: 'k1', kind: 'keyword' }, 'only')).toBeNull();
  });
  it('검색 우선순위는 묶음 첫 줄이 펼쳐지고 나머지 줄은 덮인다', () => {
    const priority = { setId: 's1', nodeId: 'p2', kind: 'priority' };
    expect(openRole(priority, 's1', { id: 'p1', kind: 'priority' }, 'first')).toBe('open');
    expect(openRole(priority, 's1', { id: 'p2', kind: 'priority' }, 'middle')).toBe('covered');
    expect(openRole(priority, 's1', { id: 'p3', kind: 'priority' }, 'last')).toBe('covered');
    expect(openRole(priority, 's1', { id: 'd1', kind: 'dataType' }, 'only')).toBeNull();
  });
  it('검증 기준도 묶음 첫 줄이 펼쳐지고, 불일치는 그 노드만 펼쳐진다', () => {
    const criterion = { setId: 's1', nodeId: 'v2', kind: 'criterion' };
    expect(openRole(criterion, 's1', { id: 'v1', kind: 'criterion' }, 'first')).toBe('open');
    expect(openRole(criterion, 's1', { id: 'v2', kind: 'criterion' }, 'last')).toBe('covered');
    expect(openRole(criterion, 's1', { id: 'm1', kind: 'mismatch' }, 'only')).toBeNull();
    const mismatch = { setId: 's1', nodeId: 'm2', kind: 'mismatch' };
    expect(openRole(mismatch, 's1', { id: 'm1', kind: 'mismatch' }, 'first')).toBeNull();
    expect(openRole(mismatch, 's1', { id: 'm2', kind: 'mismatch' }, 'last')).toBe('open');
    expect(openRole(mismatch, 's1', { id: 'v1', kind: 'criterion' }, 'first')).toBeNull();
  });
});

describe('여러 노드 펼쳐 두기(#261)', () => {
  const k1 = { setId: 's1', nodeId: 'k1', kind: 'keyword' };
  const priority = { setId: 's1', nodeId: 'p2', kind: 'priority', closing: true };
  const opened = [k1, priority];

  it('펼쳐 둔 노드마다 그 카드가 open 이고, 묶음은 첫 줄이 open·나머지가 covered 다', () => {
    expect(openMatch(opened, 's1', { id: 'k1', kind: 'keyword' }, 'only')).toEqual({
      selection: k1,
      role: 'open',
    });
    expect(openMatch(opened, 's1', { id: 'p1', kind: 'priority' }, 'first')).toEqual({
      selection: priority,
      role: 'open',
    });
    expect(openMatch(opened, 's1', { id: 'p3', kind: 'priority' }, 'last')?.role).toBe('covered');
    expect(openMatch(opened, 's1', { id: 'k2', kind: 'keyword' }, 'only')).toBeUndefined();
    expect(openMatch(opened, 's2', { id: 'k1', kind: 'keyword' }, 'only')).toBeUndefined();
    expect(openMatch(undefined, 's1', { id: 'k1', kind: 'keyword' }, 'only')).toBeUndefined();
  });

  it('키는 세트와 노드로 만들고, 묶음은 같은 종류 한 줄이 열려 있으면 다른 줄도 열린 것으로 본다', () => {
    expect(selectionKey(k1)).toBe('s1:k1');
    expect(selectionCovers(k1, 's1', 'k1', 'keyword')).toBe(true);
    expect(selectionCovers(k1, 's1', 'k2', 'keyword')).toBe(false);
    expect(selectionCovers(k1, 's2', 'k1', 'keyword')).toBe(false);
    expect(selectionCovers(priority, 's1', 'p1', 'priority')).toBe(true);
    expect(selectionCovers(priority, 's1', 'd1', 'dataType')).toBe(false);
  });
});
