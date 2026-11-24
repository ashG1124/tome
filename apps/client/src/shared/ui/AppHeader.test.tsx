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

  it('어디도 아닐 때만(ETC) 프로필에 이중 원 테두리가 있다', () => {
    renderHeader(null);
    const profile = screen.getByRole('link', { name: COPY['HD-02'] });
    expect(profile.hasAttribute('data-avatar-ring')).toBe(true);
    expect(profile.className).toContain('--color-fill-neutral)');
  });

  it('TÓME·AGORA 일 때 프로필에는 바깥 테두리가 없다', () => {
    renderHeader('tome');
    expect(screen.getByRole('link', { name: COPY['HD-02'] }).hasAttribute('data-avatar-ring')).toBe(
      false,
    );
  });

  it('Figma 변형: TOME 은 검색창만, AGORA 는 검색창+필터, ETC 는 검색창이 없다', () => {
    renderHeader('tome');
    expect(screen.getByRole('search', { name: COPY['AGS-07'] })).toBeTruthy();
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toBe(COPY['AGS-03']);
    expect(screen.queryByRole('button', { name: COPY['AGS-04'] })).toBeNull();
  });

  it('AGORA 변형은 Project/Creator/Topic 필터를 두고 Project 가 기본 선택이다', () => {
    renderHeader('agora');
    const pressed = [COPY['AGS-04'], COPY['AGS-05'], COPY['AGS-06']].map((name) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed'),
    );
    expect(pressed).toEqual(['true', 'false', 'false']);
  });

  it('ETC 변형에는 검색창이 없다', () => {
    renderHeader(null);
    expect(screen.queryByRole('search')).toBeNull();
  });
});
