import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { COPY } from '../copy';
import { AppHeader, type AppHeaderSection } from './AppHeader';

function renderHeader(current: AppHeaderSection | null, path = '/', avatarRing?: boolean) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AppHeader
            current={current}
            profileTo="/creators/me-1"
            {...(avatarRing === undefined ? {} : { avatarRing })}
          />
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
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

  it('ETC 여도 avatarRing 을 끄면 프로필에 바깥 테두리가 없다(남의 프로필, #262)', () => {
    renderHeader(null, '/', false);
    const profile = screen.getByRole('link', { name: COPY['HD-02'] });
    expect(profile.hasAttribute('data-avatar-ring')).toBe(false);
    expect(profile.className).not.toContain('--color-fill-neutral)');
  });

  it('TÓME·AGORA 일 때 프로필에는 바깥 테두리가 없다', () => {
    renderHeader('tome');
    expect(screen.getByRole('link', { name: COPY['HD-02'] }).hasAttribute('data-avatar-ring')).toBe(
      false,
    );
  });

  it('Figma 변형: TOME 은 검색창만, AGORA 는 검색창+탭, ETC 는 검색창이 없다', () => {
    renderHeader('tome');
    expect(screen.getByRole('search', { name: COPY['AGS-07'] })).toBeTruthy();
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toBe(COPY['AGS-03']);
    expect(screen.queryByRole('navigation', { name: COPY['AT-03'] })).toBeNull();
    expect(screen.queryByRole('link', { name: COPY['AGS-04'] })).toBeNull();
  });

  it.each([
    ['/agora', 0, 'page'],
    ['/agora/creators', 1, 'page'],
    ['/agora/topics', 2, 'page'],
    // 탭 아래 화면: 핫토픽은 Topic, 프로젝트 상세는 Project 가 고른 탭(aria-current="true")
    ['/agora/topics/t-1', 2, 'true'],
    ['/agora/projects/p-1', 0, 'true'],
  ] as const)('AGORA 변형 %s 에서는 %i 번째 탭만 aria-current=%s', (path, index, current) => {
    renderHeader('agora', path);
    const tabs = within(screen.getByRole('navigation', { name: COPY['AT-03'] })).getAllByRole(
      'link',
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      COPY['AGS-04'],
      COPY['AGS-05'],
      COPY['AGS-06'],
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-current'))).toEqual(
      [0, 1, 2].map((i) => (i === index ? current : null)),
    );
  });

  it('탭 링크는 탭 화면 주소이고 지금 검색어를 그대로 가져간다', () => {
    renderHeader('agora', '/agora?q=lind');
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href(COPY['AGS-04'])).toBe('/agora?q=lind');
    expect(href(COPY['AGS-05'])).toBe('/agora/creators?q=lind');
    expect(href(COPY['AGS-06'])).toBe('/agora/topics?q=lind');
  });

  it('ETC 변형에는 검색창이 없다', () => {
    renderHeader(null);
    expect(screen.queryByRole('search')).toBeNull();
  });
});
