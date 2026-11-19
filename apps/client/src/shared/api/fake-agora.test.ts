import { DeriveProjectResponseSchema } from '@tome/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './endpoints';
import { ApiRequestError } from './errors';
import { FAKE_AGORA_IDS, FAKE_TOPICS } from './fake/agora';
import { FAKE_CREATOR, FAKE_TOKEN } from './fake/data';
import { resetFake } from './fake/state';
import { dropFakeStoreMemory, fakeStore } from './fake/store';
import { fakeTransport } from './fake/transport';
import { clearSession, setSession } from './session';

// 아고라 가짜 응답이 서버(PR #100)와 같은 모양·규칙으로 동작하는지 본다.

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

const auth = { Authorization: `Bearer ${FAKE_TOKEN}` };

beforeEach(async () => {
  localStorage.clear();
  clearSession();
  resetFake();
  await signIn();
});

describe('아고라 홈·토픽', () => {
  it('추천은 점수 순이고, 라이징은 공개작이 있는 창작자, 핫 토픽은 공개작이 있는 토픽만이다', async () => {
    const home = await api.getAgoraHome();
    expect(home.recommended[0]?.id).toBe(FAKE_AGORA_IDS.original);
    expect(home.recommended.map((card) => card.title)).toContain('Paper texture study');
    expect(home.risingCreators.map((creator) => creator.displayName)).toEqual(['Lind', 'Mara']);
    expect(home.hotTopics.map((entry) => entry.topic.title)).toEqual([
      'Urban Trail',
      'Warm Task Lighting',
    ]);
    // 표지가 없는 공개작은 썸네일이 없다
    const noCover = home.recommended.find((card) => card.id === FAKE_AGORA_IDS.noCover);
    expect(noCover?.coverThumbUrl).toBeNull();
  });

  it('토픽은 그 토픽의 공개작만 주고, 없는 토픽이면 NOT_FOUND 다', async () => {
    const topic = FAKE_TOPICS[0];
    if (topic === undefined) throw new Error('토픽이 없다');
    const response = await api.getTopic(topic.id);
    expect(response.topic).toEqual(topic);
    expect(response.projects.map((card) => card.id)).toEqual([
      FAKE_AGORA_IDS.original,
      FAKE_AGORA_IDS.derived,
    ]);
    const error = await rejection(api.getTopic(crypto.randomUUID()));
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('아고라 상세', () => {
  it('원작은 대표 세트·이유·파생작·댓글 수를 준다', async () => {
    const detail = await api.getAgoraProject(FAKE_AGORA_IDS.original);
    expect(detail.author.displayName).toBe('Lind');
    expect(detail.reason).toBeDefined();
    expect(detail.sets).toHaveLength(1);
    expect(detail.sets[0]?.latestAnswer?.origin).toBe('generated');
    expect(detail.derivatives.map((card) => card.id)).toEqual([FAKE_AGORA_IDS.derived]);
    expect(detail.commentCount).toBe(2);
    expect(detail.project.commentCount).toBe(2);
    expect(detail.derivedFrom).toBeUndefined();
  });

  it('파생작은 원작 제목을, 원작이 지워진 파생작은 id 만 준다', async () => {
    const derived = await api.getAgoraProject(FAKE_AGORA_IDS.derived);
    expect(derived.derivedFrom).toEqual({
      projectId: FAKE_AGORA_IDS.original,
      answerId: expect.any(String),
      title: 'Urban commuter shoe',
    });
    const orphan = await api.getAgoraProject(FAKE_AGORA_IDS.deletedOriginalDerive);
    expect(orphan.derivedFrom).toEqual({
      projectId: FAKE_AGORA_IDS.deletedOriginal,
      answerId: null,
      title: null,
    });
  });

  it('대표가 없는 공개작은 표지·세트가 없고, 지워진 원작은 NOT_FOUND 다', async () => {
    const noCover = await api.getAgoraProject(FAKE_AGORA_IDS.noCover);
    expect(noCover.coverImageUrl).toBeNull();
    expect(noCover.sets).toEqual([]);
    expect((await rejection(api.getAgoraProject(FAKE_AGORA_IDS.deletedOriginal))).code).toBe(
      'NOT_FOUND',
    );
  });

  it('조회 기록은 204 로 본문이 없고, 공개작이 아니면 NOT_FOUND 다', async () => {
    await expect(api.recordAgoraView(FAKE_AGORA_IDS.original)).resolves.toBeUndefined();
    const response = await fakeTransport({
      method: 'POST',
      path: `/agora/projects/${FAKE_AGORA_IDS.original}/views`,
      headers: auth,
    });
    expect(response.status).toBe(204);
    expect((await rejection(api.recordAgoraView(crypto.randomUUID()))).code).toBe('NOT_FOUND');
  });
});

describe('파생', () => {
  it('내 서가 맨 앞에 kind derive 프로젝트를 만들고, 대표 답변을 복사한 세트 1개를 둔다', async () => {
    const before = await api.listProjects();
    const { project } = await api.deriveProject(FAKE_AGORA_IDS.original);
    expect(project).toMatchObject({
      title: 'Urban commuter shoe',
      kind: 'derive',
      status: 'building',
      posted: false,
      shelfPosition: 0,
    });
    const after = await api.listProjects();
    expect(after.projects.map((p) => p.id)).toEqual([
      project.id,
      ...before.projects.map((p) => p.id),
    ]);
    const workspace = await api.getWorkspace(project.id);
    expect(workspace.pages).toHaveLength(1);
    expect(workspace.sets).toHaveLength(1);
    expect(workspace.sets[0]?.prompt).toBe(
      'A commuter sneaker with a reflective heel on a rainy street',
    );
    expect(workspace.sets[0]?.latestAnswer).toMatchObject({
      number: 1,
      origin: 'derived_copy',
      status: 'accepted',
    });
    expect(workspace.activeJob).toBeUndefined();
  });

  it('201 이고, 같은 멱등 키로 다시 보내면 같은 프로젝트를 돌려준다', async () => {
    const request = {
      method: 'POST' as const,
      path: `/agora/projects/${FAKE_AGORA_IDS.original}/derive`,
      headers: { ...auth, 'Idempotency-Key': 'derive-key-1' },
    };
    const first = await fakeTransport(request);
    const again = await fakeTransport(request);
    expect(first.status).toBe(201);
    expect(again).toEqual(first);
    const { project } = DeriveProjectResponseSchema.parse(first.body);
    const shelf = await api.listProjects();
    expect(shelf.projects.filter((p) => p.title === project.title)).toHaveLength(1);
  });

  it('멱등 키가 없으면 IDEMPOTENCY_KEY_MISSING 이다', async () => {
    const response = await fakeTransport({
      method: 'POST',
      path: `/agora/projects/${FAKE_AGORA_IDS.original}/derive`,
      headers: auth,
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_MISSING' } });
  });

  it('대표가 없거나 원작이 지워졌으면 DERIVE_SOURCE_UNAVAILABLE(409), 모르는 id 는 NOT_FOUND 다', async () => {
    const noCover = await rejection(api.deriveProject(FAKE_AGORA_IDS.noCover));
    expect(noCover.status).toBe(409);
    expect(noCover.code).toBe('DERIVE_SOURCE_UNAVAILABLE');
    expect((await rejection(api.deriveProject(FAKE_AGORA_IDS.deletedOriginal))).code).toBe(
      'DERIVE_SOURCE_UNAVAILABLE',
    );
    expect((await rejection(api.deriveProject(crypto.randomUUID()))).code).toBe('NOT_FOUND');
  });
});

describe('댓글', () => {
  it('새것부터 주고, 내 댓글에는 mine 이 붙는다', async () => {
    const { comments } = await api.listComments(FAKE_AGORA_IDS.original);
    expect(comments.map((c) => c.body)).toEqual([
      'Love the sole shape.',
      'The reflective heel reads well even at night.',
    ]);
    expect(comments.map((c) => c.mine)).toEqual([true, false]);
    expect(comments[0]?.author).toEqual(FAKE_CREATOR);
  });

  it('쓰면 앞뒤 공백을 빼고 맨 앞에 붙고, 댓글 수가 늘고, 새로고침해도 남는다', async () => {
    const { comment } = await api.createComment(FAKE_AGORA_IDS.original, {
      body: '  Nice heel.  ',
    });
    expect(comment).toMatchObject({ body: 'Nice heel.', mine: true, author: FAKE_CREATOR });
    dropFakeStoreMemory();
    const { comments } = await api.listComments(FAKE_AGORA_IDS.original);
    expect(comments[0]?.id).toBe(comment.id);
    expect((await api.getAgoraProject(FAKE_AGORA_IDS.original)).commentCount).toBe(3);
  });

  it('빈 댓글은 보내기 전에 막고, 서버(가짜)도 400 이다', async () => {
    expect(() => api.createComment(FAKE_AGORA_IDS.original, { body: '   ' })).toThrow();
    const response = await fakeTransport({
      method: 'POST',
      path: `/projects/${FAKE_AGORA_IDS.original}/comments`,
      headers: { ...auth, 'Idempotency-Key': 'comment-key-1' },
      body: { body: '   ' },
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('limit·before 로 나눠 받고, 모르는 before 나 범위 밖 limit 은 VALIDATION_FAILED 다', async () => {
    const first = await api.listComments(FAKE_AGORA_IDS.original, { limit: 1 });
    expect(first.comments).toHaveLength(1);
    const last = first.comments[0];
    if (last === undefined) throw new Error('댓글이 없다');
    const next = await api.listComments(FAKE_AGORA_IDS.original, { before: last.id, limit: 1 });
    expect(next.comments.map((c) => c.body)).toEqual([
      'The reflective heel reads well even at night.',
    ]);
    const end = await api.listComments(FAKE_AGORA_IDS.original, {
      before: next.comments[0]?.id ?? '',
    });
    expect(end.comments).toEqual([]);
    const unknown = await rejection(
      api.listComments(FAKE_AGORA_IDS.original, { before: crypto.randomUUID() }),
    );
    expect(unknown.code).toBe('VALIDATION_FAILED');
    expect((await rejection(api.listComments(FAKE_AGORA_IDS.original, { limit: 51 }))).code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('내 댓글만 지운다: 남의 것은 FORBIDDEN, 두 번 지우면 NOT_FOUND 다', async () => {
    const { comments } = await api.listComments(FAKE_AGORA_IDS.original);
    const mine = comments.find((c) => c.mine);
    const others = comments.find((c) => !c.mine);
    if (mine === undefined || others === undefined) throw new Error('댓글이 없다');
    await expect(api.deleteComment(mine.id)).resolves.toBeUndefined();
    expect((await rejection(api.deleteComment(mine.id))).code).toBe('NOT_FOUND');
    const forbidden = await rejection(api.deleteComment(others.id));
    expect(forbidden.status).toBe(403);
    expect(forbidden.code).toBe('FORBIDDEN');
    const left = await api.listComments(FAKE_AGORA_IDS.original);
    expect(left.comments.map((c) => c.id)).toEqual([others.id]);
  });

  it('댓글 칸이 없던 예전 저장 데이터도 처음 댓글로 채운다', async () => {
    delete fakeStore(false).agoraComments;
    const { comments } = await api.listComments(FAKE_AGORA_IDS.original);
    expect(comments).toHaveLength(2);
  });
});
