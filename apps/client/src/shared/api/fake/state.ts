import { ErrorCodeSchema, type ErrorCode } from '@tome/shared';
import { resetFakeStore } from './store';

const CONSENT_KEY = 'tome.fake.consented';

/**
 * 아이덴티티 가짜 응답의 경우. ?fakeIdentity= 로 고른다.
 * full(기본) 기록 충분 · provisional 잠정 · none 기록 0건 · private 다른 창작자 비공개
 */
export const FAKE_IDENTITY_CASES = ['full', 'provisional', 'none', 'private'] as const;
export type FakeIdentityCase = (typeof FAKE_IDENTITY_CASES)[number];

function readIdentityCase(value: string | null): FakeIdentityCase {
  return FAKE_IDENTITY_CASES.find((item) => item === value) ?? 'full';
}

/** 생성 상한(서버 #91). ?fakeLimit=daily 하루 한도 · budget 월 상한 · 없으면 none */
export const FAKE_LIMIT_CASES = ['none', 'daily', 'budget'] as const;
export type FakeLimitCase = (typeof FAKE_LIMIT_CASES)[number];

function readLimitCase(value: string | null): FakeLimitCase {
  return FAKE_LIMIT_CASES.find((item) => item === value) ?? 'none';
}

export interface FakeState {
  consented: boolean;
  /** URL 의 ?fakeError= 로 지정한 오류. 다음 요청 하나에만 쓰고 비운다. */
  pendingError: ErrorCode | null;
  /** ?fakeProjects=empty 이면 서가가 비어 있다. */
  emptyProjects: boolean;
  /** ?fakeIdentity= 로 고른 아이덴티티 경우 */
  identityCase: FakeIdentityCase;
  /** ?fakeLimit= 로 고른 생성 상한 */
  limit: FakeLimitCase;
  /** ?fakeSample=1 이면 AI 가 실패한 것처럼, 프리셋 문장 그대로인 세트는 대체 결과(isSample) 답변을 받는다 */
  sample: boolean;
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
    identityCase: readIdentityCase(params.get('fakeIdentity')),
    limit: readLimitCase(params.get('fakeLimit')),
    sample: params.get('fakeSample') === '1',
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

/** 가짜 서버를 처음 상태로 되돌린다(동의 기록·만든 프로젝트 삭제). search 로 URL 옵션을 줄 수 있다. */
export function resetFake(search = ''): void {
  writeConsent(false);
  Object.assign(fakeState, fromSearch(search, false));
  resetFakeStore();
}
