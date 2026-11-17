import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { COPY } from '../copy';
import { AppHeader, type AppHeaderSection } from './AppHeader';

function renderHeader(current: AppHeaderSection | null) {
  const router = createMemoryRouter(
    [{ path: '*', element: <AppHeader current={current} profileTo="/creators/me-1" /> }],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
}

describe('AppHeader', () => {
  it('TÓME·AGORA 링크와 내 프로필 링크가 이름과 주소를 갖는다', () => {
    renderHeader('tome');
    expect(screen.getByRole('link', { name: COPY['W-06'] }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: COPY['HD-01'] }).getAttribute('href')).toBe('/agora');
    expect(screen.getByRole('link', { name: COPY['HD-02'] }).getAttribute('href')).toBe(
      '/creators/me-1',
    );
  });

  it('지금 있는 곳만 aria-current 이고 진한 글자색이다', () => {
    renderHeader('agora');
    const tome = screen.getByRole('link', { name: COPY['W-06'] });
    const agora = screen.getByRole('link', { name: COPY['HD-01'] });
    expect(agora.getAttribute('aria-current')).toBe('page');
    expect(tome.getAttribute('aria-current')).toBeNull();
    expect(agora.className).toContain('--color-font-strong');
    expect(tome.className).toContain('--color-font-helper-text');
  });

  it('어디도 아니면(ETC) 둘 다 연하다', () => {
    renderHeader(null);
    for (const name of [COPY['W-06'], COPY['HD-01']]) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('aria-current')).toBeNull();
      expect(link.className).toContain('--color-font-helper-text');
    }
  });

  it('글자 로고는 장식이라 낭독기에서 숨긴다', () => {
    renderHeader('tome');
    for (const mark of document.querySelectorAll('[data-wordmark]')) {
      expect(mark.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
