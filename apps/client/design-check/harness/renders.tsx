import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectSummary } from '@tome/shared';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  canvasDesignFixtures,
  nodeEditorDesignFixtures,
  canvasHistoryDesignFixtures,
  remixDesignFixtures,
} from '../../src/features/canvas';
import { NewProjectCell } from '../../src/pages/home/NewProjectCell';
import { ShelfCard } from '../../src/pages/home/ShelfCard';
import { COPY } from '../../src/shared/copy';
import { RemixLabel } from '../../src/pages/workspace/remix/RemixPanel';
import { CreatorPill } from '../../src/pages/agora/CreatorPill';
import { AppHeader, Flash, Tabs, TitleInput } from '../../src/shared/ui';
import { LandingFooter, LandingScale } from '../../src/pages/landing';

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
  // 시안 Title Input-Modal(3182:176487) = 완료 모달 입력칸 모양(look="modal", #205)
  'title-input/default': () => (
    <TitleInput look="modal" aria-label="Title" value="" placeholder={SAMPLE} onChange={() => {}} />
  ),
  'title-input/writing': () => (
    <TitleInput look="modal" aria-label="Title" value={SAMPLE} onChange={() => {}} />
  ),
  'title-input/done': () => (
    <TitleInput look="modal" aria-label="Title" value={SAMPLE} onChange={() => {}} />
  ),
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
renders['canvas/origin-heading'] = canvasDesignFixtures.originHeading;
for (let index = 1; index <= 8; index++)
  renders[`canvas/preview-generating-${String(index).padStart(2, '0')}`] =
    canvasDesignFixtures.gradient;
// ---- 리믹스 알약(#41): 그림자 여백 20px 안에 알약(열림 312px, 상대 있음 247px)을 둔다.
const pill = (width: number, partner: string | undefined, open: boolean) => () => (
  <div style={{ padding: 20 }}>
    <div style={{ width }}>
      <RemixLabel
        partner={partner === undefined ? undefined : { displayName: partner, avatarUrl: null }}
        open={open}
      />
    </div>
  </div>
);
Object.assign(renders, {
  'control/remix-selected': pill(312, undefined, true),
  'control/remix-done': pill(247, 'Paul', false),
});
// ---- 아고라 카드(#39): 시안의 이름·소개 글자를 그대로 쓴다(앱 copy 에는 넣지 않는다).
const AGORA_PERSON = {
  id: '5b1d6c0e-2f43-4a8e-9c1b-7a3e5d2f8b40',
  kind: 'seed',
  displayName: 'Lind',
  bio: 'Global Implementation Manager',
  avatarUrl: null,
} as const;
Object.assign(renders, {
  'agora-cards/creator': () => withAppContext(<CreatorPill creator={AGORA_PERSON} />),
});

const previewImages = import.meta.glob<string>(
  '../../../../design-ref/components/done-modal/assets/raw-image-01__3182-176717.png',
  { eager: true, import: 'default', query: '?url' },
);
const previewImage = Object.values(previewImages)[0];

Object.assign(renders, {
  'node-editor/weighting': nodeEditorDesignFixtures.weighting,
  'node-editor/meaning': nodeEditorDesignFixtures.meaning,
  'node-editor/preview-generating': () => nodeEditorDesignFixtures.generating(previewImage),
  'node-editor/preview-ready': () => nodeEditorDesignFixtures.ready(previewImage),
});

// ---- 인트로 랜딩(#46): 폭 1920 에서 푸터만(나머지 구간은 새 화면과 맞는 시안 캡처가 없어 뺐다, #149)
Object.assign(renders, {
  'landing/footer': () =>
    withAppContext(
      <LandingScale>
        <LandingFooter onBackToTop={() => {}} />
      </LandingScale>,
    ),
});
renders['canvas-history/corner'] = canvasHistoryDesignFixtures.corner;
renders['canvas-history/pin-off'] = () => canvasHistoryDesignFixtures.pin(false);
renders['canvas-history/pin-on'] = () => canvasHistoryDesignFixtures.pin(true);

renders['canvas-remix/closed'] = remixDesignFixtures.closed;
renders['header/etc'] = () => withAppContext(<AppHeader current={null} profileTo="/" />);
