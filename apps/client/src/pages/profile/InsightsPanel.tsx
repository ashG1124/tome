import type { ReactNode } from 'react';
import { COPY } from '../../shared/copy';
import type { MetricsView } from './identity';
import { CollapsibleSection } from './SidePanel';

interface InsightsPanelProps {
  metrics: MetricsView | null;
  /** 데이터가 적어 잠정이면 Identity Type 아래에 "may change"(P-08)를 붙인다 */
  provisional: boolean;
  /** 남의 비공개 아이덴티티면 값 대신 P-20 한 줄만 보여 준다 */
  privateMessage?: string;
}

const CARD =
  'rounded-[var(--radius-2)] bg-[color:var(--color-background-default)] px-[var(--space-padding-6)] py-[var(--space-padding-3)]';
const DASH = '—';

function Value({
  label,
  value,
  divided = false,
}: {
  label: string;
  value: ReactNode;
  /** 앞 값과의 사이에 세로선(Vector 203095, 높이 40)을 긋는다 */
  divided?: boolean;
}) {
  return (
    <div
      className={[
        'relative flex flex-col gap-[var(--space-padding-2)] whitespace-nowrap',
        divided
          ? "before:absolute before:top-1/2 before:left-[calc(var(--space-padding-8)/-2)] before:h-[var(--size-profile-value-divider)] before:-translate-y-1/2 before:border-0 before:border-l before:border-solid before:border-[color:var(--color-border-default)] before:content-['']"
          : '',
      ].join(' ')}
    >
      <dt className="[font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b2)] text-[color:var(--color-font-helper-text)]">
        {label}
      </dt>
      <dd className="m-0 [font:var(--text-heading-h2)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-sub-text)]">
        {value}
      </dd>
    </div>
  );
}

function Values({ children }: { children: ReactNode }) {
  return (
    <div className={CARD}>
      <dl className="m-0 flex items-center gap-[var(--space-padding-8)]">{children}</dl>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p
      className={`m-0 ${CARD} [font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b2)] text-[color:var(--color-font-sub-text)]`}
    >
      {children}
    </p>
  );
}

/**
 * Work 탭 오른쪽 "About your identity"(4181:35083). 구역 3개: Identity Type(세션·노드 편집 수),
 * Scale(이유를 남긴 편집 비율), Duration(첫 기록·마지막 활동 날짜). 날짜는 절대 날짜로만 보여 준다.
 * 시안의 Scale·Duration 설명 줄("Occasionally…", "Records paused…")은 기획에 없는 문구라 넣지 않는다.
 */
export function InsightsPanel({ metrics, provisional, privateMessage }: InsightsPanelProps) {
  if (privateMessage !== undefined) {
    return (
      <div className="border-0 border-t border-solid border-[color:var(--color-border-default)] px-[var(--space-profile-insight-x)] py-[var(--space-profile-insight-y)]">
        <Note>{privateMessage}</Note>
      </div>
    );
  }
  const depth =
    metrics === null || metrics.depthPercent === null ? DASH : `${metrics.depthPercent}%`;
  return (
    <>
      <CollapsibleSection title={COPY['P-24']} spacing="insight">
        <div className="flex flex-col gap-[var(--space-gap-3)]">
          <Values>
            <Value label={COPY['P-03a']} value={metrics?.sessions ?? DASH} />
            <Value label={COPY['P-03b']} value={metrics?.nodeEdits ?? DASH} divided />
          </Values>
          {provisional ? <Note>{COPY['P-08']}</Note> : null}
        </div>
      </CollapsibleSection>
      <CollapsibleSection title={COPY['P-02']} spacing="insight">
        <Values>
          <Value label={COPY['P-05']} value={depth} />
        </Values>
      </CollapsibleSection>
      <CollapsibleSection title={COPY['P-06']} spacing="insight">
        <Values>
          <Value label={COPY['P-07a']} value={metrics?.firstRecorded ?? DASH} />
          <Value label={COPY['P-07b']} value={metrics?.lastActive ?? DASH} divided />
        </Values>
      </CollapsibleSection>
    </>
  );
}
