import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '../../shared/copy';
import { LandingPage } from './LandingPage';
import { gsap, ScrollTrigger } from './motion';

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

/** matchMedia 를 흉내 낸다. noPreference 가 true 면 "움직임 줄이기 아님"으로 답한다. */
function stubMotion(noPreference: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('no-preference') ? noPreference : !noPreference,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('인트로 랜딩', () => {
  it('Get Started 와 헤더 메뉴 4개가 모두 /enter 링크다', () => {
    renderLanding();
    const nav = screen.getByRole('navigation', { name: COPY['ON-01'] });
    const menu = within(nav).getAllByRole('link');
    expect(menu.map((link) => link.textContent)).toEqual([
      COPY['ON-02a'],
      COPY['ON-02b'],
      COPY['ON-02c'],
      COPY['ON-02d'],
    ]);
    for (const link of menu) expect(link.getAttribute('href')).toBe('/enter');
    expect(screen.getByRole('link', { name: COPY['ON-03'] }).getAttribute('href')).toBe('/enter');
  });

  it('포커스 가능한 요소는 로고 → 메뉴 → Get Started → 맨 위로 버튼 순서다', () => {
    const { container } = renderLanding();
    const order = [...container.querySelectorAll('a, button')].map(
      (el) => el.getAttribute('aria-label') ?? el.textContent,
    );
    expect(order).toEqual([
      COPY['W-06'],
      COPY['ON-02a'],
      COPY['ON-02b'],
      COPY['ON-02c'],
      COPY['ON-02d'],
      COPY['ON-03'],
      COPY['ON-21'],
    ]);
  });

  it('제목 계층: h1 은 TÓME, 섹션 제목은 h2, 카드 제목은 h3', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(COPY['W-06']);
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toContain('Volumes of Thinking');
    expect(h2).toContain(COPY['ON-15']);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      COPY['ON-13a'],
      COPY['ON-13b'],
      COPY['ON-13c'],
    ]);
  });

  it('연결 기능 없는 링크가 없다: href="#"·mailto·Explore·Pricing 없음', () => {
    const { container } = renderLanding();
    for (const link of container.querySelectorAll('a')) {
      const href = link.getAttribute('href') ?? '';
      expect(href).not.toBe('#');
      expect(href.startsWith('mailto:')).toBe(false);
    }
    for (const text of ['Explore', 'Product', 'Pricing', 'Login', 'Book a demo', 'Guestbook']) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.getAllByText(COPY['ON-03'])).toHaveLength(1);
  });

  it('푸터에 CONTACT 항목과 저작권이 있고 이메일은 링크가 아니다', () => {
    const { container } = renderLanding();
    const footer = container.querySelector('footer') as HTMLElement;
    expect(within(footer).getByRole('heading', { name: COPY['ON-15'] })).toBeTruthy();
    for (const id of ['ON-16a', 'ON-16b', 'ON-17', 'ON-18', 'ON-19a', 'ON-19b', 'ON-20'] as const) {
      expect(footer.textContent).toContain(COPY[id]);
    }
    expect(within(footer).getByText(COPY['ON-18']).closest('a')).toBeNull();
  });

  it('맨 위로 버튼은 이름이 있고, 누르면 맨 위로 가며 포커스는 로고 링크로 간다', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: COPY['ON-21'] }));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(document.activeElement).toBe(screen.getByRole('link', { name: COPY['W-06'] }));
  });

  it('들어오면 맨 위에서 시작하고, 떠나면 스크롤 복원 방식을 되돌린다', () => {
    window.history.scrollRestoration = 'auto';
    const { unmount } = renderLanding();
    expect(window.history.scrollRestoration).toBe('manual');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    unmount();
    expect(window.history.scrollRestoration).toBe('auto');
  });
});

describe('인트로 랜딩 연출(GSAP)', () => {
  it('움직임 줄이기면 트윈도 ScrollTrigger 도 만들지 않는다', () => {
    stubMotion(false);
    const { container } = renderLanding();
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    const tile = container.querySelector('[data-hero-tile]') as HTMLElement;
    expect(gsap.getTweensOf(tile)).toHaveLength(0);
    expect(gsap.getTweensOf(container.querySelector('[data-hero-enter]'))).toHaveLength(0);
  });

  it('움직임 줄이기가 아니면 연출이 걸리고, 떠나면 모두 정리된다', () => {
    stubMotion(true);
    const { container, unmount } = renderLanding();
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);
    const tile = container.querySelector('[data-hero-tile]') as HTMLElement;
    expect(gsap.getTweensOf(tile).length).toBeGreaterThan(0);
    act(() => unmount());
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });
});
