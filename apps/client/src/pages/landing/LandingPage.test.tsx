import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '../../shared/copy';
import { LandingPage } from './LandingPage';
import { gsap, ScrollTrigger } from './motion';
import { resetSlowDetection } from './motionMode';

const lenisCalls = vi.hoisted(() => ({
  created: 0,
  destroyed: 0,
  scrollTo: [] as unknown[][],
}));

vi.mock('lenis', () => ({
  default: class FakeLenis {
    constructor() {
      lenisCalls.created += 1;
    }
    on() {}
    off() {}
    raf() {}
    scrollTo(...args: unknown[]) {
      lenisCalls.scrollTo.push(args);
    }
    destroy() {
      lenisCalls.destroyed += 1;
    }
  },
}));

const assets = vi.hoisted(() => ({ present: true }));
vi.mock('./assets', () => ({
  landingAsset: (name: string) => (assets.present ? `/fake/${name}` : undefined),
}));

function renderLanding(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/enter" element={<p>입장 화면</p>} />
      </Routes>
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
  Element.prototype.scrollIntoView = vi.fn();
  lenisCalls.created = 0;
  lenisCalls.destroyed = 0;
  lenisCalls.scrollTo = [];
  assets.present = true;
  resetSlowDetection();
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

const isBefore = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('인트로 랜딩 — 구성과 문구', () => {
  it('섹션 순서: 히어로 → Our Vision → Volumes → Three ways → MY WORK → REMIX → DERIVE → 푸터', () => {
    stubMotion(false);
    const { container } = renderLanding();
    const hero = screen.getByRole('heading', { level: 1 });
    const vision = screen.getByText(COPY['ON-05']);
    const volumes = screen.getByRole('heading', { level: 2, name: 'Volumes of Thinking' });
    const ways = screen.getByText(COPY['ON-09']);
    const chapters = ['mywork', 'remix', 'derive'].map(
      (id) => container.querySelector(`#${id}[data-chapter="${id}"]`) as HTMLElement,
    );
    const footer = container.querySelector('footer') as HTMLElement;
    const order = [hero, vision, volumes, ways, ...chapters, footer];
    for (const el of order) expect(el).toBeTruthy();
    for (let i = 1; i < order.length; i++) {
      expect(isBefore(order[i - 1] as Element, order[i] as Element)).toBe(true);
    }
  });

  it('문구 ID 가 그대로 그려진다(히어로·Vision·Three ways·챕터 제목·푸터)', () => {
    stubMotion(false);
    const { container } = renderLanding();
    const text = container.textContent ?? '';
    const ids = [
      'ON-04',
      'ON-05',
      'ON-06a',
      'ON-06b',
      'ON-07a',
      'ON-07b',
      'ON-07c',
      'ON-08a',
      'ON-08b',
      'ON-09',
      'ON-10a',
      'ON-10b',
      'ON-11',
      'ON-13a',
      'ON-14a',
      'ON-14b',
      'ON-14c',
      'ON-24',
      'ON-32a',
      'ON-32b',
      'ON-15',
      'ON-20',
    ] as const;
    for (const id of ids) expect(text).toContain(COPY[id]);
  });

  it('제목 계층: h1 은 TÓME, h2 에 Volumes·Three ways·CONTACT 가 있다', () => {
    stubMotion(false);
    renderLanding();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(COPY['W-06']);
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    expect(h2).toContain('Volumes of Thinking');
    expect(h2).toContain(COPY['ON-15']);
    expect(h2.some((text) => text.includes(COPY['ON-10a']))).toBe(true);
  });

  it('연결 기능 없는 링크가 없다: href="#"·mailto·Explore·Pricing 없음, Get Started 는 한 곳', () => {
    stubMotion(false);
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
    stubMotion(false);
    const { container } = renderLanding();
    const footer = container.querySelector('footer') as HTMLElement;
    expect(within(footer).getByRole('heading', { name: COPY['ON-15'] })).toBeTruthy();
    for (const id of ['ON-16a', 'ON-16b', 'ON-17', 'ON-18', 'ON-19a', 'ON-19b', 'ON-20'] as const) {
      expect(footer.textContent).toContain(COPY[id]);
    }
    expect(within(footer).getByText(COPY['ON-18']).closest('a')).toBeNull();
  });

  it('포커스 순서: 로고 → 챕터 메뉴 3개 → Get Started → 맨 위로 버튼', () => {
    stubMotion(false);
    const { container } = renderLanding();
    const order = [...container.querySelectorAll('a, button')].map(
      (el) => el.getAttribute('aria-label') ?? el.textContent,
    );
    expect(order).toEqual([
      COPY['W-06'],
      COPY['ON-02a'],
      COPY['ON-02b'],
      COPY['ON-02c'],
      COPY['ON-03'],
      COPY['ON-21'],
    ]);
  });
});

describe('인트로 랜딩 — 이동과 스크롤', () => {
  it('Get Started 를 누르면 입장 화면(/enter)으로 간다', () => {
    stubMotion(false);
    renderLanding();
    const cta = screen.getByRole('link', { name: COPY['ON-03'] });
    expect(cta.getAttribute('href')).toBe('/enter');
    fireEvent.click(cta);
    expect(screen.getByText('입장 화면')).toBeTruthy();
  });

  it('챕터 메뉴를 누르면 그 챕터로 스크롤하고, 메뉴는 화면 이동을 하지 않는다', () => {
    stubMotion(true);
    renderLanding();
    const remix = screen.getByRole('link', { name: COPY['ON-02b'] });
    expect(remix.getAttribute('href')).toBe('#remix');
    fireEvent.click(remix);
    expect(lenisCalls.scrollTo).toHaveLength(1);
    expect(lenisCalls.scrollTo[0]?.[0]).toBe(document.getElementById('remix'));
    expect(screen.queryByText('입장 화면')).toBeNull();
  });

  it('정지 모드의 챕터 메뉴는 브라우저 기본 스크롤을 쓴다', () => {
    stubMotion(false);
    renderLanding();
    fireEvent.click(screen.getByRole('link', { name: COPY['ON-02c'] }));
    expect(lenisCalls.created).toBe(0);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('맨 위로 버튼은 맨 위로 가며 포커스는 로고 링크로 간다', () => {
    stubMotion(false);
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: COPY['ON-21'] }));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(document.activeElement).toBe(screen.getByRole('link', { name: COPY['W-06'] }));
  });

  it('들어오면 맨 위에서 시작하고, 떠나면 스크롤 복원 방식을 되돌린다', () => {
    stubMotion(false);
    window.history.scrollRestoration = 'auto';
    const { unmount } = renderLanding();
    expect(window.history.scrollRestoration).toBe('manual');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    unmount();
    expect(window.history.scrollRestoration).toBe('auto');
  });
});

describe('인트로 랜딩 — 움직임 줄이기(정지 화면)', () => {
  it('Lenis·ScrollTrigger·트윈을 만들지 않고 정지 화면 모드로 그린다', () => {
    stubMotion(false);
    const { container } = renderLanding();
    expect(lenisCalls.created).toBe(0);
    expect(container.querySelector('[data-story-mode]')?.getAttribute('data-story-mode')).toBe(
      'static',
    );
    // 메뉴 강조용 ScrollTrigger 외에 연출용 ScrollTrigger 가 없다(pin 없음)
    expect(ScrollTrigger.getAll().filter((trigger) => trigger.pin)).toHaveLength(0);
    const tile = container.querySelector('[data-hero-tile]') as HTMLElement;
    expect(gsap.getTweensOf(tile)).toHaveLength(0);
    expect(gsap.getTweensOf(container.querySelector('[data-hero-enter]'))).toHaveLength(0);
  });

  it('?motion=off 도 정지 화면 모드다', () => {
    stubMotion(true);
    const { container } = renderLanding('/?motion=off');
    expect(container.querySelector('[data-story-mode]')?.getAttribute('data-story-mode')).toBe(
      'static',
    );
    expect(lenisCalls.created).toBe(0);
  });

  it('세 챕터가 정지 화면에서도 제목을 읽을 수 있게 모두 보인다', () => {
    stubMotion(false);
    const { container } = renderLanding();
    for (const id of ['mywork', 'remix', 'derive']) {
      const chapter = container.querySelector(`#${id}`) as HTMLElement;
      expect(chapter.querySelector('h2')?.textContent?.length).toBeGreaterThan(0);
    }
  });
});

describe('인트로 랜딩 — 자산이 없는 빌드', () => {
  it('이미지 대신 같은 크기의 빈 자리를 그리고 깨진 이미지가 없다', () => {
    stubMotion(false);
    assets.present = false;
    const { container } = renderLanding();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('[data-landing-placeholder]').length).toBeGreaterThan(10);
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('장식 이미지는 alt 가 비어 있다', () => {
    stubMotion(false);
    const { container } = renderLanding();
    const images = [...container.querySelectorAll('img')];
    expect(images.length).toBeGreaterThan(10);
    for (const img of images) expect(img.getAttribute('alt')).toBe('');
  });
});

describe('인트로 랜딩 — 연출(GSAP·Lenis)과 정리', () => {
  it('움직임 줄이기가 아니면 Lenis 와 연출이 켜진다', () => {
    stubMotion(true);
    const { container } = renderLanding();
    expect(lenisCalls.created).toBe(1);
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);
    const tile = container.querySelector('[data-hero-tile]') as HTMLElement;
    expect(gsap.getTweensOf(tile).length).toBeGreaterThan(0);
    expect(container.querySelector('[data-story-mode]')?.getAttribute('data-story-mode')).toBe(
      'motion',
    );
  }, 20_000);

  it('떠나면 Lenis destroy, ScrollTrigger kill, 트윈 되돌리기가 모두 끝난다', () => {
    stubMotion(true);
    const { container, unmount } = renderLanding();
    const tile = container.querySelector('[data-hero-tile]') as HTMLElement;
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);
    act(() => unmount());
    expect(lenisCalls.destroyed).toBe(lenisCalls.created);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(gsap.getTweensOf(tile)).toHaveLength(0);
    expect(tile.getAttribute('style') ?? '').not.toContain('translate');
    expect(document.documentElement.style.overflow).toBe('');
  }, 20_000);

  it('다시 들어와도(마운트 → 언마운트 → 마운트) 이전 연출이 남지 않는다', () => {
    stubMotion(true);
    const first = renderLanding();
    act(() => first.unmount());
    const second = renderLanding();
    const pinned = ScrollTrigger.getAll().filter((trigger) => trigger.pin);
    // 같은 pin 요소에 ScrollTrigger 가 겹쳐 쌓이지 않는다
    expect(new Set(pinned.map((trigger) => trigger.pin)).size).toBe(pinned.length);
    act(() => second.unmount());
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  }, 20_000);
});
