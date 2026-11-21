import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals 를 켜지 않으므로 RTL 자동 정리가 동작하지 않아 직접 등록한다.
afterEach(cleanup);

// jsdom 에는 matchMedia 가 없다. GSAP(matchMedia)이 쓰므로 기본은 "어느 조건도 맞지 않음"으로 흉내 낸다
// (→ 연출이 걸리지 않는다). 연출 테스트는 자기 안에서 window.matchMedia 를 다시 덮어쓴다.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
