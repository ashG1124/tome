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
});
