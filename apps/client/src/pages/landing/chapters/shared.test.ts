import { describe, expect, it } from 'vitest';
import { gsap } from '../motion';
import { HERO_TILES } from '../heroTiles';
import {
  APP_H,
  APP_RATIO,
  APP_W,
  ob,
  obAg,
  pinOptions,
  stretchRange,
  windowShadow,
} from './shared';

describe('챕터 공통 도우미', () => {
  it('기준안 이미지 이름은 ob2- 접두어를 붙인 webp 다', () => {
    expect(ob('mw_home2')).toBe('ob2-mw_home2.webp');
    expect(obAg('56749f8139')).toBe('ob2-ag-56749f8139.webp');
  });

  it('앱 화면 칸은 1728×1117 비율이다', () => {
    expect(APP_RATIO).toBeCloseTo(APP_W / APP_H, 5);
    expect(APP_W).toBe(1728);
    expect(APP_H).toBe(1117);
  });

  it('pin 설정은 화면 높이의 len 배만큼 스크롤하고 위치를 다시 잰다', () => {
    const stage = document.createElement('div');
    const vars = pinOptions(stage, 3);
    expect(vars.pin).toBe(true);
    expect(vars.start).toBe('top top');
    expect(vars.invalidateOnRefresh).toBe(true);
    expect((vars.end as () => string)()).toBe(`+=${window.innerHeight * 3}`);
  });

  it('창 그림자는 화면 배율에 비례한다', () => {
    expect(windowShadow(1)).toContain('0 4.00px 20.00px');
    expect(windowShadow(0.5)).toContain('0 2.00px 10.00px');
  });

  it('stretchRange 는 구간 안 시작 시각을 늘리고 뒤쪽을 밀어 낸다', () => {
    const tl = gsap.timeline({ paused: true });
    tl.to({}, { duration: 1 }, 0).to({}, { duration: 1 }, 2).to({}, { duration: 1 }, 5);
    stretchRange(tl, 2, 4, 2);
    const starts = tl.getChildren(false, true, true).map((child) => child.startTime());
    expect(starts).toEqual([0, 2, 7]);
    expect(tl.getChildren(false, true, true)[1]?.duration()).toBe(2);
    tl.kill();
  });
});

describe('히어로 사진 배치', () => {
  it('기준안의 사진 16장이 있고 모두 장식 이미지 파일 이름을 가진다', () => {
    expect(HERO_TILES).toHaveLength(16);
    for (const tile of HERO_TILES) {
      expect(tile.image).toMatch(/^ob2-.+\.webp$/);
      expect(tile.depth).toBeGreaterThan(0);
      expect(tile.w).toBeGreaterThan(0);
    }
  });
});
