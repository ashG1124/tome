import { describe, expect, it } from 'vitest';
import { openRole } from './navigation';

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
