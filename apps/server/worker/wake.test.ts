import { describe, expect, it } from 'vitest';
import { isWakeTime, parseWakeWindows, type WakeWindow } from './wake';

// 시험용 시간표(실제 운영 시간과 관계없음)
const WINDOWS: WakeWindow[] = [
  { date: '2030-01-04', start: '12:30', end: '20:00' },
  { date: '2030-01-05', start: '09:30', end: '19:00' },
];
const utc = (iso: string) => new Date(iso);

describe('isWakeTime', () => {
  it('KST 시작 시각부터 깨운다(시작 포함)', () => {
    // KST 12:30 = UTC 03:30
    expect(isWakeTime(utc('2030-01-04T03:30:00Z'), WINDOWS)).toBe(true);
    expect(isWakeTime(utc('2030-01-04T03:29:59Z'), WINDOWS)).toBe(false);
  });

  it('KST 끝 시각에는 깨우지 않는다(끝 제외)', () => {
    // KST 20:00 = UTC 11:00
    expect(isWakeTime(utc('2030-01-04T10:59:00Z'), WINDOWS)).toBe(true);
    expect(isWakeTime(utc('2030-01-04T11:00:00Z'), WINDOWS)).toBe(false);
  });

  it('UTC 로는 전날이어도 KST 날짜로 판단한다', () => {
    // KST 2030-01-05 09:30 = UTC 2030-01-05 00:30, KST 2030-01-05 09:00 = UTC 2030-01-05 00:00
    expect(isWakeTime(utc('2030-01-05T00:30:00Z'), WINDOWS)).toBe(true);
    expect(isWakeTime(utc('2030-01-05T00:00:00Z'), WINDOWS)).toBe(false);
    // UTC 2030-01-04 23:00 = KST 2030-01-05 08:00 → 아직 시작 전
    expect(isWakeTime(utc('2030-01-04T23:00:00Z'), WINDOWS)).toBe(false);
  });

  it('시간표에 없는 날은 깨우지 않는다', () => {
    expect(isWakeTime(utc('2030-01-06T03:00:00Z'), WINDOWS)).toBe(false);
  });

  it('시간표가 비면 깨우지 않는다', () => {
    expect(isWakeTime(utc('2030-01-04T05:00:00Z'), [])).toBe(false);
  });
});

describe('parseWakeWindows', () => {
  it('올바른 JSON 은 그대로 읽는다', () => {
    expect(parseWakeWindows(JSON.stringify(WINDOWS))).toEqual(WINDOWS);
  });

  it.each([
    ['없음', undefined],
    ['빈 문자열', ''],
    ['JSON 아님', 'not json'],
    ['배열 아님', '{"date":"2030-01-04","start":"12:30","end":"20:00"}'],
    ['날짜 형식 틀림', '[{"date":"2030-1-4","start":"12:30","end":"20:00"}]'],
    ['시각 형식 틀림', '[{"date":"2030-01-04","start":"9:30","end":"20:00"}]'],
    ['시작이 끝보다 늦음', '[{"date":"2030-01-04","start":"20:00","end":"12:30"}]'],
    ['항목 하나만 틀려도', '[{"date":"2030-01-04","start":"12:30","end":"20:00"},{"date":"x"}]'],
  ])('%s → 빈 목록(깨우지 않음)', (_name, raw) => {
    expect(parseWakeWindows(raw)).toEqual([]);
  });
});
