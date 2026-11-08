import { ErrorCodeSchema, type ErrorCode } from '@tome/shared';

const CONSENT_KEY = 'tome.fake.consented';

export interface FakeState {
  consented: boolean;
  /** URL 의 ?fakeError= 로 지정한 오류. 다음 요청 하나에만 쓰고 비운다. */
  pendingError: ErrorCode | null;
  /** ?fakeProjects=empty 이면 서가가 비어 있다. */
  emptyProjects: boolean;
}

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeConsent(value: boolean): void {
  try {
    if (value) localStorage.setItem(CONSENT_KEY, '1');
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 이번 탭 메모리에서만 유지한다.
  }
}

function fromSearch(search: string, consented: boolean): FakeState {
  const params = new URLSearchParams(search);
  const error = ErrorCodeSchema.safeParse(params.get('fakeError'));
  return {
    consented,
    pendingError: error.success ? error.data : null,
    emptyProjects: params.get('fakeProjects') === 'empty',
  };
}

/** 페이지를 열 때의 주소를 한 번만 읽는다. 화면 안에서 주소가 바뀌어도 옵션은 유지된다. */
export const fakeState: FakeState = fromSearch(
  typeof location === 'undefined' ? '' : location.search,
  readConsent(),
);

export function setFakeConsented(): void {
  fakeState.consented = true;
  writeConsent(true);
}

/** 가짜 서버를 처음 상태로 되돌린다(동의 기록 삭제). search 로 URL 옵션을 줄 수 있다. */
export function resetFake(search = ''): void {
  writeConsent(false);
  Object.assign(fakeState, fromSearch(search, false));
}
