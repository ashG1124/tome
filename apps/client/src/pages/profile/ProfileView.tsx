import type {
  CompareResponse,
  CreatorSummary,
  Id,
  IdentityResponse,
  ProjectSummary,
} from '@tome/shared';
import { useState } from 'react';
import { COPY, type CopyKey } from '../../shared/copy';
import { Tabs } from '../../shared/ui';
import { Avatar } from './Avatar';
import { AxisTable } from './AxisTable';
import { compareMarkers, identityView, metricsView, quadrantOf, type ChartKey } from './identity';
import { IdentityChart, type ChartMarker } from './IdentityChart';
import { bubbleText } from './labels';
import { MetricsPanel } from './MetricsPanel';
import { ProfileCard } from './ProfileCard';
import { WorkGrid } from './WorkGrid';

export type ProfileTab = 'work' | 'identity' | 'compare';

const TABS: readonly { key: ProfileTab; label: CopyKey }[] = [
  { key: 'work', label: 'P-01a' },
  { key: 'identity', label: 'P-01b' },
  { key: 'compare', label: 'P-01c' },
];

const IDENTITY_TITLES: Record<ChartKey, { title: CopyKey; help: CopyKey }> = {
  ai: { title: 'P-09', help: 'P-10' },
  decision: { title: 'P-11', help: 'P-12' },
};
const COMPARE_TITLES: Record<ChartKey, { title: CopyKey; help: CopyKey }> = {
  ai: { title: 'P-14', help: 'P-10' },
  decision: { title: 'P-15', help: 'P-12' },
};
const CHARTS: readonly ChartKey[] = ['ai', 'decision'];

interface ProfileViewProps {
  creator: CreatorSummary;
  works: readonly ProjectSummary[];
  /** 아이덴티티 스냅샷과 숨김 표. 아직 없으면 null(기록 중) */
  identity: IdentityResponse | null;
  /** 남의 비공개 아이덴티티(IDENTITY_PRIVATE)면 true. 좌표 자리에 "기록 중" 대신 P-20 을 보여 준다 */
  identityPrivate?: boolean;
  /** Compare 탭 데이터. 아직 없으면 null */
  compare: CompareResponse | null;
  /** Compare 탭에서 다른 창작자 아바타를 눌렀을 때. 프로필 화면은 그 사람과 리믹스한 새 워크스페이스로 간다(#41) */
  onSelectPartner: (creatorId: Id) => void;
  initialTab?: ProfileTab;
  /** 날짜 표시용(테스트에서 고정). 기본은 기기 로케일 */
  locale?: string;
  timeZone?: string;
}

/**
 * 창작자 프로필. 왼쪽 프로필 카드·지표, 오른쪽 Work / Identity / Compare 탭.
 * 탭은 공통 Tabs(←/→ 로 옮기고 자동 선택), 좌표 그림은 숨김 표로 화면 읽기 프로그램에 전한다.
 */
export function ProfileView({
  creator,
  works,
  identity,
  identityPrivate = false,
  compare,
  onSelectPartner,
  initialTab = 'work',
  locale,
  timeZone,
}: ProfileViewProps) {
  const [tab, setTab] = useState<ProfileTab>(initialTab);

  const view = identityView(identity?.snapshot ?? null);
  const metrics =
    identity === null ? null : metricsView(identity.snapshot.metrics, locale, timeZone);
  const recording = COPY['P-17'];
  const identityEmpty = identityPrivate ? COPY['P-20'] : recording;

  const identityMarkers = (chart: ChartKey): ChartMarker[] => {
    const point = view.points[chart];
    if (point === null || identity === null) return [];
    const bubble = bubbleText(chart, quadrantOf(identity.snapshot.axes, chart));
    return [
      {
        key: 'me',
        point,
        content: <Avatar creator={creator} size="me" />,
        ...(bubble !== null ? { bubble } : {}),
      },
    ];
  };

  const compareChartMarkers = (chart: ChartKey): ChartMarker[] => {
    if (compare === null) return [];
    return compareMarkers(compare, chart).map((marker) => ({
      key: marker.creator.id,
      point: marker.point,
      content: marker.me ? (
        <div className="flex flex-col items-center gap-[var(--space-padding-2)]">
          <Avatar creator={marker.creator} size="me" />
          <span className="rounded-[var(--radius-max)] bg-[color:var(--color-background-default)] px-[var(--space-padding-3)] [font:var(--text-body-b2-m)] text-[color:var(--color-font-main-text)] shadow-[var(--shadow-03)]">
            {COPY['P-16']}
          </span>
        </div>
      ) : (
        <button
          type="button"
          aria-label={marker.creator.displayName}
          onClick={() => onSelectPartner(marker.creator.id)}
          className="cursor-pointer rounded-[var(--radius-max)] border-0 bg-transparent p-0"
        >
          <Avatar creator={marker.creator} size="other" />
        </button>
      ),
    }));
  };

  return (
    <div className="flex items-start gap-[var(--space-padding-8)]">
      <aside className="flex w-[var(--size-profile-column)] shrink-0 flex-col gap-[var(--space-padding-4)]">
        <ProfileCard creator={creator} />
        {/* 남의 비공개면 "바뀔 수 있음"(P-08)은 뜻이 맞지 않아 보이지 않는다 */}
        <MetricsPanel metrics={metrics} provisional={view.provisional && !identityPrivate} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-padding-8)]">
        <Tabs
          value={tab}
          onValueChange={setTab}
          label={creator.displayName}
          items={TABS.map((t) => ({ value: t.key, label: COPY[t.label] }))}
        >
          {tab === 'work' ? <WorkGrid works={works} /> : null}
          {tab === 'identity' ? (
            <div className="flex gap-[var(--space-gap-5)]">
              {CHARTS.map((chart) => (
                <IdentityChart
                  key={chart}
                  chart={chart}
                  title={COPY[IDENTITY_TITLES[chart].title]}
                  help={COPY[IDENTITY_TITLES[chart].help]}
                  markers={identityMarkers(chart)}
                  emptyMessage={view.state === 'recording' ? identityEmpty : undefined}
                />
              ))}
              {identity !== null && view.state === 'ready' ? (
                <AxisTable table={identity.table} />
              ) : null}
            </div>
          ) : null}
          {tab === 'compare' ? (
            <div className="flex gap-[var(--space-gap-5)]">
              {CHARTS.map((chart) => (
                <IdentityChart
                  key={chart}
                  chart={chart}
                  title={COPY[COMPARE_TITLES[chart].title]}
                  help={COPY[COMPARE_TITLES[chart].help]}
                  markers={compareChartMarkers(chart)}
                  emptyMessage={recording}
                />
              ))}
            </div>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}
