import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Icon } from './Icon';

vi.mock('./icon-registry', () => ({
  ICON_URLS: { edit: '/assets/icon-edit.svg' },
}));

describe('Icon', () => {
  it('파일이 있는 이름은 mask 로 그리고 글자색을 따른다', () => {
    const { container } = render(<Icon name="edit" size={24} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.maskImage).toContain('/assets/icon-edit.svg');
    expect(el.style.backgroundColor).toBe('currentcolor');
    expect(el.style.width).toBe('24px');
    expect(el.style.height).toBe('24px');
    expect(el.dataset.iconMissing).toBeUndefined();
  });

  it('파일이 없는 이름은 같은 크기의 빈 자리를 그린다', () => {
    const { container } = render(<Icon name="no-such-icon" size={32} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.dataset.iconMissing).toBe('true');
    expect(el.style.width).toBe('32px');
    expect(el.style.height).toBe('32px');
    expect(el.style.maskImage).toBeFalsy();
    expect(el.style.backgroundColor).toBe('');
    expect(el.childElementCount).toBe(0);
    expect(el.textContent).toBe('');
  });
});
