import {
  ApiErrorSchema,
  JobStageSchema,
  MeResponseSchema,
  PROMPT_PRESETS,
  type AdvanceJobResponse,
} from '@tome/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './endpoints';
import { ApiRequestError } from './errors';
import { FAKE_TOKEN } from './fake/data';
import { FAKE_SAFETY_CATEGORIES } from './fake/errors';
import { fakeState, resetFake } from './fake/state';
import { dropFakeStoreMemory, fakeStore } from './fake/store';
import { FAKE_IDEMPOTENCY_MAX, fakeTransport } from './fake/transport';
import { clearSession, setSession } from './session';

// #97 리뷰: 서버(#33·#91·#95)와 같은 모양·규칙으로 가짜 응답이 동작하는지 본다.

const PRESET = PROMPT_PRESETS[0];
if (PRESET === undefined) throw new Error('프리셋이 없다');

async function signIn() {
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

async function runAll(jobId: string): Promise<AdvanceJobResponse[]> {
  const results: AdvanceJobResponse[] = [];
  for (const stage of JobStageSchema.options) results.push(await api.advanceJob(jobId, stage));
  return results;
}

async function newProject() {
  const { project } = await api.createProject({});
  const workspace = await api.getWorkspace(project.id);
  return { projectId: project.id, pageId: workspace.currentPageId };
}

beforeEach(async () => {
  localStorage.clear();
  clearSession();
  resetFake();
  await signIn();
});

describe('입력 안전 검사(?fakeError=SAFETY_BLOCKED)', () => {
  it('422 와 함께 details: { stage: input, categories } 를 준다', async () => {
    const { projectId, pageId } = await newProject();
    fakeState.pendingError = 'SAFETY_BLOCKED';
    const error = await rejection(api.createSet(projectId, { pageId, prompt: 'A lighthouse' }));
    expect(error.code).toBe('SAFETY_BLOCKED');
    expect(error.status).toBe(422);
    expect(error.details).toEqual({ stage: 'input', categories: [...FAKE_SAFETY_CATEGORIES] });
  });
});

describe('생성 상한(?fakeLimit=daily|budget)', () => {
  it('GET /me 의 limits 가 서버처럼 dailyLimitReached·budgetReached 를 준다', async () => {
    const plain = await api.getMe();
    expect(plain.limits).toEqual({ dailyLimitReached: false, budgetReached: false });

    fakeState.limit = 'daily';
    expect((await api.getMe()).limits).toEqual({ dailyLimitReached: true, budgetReached: false });
    fakeState.limit = 'budget';
    const budget = await api.getMe();
    expect(MeResponseSchema.safeParse(budget).success).toBe(true);
    expect(budget.limits).toEqual({ dailyLimitReached: false, budgetReached: true });
  });

  it('상한에 닿으면 직접 쓴 프롬프트는 429 로 막힌다(하루 한도 / 월 상한)', async () => {
    const { projectId, pageId } = await newProject();
    fakeState.limit = 'daily';
    const daily = await rejection(api.createSet(projectId, { pageId, prompt: 'A lighthouse' }));
    expect(daily.code).toBe('DAILY_LIMIT_REACHED');
    expect(daily.status).toBe(429);

    fakeState.limit = 'budget';
    const budget = await rejection(api.createProject({ prompt: 'A lighthouse' }));
    expect(budget.code).toBe('BUDGET_REACHED');
  });

  it('상한에 닿아도 프리셋 문장 그대로면 통과하고, 대체 결과(isSample) 답변으로 채운다', async () => {
    const { projectId, pageId } = await newProject();
    fakeState.limit = 'daily';
    const { job } = await api.createSet(projectId, {
      pageId,
      prompt: PRESET.prompt,
      presetKey: PRESET.key,
    });
    const steps = await runAll(job.id);
    const answer = steps.find((r) => r.step.stage === 'image')?.step.answer;

    expect(answer?.isSample).toBe(true);
    expect(answer?.origin).toBe('sample');
    expect(answer?.number).toBeNull();
    expect(steps.every((r) => r.step.provider !== 'mock')).toBe(true);
  });
});

describe('대체 결과 답변(?fakeSample=1)', () => {
  it('프리셋 문장 그대로인 세트는 대체 결과, 직접 쓴 세트는 보통 답변이 나온다', async () => {
    fakeState.sample = true;
    const preset = await api.createProject({ presetKey: PRESET.key });
    const presetSteps = await runAll(preset.job?.id ?? '');
    const sample = presetSteps.find((r) => r.step.stage === 'image')?.step.answer;
    expect(sample?.isSample).toBe(true);

    const { projectId, pageId } = await newProject();
    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });
    const normal = (await runAll(job.id)).find((r) => r.step.stage === 'image')?.step.answer;
    expect(normal?.isSample).toBe(false);
    expect(normal?.number).toBe(1);
  });
});

describe('단계 순서 오류', () => {
  it('STAGE_OUT_OF_ORDER 는 details.expected 로 지금 보낼 단계를 알려 준다', async () => {
    const { projectId, pageId } = await newProject();
    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });
    const error = await rejection(api.advanceJob(job.id, 'research'));
    expect(error.code).toBe('STAGE_OUT_OF_ORDER');
    expect(error.details).toEqual({ expected: 'analyze' });
  });
});

describe('게시 켜고 끄기(서버 setPosted 와 같게)', () => {
  it('완료 전이어도 끄기(posted: false)는 되고, 이미 같은 상태면 예전 시각을 그대로 준다', async () => {
    const { projectId, pageId } = await newProject();
    // 완료 전: 켜기는 NOT_FINISHED, 끄기는 그대로 null
    expect((await api.postProject(projectId, { posted: false })).postedAt).toBeNull();
    expect((await rejection(api.postProject(projectId, { posted: true }))).code).toBe(
      'NOT_FINISHED',
    );

    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });
    await runAll(job.id);
    const [cover] = (await api.getFinishCandidates(projectId)).answers;
    if (cover === undefined) throw new Error('후보가 없다');
    await api.finishProject(projectId, { title: 'Lighthouse', coverAnswerId: cover.id });

    const first = (await api.postProject(projectId, { posted: true })).postedAt;
    const again = (await api.postProject(projectId, { posted: true })).postedAt;
    expect(first).not.toBeNull();
    expect(again).toBe(first);
  });
});

describe('빈 서가 옵션과 멱등 기록', () => {
  it('?fakeProjects=empty 로 만든 상태는 저장하지 않아, 옵션 없이 다시 열면 기본 데이터로 돌아온다', async () => {
    const defaults = (await api.listProjects()).projects.map((p) => p.id);

    resetFake('?fakeProjects=empty');
    await signIn();
    await api.createProject({});
    expect((await api.listProjects()).projects).toHaveLength(1);

    // 새로고침처럼: 메모리를 비우고 옵션 없이 다시 연다
    dropFakeStoreMemory();
    fakeState.emptyProjects = false;
    expect((await api.listProjects()).projects.map((p) => p.id)).toEqual(defaults);
  });

  it('멱등 기록은 정한 개수까지만 남고 오래된 것부터 지운다', async () => {
    for (let i = 0; i < FAKE_IDEMPOTENCY_MAX + 5; i++) {
      const response = await fakeTransport({
        method: 'GET',
        path: '/me',
        headers: { Authorization: `Bearer ${FAKE_TOKEN}`, 'Idempotency-Key': `key-${i}` },
      });
      expect(ApiErrorSchema.safeParse(response.body).success).toBe(false);
    }
    const keys = Object.keys(fakeStore(false).idempotency);
    expect(keys).toHaveLength(FAKE_IDEMPOTENCY_MAX);
    expect(keys).not.toContain('key-0');
    expect(keys).toContain(`key-${FAKE_IDEMPOTENCY_MAX + 4}`);
  });
});
