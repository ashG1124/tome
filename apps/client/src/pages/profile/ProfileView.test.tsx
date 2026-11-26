import type {
  CompareResponse,
  CreatorSummary,
  IdentityResponse,
  ProjectSummary,
} from '@tome/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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
const JUDY: CreatorSummary = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  kind: 'seed',
  displayName: 'Judy',
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
      // ai: 위(가볍게)·왼쪽(AI 주도) / decision: 위·왼쪽(근거)
      creator: WILLIAM,
      axes: { scaleIntensity: -20, aiRelation: -50, decisionBasis: 30, direction: -60 },
      provisional: false,
    },
    {
      // ai: 아래·왼쪽 / decision: 아래·오른쪽(직관)
      creator: JUDY,
      axes: { scaleIntensity: 70, aiRelation: -40, decisionBasis: -30, direction: 50 },
      provisional: false,
    },
  ],
};

const REACH = {
  remixedBy: { count: 6, creators: [WILLIAM, JUDY] },
  derivedBy: { count: 32, creators: [JUDY] },
};

function setup({
  tab = 'identity',
  data = identity(),
  identityPrivate = false,
  mine = true,
  creator = JULIAN,
}: {
  tab?: ProfileTab;
  data?: IdentityResponse | null;
  identityPrivate?: boolean;
  mine?: boolean;
  creator?: CreatorSummary;
} = {}) {
  const onSelectPartner = vi.fn();
  render(
    <MemoryRouter>
      <ProfileView
        creator={creator}
        works={WORKS}
        {...REACH}
        identity={data}
        identityPrivate={identityPrivate}
        compare={COMPARE}
        mine={mine}
        onSelectPartner={onSelectPartner}
        initialTab={tab}
        locale="en-US"
        timeZone="UTC"
      />
    </MemoryRouter>,
  );
  return { onSelectPartner };
}

const panel = (name: string) => screen.getByRole('complementary', { name });
const chart = (key: 'ai' | 'decision') =>
  document.querySelector(`[data-chart="${key}"]`) as HTMLElement;
const personState = (key: 'ai' | 'decision', who: CreatorSummary) =>
  chart(key).querySelector(`[data-person="${who.id}"]`)?.getAttribute('data-state');

describe('ProfileView', () => {
  it('머리글: 이름(h1)·소개, Remixed by·Derived by 수', () => {
    setup({ tab: 'work' });
    expect(screen.getByRole('heading', { level: 1, name: 'Julian' })).toBeTruthy();
    expect(screen.getByText('Future Functionality Developer')).toBeTruthy();
    expect(screen.getByText(COPY['P-21']).parentElement?.textContent).toBe(`${COPY['P-21']} 6`);
    expect(screen.getByText(COPY['P-22']).parentElement?.textContent).toBe(`${COPY['P-22']} 32`);
  });

  it('Work 탭: About your identity 에 지표 값과 절대 날짜, 잠정이면 may change', () => {
    setup({ tab: 'work' });
    const about = panel(COPY['P-23a']);
    expect(within(about).getByText('48')).toBeTruthy();
    expect(within(about).getByText('14')).toBeTruthy();
    expect(within(about).getByText('54%')).toBeTruthy();
    expect(within(about).getByText('Nov 1, 2026')).toBeTruthy();
    expect(within(about).getByText('Nov 12, 2026')).toBeTruthy();
    expect(within(about).getByText(COPY['P-08'])).toBeTruthy();
    // 상대 표기·"paused" 문장은 어디에도 없다
    expect(document.body.textContent).not.toMatch(/paused| ago/i);
  });

  it('잠정이 아니면 may change 문장이 없다', () => {
    setup({ tab: 'work', data: identity({ provisional: false }) });
    expect(screen.queryByText(COPY['P-08'])).toBeNull();
  });

  it('이유를 남긴 편집 비율이 없으면(null) reasoned edits 값을 "—" 로 보여 준다', () => {
    const data = identity();
    // 이유를 남길 수 있는 편집이 5개 미만이면 서버가 null 을 준다(#36).
    data.snapshot.metrics.reasonedRatio = null;
    setup({ tab: 'work', data });
    const label = screen.getByText(COPY['P-05']);
    expect(label.nextElementSibling?.textContent).toBe('—');
  });

  it('패널 구역은 제목 단추로 접고 편다(aria-expanded)', () => {
    setup({ tab: 'work' });
    const toggle = screen.getByRole('button', { name: COPY['P-24'] });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('48').closest('[hidden]')).not.toBeNull();
  });

  it('패널에는 닫기(X)가 없고, 탭을 바꾸면 그 탭의 패널이 보인다(#262)', async () => {
    setup({ tab: 'work' });
    expect(within(panel(COPY['P-23a'])).queryByRole('button', { name: COPY['D-11'] })).toBeNull();
    const identityTab = screen.getByRole('tab', { name: COPY['P-01b'] });
    act(() => identityTab.focus());
    await waitFor(() => expect(identityTab.getAttribute('aria-selected')).toBe('true'));
    expect(within(panel(COPY['P-25'])).queryByRole('button', { name: COPY['D-11'] })).toBeNull();
  });

  it('탭 2개(Work·Identity), ←/→ 로 옮기면 선택과 포커스가 같이 움직인다', async () => {
    setup({ tab: 'work' });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([COPY['P-01a'], COPY['P-01b']]);
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

  it('Work 탭은 게시작을 카드 링크(이름 = 제목)로 보여 주고, 내 작품은 워크스페이스로 간다', () => {
    setup({ tab: 'work' });
    const link = within(screen.getByRole('tabpanel')).getByRole('link', {
      name: /Neon street at night/,
    });
    expect(link.getAttribute('href')).toBe(`/projects/${WORKS[0]!.id}`);
  });

  it('남의 Work 카드는 아고라 상세(읽기 전용)로 가고, 패널 제목은 남의 것', () => {
    setup({ tab: 'work', mine: false, creator: WILLIAM });
    const link = within(screen.getByRole('tabpanel')).getByRole('link', {
      name: /Neon street at night/,
    });
    expect(link.getAttribute('href')).toBe(`/agora/projects/${WORKS[0]!.id}`);
    expect(panel(COPY['P-23b'])).toBeTruthy();
  });

  it('Identity 탭: 좌표 2개(짧은 축 이름), Me 이름표, 화면 읽기용 숨김 표', () => {
    setup({ tab: 'identity' });

    expect(screen.getByRole('heading', { name: COPY['P-29a'] })).toBeTruthy();
    expect(screen.getByRole('heading', { name: COPY['P-29b'] })).toBeTruthy();
    expect(within(chart('ai')).getByText(COPY['P-31c'])).toBeTruthy();
    expect(within(chart('decision')).getByText(COPY['P-31h'])).toBeTruthy();
    expect(within(chart('ai')).getByText(COPY['P-16'])).toBeTruthy();
    // 도움말(?) 단추 이름이 안내 문장이다
    expect(screen.getByRole('button', { name: COPY['P-10'] })).toBeTruthy();

    const table = screen.getByRole('table', { name: COPY['P-19a'] });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      `${COPY['P-13c']} – ${COPY['P-13d']}60`,
      `${COPY['P-13a']} – ${COPY['P-13b']}-40`,
      // 숨김 표 이름은 "− 쪽 – + 쪽": 판단 근거는 + 가 Evidence
      `${COPY['P-13h']} – ${COPY['P-13g']}-20`,
      `${COPY['P-13e']} – ${COPY['P-13f']}80`,
    ]);
  });

  it('남의 프로필이면 좌표 이름표가 그 사람 이름이고, 그 사람은 목록에서 빠진다', () => {
    setup({ tab: 'identity', mine: false, creator: WILLIAM });
    expect(within(chart('ai')).queryByText(COPY['P-16'])).toBeNull();
    const list = panel(COPY['P-25']);
    expect(within(list).getByText(COPY['P-27b'].replace('{name}', 'William'))).toBeTruthy();
    expect(within(list).queryByRole('button', { name: /William/ })).toBeNull();
  });

  it('이벤트가 모자라면 좌표 대신 기록 중 문장, 숨김 표는 없다', () => {
    setup({ tab: 'identity', data: identity({ eventCount: 5 }) });

    expect(screen.getAllByText(COPY['P-17'])).toHaveLength(2);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('스냅샷이 없어도 화면이 그려지고 지표는 — 로 보인다', () => {
    setup({ tab: 'work', data: null });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('남의 비공개 아이덴티티면 좌표 자리와 About 패널에 P-20 을 보여 준다', async () => {
    setup({ tab: 'identity', data: null, identityPrivate: true, mine: false, creator: WILLIAM });
    expect(screen.getAllByText(COPY['P-20'])).toHaveLength(2);
    expect(screen.queryByText(COPY['P-17'])).toBeNull();
    const workTab = screen.getByRole('tab', { name: COPY['P-01a'] });
    act(() => workTab.focus());
    await waitFor(() => expect(workTab.getAttribute('aria-selected')).toBe('true'));
    expect(within(panel(COPY['P-23b'])).getByText(COPY['P-20'])).toBeTruthy();
    expect(screen.queryByText(COPY['P-08'])).toBeNull();
  });

  it('Other Creators: 다른 창작자 목록(설명 줄) + 리믹스 화살표를 누르면 알린다', () => {
    const { onSelectPartner } = setup({ tab: 'identity' });
    const list = panel(COPY['P-25']);
    expect(within(list).getByText('William')).toBeTruthy();
    expect(
      within(list).getByText('Lets the AI lead and nudges gently — trusts data, narrows down.'),
    ).toBeTruthy();
    expect(within(list).getByRole('status').textContent).toBe(`2 ${COPY['P-28b']}`);
    fireEvent.click(
      within(list).getByRole('button', { name: COPY['P-30'].replace('{name}', 'Judy') }),
    );
    expect(onSelectPartner).toHaveBeenCalledWith(JUDY.id);
  });

  it('필터가 없으면 좌표의 다른 창작자는 회색 점, 사분면을 고르면 걸린 사람만 사진·이름·선', () => {
    setup({ tab: 'identity' });
    expect(chart('ai').querySelectorAll('[data-state="dot"]')).toHaveLength(2);
    expect(chart('ai').querySelector('line')).toBeNull();

    const cell = screen.getByRole('button', { name: `${COPY['P-31a']}, ${COPY['P-31c']}` });
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    const list = panel(COPY['P-25']);
    expect(within(list).getByRole('status').textContent).toBe(`1 ${COPY['P-28b']}`);
    expect(within(list).queryByText('Judy')).toBeNull();
    expect(personState('ai', WILLIAM)).toBe('shown');
    expect(personState('ai', JUDY)).toBe('dot');
    expect(chart('ai').querySelectorAll('line')).toHaveLength(1);

    fireEvent.click(within(list).getByRole('button', { name: COPY['P-26'] }));
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    expect(within(list).getByRole('status').textContent).toBe(`2 ${COPY['P-28b']}`);
  });

  it('검색은 이름으로 거르고, 목록 줄을 가리키면 좌표에서 그 사람을 밝힌다', () => {
    setup({ tab: 'identity' });
    const list = panel(COPY['P-25']);
    fireEvent.change(within(list).getByRole('searchbox', { name: COPY['AGS-07'] }), {
      target: { value: 'ju' },
    });
    expect(within(list).queryByText('William')).toBeNull();
    const row = within(list).getByText('Judy').closest('li') as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(personState('ai', JUDY)).toBe('highlighted');
    fireEvent.mouseLeave(row);
    expect(personState('ai', JUDY)).toBe('shown');
  });

  it('Similarity 막대: 위 끝을 낮추면 그보다 닮은 사람이 빠진다(0~N 표시)', () => {
    setup({ tab: 'identity' });
    const slider = screen.getByRole('slider', { name: COPY['P-27a'] });
    expect(slider.getAttribute('aria-valuetext')).toBe('0~100');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(slider.getAttribute('aria-valuetext')).toBe('0~30');
    const list = panel(COPY['P-25']);
    // 나(−40, 60, −20, 80)와 William·Judy 모두 닮은 정도가 30 보다 높다
    expect(within(list).getByRole('status').textContent).toBe(`0 ${COPY['P-28b']}`);
  });
});
