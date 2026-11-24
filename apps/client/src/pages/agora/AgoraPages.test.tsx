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
import { AgoraCreatorsPage } from './AgoraCreatorsPage';
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
      { path: '/agora/creators', element: <AgoraCreatorsPage /> },
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
    expect(await screen.findByText(COPY['S-02'])).toBeTruthy();
    expect(screen.getByText(COPY['S-02']).getAttribute('role')).toBe('status');
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
    newCreators: [],
    hotTopics: [
      {
        topic: TOPIC.topic,
        projects: Array.from({ length: 4 }, (_, k) => card(k + 10, `P${k}`)),
        projectCount: 4,
      },
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
    // 주제의 공개작이 묶음에 보이는 4장뿐이면 "+N" 은 없다. 핫토픽 전체 목록은 헤더 Topic 탭이 맡아 See more 링크가 없다
    expect(bundle.querySelector('[data-topic-count]')).toBeNull();
    expect(screen.queryByRole('link', { name: COPY['A-03'] })).toBeNull();
  });

  it('주제에 공개작이 더 있으면 묶음에 "+N" 을 보이고 낭독기에는 문장으로 읽힌다', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue({
      ...HOME,
      hotTopics: [{ ...HOME.hotTopics[0]!, projectCount: 20 }],
    });
    renderAt('/agora');
    const topics = await screen.findByRole('region', { name: COPY['A-01'] });
    const bundle = within(topics).getByRole('link', {
      name: `Urban Trail, ${COPY['AT-02'].replace('{count}', '16')}`,
    });
    const count = bundle.querySelector('[data-topic-count]');
    expect(count?.textContent).toBe('+16');
    expect(count?.getAttribute('aria-hidden')).toBe('true');
  });

  it('게시물이 하나도 없으면 S-02', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue({
      recommended: [],
      risingCreators: HOME.risingCreators,
      newCreators: HOME.risingCreators,
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
    newCreators: [],
    hotTopics: [
      { topic: TOPIC.topic, projects: TOPIC.projects, projectCount: 2 },
      {
        topic: { id: '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9', title: 'Warm Task Lighting' },
        projects: [card(5, 'Lamp')],
        projectCount: 1,
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
    expect((await screen.findByText(COPY['S-02'])).getAttribute('role')).toBe('status');
  });
});

describe('헤더 탭(Project·Creator·Topic)과 검색(새 API 없이 이미 받은 데이터를 거른다)', () => {
  const HOME: AgoraHomeResponse = {
    recommended: [card(1, 'Cyber-cympathy'), card(2, 'Lifestyle furniture')],
    risingCreators: [{ ...person(40, 'Lind'), bio: 'Global Implementation Manager' }],
    newCreators: [person(41, 'Nichole')],
    hotTopics: [
      {
        topic: TOPIC.topic,
        projects: [card(3, 'Urban Commuter'), card(4, 'Trail Accent')],
        projectCount: 2,
      },
    ],
  };
  const status = () => screen.getAllByRole('status').find((el) => el.textContent !== '');
  const tab = (name: string) =>
    within(screen.getByRole('navigation', { name: COPY['AT-03'] })).getByRole('link', { name });

  beforeEach(() => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue(HOME);
  });

  it('Project 탭은 프로젝트 제목으로 거르고, 결과 수를 role=status 로 알린다', async () => {
    renderAt('/agora?q=lifestyle');
    expect(await screen.findByRole('link', { name: /Lifestyle furniture/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Cyber-cympathy/ })).toBeNull();
    expect(screen.queryByRole('region', { name: COPY['A-10'] })).toBeNull();
    expect(screen.queryByRole('region', { name: COPY['A-01'] })).toBeNull();
    expect(status()?.textContent).toBe(`${COPY['AGS-02']}: 1`);
  });

  it('Project 탭은 작성자 이름으로는 거르지 않는다(창작자는 Creator 탭)', async () => {
    renderAt('/agora?q=author%203');
    expect(await screen.findByText(COPY['AGS-01'])).toBeTruthy();
  });

  it('Creator 탭은 창작자 이름으로 Rising·New 를 함께 거른다', async () => {
    renderAt('/agora/creators?q=lind');
    const rising = await screen.findByRole('region', { name: COPY['A-10'] });
    expect(within(rising).getByRole('link', { name: /Lind/ })).toBeTruthy();
    expect(screen.queryByRole('region', { name: COPY['AT-01'] })).toBeNull();
    expect(screen.queryByRole('region', { name: COPY['A-09'] })).toBeNull();
    expect(status()?.textContent).toBe(`${COPY['AGS-02']}: 1`);
  });

  it('Topic 탭은 주제 제목으로 묶음째 거른다', async () => {
    renderAt('/agora/topics?q=urban');
    expect(await screen.findByRole('link', { name: /Urban Trail/ })).toBeTruthy();
    expect(status()?.textContent).toBe(`${COPY['AGS-02']}: 1`);
  });

  it('결과가 없으면 No results. 를 보여 준다', async () => {
    renderAt('/agora?q=zzzz');
    expect(await screen.findByText(COPY['AGS-01'])).toBeTruthy();
    expect(screen.queryByRole('region', { name: COPY['A-09'] })).toBeNull();
  });

  it('예전 주소(?in=creator)는 Creator 탭 주소로 바뀐다', async () => {
    const router = renderAt('/agora?q=lind&in=creator');
    await waitFor(() => expect(router.state.location.pathname).toBe('/agora/creators'));
    expect(router.state.location.search).toBe('?q=lind');
    expect(await screen.findByRole('region', { name: COPY['A-10'] })).toBeTruthy();
  });

  it('입력하면 주소 쿼리가 바뀌고 바로 거른다. 탭을 옮겨도 검색어를 가져가고 Esc 로 지운다', async () => {
    const router = renderAt('/agora');
    const input = await screen.findByRole('searchbox', { name: COPY['AGS-07'] });
    await screen.findByRole('link', { name: /Cyber-cympathy/ });
    expect(tab(COPY['AGS-04']).getAttribute('aria-current')).toBe('page');
    fireEvent.change(input, { target: { value: 'cyber' } });
    await waitFor(() => expect(router.state.location.search).toBe('?q=cyber'));
    expect(screen.queryByRole('link', { name: /Lifestyle furniture/ })).toBeNull();

    fireEvent.change(input, { target: { value: 'lind' } });
    fireEvent.click(tab(COPY['AGS-05']));
    await waitFor(() => expect(router.state.location.pathname).toBe('/agora/creators'));
    expect(router.state.location.search).toBe('?q=lind');
    const rising = await screen.findByRole('region', { name: COPY['A-10'] });
    expect(within(rising).getByRole('link', { name: /Lind/ })).toBeTruthy();
    expect(tab(COPY['AGS-05']).getAttribute('aria-current')).toBe('page');
    expect(tab(COPY['AGS-04']).getAttribute('aria-current')).toBeNull();
    // 새 화면의 헤더가 고른 탭에 포커스를 돌려준다(키보드로 탭을 옮겨도 자리를 잃지 않는다)
    await waitFor(() => expect(document.activeElement).toBe(tab(COPY['AGS-05'])));

    const next = screen.getByRole('searchbox', { name: COPY['AGS-07'] }) as HTMLInputElement;
    expect(next.value).toBe('lind');
    fireEvent.keyDown(next, { key: 'Escape' });
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(next.value).toBe('');
    expect(router.state.location.pathname).toBe('/agora/creators');
  });

  it('아고라 상세처럼 거를 목록이 없는 화면에서는 Enter 로 그 탭 화면에 가서 같은 검색을 적용한다', async () => {
    vi.spyOn(api, 'getAgoraProject').mockResolvedValue(DETAIL);
    const router = renderAt(`/agora/projects/${DETAIL.project.id}`);
    const input = await screen.findByRole('searchbox', { name: COPY['AGS-07'] });
    expect(tab(COPY['AGS-04']).getAttribute('aria-current')).toBe('true');
    fireEvent.change(input, { target: { value: 'lifestyle' } });
    expect(router.state.location.pathname).toBe(`/agora/projects/${DETAIL.project.id}`);
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/agora'));
    expect(router.state.location.search).toBe('?q=lifestyle');
  });

  it('핫토픽 화면(Topic 탭 아래)에서는 이 주제의 프로젝트를 제목으로 거른다', async () => {
    vi.spyOn(api, 'getTopic').mockResolvedValue(TOPIC);
    renderAt(`/agora/topics/${TOPIC.topic.id}?q=high-vis`);
    expect(await screen.findByRole('link', { name: /High-Vis Trail Accent/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Urban Commuter/ })).toBeNull();
    expect(tab(COPY['AGS-06']).getAttribute('aria-current')).toBe('true');
  });
});

describe('AgoraCreatorsPage (Creator 탭)', () => {
  const HOME: AgoraHomeResponse = {
    recommended: [card(1, 'Cyber-cympathy')],
    risingCreators: [{ ...person(40, 'Lind'), bio: 'Global Implementation Manager' }, QUEEN],
    newCreators: [person(41, 'Nichole')],
    hotTopics: [],
  };

  it('Rising Creator·New Creator 두 구역만 보이고, 알약은 그 사람 프로필로 간다', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue(HOME);
    renderAt('/agora/creators');
    expect(await screen.findByRole('heading', { level: 1, name: COPY['AGS-05'] })).toBeTruthy();
    const rising = await screen.findByRole('region', { name: COPY['A-10'] });
    const lind = within(rising).getByRole('link', { name: /Lind/ });
    expect(lind.getAttribute('href')).toBe(`/creators/${HOME.risingCreators[0]?.id}`);
    expect(lind.textContent).toContain('Global Implementation Manager');
    expect(within(rising).getAllByRole('link')).toHaveLength(2);
    const fresh = screen.getByRole('region', { name: COPY['AT-01'] });
    expect(within(fresh).getByRole('link', { name: /Nichole/ })).toBeTruthy();
    // 프로젝트 구역은 없다
    expect(screen.queryByRole('region', { name: COPY['A-09'] })).toBeNull();
    expect(screen.queryByRole('region', { name: COPY['A-01'] })).toBeNull();
  });

  it('새 창작자가 없으면 그 구역만 뺀다', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue({ ...HOME, newCreators: [] });
    renderAt('/agora/creators');
    expect(await screen.findByRole('region', { name: COPY['A-10'] })).toBeTruthy();
    expect(screen.queryByRole('region', { name: COPY['AT-01'] })).toBeNull();
  });

  it('창작자가 하나도 없으면 S-02 를 role=status 로 보여 준다', async () => {
    vi.spyOn(api, 'getAgoraHome').mockResolvedValue({
      ...HOME,
      risingCreators: [],
      newCreators: [],
    });
    renderAt('/agora/creators');
    expect((await screen.findByText(COPY['S-02'])).getAttribute('role')).toBe('status');
  });

  it('불러오지 못하면 오류와 다시 시도를 보여 준다', async () => {
    vi.spyOn(api, 'getAgoraHome').mockRejectedValue(new NetworkError(new Error('offline')));
    renderAt('/agora/creators');
    expect((await screen.findByRole('alert')).textContent).toContain(COPY['E-03']);
    expect(screen.getByRole('button', { name: COPY['E-01b'] })).toBeTruthy();
  });
});
