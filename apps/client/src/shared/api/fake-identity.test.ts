import {
  CompareResponseSchema,
  CreatorProfileResponseSchema,
  IdentityResponseSchema,
} from '@tome/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './endpoints';
import { ApiRequestError } from './errors';
import { FAKE_CREATOR } from './fake/data';
import { FAKE_OTHER_CREATORS } from './fake/identity';
import { resetFake } from './fake/state';
import { clearSession, setSession } from './session';

const ME = FAKE_CREATOR.id;
const OTHER = FAKE_OTHER_CREATORS[0]?.id ?? '';
const UNKNOWN = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';

/** 주소 옵션(?fakeIdentity=…)을 준 상태로 들어와 동의까지 마친다. */
async function signIn(search = '') {
  resetFake(search);
  const session = await api.createSession('any-code');
  setSession(session.token, session.noticeVersion);
  await api.consent(session.noticeVersion);
}

async function rejection(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    return error as ApiRequestError;
  }
  throw new Error('요청이 성공했다');
}

beforeEach(() => {
  localStorage.clear();
  clearSession();
});

describe('프로필 API 가짜 응답 — 기록 충분(기본)', () => {
  beforeEach(() => signIn());

  it('getCreator: 내 프로필은 스키마를 통과하고 게시작과 스냅샷이 있다', async () => {
    const profile = await api.getCreator(ME);
    expect(CreatorProfileResponseSchema.safeParse(profile).success).toBe(true);
    expect(profile.creator.id).toBe(ME);
    expect(profile.works.every((work) => work.posted)).toBe(true);
    expect(profile.identity?.provisional).toBe(false);
  });

  it('getCreator: 남의 프로필도 스키마를 통과한다', async () => {
    const profile = await api.getCreator(OTHER);
    expect(CreatorProfileResponseSchema.safeParse(profile).success).toBe(true);
    expect(profile.creator.id).toBe(OTHER);
    expect(profile.identity).not.toBeNull();
  });

  it('getIdentity: 스냅샷과 축 4개 점수 표가 스키마를 통과한다', async () => {
    const identity = await api.getIdentity(ME);
    expect(IdentityResponseSchema.safeParse(identity).success).toBe(true);
    expect(identity.table.map((row) => row.axis)).toEqual([
      'scaleIntensity',
      'aiRelation',
      'decisionBasis',
      'direction',
    ]);
    for (const row of identity.table) {
      expect(row.score).toBe(identity.snapshot.axes[row.axis]);
    }
    expect(identity.snapshot.provisional).toBe(false);
  });

  it('getCompare: 나와 다른 창작자들 좌표가 스키마를 통과한다', async () => {
    const compare = await api.getCompare();
    expect(CompareResponseSchema.safeParse(compare).success).toBe(true);
    expect(compare.me.creator.id).toBe(ME);
    expect(compare.others.length).toBe(FAKE_OTHER_CREATORS.length);
    expect(compare.others.some((entry) => entry.creator.id === ME)).toBe(false);
  });

  it('없는 창작자는 NOT_FOUND(404)', async () => {
    const creatorError = await rejection(api.getCreator(UNKNOWN));
    expect(creatorError.code).toBe('NOT_FOUND');
    expect(creatorError.status).toBe(404);
    const identityError = await rejection(api.getIdentity(UNKNOWN));
    expect(identityError.code).toBe('NOT_FOUND');
  });
});

describe('프로필 API 가짜 응답 — 고를 수 있는 경우', () => {
  it('?fakeIdentity=provisional: 점수는 있고 잠정이다', async () => {
    await signIn('?fakeIdentity=provisional');
    const profile = await api.getCreator(ME);
    expect(profile.identity?.provisional).toBe(true);
    expect(profile.identity?.projectCount).toBeLessThan(3);
    const identity = await api.getIdentity(ME);
    expect(identity.snapshot.provisional).toBe(true);
    expect(identity.table.every((row) => row.score !== null)).toBe(true);
    const compare = await api.getCompare();
    expect(compare.me.provisional).toBe(true);
  });

  it('?fakeIdentity=none: 프로필 identity 는 null 이고 점수가 모두 비어 있다', async () => {
    await signIn('?fakeIdentity=none');
    const profile = await api.getCreator(ME);
    expect(CreatorProfileResponseSchema.safeParse(profile).success).toBe(true);
    expect(profile.identity).toBeNull();
    const identity = await api.getIdentity(ME);
    expect(IdentityResponseSchema.safeParse(identity).success).toBe(true);
    expect(identity.snapshot.eventCount).toBe(0);
    expect(identity.table.every((row) => row.score === null)).toBe(true);
    const compare = await api.getCompare();
    expect(Object.values(compare.me.axes).every((score) => score === null)).toBe(true);
  });

  it('?fakeIdentity=private: 남의 아이덴티티는 IDENTITY_PRIVATE(403), 목록에서도 빠진다', async () => {
    await signIn('?fakeIdentity=private');
    const error = await rejection(api.getIdentity(OTHER));
    expect(error.code).toBe('IDENTITY_PRIVATE');
    expect(error.status).toBe(403);
    const profile = await api.getCreator(OTHER);
    expect(profile.identity).toBeNull();
    const compare = await api.getCompare();
    expect(compare.others).toEqual([]);
    // 내 아이덴티티는 나에게 계속 보인다
    const mine = await api.getIdentity(ME);
    expect(IdentityResponseSchema.safeParse(mine).success).toBe(true);
  });

  it('모르는 값이면 기본(기록 충분)으로 돌아간다', async () => {
    await signIn('?fakeIdentity=unknown');
    const identity = await api.getIdentity(ME);
    expect(identity.snapshot.provisional).toBe(false);
  });
});
