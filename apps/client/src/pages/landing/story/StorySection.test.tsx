import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '../../../shared/copy';
import { ScrollTrigger } from '../motion';
import { StorySection } from './StorySection';
import { resetSlowDetection } from './storyMode';

vi.mock('../assets', () => ({
  landingAsset: (name: string) => `/fake/${name}`,
}));

function renderStory(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <StorySection />
    </MemoryRouter>,
  );
}

/** matchMedia 를 흉내 낸다. noPreference 가 true 면 "움직임 줄이기 아님" */
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
  resetSlowDetection();
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function modeOf(container: HTMLElement) {
  return container.querySelector('[data-story-mode]')?.getAttribute('data-story-mode');
}

/** 줄마다 진짜 목록(복제본 제외)의 카드 수 */
function rowCounts(container: HTMLElement) {
  return (['projects', 'creators', 'topics'] as const).map(
    (kind) =>
      container.querySelectorAll(`[data-roll-row="${kind}"] ul:not([aria-hidden]) > li`).length,
  );
}

describe('스크롤 스토리 — 정지 화면 모드(움직임 줄이기)', () => {
  it('ScrollTrigger 를 만들지 않고 제목·부제·라벨·Try Remix 버튼을 차례로 그린다', () => {
    stubMotion(false);
    const { container } = renderStory();
    expect(modeOf(container)).toBe('static');
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    // 제목은 그림 글자(aria-hidden)와 이름(sr 텍스트)으로 이뤄져 접근 이름이 문구 그대로다
    for (const id of ['ON-23a', 'ON-23b', 'ON-23c'] as const) {
      expect(screen.getByRole('heading', { level: 2, name: COPY[id] })).toBeTruthy();
    }
    expect(screen.getByText(COPY['ON-24'])).toBeTruthy();
    expect(screen.getByText(COPY['ON-25'])).toBeTruthy();
    expect(screen.getByText(COPY['ON-26'])).toBeTruthy();
    expect(screen.getByText(COPY['ON-27'])).toBeTruthy();
    expect(screen.getByText(COPY['ON-29'])).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY['ON-28'] })).toBeTruthy();
    expect(screen.getByRole('region', { name: COPY['ON-22'] })).toBeTruthy();
  });

  it('롤링 3줄은 카드 9·11·8장이고 복제본·aria-hidden 줄이 없다', () => {
    stubMotion(false);
    const { container } = renderStory();
    expect(rowCounts(container)).toEqual([9, 11, 8]);
    expect(container.querySelectorAll('[data-roll-clone]')).toHaveLength(0);
    for (const label of ['ON-30a', 'ON-30b', 'ON-30c'] as const) {
      expect(screen.getByRole('list', { name: COPY[label] })).toBeTruthy();
    }
    expect(container.querySelector('[data-roll-row][aria-hidden]')).toBeNull();
  });

  it('?motion=off 면 움직임 줄이기가 아니어도 정지 화면 모드다', () => {
    stubMotion(true);
    const { container } = renderStory('/?motion=off');
    expect(modeOf(container)).toBe('static');
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it('Try Remix 버튼을 누르면 Remix with 패널 그림으로 스크롤한다', () => {
    stubMotion(false);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderStory();
    fireEvent.click(screen.getByRole('button', { name: COPY['ON-28'] }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('링크가 없고 href="#" 도 없다', () => {
    stubMotion(false);
    const { container } = renderStory();
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelector('[href="#"]')).toBeNull();
  });

  it('이미지 불러오기에 실패하면 회색 자리 표시로 바뀐다', () => {
    stubMotion(false);
    const { container } = renderStory();
    const img = container.querySelector('img[src="/fake/story-home.webp"]') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('width')).toBe('2661');
    expect(img.getAttribute('height')).toBe('1741');
    fireEvent.error(img);
    expect(container.querySelector('img[src="/fake/story-home.webp"]')).toBeNull();
    expect(container.querySelector('[data-landing-placeholder="story-home.webp"]')).not.toBeNull();
  });
});

describe('스크롤 스토리 — 연출 모드', () => {
  it('ScrollTrigger 가 걸리고 롤링 줄은 복제본을 한 번 더 이어 붙이며, 떠나면 모두 정리된다', () => {
    stubMotion(true);
    const { container, unmount } = renderStory();
    expect(modeOf(container)).toBe('motion');
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);
    expect(rowCounts(container)).toEqual([9, 11, 8]);
    expect(container.querySelectorAll('[data-roll-clone]')).toHaveLength(3);
    const track = container.querySelector('[data-roll-track]') as HTMLElement;
    expect(within(track).getAllByRole('list')).toHaveLength(1); // 복제본은 읽기 대상이 아니다
    act(() => unmount());
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  }, 20_000);

  it('프레임 간격이 평균 40ms 를 넘으면 연출을 걷어 내고 정지 화면 모드로 바꾼다', () => {
    stubMotion(true);
    let observed: IntersectionObserverCallback = () => {};
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        observed = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(performance, 'now').mockReturnValue(0);

    const { container } = renderStory();
    expect(modeOf(container)).toBe('motion');
    act(() => {
      observed([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    // 60ms 간격(≈16fps)으로 1초 넘게 프레임이 온다
    act(() => {
      for (let time = 0; time <= 1200; time += 60) frames.shift()?.(time);
    });
    expect(modeOf(container)).toBe('static');
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  }, 20_000);
});
