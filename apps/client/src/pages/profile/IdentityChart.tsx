import type { CSSProperties, ReactNode } from 'react';
import { COPY } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import { bubbleSide, type ChartKey, type ChartPoint } from './identity';
import { AXIS_LABELS } from './labels';

export interface ChartMarker {
  key: string;
  point: ChartPoint;
  content: ReactNode;
  /** 아바타 위(또는 아래)에 띄울 말풍선 글. 판 밖으로 나가지 않게 판 안에서 자리를 잡는다. */
  bubble?: string;
}

interface IdentityChartProps {
  chart: ChartKey;
  title: string;
  help: string;
  markers: readonly ChartMarker[];
  /** 좌표를 찍지 못할 때(기록 중) 판 가운데에 보여 줄 문장 */
  emptyMessage?: string;
}

/** 아바타 반지름 + 간격만큼 말풍선을 아바타에서 띄운다. */
const BUBBLE_OFFSET = 'calc(var(--size-avatar-me) / 2 + var(--space-padding-3))';

/**
 * 말풍선 자리. left 와 translateX 를 같은 %로 주면, 점이 왼쪽 끝이면 말풍선 왼쪽 끝이,
 * 오른쪽 끝이면 오른쪽 끝이 판에 맞춰져서 판 밖(축 이름 위)으로 나가지 않는다.
 */
function bubbleStyle(point: ChartPoint): CSSProperties {
  const below = bubbleSide(point) === 'below';
  return {
    left: `${point.left}%`,
    top: `${point.top}%`,
    transform: below
      ? `translate(-${point.left}%, ${BUBBLE_OFFSET})`
      : `translate(-${point.left}%, calc(-100% - ${BUBBLE_OFFSET}))`,
  };
}

const AXIS_TEXT =
  '[font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-sub-text)]';

/**
 * 사분면 좌표 판. 네 변에 축 이름을 두고, 점(아바타)은 % 위치로 올린다.
 * 점의 위치(점수)는 화면 읽기 프로그램이 숨김 표(AxisTable)로 읽는다.
 * 판은 숨기지 않는다: Compare 탭의 아바타 버튼은 키보드·낭독기로도 눌러야 한다.
 */
export function IdentityChart({ chart, title, help, markers, emptyMessage }: IdentityChartProps) {
  const labels = AXIS_LABELS[chart];
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-[var(--space-padding-8)] rounded-[var(--radius-chart-panel)] bg-[color:var(--color-background-weak)] p-[var(--space-padding-8)]">
      <div className="flex flex-col gap-[var(--space-padding-3)]">
        <h3 className="m-0 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)]">
          {title}
        </h3>
        <p className="m-0 flex gap-[var(--space-padding-3)] [font:var(--text-body-b2-r)] text-[color:var(--color-font-helper-text)]">
          <Icon name="help" size={20} />
          <span>{help}</span>
        </p>
      </div>
      <div className="mx-auto grid w-full max-w-[var(--size-chart)] grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] items-center gap-[var(--space-padding-3)] rounded-[var(--radius-chart-panel)] bg-[color:var(--color-background-default)] p-[var(--space-padding-6)]">
        <span className={`col-start-2 row-start-1 text-center ${AXIS_TEXT}`}>
          {COPY[labels.top]}
        </span>
        <span
          className={`col-start-1 row-start-2 [writing-mode:vertical-rl] rotate-180 ${AXIS_TEXT}`}
        >
          {COPY[labels.left]}
        </span>
        <div className="relative col-start-2 row-start-2 aspect-square">
          {markers.map((marker) => (
            <div
              key={marker.key}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${marker.point.left}%`, top: `${marker.point.top}%` }}
            >
              {marker.content}
            </div>
          ))}
          {markers.map((marker) =>
            marker.bubble === undefined ? null : (
              <p
                key={`${marker.key}-bubble`}
                data-bubble={bubbleSide(marker.point)}
                className={[
                  'absolute m-0 w-max max-w-full rounded-[var(--radius-node)] border border-solid',
                  'border-[length:var(--stroke-weight-light)] border-[color:var(--color-tome-yellow-4)]',
                  'bg-[color:var(--color-background-default)] px-[var(--space-padding-5)] py-[var(--space-padding-3)]',
                  '[font:var(--text-body-b2-m)] text-[color:var(--color-font-main-text)] shadow-[var(--shadow-03)]',
                ].join(' ')}
                style={bubbleStyle(marker.point)}
              >
                {marker.bubble}
              </p>
            ),
          )}
          {markers.length === 0 && emptyMessage !== undefined ? (
            <p className="absolute inset-0 m-0 flex items-center justify-center px-[var(--space-padding-8)] text-center [font:var(--text-body-b1-m)] text-[color:var(--color-font-sub-text)]">
              {emptyMessage}
            </p>
          ) : null}
        </div>
        <span className={`col-start-3 row-start-2 [writing-mode:vertical-rl] ${AXIS_TEXT}`}>
          {COPY[labels.right]}
        </span>
        <span className={`col-start-2 row-start-3 text-center ${AXIS_TEXT}`}>
          {COPY[labels.bottom]}
        </span>
      </div>
    </section>
  );
}
