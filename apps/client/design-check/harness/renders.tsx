import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectSummary } from '@tome/shared';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { canvasDesignFixtures } from '../../src/features/canvas';
import { NewProjectCell } from '../../src/pages/home/NewProjectCell';
import { ShelfCard } from '../../src/pages/home/ShelfCard';
import { COPY } from '../../src/shared/copy';
import { Flash, Tabs, TitleInput } from '../../src/shared/ui';

// 시범 비교용 안내 글자. 앱 copy 에는 넣지 않는다.
const SAMPLE = 'Please ~~~';
// 홈 카드 시안(1226:78464)의 제목 자리 글자. 앱 copy 에는 넣지 않는다.
const FIGMA_CARD_TITLE = '프로젝트 타이틀 입력 프로젝트 타이틀 입력 프로젝트 타이틀 입력';

/** 링크(react-router)와 표지 받기(TanStack Query)가 필요한 화면을 감싼다. */
function withAppContext(element: ReactNode): ReactNode {
  const router = createMemoryRouter([{ path: '/', element }], { initialEntries: ['/'] });
  return (
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

function shelfCard(extra: Partial<ProjectSummary>): ReactNode {
  const project: ProjectSummary = {
    id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c',
    title: FIGMA_CARD_TITLE,
    status: 'finished',
    posted: true,
    coverThumbUrl: null,
    lastEditedAt: '2026-11-03T10:30:00.000Z',
    shelfPosition: 0,
    kind: 'original',
    ...extra,
  };
  return withAppContext(<ShelfCard project={project} openToLeft={false} onMove={() => {}} />);
}

/** cases.ts 의 id → 그릴 화면 */
export const renders: Record<string, () => ReactNode> = {
  'title-input/default': () => (
    <TitleInput aria-label="Title" value="" placeholder={SAMPLE} onChange={() => {}} />
  ),
  'title-input/writing': () => <TitleInput aria-label="Title" value={SAMPLE} onChange={() => {}} />,
  'title-input/done': () => <TitleInput aria-label="Title" value={SAMPLE} onChange={() => {}} />,
  'home-thumbnail/my-work': () => shelfCard({}),
  'home-thumbnail/remix': () =>
    shelfCard({
      remixPartner: {
        id: '5b1d6c0e-2f43-4a8e-9c1b-7a3e5d2f8b11',
        kind: 'seed',
        displayName: 'Judy',
        bio: null,
        avatarUrl: null,
      },
    }),
  'home-thumbnail/derive': () => shelfCard({ kind: 'derive' }),
  'thumbnail-new-project/default': () =>
    withAppContext(
      <div className="p-px">
        <NewProjectCell onCreate={() => Promise.resolve('0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c')} />
      </div>,
    ),
};

// ---- 공통 부품: 플래시·탭
const TAB_ITEMS = [
  { value: 'work', label: COPY['P-01a'] },
  { value: 'identity', label: COPY['P-01b'] },
  { value: 'compare', label: COPY['P-01c'] },
] as const;
const tabs = (value: 'work' | 'identity' | 'compare') => () => (
  <Tabs value={value} onValueChange={() => {}} label="Profile" items={TAB_ITEMS}>
    {null}
  </Tabs>
);
Object.assign(renders, {
  'flash/done': () => <Flash kind="done" />,
  'flash/update': () => <Flash kind="update" />,
  'flash/stack': () => <Flash kind="stack" />,
  'tabs/work': tabs('work'),
  'tabs/identity': tabs('identity'),
  'tabs/compare': tabs('compare'),
});

renders['canvas/keyword'] = canvasDesignFixtures.keyword;
for (let index = 1; index <= 8; index++)
  renders[`canvas/preview-generating-${String(index).padStart(2, '0')}`] =
    canvasDesignFixtures.gradient;
