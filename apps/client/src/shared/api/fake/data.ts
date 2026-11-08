import type {
  CreatorSummary,
  HealthResponse,
  ProjectSummary,
  WorkspaceResponse,
} from '@tome/shared';

export const FAKE_TOKEN = 'fake-token';
export const FAKE_NOTICE_VERSION = 'fake-notice-1';

const FIXED_TIME = '2026-11-01T09:00:00.000Z';

export const FAKE_CREATOR: CreatorSummary = {
  id: '5b1d6c0e-2f43-4a8e-9c1b-7a3e5d2f8b10',
  kind: 'visitor',
  displayName: 'Visitor 1',
  bio: null,
  avatarUrl: null,
};

export const FAKE_PROJECTS: readonly ProjectSummary[] = [
  {
    id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c',
    title: 'Neon street at night',
    status: 'building',
    posted: false,
    coverThumbUrl: null,
    lastEditedAt: '2026-11-03T10:30:00.000Z',
    shelfPosition: 0,
    kind: 'original',
  },
  {
    id: '7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d',
    title: 'Desk lamp study',
    status: 'finished',
    posted: true,
    coverThumbUrl: null,
    lastEditedAt: '2026-11-02T15:00:00.000Z',
    shelfPosition: 1,
    kind: 'original',
  },
];

/** 프로젝트별 페이지 id. 첫 항목이 마지막으로 연 페이지다. */
const FAKE_PAGE_IDS: Record<string, readonly string[]> = {
  '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c': ['c4a1e7d2-8b5f-4e39-a6c0-2f1d3b4a5c6e'],
  '7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d': [
    'e9f3b1a7-5d2c-4b86-8f0a-3c4d5e6f7a8b',
    'a2c4e6f8-1b3d-4f57-9a8c-0e1f2a3b4c5d',
  ],
};

export function fakeWorkspace(projectId: string): WorkspaceResponse | null {
  const project = FAKE_PROJECTS.find((p) => p.id === projectId);
  const pageIds = FAKE_PAGE_IDS[projectId];
  const first = pageIds?.[0];
  if (!project || !pageIds || first === undefined) return null;
  return {
    project,
    pages: pageIds.map((id, index) => ({ id, index, setCount: 0 })),
    currentPageId: first,
    sets: [],
  };
}

export function fakeHealth(): HealthResponse {
  return { status: 'ok', db: 'up', time: new Date().toISOString(), version: 'fake' };
}

export const FAKE_AGREED_AT = FIXED_TIME;
