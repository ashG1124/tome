import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COPY } from '../copy';
import { Flash } from './Flash';

describe('Flash', () => {
  it('보여 줄 것이 없어도 status 칸은 늘 있다(새 글을 낭독하도록)', () => {
    render(<Flash kind={null} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it.each([
    ['done', COPY['D-10'], 'done'],
    ['update', COPY['W-05'], 'history'],
    ['stack', COPY['W-07'], 'version-stacking'],
  ] as const)('%s 는 시안 문구와 아이콘을 보여 준다', (kind, text, icon) => {
    const { container } = render(<Flash kind={kind} />);
    expect(screen.getByRole('status').textContent).toBe(text);
    expect(container.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
  });
});
