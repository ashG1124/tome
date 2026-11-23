import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AgoraComment,
  AgoraHomeResponse,
  AgoraProjectCard,
  AgoraProjectResponse,
  CreatorSummary,
  TopicResponse,
} from '@tome/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiRequestError, clearSession, NetworkError, setSession } from '../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../shared/api/fake/data';
import { FAKE_AGORA_IDS } from '../../shared/api/fake/agora';
import { resetFake, setFakeConsented } from '../../shared/api/fake/state';
import { COPY } from '../../shared/copy';
import { AgoraHomePage } from './AgoraHomePage';
import { AgoraProjectPage } from './AgoraProjectPage';
import { TopicListPage } from './TopicListPage';
import { TopicPage } from './TopicPage';

const person = (n: number, name: string): CreatorSummary => ({
  id: `5b1d6c0e-2f43-4a8e-9c1b-7a3e5d2f8b${String(n).padStart(2, '0')}`,
  kind: 'seed',
  displayName: name,
  bio: null,
  avatarUrl: null,
});

const card = (n: number, title: string): AgoraProjectCard => ({
  id: `3c1a2b4d-5e6f-4a7b-8c9d-0e1f2a3b4c${String(n).padStart(2, '0')}`,
  title,
  kind: 'derive',
  author: person(n, `Author ${n}`),
  coverThumbUrl: null,
  likeCount: 1234,
  commentCount: 42,
});

const TOPIC: TopicResponse = {
  topic: { id: '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b', title: 'Urban Trail' },
  projects: [card(1, 'Urban Commuter Tailoring'), card(2, 'High-Vis Trail Accent')],
};

const QUEEN = person(20, 'Queen');
const DETAIL: AgoraProjectResponse = {
  project: { ...card(0, 'Urban Trail'), kind: 'original', author: QUEEN, commentCount: 2 },
  author: QUEEN,
  coverImageUrl: null,
  sets: [],
  commentCount: 2,
  derivatives: [card(3, 'Lattice-Structure Runway Sneaker')],
};

const comment = (n: number, body: string, mine: boolean): AgoraComment => ({
  id: `6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c${String(n).padStart(2, '0')}`,
  author: person(30 + n, mine ? 'Me' : 'Jack'),
  body,
  createdAt: '2026-11-13T09:30:00.000Z',
  mine,
});

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/agora', element: <AgoraHomePage /> },
      { path: '/agora/topics', element: <TopicListPage /> },
      { path: '/agora/topics/:id', element: <TopicPage /> },
      { path: '/agora/projects/:id', element: <AgoraProjectPage /> },
      { path: '/projects/:id', element: <p>workspace</p> },
    ],
    { initialEntries: [path] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  localStorage.clear();
  setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
  setFakeConsented();
  vi.spyOn(api, 'listComments').mockResolvedValue({ comments: [] });
  vi.spyOn(api, 'recordAgoraView').mockResolvedValue(undefined);
});

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe('TopicPage', () => {
  it('"Hot Topic" 과 주제 제목, 프로젝트 카드(상세 링크·줄인 숫자)를 보여 준다', async () => {
    vi.spyOn(api, 'getTopic').mockResolvedValue(TOPIC);
    renderAt(`/agora/topics/${TOPIC.topic.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Urban Trail' })).toBeTruthy();
    expect(screen.getByText(COPY['A-01'])).toBeTruthy();
    const link = screen.getByRole('link', { name: /Urban Commuter Tailoring/ });
    expect(link.getAttribute('href')).toBe(`/agora/projects/${TOPIC.projects[0]?.id}`);
    expect(link.textContent).toContain(`${COPY['A-07']}1.2k`);
    expect(link.textContent).toContain(`${COPY['A-02']}42`);
  });

  it('프로젝트가 없으면 S-02 를 보여 준다', async () => {
    vi.spyOn(api, 'getTopic').mockResolvedValue({ ...TOPIC, projects: [] });
    renderAt(`/agora/topics/${TOPIC.topic.id}`);
    expect((await screen.findByRole('status')).textContent).toBe(COPY['S-02']);
    expect(screen.queryAllByRole('link', { name: /Urban/ })).toHaveLength(0);
  });
});

describe('AgoraProjectPage', () => {
  it('작성자·제목·파생작을 보여 주고, 열 때 조회를 한 번 센다', async () => {
    vi.spyOn(api, 'getAgoraProject').mockResolvedValue(DETAIL);
    renderAt(`/agora/projects/${DETAIL.project.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Urban Trail' })).toBeTruthy();
    expect(screen.getByText('Queen')).toBeTruthy();
    const side = screen.getByRole('complementary', { name: COPY['A-04'] });
    expect(within(side).getByRole('link', { name: /Lattice-Structure/ })).toBeTruthy();
    expect(api.recordAgoraView).toHaveBeenCalledTimes(1);
  });

  it('Go to derive 를 누르면 복사한 내 프로젝트 워크스페이스로 간다', async () => {
    vi.spyOn(api, 'getAgoraProject').mockResolvedValue(DETAIL);
    const derive = vi.spyOn(api, 'deriveProject').mockResolvedValue({
      project: {
        id: '11111111-2222-4333-8444-555555555555',
        title: 'Urban Trail',
        status: 'building',
        posted: false,
        coverThumbUrl: null,
        lastEditedAt: '2026-11-16T00:00:00.000Z',
        shelfPosition: 0,
        kind: 'derive',
      },
    });
    const router = renderAt(`/agora/projects/${DETAIL.project.id}`);

    fireEvent.click(await screen.findByRole('button', { name: COPY['A-05'] }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/projects/11111111-2222-4333-8444-555555555555'),
    );
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it('원작을 복사할 수 없으면 S-06 을 보이고 Retry 는 없다. 연결이 끊기면 E-03 과 Retry', async () => {
    vi.spyOn(api, 'getAgoraProject').mockResolvedValue(DETAIL);
    const derive = vi
      .spyOn(api, 'deriveProject')
      .mockRejectedValueOnce(
        new ApiRequestError(409, {
          code: 'DERIVE_SOURCE_UNAVAILABLE',
          message: 'gone',
          retryable: false,
        }),
      )
      .mockRejectedValueOnce(new NetworkError(new Error('offline')));
    renderAt(`/agora/projects/${DETAIL.project.id}`);

    fireEvent.click(await screen.findByRole('button', { name: COPY['A-05'] }));
    expect((await screen.findByRole('alert')).textContent).toContain(COPY['S-06']);
    expect(screen.queryByRole('button', { name: COPY['E-01b'] })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: COPY['A-05'] }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(COPY['E-03']));
    expect(screen.getByRole('button', { name: COPY['E-01b'] })).toBeTruthy();
    expect(derive).toHaveBeenCalledTimes(2);
  });

  it('원작이 지워진 파생작이면 "Derived from Deleted original"', async () => {
    vi.spyOn(api, 'getAgoraProject').mockResolvedValue({
      ...DETAIL,
      derivedFrom: { projectId: DETAIL.project.id, answerId: null, title: null },
    });
    renderAt(`/agora/projects/${DETAIL.project.id}`);
    expect(await screen.findByText(`${COPY['A-06']} ${COPY['S-06']}`)).toBeTruthy();
  });
});

describe('CommentsSection', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getAgoraProject').mockResolvedValue(DETAIL);
  });

  it('처음엔 1개만 보이고 See more 로 모두 펼친다. 시각은 절대 날짜', async () => {
    vi.spyOn(api, 'listComments').mockResolvedValue({
      comments: [comment(1, 'First', false), comment(2, 'Second', true)],
    });
    renderAt(`/agora/projects/${DETAIL.project.id}`);

    expect(await screen.findByText('First')).toBeTruthy();
    expect(screen.queryByText('Second')).toBeNull();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: COPY['A-03'] }));
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('내 댓글에만 Delete 가 있고, 누르면 지운다', async () => {
    vi.spyOn(api, 'listComments').mockResolvedValue({
      comments: [comment(1, 'Mine', true), comment(2, 'Theirs', false)],
    });
    const remove = vi.spyOn(api, 'deleteComment').mockResolvedValue(undefined);
    renderAt(`/agora/projects/${DETAIL.project.id}`);

    await screen.findByText('Mine');
    fireEvent.click(screen.getByRole('button', { name: COPY['A-03'] }));
    const buttons = screen.getAllByRole('button', { name: COPY['S-07b'] });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    await waitFor(() => expect(remove).toHaveBeenCalledWith(comment(1, 'Mine', true).id));
  });

  it('보내면 입력칸을 비우고, 실패하면 입력한 글을 그대로 둔다. 공백만이면 보내지 않는다', async () => {
    const create = vi
      .spyOn(api, 'createComment')
      .mockRejectedValueOnce(new NetworkError(new Error('offline')))
      .mockResolvedValueOnce({ comment: comment(3, 'Nice', true) });
    renderAt(`/agora/projects/${DETAIL.project.id}`);

    const input = (await screen.findByRole('textbox', {
      name: COPY['S-07a'],
    })) as HTMLTextAreaElement;
    const post = screen.getByRole('button', { name: COPY['A-08'] }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: '   ' } });
    expect(post.disabled).toBe(true);

    fireEvent.change(input, { target: { value: '  Nice  ' } });
    fireEvent.click(post);
    expect((await screen.findByRole('alert')).textContent).toContain(COPY['E-03']);
    expect(input.value).toBe('  Nice  ');

    fireEvent.click(post);
    await waitFor(() => expect(input.value).toBe(''));
    expect(create).toHaveBeenLastCalledWith(DETAIL.project.id, { body: 'Nice' });
  });
});

describe('AgoraHomePage', () => {
  const HOME: AgoraHomeResponse = {
    recommended: [card(1, 'Cyber-cympathy'), card(2, 'Lifestyle furniture')],
    risingCreators: [{ ...person(40, 'Lind'), bio: 'Global Implementation Manager' }],
    hotTopics: [
      { topic: TOPIC.topic, projects: Array.from({ length: 20 }, (_, k) => card(k + 10, `P${k}`)) },
    ],
  };

  it('세 줄(추천·라이징·핫토픽)을 보여 주고, 각각 상세·프로필·핫토픽 목록으로 이어진다', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue(HOME);
    renderAt('/agora');

    const recommended = await screen.findByRole('region', { name: COPY['A-09'] });
    expect(
      within(recommended)
        .getByRole('link', { name: /Cyber-cympathy/ })
        .getAttribute('href'),
    ).toBe(`/agora/projects/${HOME.recommended[0]?.id}`);
    const rising = screen.getByRole('region', { name: COPY['A-10'] });
    const lind = within(rising).getByRole('link', { name: /Lind/ });
    expect(lind.getAttribute('href')).toBe(`/creators/${HOME.risingCreators[0]?.id}`);
    expect(lind.textContent).toContain('Global Implementation Manager');
    const topics = screen.getByRole('region', { name: COPY['A-01'] });
    const bundle = within(topics).getByRole('link', { name: /Urban Trail/ });
    expect(bundle.getAttribute('href')).toBe(`/agora/topics/${TOPIC.topic.id}`);
    // 응답에 주제 전체 프로젝트 수가 없으므로 "+N" 은 보이지 않는다
    expect(bundle.textContent).not.toMatch(/\+\d/);
  });

  it('게시물이 하나도 없으면 S-02', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue({
      recommended: [],
      risingCreators: HOME.risingCreators,
      hotTopics: [],
    });
    renderAt('/agora');
    expect((await screen.findByRole('status')).textContent).toBe(COPY['S-02']);
  });
});

describe('가짜 서버 그대로(shared/api 아고라 가짜 응답)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFake();
    setFakeConsented();
  });

  it('원작 상세에서 Go to derive 를 누르면 서가 맨 앞에 생긴 내 프로젝트 워크스페이스로 간다', async () => {
    const router = renderAt(`/agora/projects/${FAKE_AGORA_IDS.original}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Urban commuter shoe' }),
    ).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: COPY['A-05'] }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/projects\//));
    const { projects } = await api.listProjects();
    expect(projects[0]).toMatchObject({ kind: 'derive', title: 'Urban commuter shoe' });
    expect(router.state.location.pathname).toBe(`/projects/${projects[0]?.id ?? ''}`);
  });

  it('대표가 없는 공개작은 Go to derive 를 누르면 S-06 을 보여 준다', async () => {
    renderAt(`/agora/projects/${FAKE_AGORA_IDS.noCover}`);
    fireEvent.click(await screen.findByRole('button', { name: COPY['A-05'] }));
    expect((await screen.findByRole('alert')).textContent).toContain(COPY['S-06']);
  });
});

describe('TopicListPage', () => {
  const HOME: AgoraHomeResponse = {
    recommended: [],
    risingCreators: [],
    hotTopics: [
      { topic: TOPIC.topic, projects: TOPIC.projects },
      {
        topic: { id: '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9', title: 'Warm Task Lighting' },
        projects: [card(5, 'Lamp')],
      },
    ],
  };

  it('아고라 홈의 핫토픽을 모두 늘어놓고 누르면 그 주제로 간다', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue(HOME);
    const router = renderAt('/agora/topics');
    expect(await screen.findByRole('heading', { level: 1, name: COPY['A-01'] })).toBeTruthy();
    const link = await screen.findByRole('link', { name: 'Warm Task Lighting' });
    expect(screen.getByRole('link', { name: 'Urban Trail' })).toBeTruthy();
    fireEvent.click(link);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/agora/topics/${HOME.hotTopics[1]?.topic.id}`),
    );
  });

  it('핫토픽이 없으면 S-02 를 보여 준다', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue({ ...HOME, hotTopics: [] });
    renderAt('/agora/topics');
    expect((await screen.findByRole('status')).textContent).toBe(COPY['S-02']);
  });
});
