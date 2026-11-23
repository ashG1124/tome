import { describe, expect, it } from 'vitest';
import {
  averageFrameMs,
  decideStoryMode,
  frameDeltas,
  isMotionOff,
  isMotionOn,
  isSlowDevice,
  MIN_SAMPLES,
  SLOW_FRAME_MS,
} from './motionMode';

const steady = (ms: number, count: number) => Array.from({ length: count }, () => ms);

describe('스토리 정지 화면 모드 판정', () => {
  it('프레임 시각 목록에서 간격을 뽑고 탭 정지로 보이는 긴 간격은 뺀다', () => {
    expect(frameDeltas([0, 16, 33, 50])).toEqual([16, 17, 17]);
    expect(frameDeltas([0, 16, 2016, 2032])).toEqual([16, 16]);
    expect(frameDeltas([5])).toEqual([]);
  });

  it('평균 프레임 시간을 구한다', () => {
    expect(averageFrameMs([10, 20, 30])).toBe(20);
    expect(averageFrameMs([])).toBe(0);
  });

  it('평균이 40ms 를 넘으면 느린 PC 로 본다', () => {
    expect(SLOW_FRAME_MS).toBe(40);
    expect(isSlowDevice(steady(16.7, 60))).toBe(false);
    expect(isSlowDevice(steady(40, 25))).toBe(false); // 40ms 딱 맞으면 아직 괜찮다
    expect(isSlowDevice(steady(41, 25))).toBe(true);
    expect(isSlowDevice(steady(100, 10))).toBe(true);
  });

  it('표본이 모자라면 판단하지 않는다', () => {
    expect(isSlowDevice(steady(200, MIN_SAMPLES - 1))).toBe(false);
    expect(isSlowDevice([])).toBe(false);
  });

  it('가끔 한 프레임만 길어도 평균이 낮으면 느리다고 하지 않는다', () => {
    expect(isSlowDevice([...steady(16.7, 59), 300])).toBe(false);
  });

  it('?motion=off 만 정지 화면으로 본다', () => {
    expect(isMotionOff('?motion=off')).toBe(true);
    expect(isMotionOff('?a=1&motion=off')).toBe(true);
    expect(isMotionOff('?motion=on')).toBe(false);
    expect(isMotionOff('')).toBe(false);
  });

  it('움직임 줄이기·?motion=off·느린 PC 중 하나면 static, 아니면 motion', () => {
    const base = { search: '', reducedMotion: false, slow: false };
    expect(decideStoryMode(base)).toBe('motion');
    expect(decideStoryMode({ ...base, reducedMotion: true })).toBe('static');
    expect(decideStoryMode({ ...base, slow: true })).toBe('static');
    expect(decideStoryMode({ ...base, search: '?motion=off' })).toBe('static');
  });

  it('?motion=on 만 연출 고정으로 본다', () => {
    expect(isMotionOn('?motion=on')).toBe(true);
    expect(isMotionOn('?a=1&motion=on')).toBe(true);
    expect(isMotionOn('?motion=off')).toBe(false);
    expect(isMotionOn('')).toBe(false);
  });

  it('?motion=on 이면 느린 PC 여도 motion 으로 고정한다', () => {
    const on = { search: '?motion=on', reducedMotion: false, slow: true };
    expect(decideStoryMode(on)).toBe('motion');
    expect(decideStoryMode({ ...on, slow: false })).toBe('motion');
  });

  it('움직임 줄이기는 ?motion=on 보다 먼저라 static 이다', () => {
    expect(decideStoryMode({ search: '?motion=on', reducedMotion: true, slow: false })).toBe(
      'static',
    );
  });

  it('?motion=off 는 ?motion=on 보다 먼저라 static 이다', () => {
    expect(decideStoryMode({ search: '?motion=off', reducedMotion: false, slow: false })).toBe(
      'static',
    );
  });
});
