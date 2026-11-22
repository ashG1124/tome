import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '../../../shared/copy';
import { ScrollTrigger } from '../motion';
import { DeriveChapter } from './DeriveChapter';
import { MyWorkChapter } from './MyWorkChapter';
import { RemixChapter } from './RemixChapter';

vi.mock('../assets', () => ({ landingAsset: (name: string) => `/fake/${name}` }));

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('no-preference'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('스토리 챕터 — 정지 화면(motion=false)', () => {
  it('세 챕터가 제목을 그리고 ScrollTrigger 를 만들지 않는다', () => {
    const { container } = render(
      <>
        <MyWorkChapter motion={false} />
        <RemixChapter motion={false} />
        <DeriveChapter motion={false} />
      </>,
    );
    const text = container.textContent ?? '';
    for (const id of ['ON-24', 'ON-29', 'ON-32a', 'ON-32b', 'ON-33a', 'ON-33b'] as const) {
      expect(text).toContain(COPY[id]);
    }
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  it('장식 이미지는 alt 가 비어 있다', () => {
    const { container } = render(<DeriveChapter motion={false} />);
    for (const img of container.querySelectorAll('img')) expect(img.getAttribute('alt')).toBe('');
  });
});

describe('스토리 챕터 — 연출(motion=true)', () => {
  it('MY WORK 는 떠날 때 헤더 투명을 풀고 모든 ScrollTrigger 를 걷는다', () => {
    const onHeaderClear = vi.fn();
    const { unmount } = render(<MyWorkChapter motion onHeaderClear={onHeaderClear} />);
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);
    act(() => unmount());
    expect(onHeaderClear).toHaveBeenLastCalledWith(false);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  }, 20_000);

  it('REMIX·DERIVE 도 떠나면 ScrollTrigger 가 남지 않는다', () => {
    const { unmount } = render(
      <>
        <RemixChapter motion />
        <DeriveChapter motion />
      </>,
    );
    expect(ScrollTrigger.getAll().length).toBeGreaterThan(0);
    act(() => unmount());
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  }, 20_000);
});
