// 운영 시간에 서버를 깨워 두는 판단 (#45).
// 시간표는 저장소에 쓰지 않고 Worker 비밀값 WAKE_WINDOWS(JSON)로 받는다.
// 형식: [{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM"}, ...]  (모두 한국 시간 KST)
// start 이상 end 미만이면 깨운다. 이 파일은 Cloudflare 전용 모듈을 쓰지 않아 Vitest 로 시험한다.

export interface WakeWindow {
  /** KST 날짜 */
  date: string;
  /** KST 시작 시각(포함) */
  start: string;
  /** KST 끝 시각(제외) */
  end: string;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 비밀값 문자열을 시간표로 바꾼다. 없거나 형식이 틀리면 빈 목록(아무 때도 깨우지 않음). */
export function parseWakeWindows(raw: string | undefined): WakeWindow[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const ok = data.every(
    (w): w is WakeWindow =>
      typeof w === 'object' &&
      w !== null &&
      typeof w.date === 'string' &&
      typeof w.start === 'string' &&
      typeof w.end === 'string' &&
      DATE_RE.test(w.date) &&
      TIME_RE.test(w.start) &&
      TIME_RE.test(w.end) &&
      w.start < w.end,
  );
  return ok ? (data as WakeWindow[]) : [];
}

/** now(UTC 시각)를 KST 로 바꿔 시간표 안인지 본다. */
export function isWakeTime(now: Date, windows: readonly WakeWindow[]): boolean {
  const kst = new Date(now.getTime() + KST_OFFSET_MS).toISOString();
  const date = kst.slice(0, 10);
  const time = kst.slice(11, 16);
  return windows.some((w) => w.date === date && time >= w.start && time < w.end);
}
