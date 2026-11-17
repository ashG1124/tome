import type { ReactNode } from 'react';
import { COPY } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import type { MetricsView } from './identity';

interface MetricsPanelProps {
  metrics: MetricsView | null;
  provisional: boolean;
}

const CARD =
  'flex flex-col gap-[var(--space-padding-6)] rounded-[var(--radius-profile-card)] bg-[color:var(--color-background-weak)] p-[var(--space-padding-6)]';
const LABEL = '[font:var(--text-body-b2-r)] text-[color:var(--color-font-helper-text)]';
const VALUE = '[font:var(--text-body-b1-m)] text-[color:var(--color-font-main-text)]';

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col items-end">
      <dt className={`${LABEL} whitespace-nowrap`}>{label}</dt>
      <dd className={`m-0 whitespace-nowrap ${VALUE}`}>{value}</dd>
    </div>
  );
}

function CardTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h3 className="m-0 flex items-center gap-[var(--space-padding-2)] [font:var(--text-body-b1-m)] text-[color:var(--color-font-main-text)]">
      <Icon name={icon} size={20} />
      {children}
    </h3>
  );
}

/**
 * 왼쪽 지표 3개. 값만 보여 주고, 기간은 날짜로만 보여 준다("paused" 같은 문장은 넣지 않는다).
 * 데이터가 적어 잠정이면 Scale 카드 아래에 "may change" 문장을 보여 준다.
 */
export function MetricsPanel({ metrics, provisional }: MetricsPanelProps) {
  const dash = '—';
  return (
    <div className="flex flex-col gap-[var(--space-padding-4)]">
      <section className={CARD}>
        <div className="flex items-start justify-between gap-[var(--space-padding-3)]">
          <CardTitle icon="chart">{COPY['P-02']}</CardTitle>
          <dl className="m-0 flex gap-[var(--space-gap-5)]">
            <Metric label={COPY['P-03a']} value={metrics?.sessions ?? dash} />
            <Metric label={COPY['P-03b']} value={metrics?.nodeEdits ?? dash} />
          </dl>
        </div>
        {provisional ? <p className={`m-0 ${VALUE}`}>{COPY['P-08']}</p> : null}
      </section>
      <section className={CARD}>
        <div className="flex items-start justify-between gap-[var(--space-padding-3)]">
          <CardTitle icon="quote">{COPY['P-04']}</CardTitle>
          <dl className="m-0 flex">
            <Metric
              label={COPY['P-05']}
              value={
                metrics === null || metrics.depthPercent === null
                  ? dash
                  : `${metrics.depthPercent}%`
              }
            />
          </dl>
        </div>
      </section>
      <section className={CARD}>
        {/* 날짜 두 개는 제목 옆에 다 들어가지 않아 제목 아래 줄에 둔다(날짜가 중간에서 끊기지 않게) */}
        <div className="flex flex-col gap-[var(--space-padding-3)]">
          <CardTitle icon="calendar">{COPY['P-06']}</CardTitle>
          <dl className="m-0 flex justify-between gap-[var(--space-gap-5)]">
            <Metric label={COPY['P-07a']} value={metrics?.firstRecorded ?? dash} />
            <Metric label={COPY['P-07b']} value={metrics?.lastActive ?? dash} />
          </dl>
        </div>
      </section>
    </div>
  );
}
