import type {
  CompareResponse,
  CreatorSummary,
  IdentityResponse,
  ProjectSummary,
} from '@tome/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COPY } from '../../shared/copy';
import { ProfileView, type ProfileTab } from './ProfileView';

const JULIAN: CreatorSummary = {
  id: '5b1d6c0e-2f43-4a8e-9c1b-7a3e5d2f8b10',
  kind: 'persona',
  displayName: 'Julian',
  bio: 'Future Functionality Developer',
  avatarUrl: null,
};
const WILLIAM: CreatorSummary = {
  id: '7d9e1c2a-6b5f-4a3e-9d8c-1b2a3c4d5e6f',
  kind: 'seed',
  displayName: 'William',
  bio: null,
  avatarUrl: null,
};

const WORKS: ProjectSummary[] = [
  {
    id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c',
    title: 'Neon street at night',
    status: 'finished',
    posted: true,
    coverThumbUrl: null,
    lastEditedAt: '2026-11-03T10:30:00.000Z',
    shelfPosition: 0,
    kind: 'original',
  },
];

function identity(overrides: Partial<IdentityResponse['snapshot']> = {}): IdentityResponse {
  return {
    snapshot: {
      algoVersion: 'identity-v1',
      axes: { scaleIntensity: -40, aiRelation: 60, decisionBasis: -20, direction: 80 },
      metrics: {
        sessions: 48,
        nodeEdits: 14,
        reasonedRatio: 0.54,
        firstRecordedAt: '2026-11-01T09:00:00.000Z',
        lastActiveAt: '2026-11-12T15:30:00.000Z',
        originBreakdown: { own: 10, remix: 3, derived: 1 },
      },
      eventCount: 30,
      projectCount: 2,
      provisional: true,
      computedAt: '2026-11-12T15:31:00.000Z',
      ...overrides,
    },
    table: [
      { axis: 'aiRelation', score: 60 },
      { axis: 'scaleIntensity', score: -40 },
      { axis: 'decisionBasis', score: -20 },
      { axis: 'direction', score: 80 },
    ],
  };
}

const COMPARE: CompareResponse = {
  me: {
    creator: JULIAN,
    axes: { scaleIntensity: -40, aiRelation: 60, decisionBasis: -20, direction: 80 },
    provisional: true,
  },
  others: [
    {
      creator: WILLIAM,
      axes: { scaleIntensity: 20, aiRelation: -50, decisionBasis: 30, direction: -60 },
      provisional: false,
    },
  ],
};

function setup({
  tab = 'identity',
  data = identity(),
}: { tab?: ProfileTab; data?: IdentityResponse | null } = {}) {
  const onSelectPartner = vi.fn();
  render(
    <ProfileView
      creator={JULIAN}
      works={WORKS}
      identity={data}
      compare={COMPARE}
      onSelectPartner={onSelectPartner}
      initialTab={tab}
      locale="en-US"
      timeZone="UTC"
    />,
  );
  return { onSelectPartner };
}

describe('ProfileView', () => {
  it('프로필 카드에 이름·소개, 지표에 값과 절대 날짜를 보여 준다', () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Julian' })).toBeTruthy();
    expect(screen.getByText('Future Functionality Developer')).toBeTruthy();
    expect(screen.getByText('48')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('54%')).toBeTruthy();
    expect(screen.getByText('Nov 1, 2026')).toBeTruthy();
    expect(screen.getByText('Nov 12, 2026')).toBeTruthy();
  });

  it('잠정이면 may change 문장을 보이고, "paused" 문장은 어디에도 없다', () => {
    setup();
    expect(screen.getByText(COPY['P-08'])).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/paused/i);
  });

  it('잠정이 아니면 may change 문장이 없다', () => {
    setup({ data: identity({ provisional: false }) });
    expect(screen.queryByText(COPY['P-08'])).toBeNull();
  });

  it('탭 3개, ←/→ 로 옮기면 선택과 포커스가 같이 움직인다', async () => {
    setup({ tab: 'work' });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([COPY['P-01a'], COPY['P-01b'], COPY['P-01c']]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');

    // Radix 탭은 화살표를 누르면 잠시 뒤 다음 탭에 포커스를 옮기고, 포커스가 오면 그 탭을 연다.
    act(() => (tabs[0] as HTMLElement).focus());
    fireEvent.keyDown(tabs[0] as HTMLElement, { key: 'ArrowRight' });
    const identityTab = screen.getByRole('tab', { name: COPY['P-01b'] });
    await waitFor(() => expect(identityTab.getAttribute('aria-selected')).toBe('true'));
    expect(document.activeElement).toBe(identityTab);

    fireEvent.keyDown(identityTab, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: COPY['P-01a'] }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
  });

  it('Work 탭은 게시작 제목을 보여 준다', () => {
    setup({ tab: 'work' });
    expect(within(screen.getByRole('tabpanel')).getByText('Neon street at night')).toBeTruthy();
  });

  it('Identity 탭: 좌표 2개, 사분면 말풍선, 화면 읽기용 숨김 표', () => {
    setup({ tab: 'identity' });

    expect(screen.getByRole('heading', { name: COPY['P-09'] })).toBeTruthy();
    expect(screen.getByRole('heading', { name: COPY['P-11'] })).toBeTruthy();
    expect(screen.getByText(COPY['P-18-ai-top-right'])).toBeTruthy();
    expect(screen.getByText(COPY['P-18-decision-bottom-left'])).toBeTruthy();

    const table = screen.getByRole('table', { name: COPY['P-19a'] });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      `${COPY['P-13c']} – ${COPY['P-13d']}60`,
      `${COPY['P-13a']} – ${COPY['P-13b']}-40`,
      `${COPY['P-13g']} – ${COPY['P-13h']}-20`,
      `${COPY['P-13e']} – ${COPY['P-13f']}80`,
    ]);
  });

  it('이벤트가 모자라면 좌표 대신 기록 중 문장, 숨김 표는 없다', () => {
    setup({ tab: 'identity', data: identity({ eventCount: 5 }) });

    expect(screen.getAllByText(COPY['P-17'])).toHaveLength(2);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('스냅샷이 없어도 화면이 그려지고 지표는 — 로 보인다', () => {
    setup({ tab: 'identity', data: null });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getAllByText(COPY['P-17'])).toHaveLength(2);
  });

  it('Compare 탭: 다른 창작자 아바타를 누르면 알리고, 나는 Me 로 표시된다', () => {
    const { onSelectPartner } = setup({ tab: 'compare' });

    expect(screen.getByRole('heading', { name: COPY['P-14'] })).toBeTruthy();
    expect(screen.getAllByText(COPY['P-16'])).toHaveLength(2);
    const william = screen.getAllByRole('button', { name: 'William' });
    expect(william).toHaveLength(2);
    fireEvent.click(william[0] as HTMLElement);
    expect(onSelectPartner).toHaveBeenCalledWith(WILLIAM.id);
    expect(screen.queryByRole('button', { name: 'Julian' })).toBeNull();
  });

  it('이유를 남긴 편집 비율이 없으면(null) Depth 값을 "—" 로 보여 준다', () => {
    const data = identity();
    // 이유를 남길 수 있는 편집이 5개 미만이면 서버가 null 을 준다(#36).
    data.snapshot.metrics.reasonedRatio = null;
    setup({ tab: 'identity', data });
    const label = screen.getByText(COPY['P-05']);
    expect(label.nextElementSibling?.textContent).toBe('—');
  });
});
