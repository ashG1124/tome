import { JobStageSchema, LIMITS, PROMPT_PRESETS, type AdvanceJobResponse } from '@tome/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './endpoints';
import { ApiRequestError } from './errors';
import { FAKE_TOKEN } from './fake/data';
import { FAKE_RETRY_AFTER_MS } from './fake/errors';
import { fakeState, resetFake } from './fake/state';
import { dropFakeStoreMemory } from './fake/store';
import { fakeTransport } from './fake/transport';
import { clearSession, setSession } from './session';

// 가짜 응답 모드에서 서가 → 워크스페이스 → 세트 → 단계 진행이 서버 규칙대로 이어지는지 본다.

const TWO_PAGE_PROJECT = '7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d';

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

/** job 을 7단계 끝까지 진행하고 단계별 응답을 돌려준다. */
async function runAll(jobId: string): Promise<AdvanceJobResponse[]> {
  const results: AdvanceJobResponse[] = [];
  for (const stage of JobStageSchema.options) results.push(await api.advanceJob(jobId, stage));
  return results;
}

/** 빈 프로젝트 하나와 그 첫 페이지 id */
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

describe('가짜 응답: 서가', () => {
  it('프롬프트 없이 만들면 Untitled 로 서가 맨 앞(0번)에 놓이고, 나머지는 한 칸씩 밀린다', async () => {
    const before = (await api.listProjects()).projects;
    const created = await api.createProject({});

    expect(created.project.title).toBe('Untitled');
    expect(created.project.shelfPosition).toBe(0);
    expect(created.set).toBeUndefined();
    const after = (await api.listProjects()).projects;
    expect(after.map((p) => p.id)).toEqual([created.project.id, ...before.map((p) => p.id)]);
    expect(after.map((p) => p.shelfPosition)).toEqual(after.map((_, index) => index));
  });

  it('프리셋만 보내면 프리셋 문장의 앞 60자를 제목으로 하고, 세트와 job 까지 만든다', async () => {
    const preset = PROMPT_PRESETS[0];
    const created = await api.createProject({ presetKey: preset.key });

    expect(created.project.title).toBe(preset.prompt.trim().slice(0, LIMITS.TITLE_MAX).trim());
    expect(created.set?.position).toBe(1);
    expect(created.job?.status).toBe('pending');
    expect(created.job?.nextStage).toBe('analyze');
  });

  it('순서를 옮기면 보이는 카드만 0부터 다시 번호를 매긴다', async () => {
    const [first, second] = (await api.listProjects()).projects;
    if (!first || !second) throw new Error('가짜 프로젝트가 2개 있어야 한다');

    const moved = await api.updateProject(first.id, { shelfPosition: 1 });

    expect(moved.project.shelfPosition).toBe(1);
    const after = (await api.listProjects()).projects;
    expect(after.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(after.map((p) => p.shelfPosition)).toEqual([0, 1]);
  });

  it('없는 프로젝트를 고치면 404 NOT_FOUND 다', async () => {
    const error = await rejection(
      api.updateProject('00000000-0000-4000-8000-000000000000', { title: 'x' }),
    );
    expect(error.code).toBe('NOT_FOUND');
  });

  it('?fakeProjects=empty 이면 빈 서가에서 시작하고, 만든 프로젝트만 보인다', async () => {
    resetFake('?fakeProjects=empty');
    await signIn();
    expect((await api.listProjects()).projects).toEqual([]);

    const created = await api.createProject({});
    expect((await api.listProjects()).projects.map((p) => p.id)).toEqual([created.project.id]);
  });
});

describe('가짜 응답: 워크스페이스·페이지·세트', () => {
  it('pageId 를 주지 않으면 마지막 페이지를, 주면 그 페이지를 연다', async () => {
    const opened = await api.getWorkspace(TWO_PAGE_PROJECT);
    expect(opened.pages).toHaveLength(2);
    expect(opened.currentPageId).toBe(opened.pages[1]?.id);

    const firstPageId = opened.pages[0]?.id ?? '';
    expect((await api.getWorkspace(TWO_PAGE_PROJECT, firstPageId)).currentPageId).toBe(firstPageId);
    const error = await rejection(
      api.getWorkspace(TWO_PAGE_PROJECT, '00000000-0000-4000-8000-000000000000'),
    );
    expect(error.code).toBe('NOT_FOUND');
  });

  it('페이지는 10개까지 만들고, 그 뒤에는 409 PAGE_LIMIT_REACHED 다', async () => {
    const { projectId } = await newProject();
    for (let count = 1; count < LIMITS.PAGES_MAX; count += 1) {
      const { page } = await api.createPage(projectId);
      expect(page.index).toBe(count);
    }

    expect((await api.getWorkspace(projectId)).pages).toHaveLength(LIMITS.PAGES_MAX);
    const error = await rejection(api.createPage(projectId));
    expect(error.code).toBe('PAGE_LIMIT_REACHED');
    expect(error.status).toBe(409);
  });

  it('세트를 만들면 진행 중 job 이 생기고, 그동안 새 세트는 GENERATION_IN_PROGRESS 다', async () => {
    const { projectId, pageId } = await newProject();
    const { set, job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });

    const workspace = await api.getWorkspace(projectId);
    expect(workspace.activeJob?.id).toBe(job.id);
    expect(workspace.sets.map((s) => s.id)).toEqual([set.id]);
    expect(workspace.pages[0]?.setCount).toBe(1);

    const error = await rejection(api.createSet(projectId, { pageId, prompt: 'Second' }));
    expect(error.code).toBe('GENERATION_IN_PROGRESS');
    expect(error.retryable).toBe(true);
  });

  it('한 페이지에 세트는 3개까지이고, 넘으면 SET_LIMIT_REACHED 다', async () => {
    const { projectId, pageId } = await newProject();
    for (let count = 1; count <= LIMITS.SETS_PER_PAGE; count += 1) {
      const { set, job } = await api.createSet(projectId, { pageId, prompt: `Prompt ${count}` });
      expect(set.position).toBe(count);
      await runAll(job.id);
    }

    const error = await rejection(api.createSet(projectId, { pageId, prompt: 'One more' }));
    expect(error.code).toBe('SET_LIMIT_REACHED');
  });

  it('첨부는 아직 받지 않는다(400 VALIDATION_FAILED)', async () => {
    const { projectId, pageId } = await newProject();
    const error = await rejection(
      api.createSet(projectId, {
        pageId,
        prompt: 'With attachment',
        attachmentId: '00000000-0000-4000-8000-000000000000',
      }),
    );
    expect(error.code).toBe('VALIDATION_FAILED');
  });
});

describe('가짜 응답: 단계 진행', () => {
  it('7단계를 차례로 진행하면 노드·답변·검증이 차고, 끝나면 진행 중 job 이 사라진다', async () => {
    const { projectId, pageId } = await newProject();
    const { set, job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });

    const results = await runAll(job.id);

    expect(results.map((r) => r.step.stage)).toEqual(JobStageSchema.options);
    expect(results[0]?.step.nodes?.map((n) => n.id)).toEqual(['k1', 'k2']);
    expect(results[0]?.job.status).toBe('running');
    const image = results.find((r) => r.step.stage === 'image');
    expect(image?.step.answer?.setId).toBe(set.id);
    expect(image?.step.answer?.nodes.nodes.map((n) => n.id)).toEqual([
      'k1',
      'k2',
      'd1',
      's1',
      'e1',
      'a1',
      'a2',
    ]);
    const last = results[results.length - 1];
    expect(last?.job.status).toBe('succeeded');
    expect(last?.job.nextStage).toBeNull();
    expect(last?.step.verification?.criteria.map((c) => c.id)).toEqual(['v1', 'v2']);

    const workspace = await api.getWorkspace(projectId);
    expect(workspace.activeJob).toBeUndefined();
    expect(workspace.sets[0]?.answers).toHaveLength(1);
    expect(workspace.sets[0]?.latestAnswer?.number).toBe(1);
    expect(workspace.sets[0]?.latestAnswer?.verification?.criteria).toHaveLength(2);
  });

  it('순서를 건너뛰면 STAGE_OUT_OF_ORDER, 끝낸 단계를 다시 보내면 같은 결과가 온다', async () => {
    const { projectId, pageId } = await newProject();
    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });

    const skipped = await rejection(api.advanceJob(job.id, 'research'));
    expect(skipped.code).toBe('STAGE_OUT_OF_ORDER');

    const first = await api.advanceJob(job.id, 'analyze');
    const again = await api.advanceJob(job.id, 'analyze');
    expect(again.step).toEqual(first.step);
    expect(again.job.nextStage).toBe('research');
  });

  it('다시 열면 getJob 으로 지금까지의 단계 결과를 받아 이어서 할 수 있다', async () => {
    const { projectId, pageId } = await newProject();
    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });
    await api.advanceJob(job.id, 'analyze');
    await api.advanceJob(job.id, 'research');

    const resumed = await api.getJob(job.id);
    expect(resumed.job.nextStage).toBe('evidence');
    expect(resumed.steps.map((s) => s.stage)).toEqual(['analyze', 'research']);
    expect(resumed.steps[1]?.nodes?.map((n) => n.id)).toEqual(['d1', 's1']);
  });

  it('취소하면 진행 중 job 이 사라지고, 끝난 job 을 취소하거나 진행하면 JOB_CLOSED 다', async () => {
    const { projectId, pageId } = await newProject();
    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });

    expect((await api.cancelJob(job.id)).job.status).toBe('cancelled');
    expect((await api.getWorkspace(projectId)).activeJob).toBeUndefined();
    expect((await rejection(api.advanceJob(job.id, 'analyze'))).code).toBe('JOB_CLOSED');

    const next = await api.createSet(projectId, { pageId, prompt: 'Again' });
    await runAll(next.job.id);
    expect((await rejection(api.cancelJob(next.job.id))).code).toBe('JOB_CLOSED');
  });

  it('?fakeError=STEP_IN_PROGRESS 는 다시 보낼 때까지 기다릴 시간(retryAfterMs)을 같이 준다', async () => {
    const { projectId, pageId } = await newProject();
    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });

    fakeState.pendingError = 'STEP_IN_PROGRESS';
    const busy = await rejection(api.advanceJob(job.id, 'analyze'));
    expect(busy.code).toBe('STEP_IN_PROGRESS');
    expect(busy.details).toEqual({ retryAfterMs: FAKE_RETRY_AFTER_MS });

    // 오류 흉내는 한 번만이라 같은 요청을 다시 보내면 진행된다.
    expect((await api.advanceJob(job.id, 'analyze')).step.status).toBe('succeeded');
  });
});

describe('가짜 응답: 완료·게시', () => {
  /** 세트 하나를 끝까지 만든 프로젝트 */
  async function projectWithAnswer() {
    const { projectId, pageId } = await newProject();
    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });
    await runAll(job.id);
    return projectId;
  }

  it('답변이 없으면 후보가 비어 있고, 완료는 409 NOT_FINISHABLE 이다', async () => {
    const { projectId } = await newProject();
    expect((await api.getFinishCandidates(projectId)).answers).toEqual([]);
    const error = await rejection(
      api.finishProject(projectId, {
        title: 'Lighthouse',
        coverAnswerId: '00000000-0000-4000-8000-000000000000',
      }),
    );
    expect(error.code).toBe('NOT_FINISHABLE');
  });

  it('후보 중 하나로 완료하면 제목·대표 그림이 바뀌고 finished 가 된다', async () => {
    const projectId = await projectWithAnswer();
    const [cover] = (await api.getFinishCandidates(projectId)).answers;
    if (cover === undefined) throw new Error('후보가 없다');

    const { project } = await api.finishProject(projectId, {
      title: '  Lighthouse  ',
      coverAnswerId: cover.id,
      reason: 'Best light',
    });

    expect(project.status).toBe('finished');
    expect(project.title).toBe('Lighthouse');
    expect(project.coverThumbUrl).toBe(cover.thumbUrl);
    expect(project.posted).toBe(false);
  });

  it('이 프로젝트의 답변이 아니면 400 VALIDATION_FAILED 다', async () => {
    const projectId = await projectWithAnswer();
    const error = await rejection(
      api.finishProject(projectId, {
        title: 'Lighthouse',
        coverAnswerId: '00000000-0000-4000-8000-000000000000',
      }),
    );
    expect(error.code).toBe('VALIDATION_FAILED');
  });

  it('완료 전 게시는 NOT_FINISHED, 완료 뒤에는 켜고 끌 수 있다', async () => {
    const projectId = await projectWithAnswer();
    expect((await rejection(api.postProject(projectId, { posted: true }))).code).toBe(
      'NOT_FINISHED',
    );
    const [cover] = (await api.getFinishCandidates(projectId)).answers;
    if (cover === undefined) throw new Error('후보가 없다');
    await api.finishProject(projectId, { title: 'Lighthouse', coverAnswerId: cover.id });

    expect((await api.postProject(projectId, { posted: true })).postedAt).not.toBeNull();
    expect((await api.listProjects()).projects.find((p) => p.id === projectId)?.posted).toBe(true);
    expect((await api.postProject(projectId, { posted: false })).postedAt).toBeNull();
  });
});

describe('변경 요청의 Idempotency-Key', () => {
  it('제목·순서 바꾸기에도 키를 새로 만들어 붙인다', async () => {
    const projectId = (await api.listProjects()).projects[0]?.id ?? '';
    const uuid = vi.spyOn(crypto, 'randomUUID');
    await api.updateProject(projectId, { title: 'Renamed' });
    expect(uuid).toHaveBeenCalledTimes(1);
    uuid.mockRestore();
  });
});

describe('가짜 응답: 지우기', () => {
  it('지우면 서가에서 빠지고 남은 카드는 0부터 다시 번호를 매긴다. 지운 프로젝트는 404', async () => {
    const before = (await api.listProjects()).projects;
    const target = before[0];
    if (target === undefined) throw new Error('프로젝트가 없다');

    await api.deleteProject(target.id);

    const after = (await api.listProjects()).projects;
    expect(after.map((p) => p.id)).toEqual(before.slice(1).map((p) => p.id));
    expect(after.map((p) => p.shelfPosition)).toEqual(after.map((_, index) => index));
    expect((await rejection(api.getWorkspace(target.id))).code).toBe('NOT_FOUND');
    expect((await rejection(api.deleteProject(target.id))).code).toBe('NOT_FOUND');
  });

  it('지우면 그 프로젝트의 진행 중 job 도 취소된다', async () => {
    const { projectId, pageId } = await newProject();
    const { job } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });
    await api.deleteProject(projectId);
    expect((await api.getJob(job.id)).job.status).toBe('cancelled');
  });
});

describe('가짜 응답: 같은 Idempotency-Key', () => {
  const send = (key: string, body: unknown) =>
    fakeTransport({
      method: 'POST',
      path: '/projects',
      headers: { Authorization: `Bearer ${FAKE_TOKEN}`, 'Idempotency-Key': key },
      body,
    });

  it('같은 키로 같은 요청을 다시 보내면 처음 응답을 그대로 주고, 새로 만들지 않는다', async () => {
    const before = (await api.listProjects()).projects.length;
    const first = await send('6f1c2d3e-4b5a-4c6d-8e7f-001122334455', {});
    const again = await send('6f1c2d3e-4b5a-4c6d-8e7f-001122334455', {});

    expect(again).toEqual(first);
    expect((await api.listProjects()).projects.length).toBe(before + 1);
  });

  it('같은 키로 다른 요청을 보내면 409 IDEMPOTENCY_KEY_REUSED', async () => {
    await send('7a8b9c0d-1e2f-4a3b-8c4d-556677889900', {});
    const other = await send('7a8b9c0d-1e2f-4a3b-8c4d-556677889900', { prompt: 'Other' });
    expect(other.status).toBe(409);
    expect(other.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('실패한 요청은 기록하지 않아 같은 키로 다시 시도할 수 있다', async () => {
    const key = '8b9c0d1e-2f3a-4b4c-9d5e-66778899aabb';
    const bad = await send(key, { prompt: '' });
    expect(bad.status).toBe(400);
    const retry = await send(key, { prompt: '' });
    expect(retry.status).toBe(400);
    expect(retry.body).not.toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });
});

describe('가짜 응답: 새로고침', () => {
  it('만든 프로젝트·바꾼 순서·세트가 새로고침 뒤에도 남는다', async () => {
    const { projectId, pageId } = await newProject();
    const { set } = await api.createSet(projectId, { pageId, prompt: 'A lighthouse' });
    await api.updateProject(projectId, { shelfPosition: 1 });
    const before = (await api.listProjects()).projects.map((p) => p.id);

    dropFakeStoreMemory();

    expect((await api.listProjects()).projects.map((p) => p.id)).toEqual(before);
    expect((await api.getWorkspace(projectId)).sets.map((s) => s.id)).toEqual([set.id]);
  });

  it('resetFake 는 저장해 둔 데이터도 지운다', async () => {
    const { projectId } = await newProject();
    resetFake();
    await signIn();
    dropFakeStoreMemory();
    expect((await api.listProjects()).projects.some((p) => p.id === projectId)).toBe(false);
  });
});
