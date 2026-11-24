import type { CreatorSummary } from '@tome/shared';
import { COPY } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import { Avatar } from './Avatar';
import type { ChartKey, ChartPoint } from './identity';
import { CHART_LABELS } from './labels';

/** 좌표의 주인공(내 프로필이면 나, 남의 프로필이면 그 사람). 사진 아래에 이름표(Me 또는 이름)를 단다. */
export interface ChartFocal {
  creator: CreatorSummary;
  label: string;
  point: ChartPoint;
}

/**
 * 다른 창작자 한 명의 모양.
 * dot = 이름 없는 회색 점(마우스를 올리면 사진·이름이 보인다), shown = 사진·이름·주인공과 잇는 선,
 * dimmed = shown 인데 다른 사람을 가리키는 중이라 흐리게.
 */
export type ChartPersonState = 'dot' | 'shown' | 'dimmed';

export interface ChartPersonView {
  creator: CreatorSummary;
  point: ChartPoint;
  state: ChartPersonState;
  /** 오른쪽 목록에서 가리키는 사람이면 true: 노란 빛을 두르고 맨 위에 그린다 */
  highlighted: boolean;
}

interface IdentityChartProps {
  chart: ChartKey;
  title: string;
  help: string;
  focal: ChartFocal | null;
  people: readonly ChartPersonView[];
  /** 주인공 점을 찍지 못할 때(기록 중·비공개) 판 가운데에 보여 줄 문장 */
  emptyMessage?: string;
}

const AXIS_TEXT =
  'pointer-events-none absolute [font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b2)] whitespace-nowrap text-[color:var(--color-font-sub-text)]';

/** 이름표(Hover Profile v7 Label 4181:35995): 흰 바탕, 0.5 테두리, 12px */
const NAME_CHIP =
  'rounded-[var(--radius-max)] border border-solid border-[length:var(--stroke-weight-profile-chip)] border-[color:var(--color-border-default)] bg-[color:var(--color-background-default)] px-[var(--space-padding-3)] py-[calc(var(--space-padding-2)/2)] text-[length:var(--font-size-profile-small)] leading-normal whitespace-nowrap text-[color:var(--color-font-strong)]';

/** 사진 가운데가 점 위치에 오도록 놓는다(이름표는 사진 아래로 내려간다). */
const AT_AVATAR =
  'absolute flex -translate-x-1/2 -translate-y-[calc(var(--size-profile-chart-avatar)/2)] flex-col items-center gap-[var(--space-profile-chart-chip-gap)]';

function at(point: ChartPoint) {
  return { left: `${point.left}%`, top: `${point.top}%` };
}

function Person({ person }: { person: ChartPersonView }) {
  if (person.state === 'dot' && !person.highlighted) {
    // 회색 점. 마우스를 올리면 그 자리에 사진과 이름이 뜬다(Hover Profile v7 off → hi).
    return (
      <div
        data-person={person.creator.id}
        data-state="dot"
        className="group/dot absolute size-[var(--size-profile-other-dot)] -translate-x-1/2 -translate-y-1/2"
        style={at(person.point)}
      >
        <span className="block size-full rounded-[var(--radius-max)] bg-[color:var(--color-grayscale-3)] opacity-[var(--opacity-profile-other-dot)] group-hover/dot:opacity-0" />
        <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-[calc(var(--size-profile-chart-avatar)/2)] flex-col items-center gap-[var(--space-profile-chart-chip-gap)] opacity-0 transition-opacity group-hover/dot:z-10 group-hover/dot:opacity-100 motion-reduce:transition-none">
          <Avatar
            creator={person.creator}
            sizeClass="size-[var(--size-profile-chart-avatar)]"
            className="shadow-[var(--shadow-profile-glow)]"
          />
          <span className={NAME_CHIP}>{person.creator.displayName}</span>
        </span>
      </div>
    );
  }
  return (
    <div
      data-person={person.creator.id}
      data-state={person.highlighted ? 'highlighted' : person.state}
      className={[
        AT_AVATAR,
        person.highlighted ? 'z-10' : '',
        person.state === 'dimmed' && !person.highlighted
          ? 'opacity-[var(--opacity-profile-dimmed)]'
          : '',
      ].join(' ')}
      style={at(person.point)}
    >
      <Avatar
        creator={person.creator}
        sizeClass="size-[var(--size-profile-chart-avatar)]"
        className={
          person.highlighted ? 'shadow-[var(--shadow-profile-glow)]' : 'shadow-[var(--shadow-03)]'
        }
      />
      <span className={NAME_CHIP}>{person.creator.displayName}</span>
    </div>
  );
}

/**
 * 사분면 좌표 한 장(Proto v7 AI Collaboration Chart 4181:35172 / Decision Chart 4181:35382).
 * 제목 + 도움말(?) 아래, 점무늬가 가장자리로 갈수록 흐려지는 판. 판 안쪽 네 변에 짧은 축 이름을 둔다.
 * 점·사진·선은 그림이라 낭독기에서 숨긴다. 점수는 숨김 표(AxisTable), 사람은 오른쪽 목록이 읽힌다.
 */
export function IdentityChart({
  chart,
  title,
  help,
  focal,
  people,
  emptyMessage,
}: IdentityChartProps) {
  const labels = CHART_LABELS[chart];
  const lines =
    focal === null ? [] : people.filter((person) => person.state !== 'dot' || person.highlighted);
  return (
    <section
      aria-label={title}
      className="flex w-full max-w-[var(--size-profile-chart)] min-w-0 flex-col gap-[var(--space-gap-5)]"
    >
      <div className="flex items-center gap-[var(--space-gap-4)]">
        <h3 className="m-0 [font:var(--text-subtitle-st1-sb)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)]">
          {title}
        </h3>
        <span className="group/help relative flex">
          <button
            type="button"
            aria-label={help}
            className="flex cursor-help items-center justify-center rounded-[var(--radius-max)] border-0 bg-transparent p-0 text-[color:var(--color-font-helper-text)]"
          >
            <Icon name="help" size={24} />
          </button>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-full left-0 z-20 mt-[var(--space-padding-3)] hidden w-max max-w-[var(--size-remix-panel-width)] rounded-[var(--radius-2)] bg-[color:var(--color-background-default)] px-[var(--space-padding-5)] py-[var(--space-padding-3)] [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)] shadow-[var(--shadow-03)] group-focus-within/help:block group-hover/help:block"
          >
            {help}
          </span>
        </span>
      </div>
      <div
        data-chart={chart}
        className={[
          'relative aspect-square w-full overflow-hidden rounded-[var(--radius-profile-chart)]',
          // 가운데는 비치고(판 바탕 #F9FAFC) 가장자리로 갈수록 흰색. 그 아래에 회색 점무늬(간격 10)
          'bg-[image:radial-gradient(52%_56%_at_51%_50%,transparent,var(--color-background-default)),radial-gradient(circle,var(--color-grayscale-3)_var(--size-profile-chart-dot),transparent_calc(var(--size-profile-chart-dot)+0.5px))]',
          'bg-[size:100%_100%,var(--size-profile-chart-dot-pitch)_var(--size-profile-chart-dot-pitch)]',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={`${AXIS_TEXT} top-[var(--space-profile-chart-label)] left-1/2 -translate-x-1/2`}
        >
          {COPY[labels.top]}
        </span>
        <span
          aria-hidden="true"
          className={`${AXIS_TEXT} bottom-[var(--space-profile-chart-label)] left-1/2 -translate-x-1/2`}
        >
          {COPY[labels.bottom]}
        </span>
        <span
          aria-hidden="true"
          className={`${AXIS_TEXT} top-1/2 left-[var(--space-profile-chart-label)] -translate-y-1/2 rotate-180 [writing-mode:vertical-rl]`}
        >
          {COPY[labels.left]}
        </span>
        <span
          aria-hidden="true"
          className={`${AXIS_TEXT} top-1/2 right-[var(--space-profile-chart-label)] -translate-y-1/2 [writing-mode:vertical-rl]`}
        >
          {COPY[labels.right]}
        </span>
        <div aria-hidden="true" className="absolute inset-[var(--space-profile-chart-plot)]">
          {focal !== null && lines.length > 0 ? (
            <svg
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {lines.map((person) => (
                <line
                  key={person.creator.id}
                  x1={focal.point.left}
                  y1={focal.point.top}
                  x2={person.point.left}
                  y2={person.point.top}
                  vectorEffect="non-scaling-stroke"
                  className={[
                    'stroke-[color:var(--color-profile-line)] [stroke-width:var(--stroke-weight-light)]',
                    person.state === 'dimmed' && !person.highlighted
                      ? 'opacity-[var(--opacity-profile-dimmed)]'
                      : '',
                    person.highlighted ? 'stroke-[color:var(--color-font-helper-text)]' : '',
                  ].join(' ')}
                />
              ))}
            </svg>
          ) : null}
          {people.map((person) => (
            <Person key={person.creator.id} person={person} />
          ))}
          {focal !== null ? (
            <div data-focal="" className={`${AT_AVATAR} z-20`} style={at(focal.point)}>
              <Avatar
                creator={focal.creator}
                sizeClass="size-[var(--size-profile-chart-avatar)]"
                className="shadow-[var(--shadow-03)]"
              />
              <span className="rounded-[var(--radius-max)] border border-solid border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-default)] bg-[color:var(--color-background-default)] px-[var(--space-profile-chart-chip-x)] py-[var(--space-profile-chart-chip-y)] text-[length:var(--font-size-profile-me)] leading-[var(--line-height-default)] whitespace-nowrap text-[color:var(--color-font-strong)]">
                {focal.label}
              </span>
            </div>
          ) : null}
        </div>
        {focal === null && emptyMessage !== undefined ? (
          <p className="absolute inset-0 m-0 flex items-center justify-center px-[var(--space-profile-chart-plot)] text-center [font:var(--text-body-b1-m)] text-[color:var(--color-font-sub-text)]">
            {emptyMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
