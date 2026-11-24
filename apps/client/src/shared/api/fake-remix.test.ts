import { JobStageSchema } from '@tome/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './endpoints';
import { ApiRequestError } from './errors';
import { FAKE_CREATOR, FAKE_TOKEN } from './fake/data';
import { FAKE_OTHER_CREATORS } from './fake/identity';
import { resetFake } from './fake/state';
import { dropFakeStoreMemory } from './fake/store';
import { fakeTransport } from './fake/transport';
import { clearSession, setSession } from './session';

// 리믹스 가짜 응답이 서버(PR #102)와 같은 모양·규칙으로 동작하는지 본다.

const [LIND, MARA] = FAKE_OTHER_CREATORS;
if (LIND === undefined || MARA === undefined) throw new Error('가짜 창작자가 없다');

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

async function newProjectId(): Promise<string> {
  const { project } = await api.createProject({});
  return project.id;
}

beforeEach(async () => {
  localStorage.clear();
  clearSession();
  await signIn();
});

describe('리믹스 후보·즐겨찾기', () => {
  it('rising 은 나를 뺀 공개 창작자, favorite 은 처음엔 비어 있다', async () => {
    const rising = await api.getRemixCandidates('rising');
    expect(rising.creators.map((c) => c.displayName)).toEqual(['Lind', 'Mara']);
    expect(rising.creators.some((c) => c.id === FAKE_CREATOR.id)).toBe(false);
    expect(rising.creators.every((c) => !c.favorite && c.avatarUrl === null)).toBe(true);
    expect((await api.getRemixCandidates('favorite')).creators).toEqual([]);
  });

  it('즐겨찾기는 204 이고 넣은 순서대로 보이며, 새로고침해도 남는다', async () => {
    await expect(api.addFavorite(MARA.id)).resolves.toBeUndefined();
    await api.addFavorite(LIND.id);
    await api.addFavorite(MARA.id);
    dropFakeStoreMemory();
    const favorite = await api.getRemixCandidates('favorite');
    expect(favorite.creators.map((c) => c.displayName)).toEqual(['Mara', 'Lind']);
    expect(favorite.creators.every((c) => c.favorite)).toBe(true);
    const rising = await api.getRemixCandidates('rising');
    expect(rising.creators.every((c) => c.favorite)).toBe(true);
  });

  it('즐겨찾기 해제는 없던 사람이어도 성공한다', async () => {
    await api.addFavorite(LIND.id);
    await api.removeFavorite(LIND.id);
    await expect(api.removeFavorite(LIND.id)).resolves.toBeUndefined();
    expect((await api.getRemixCandidates('favorite')).creators).toEqual([]);
  });

  it('나 자신은 즐겨찾기할 수 없고(400), 모르는 사람은 NOT_FOUND 다', async () => {
    const self = await rejection(api.addFavorite(FAKE_CREATOR.id));
    expect(self.status).toBe(400);
    expect(self.details).toEqual({
      fields: [{ path: 'creatorId', message: 'Choose another creator.' }],
    });
    expect((await rejection(api.addFavorite(crypto.randomUUID()))).code).toBe('NOT_FOUND');
  });

  it('tab 이 없거나 틀리면 VALIDATION_FAILED 다', async () => {
    const response = await fakeTransport({
      method: 'GET',
      path: '/remix/candidates?tab=all',
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('?fakeIdentity=private 면 남이 모두 비공개라 후보가 0명이다(S-04 확인용)', async () => {
    await signIn('?fakeIdentity=private');
    expect((await api.getRemixCandidates('rising')).creators).toEqual([]);
  });
});

describe('리믹스 상대', () => {
  it('고르면 스냅샷 id 와 함께 돌려주고, 워크스페이스·서가의 프로젝트에 상대가 실린다', async () => {
    const projectId = await newProjectId();
    const { remix } = await api.setRemixPartner(projectId, LIND.id);
    expect(remix?.partner).toEqual({ ...LIND, avatarUrl: null });
    expect(remix?.snapshotId).toEqual(expect.any(String));
    expect((await api.getWorkspace(projectId)).project.remixPartner?.id).toBe(LIND.id);
    const shelf = await api.listProjects();
    expect(shelf.projects.find((p) => p.id === projectId)?.remixPartner?.displayName).toBe('Lind');
  });

  it('다른 사람으로 바꾸거나 null 로 해제할 수 있다', async () => {
    const projectId = await newProjectId();
    await api.setRemixPartner(projectId, LIND.id);
    await api.setRemixPartner(projectId, MARA.id);
    expect((await api.getWorkspace(projectId)).project.remixPartner?.id).toBe(MARA.id);
    expect(await api.setRemixPartner(projectId, null)).toEqual({ remix: null });
    expect((await api.getWorkspace(projectId)).project.remixPartner).toBeUndefined();
  });

  it('나 자신·모르는 사람은 400, 비공개면 IDENTITY_PRIVATE, 없는 프로젝트는 NOT_FOUND', async () => {
    const projectId = await newProjectId();
    const self = await rejection(api.setRemixPartner(projectId, FAKE_CREATOR.id));
    expect(self.code).toBe('VALIDATION_FAILED');
    expect(self.details).toEqual({
      fields: [{ path: 'partnerId', message: 'Choose another creator.' }],
    });
    expect((await rejection(api.setRemixPartner(projectId, crypto.randomUUID()))).code).toBe(
      'VALIDATION_FAILED',
    );
    expect((await rejection(api.setRemixPartner(crypto.randomUUID(), LIND.id))).code).toBe(
      'NOT_FOUND',
    );
    await signIn('?fakeIdentity=private');
    const privateProject = await newProjectId();
    const hidden = await rejection(api.setRemixPartner(privateProject, LIND.id));
    expect(hidden.status).toBe(403);
    expect(hidden.code).toBe('IDENTITY_PRIVATE');
  });

  it('새 프로젝트를 만들 때 remixPartnerId 를 주면 처음부터 리믹스 상태다(나·모르는 사람은 400)', async () => {
    const { project } = await api.createProject({ remixPartnerId: MARA.id });
    expect(project.remixPartner?.id).toBe(MARA.id);
    const bad = await rejection(api.createProject({ remixPartnerId: FAKE_CREATOR.id }));
    expect(bad.details).toEqual({
      fields: [{ path: 'remixPartnerId', message: 'Choose another creator.' }],
    });
  });
});

describe('Connection', () => {
  /** 상대를 정해 둔 프로젝트에서 세트 하나를 끝까지 만들어 답변 id 를 받는다. */
  async function answerWithPartner(partnerId: string | undefined): Promise<string> {
    const { project, job } = await api.createProject({
      prompt: 'A lighthouse at dusk',
      ...(partnerId === undefined ? {} : { remixPartnerId: partnerId }),
    });
    if (job === undefined) throw new Error('job 이 없다');
    for (const stage of JobStageSchema.options) await api.advanceJob(job.id, stage);
    const workspace = await api.getWorkspace(project.id);
    const answer = workspace.sets[0]?.latestAnswer;
    if (!answer) throw new Error('답변이 없다');
    return answer.id;
  }

  it('지금 상대 기준으로 갈리는 노드에 Connection 을 만들고, 다시 불러도 같다', async () => {
    const answerId = await answerWithPartner(LIND.id);
    const first = await api.listConnections(answerId);
    expect(first.connections.length).toBeGreaterThan(0);
    expect(first.connections.length).toBeLessThanOrEqual(5);
    expect(first.connections.every((c) => c.status === 'shown' && c.sentence.length > 0)).toBe(
      true,
    );
    const again = await api.listConnections(answerId);
    expect(again.connections.map((c) => c.id)).toEqual(first.connections.map((c) => c.id));
  });

  it('숨기면 dismissed 가 되고, 다시 숨겨도 같은 상태를 돌려준다', async () => {
    const answerId = await answerWithPartner(LIND.id);
    const [target] = (await api.listConnections(answerId)).connections;
    if (target === undefined) throw new Error('Connection 이 없다');
    expect(await api.dismissConnection(target.id)).toEqual({ status: 'dismissed' });
    expect(await api.dismissConnection(target.id)).toEqual({ status: 'dismissed' });
    const after = await api.listConnections(answerId);
    expect(after.connections.find((c) => c.id === target.id)?.status).toBe('dismissed');
  });

  it('상대를 바꾸면 새 상대 기준으로 만들고, 예전 상대 것은 partnerId 로 그대로 볼 수 있다', async () => {
    const answerId = await answerWithPartner(LIND.id);
    const lind = await api.listConnections(answerId);
    const projectId = (await api.listProjects()).projects[0]?.id ?? '';
    await api.setRemixPartner(projectId, MARA.id);
    const mara = await api.listConnections(answerId);
    expect(mara.connections.map((c) => c.id)).not.toEqual(lind.connections.map((c) => c.id));
    const old = await api.listConnections(answerId, LIND.id);
    expect(old.connections.map((c) => c.id)).toEqual(lind.connections.map((c) => c.id));
  });

  /** 첫 노드의 가중치를 바꾼 revise 를 끝까지 돌려 초안 id 를 받는다(서버 edit.service 와 같은 흐름). */
  async function reviseWith(answerId: string, ids: string[]): Promise<string> {
    const workspace = await api.getWorkspace((await api.listProjects()).projects[0]?.id ?? '');
    const set = workspace.sets[0];
    const base = set?.latestAnswer;
    if (!set || !base || base.id !== answerId) throw new Error('답변이 없다');
    const nodes = structuredClone(base.nodes);
    const keyword = nodes.nodes.find((node) => node.kind === 'keyword');
    if (!keyword) throw new Error('keyword 노드가 없다');
    keyword.weight = (keyword.weight ?? 5) === 9 ? 7 : 9;
    const { job } = await api.createRevision(
      set.id,
      { baseAnswerId: base.id, nodes, appliedConnectionIds: ids },
      crypto.randomUUID(),
    );
    let current = job;
    while (current.nextStage) current = (await api.advanceJob(current.id, current.nextStage)).job;
    const draft = (await api.getJob(job.id)).steps.find((step) => step.answer)?.answer;
    if (!draft) throw new Error('초안이 없다');
    return draft.id;
  }

  it('Apply(#151): revise 에 실은 Connection 은 확정하면 applied 가 된다', async () => {
    const answerId = await answerWithPartner(LIND.id);
    const [target] = (await api.listConnections(answerId)).connections;
    if (target === undefined) throw new Error('Connection 이 없다');
    const draftId = await reviseWith(answerId, [target.id]);
    expect((await api.listConnections(answerId)).connections[0]?.status).toBe('shown');
    await api.acceptAnswer(draftId, crypto.randomUUID());
    const after = await api.listConnections(answerId, LIND.id);
    expect(after.connections.find((c) => c.id === target.id)?.status).toBe('applied');
  });

  it('Apply(#151): 예전 상대의 Connection 을 실으면 VALIDATION_FAILED 다', async () => {
    const answerId = await answerWithPartner(LIND.id);
    const [old] = (await api.listConnections(answerId)).connections;
    if (old === undefined) throw new Error('Connection 이 없다');
    const projectId = (await api.listProjects()).projects[0]?.id ?? '';
    await api.setRemixPartner(projectId, MARA.id);
    const failure = await rejection(reviseWith(answerId, [old.id]));
    expect(failure.code).toBe('VALIDATION_FAILED');
  });

  it('상대가 없으면 NO_PARTNER(409), 모르는 답변·Connection 은 NOT_FOUND', async () => {
    const answerId = await answerWithPartner(undefined);
    const none = await rejection(api.listConnections(answerId));
    expect(none.status).toBe(409);
    expect(none.code).toBe('NO_PARTNER');
    expect((await rejection(api.listConnections(crypto.randomUUID()))).code).toBe('NOT_FOUND');
    expect((await rejection(api.dismissConnection(crypto.randomUUID()))).code).toBe('NOT_FOUND');
  });
});
