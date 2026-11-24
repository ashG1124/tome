import type {
  CompareEntry,
  CompareResponse,
  CreatorReach,
  CreatorSummary,
  Id,
  IdentityResponse,
  ProjectSummary,
} from '@tome/shared';
import { useState } from 'react';
import { COPY, type CopyKey } from '../../shared/copy';
import { Tabs } from '../../shared/ui';
import { AxisTable } from './AxisTable';
import { CreatorFilterPanel } from './CreatorFilterPanel';
import {
  DEFAULT_FILTER,
  chartPeople,
  filterCreators,
  identityView,
  isFilterActive,
  metricsView,
  type ChartKey,
  type CreatorFilter,
} from './identity';
import { IdentityChart, type ChartFocal, type ChartPersonView } from './IdentityChart';
import { InsightsPanel } from './InsightsPanel';
import { ProfileHeader } from './ProfileHeader';
import { SidePanel } from './SidePanel';
import { WorkGrid } from './WorkGrid';

/** Proto v7 은 Work·Identity 두 탭이다. 예전 Compare 탭의 비교·리믹스는 Identity 탭 오른쪽 Other Creators 로 옮겼다. */
export type ProfileTab = 'work' | 'identity';

const TABS: readonly { key: ProfileTab; label: CopyKey }[] = [
  { key: 'work', label: 'P-01a' },
  { key: 'identity', label: 'P-01b' },
];

const CHARTS: Readonly<Record<ChartKey, { title: CopyKey; help: CopyKey }>> = {
  ai: { title: 'P-29a', help: 'P-10' },
  decision: { title: 'P-29b', help: 'P-12' },
};

const NO_REACH: CreatorReach = { count: 0, creators: [] };

interface ProfileViewProps {
  creator: CreatorSummary;
  works: readonly ProjectSummary[];
  remixedBy?: CreatorReach;
  derivedBy?: CreatorReach;
  /** 아이덴티티 스냅샷과 숨김 표. 아직 없으면 null(기록 중) */
  identity: IdentityResponse | null;
  /** 남의 비공개 아이덴티티(IDENTITY_PRIVATE)면 true. 좌표 자리에 "기록 중" 대신 P-20 을 보여 준다 */
  identityPrivate?: boolean;
  /** 비교 데이터(나 + 다른 창작자). 아직 없으면 null */
  compare: CompareResponse | null;
  /** 내 프로필이면 true: 좌표 이름표가 Me, 패널 제목이 About your identity, 작품은 워크스페이스로 간다 */
  mine: boolean;
  /** Other Creators 목록에서 리믹스 화살표를 눌렀을 때. 프로필 화면은 그 사람과 리믹스한 새 워크스페이스로 간다(#41) */
  onSelectPartner: (creatorId: Id) => void;
  initialTab?: ProfileTab;
  /** 날짜 표시용(테스트에서 고정). 기본은 기기 로케일 */
  locale?: string;
  timeZone?: string;
}

/**
 * 창작자 프로필(Proto v7 · Work 4181:34983 / Proto v7 · Identity 4181:35165).
 * 위에 머리글(사진·이름·소개, Remixed by·Derived by), 그 아래 Work·Identity 탭, 오른쪽에 탭마다 다른 패널.
 * Work: 게시작 격자 + About your identity(지표). Identity: 좌표 2장 + Other Creators(검색·닮은 정도·사분면·목록).
 * 탭은 공통 Tabs(←/→ 로 옮기고 자동 선택), 좌표 그림은 숨김 표로 화면 읽기 프로그램에 전한다.
 */
export function ProfileView({
  creator,
  works,
  remixedBy = NO_REACH,
  derivedBy = NO_REACH,
  identity,
  identityPrivate = false,
  compare,
  mine,
  onSelectPartner,
  initialTab = 'work',
  locale,
  timeZone,
}: ProfileViewProps) {
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  // 닫기(X)는 지금 탭의 패널만 접는다. 탭을 바꾸면 그 탭의 패널이 다시 열린다.
  const [panelOpen, setPanelOpen] = useState(true);
  const [filter, setFilter] = useState<CreatorFilter>(DEFAULT_FILTER);
  const [highlightId, setHighlightId] = useState<Id | null>(null);

  const view = identityView(identity?.snapshot ?? null);
  const metrics =
    identity === null ? null : metricsView(identity.snapshot.metrics, locale, timeZone);
  const focalAxes = identity !== null && view.state === 'ready' ? identity.snapshot.axes : null;

  // 비교할 사람들: 내 프로필이면 다른 창작자 전부, 남의 프로필이면 그 사람을 뺀 다른 창작자.
  const others: CompareEntry[] =
    compare === null ? [] : compare.others.filter((entry) => entry.creator.id !== creator.id);
  const matches = filterCreators(others, focalAxes, filter);
  const matchIds = new Set(matches.map((entry) => entry.creator.id));
  const filtering = isFilterActive(filter);

  const peopleOf = (chart: ChartKey): ChartPersonView[] =>
    chartPeople(others, chart).map(({ creator: person, point }) => {
      const highlighted = highlightId === person.id;
      const shown = filtering && matchIds.has(person.id);
      const state = !shown ? 'dot' : highlightId !== null && !highlighted ? 'dimmed' : 'shown';
      return { creator: person, point, state, highlighted };
    });

  const focalOf = (chart: ChartKey): ChartFocal | null => {
    const point = view.points[chart];
    if (point === null) return null;
    return { creator, label: mine ? COPY['P-16'] : creator.displayName, point };
  };

  const changeTab = (next: ProfileTab) => {
    setTab(next);
    setPanelOpen(true);
    setHighlightId(null);
  };

  return (
    <div className="mb-[var(--space-profile-panel-bottom)] flex min-h-[calc(100dvh-var(--size-header-height)-var(--space-profile-panel-bottom))] gap-[var(--space-profile-panel-gap)] pr-[var(--space-header-x)]">
      <div className="flex min-w-0 flex-1 flex-col pl-[var(--space-profile-x)]">
        <ProfileHeader creator={creator} remixedBy={remixedBy} derivedBy={derivedBy} />
        <div className="mt-[var(--space-profile-tabs-top)]">
          <Tabs
            variant="underline"
            value={tab}
            onValueChange={changeTab}
            label={creator.displayName}
            items={TABS.map((t) => ({ value: t.key, label: COPY[t.label] }))}
          >
            {tab === 'work' ? (
              <WorkGrid
                works={works}
                mine={mine}
                className="mt-[var(--space-profile-work-top)] -ml-[calc(var(--space-profile-x)-var(--space-header-x))] min-h-[calc(100dvh-var(--size-header-height)-var(--size-profile-avatar)-var(--space-profile-tabs-top)-var(--size-segment-height)-var(--space-profile-work-top)-var(--space-profile-panel-bottom))]"
              />
            ) : (
              <div className="mt-[var(--space-profile-identity-top)] flex justify-center gap-[var(--space-profile-chart-gap)] rounded-[var(--radius-chart-panel)] bg-[color:var(--color-profile-panel)] p-[var(--space-profile-chart-pad)]">
                {(['ai', 'decision'] as const).map((chart) => (
                  <IdentityChart
                    key={chart}
                    chart={chart}
                    title={COPY[CHARTS[chart].title]}
                    help={COPY[CHARTS[chart].help]}
                    focal={focalOf(chart)}
                    people={peopleOf(chart)}
                    emptyMessage={identityPrivate ? COPY['P-20'] : COPY['P-17']}
                  />
                ))}
                {identity !== null && view.state === 'ready' ? (
                  <AxisTable table={identity.table} />
                ) : null}
              </div>
            )}
          </Tabs>
        </div>
      </div>
      {panelOpen ? (
        tab === 'work' ? (
          <SidePanel
            title={mine ? COPY['P-23a'] : COPY['P-23b']}
            onClose={() => setPanelOpen(false)}
          >
            <InsightsPanel
              metrics={metrics}
              // 남의 비공개면 "바뀔 수 있음"(P-08)은 뜻이 맞지 않아 보이지 않는다
              provisional={view.provisional && !identityPrivate}
              {...(identityPrivate ? { privateMessage: COPY['P-20'] } : {})}
            />
          </SidePanel>
        ) : (
          <SidePanel title={COPY['P-25']} onClose={() => setPanelOpen(false)}>
            <CreatorFilterPanel
              filter={filter}
              onFilterChange={setFilter}
              matches={matches}
              focalName={mine ? null : creator.displayName}
              onHighlight={setHighlightId}
              onRemix={onSelectPartner}
            />
          </SidePanel>
        )
      ) : null}
    </div>
  );
}
