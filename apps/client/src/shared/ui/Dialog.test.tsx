import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('제목·설명으로 이름 붙은 모달이다', () => {
    render(<Dialog open title="Title" description="Desc" />);
    const dialog = screen.getByRole('dialog', { name: 'Title' });
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('뒤 배경은 기본이 회색(dim)이다', () => {
    render(<Dialog open title="Title" description="Desc" />);
    expect(document.querySelector('[data-backdrop]')?.getAttribute('data-backdrop')).toBe('dim');
  });

  it('backdrop="yellow" 면 Yellow Dim 배경을 쓴다', () => {
    render(<Dialog open title="Title" description="Desc" backdrop="yellow" />);
    const overlay = document.querySelector('[data-backdrop]');
    expect(overlay?.getAttribute('data-backdrop')).toBe('yellow');
    expect(overlay?.className).toContain('--color-dim-from');
  });
});
