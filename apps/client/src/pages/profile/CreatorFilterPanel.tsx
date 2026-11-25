import type { CompareEntry, Id } from '@tome/shared';
import { useId, type ReactNode } from 'react';
import { COPY } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import { Avatar } from './Avatar';
import {
  SIMILARITY_MAX,
  SIMILARITY_STEP,
  type ChartKey,
  type CreatorFilter,
  type Quadrant,
} from './identity';
import { MATRIX_LABELS, creatorDescription, quadrantName } from './labels';
import { CollapsibleSection } from './SidePanel';

interface CreatorFilterPanelProps {
  filter: CreatorFilter;
  onFilterChange: (filter: CreatorFilter) => void;
  /** 걸러진 창작자(목록 순서 그대로) */
  matches: readonly CompareEntry[];
  /** 닮은 정도 기준이 되는 사람 이름. null 이면 나("Similarity to you") */
  focalName: string | null;
  /** 목록에서 가리키는(마우스·키보드) 사람. 좌표에서 그 사람을 밝힌다 */
  onHighlight: (creatorId: Id | null) => void;
  /** 화살표를 누르면 그 사람과 리믹스한 새 프로젝트를 만든다(#41) */
  onRemix: (creatorId: Id) => void;
}

const SECTION =
  'flex shrink-0 flex-col gap-[var(--space-gap-3)] border-0 border-t border-solid border-[color:var(--color-border-default)] p-[var(--space-padding-8)]';
const SECTION_LABEL =
  '[font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]';
const QUADRANTS: readonly Quadrant[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const MATRIX_TEXT =
  'pointer-events-none absolute text-[length:var(--font-size-profile-small)] leading-[1.3] tracking-[var(--letter-spacing-body-b2)] whitespace-nowrap text-[color:var(--color-font-sub-text)]';

/** Search(4181:35592): 이름으로 창작자 찾기 */
function SearchSection({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputId = useId();
  return (
    <div className={SECTION}>
      <label htmlFor={inputId} className={SECTION_LABEL}>
        {COPY['AGS-07']}
      </label>
      <div className="flex items-center gap-[var(--space-padding-4)] rounded-[var(--radius-profile-search)] border border-solid border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-default)] bg-[color:var(--color-background-default)] px-[var(--space-padding-6)] py-[var(--space-padding-5)] backdrop-blur-[var(--blur-profile-search)] focus-within:border-[color:var(--color-border-input)]">
        <input
          id={inputId}
          type="search"
          value={value}
          placeholder={COPY['FG-02']}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-main-text)] outline-none placeholder:text-[color:var(--color-font-helper-text)]"
        />
        <span className="flex text-[color:var(--color-font-sub-text)]">
          <Icon name="search" size={24} />
        </span>
      </div>
    </div>
  );
}

/**
 * Similarity to you(4181:35598): 0 부터 위 끝까지 고르는 막대. 아래 끝(0)은 고정이고 위 끝만 10 단위로 움직인다.
 * 보이지 않는 range 입력이 손잡이 자리와 같은 곳에 겹쳐 있어 마우스·키보드(←/→)로 조절한다.
 */
function SimilaritySection({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const inputId = useId();
  const range = `0~${value}`;
  // 손잡이 가운데 = 막대 왼쪽 + 손잡이 반지름 + 비율 × (막대 폭 − 손잡이 지름)
  const center = (ratio: number) =>
    `calc(var(--size-profile-slider-thumb) / 2 + (100% - var(--size-profile-slider-thumb)) * ${ratio})`;
  const thumb =
    'pointer-events-none absolute top-0 box-border size-[var(--size-profile-slider-thumb)] -translate-x-1/2 rounded-[var(--radius-max)] border-[length:var(--stroke-weight-bold)] border-solid border-[color:var(--color-node-line)] bg-[color:var(--color-background-default)]';
  return (
    <div className={SECTION}>
      <div className="flex items-end justify-between whitespace-nowrap">
        <label htmlFor={inputId} className={SECTION_LABEL}>
          {label}
        </label>
        <span
          aria-hidden="true"
          className="[font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b2)] text-[color:var(--color-font-sub-text)]"
        >
          {range}
        </span>
      </div>
      <div className="relative h-[var(--size-profile-slider-thumb)]">
        <input
          id={inputId}
          type="range"
          min={0}
          max={SIMILARITY_MAX}
          step={SIMILARITY_STEP}
          value={value}
          aria-valuetext={range}
          onChange={(event) => onChange(Number(event.target.value))}
          className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-[var(--size-profile-slider-track)] -translate-y-1/2 rounded-[var(--radius-max)] bg-[color:var(--color-fill-card)]"
          style={{ left: center(0), right: `calc(var(--size-profile-slider-thumb) / 2)` }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-[var(--size-profile-slider-track)] -translate-y-1/2 rounded-[var(--radius-max)] bg-[color:var(--color-node-line)]"
          style={{
            left: center(0),
            width: `calc((100% - var(--size-profile-slider-thumb)) * ${value / SIMILARITY_MAX})`,
          }}
        />
        <span aria-hidden="true" className={thumb} style={{ left: center(0) }} />
        <span
          aria-hidden="true"
          className={`${thumb} peer-focus-visible:outline-[length:var(--stroke-weight-bold)] peer-focus-visible:outline-offset-[var(--focus-outline-offset)] peer-focus-visible:outline-[color:var(--color-shelf-focus)] peer-focus-visible:outline-solid`}
          style={{ left: center(value / SIMILARITY_MAX) }}
        />
      </div>
    </div>
  );
}

/** Identity 필터 판 한 장(Editing Style Matrix 4181:35757): 네 변 축 이름 + 가운데 2×2 칸(눌러서 고르기) */
function Matrix({
  chart,
  title,
  selected,
  onSelect,
}: {
  chart: ChartKey;
  title: string;
  selected: Quadrant | null;
  onSelect: (quadrant: Quadrant | null) => void;
}) {
  const labels = MATRIX_LABELS[chart];
  return (
    <div
      role="group"
      aria-label={title}
      className="relative size-[var(--size-profile-matrix)] shrink-0 rounded-[var(--radius-profile-search)] bg-[color:var(--color-profile-matrix-bg)]"
    >
      <span
        aria-hidden="true"
        className={`${MATRIX_TEXT} top-[var(--space-profile-matrix-label)] left-1/2 -translate-x-1/2`}
      >
        {COPY[labels.top]}
      </span>
      <span
        aria-hidden="true"
        className={`${MATRIX_TEXT} bottom-[var(--space-profile-matrix-label)] left-1/2 -translate-x-1/2`}
      >
        {COPY[labels.bottom]}
      </span>
      <span
        aria-hidden="true"
        className={`${MATRIX_TEXT} top-1/2 left-[var(--space-profile-matrix-label)] -translate-y-1/2 rotate-180 [writing-mode:vertical-rl]`}
      >
        {COPY[labels.left]}
      </span>
      <span
        aria-hidden="true"
        className={`${MATRIX_TEXT} top-1/2 right-[var(--space-profile-matrix-label)] -translate-y-1/2 [writing-mode:vertical-rl]`}
      >
        {COPY[labels.right]}
      </span>
      <div className="absolute top-1/2 left-1/2 grid size-[var(--size-profile-matrix-grid)] -translate-x-1/2 -translate-y-1/2 grid-cols-2 grid-rows-2 gap-[var(--space-padding-2)]">
        {QUADRANTS.map((quadrant) => {
          const on = selected === quadrant;
          return (
            <button
              key={quadrant}
              type="button"
              aria-pressed={on}
              aria-label={quadrantName(chart, quadrant)}
              data-quadrant={quadrant}
              onClick={() => onSelect(on ? null : quadrant)}
              className={[
                'cursor-pointer rounded-[var(--radius-profile-matrix-cell)] border-0 p-0 opacity-[var(--opacity-profile-matrix-cell)]',
                on
                  ? 'bg-[color:var(--color-fill-brand)]'
                  : 'bg-[color:var(--color-fill-card)] hover:bg-[color:var(--color-fill-brand-med)]',
              ].join(' ')}
            />
          );
        })}
      </div>
    </div>
  );
}

function Row({
  entry,
  onHighlight,
  onRemix,
}: {
  entry: CompareEntry;
  onHighlight: (creatorId: Id | null) => void;
  onRemix: (creatorId: Id) => void;
}) {
  const description = creatorDescription(entry);
  const { creator } = entry;
  return (
    <li
      data-creator={creator.id}
      onMouseEnter={() => onHighlight(creator.id)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(creator.id)}
      onBlur={() => onHighlight(null)}
      className="group/row flex items-center gap-[var(--space-gap-3)] rounded-[var(--radius-2)] p-[var(--space-padding-5)] focus-within:bg-[color:var(--color-profile-matrix-bg)] hover:bg-[color:var(--color-profile-matrix-bg)]"
    >
      <div className="flex min-w-0 flex-1 items-start gap-[var(--space-gap-3)]">
        <Avatar creator={creator} sizeClass="size-[var(--size-profile-creator-avatar)]" />
        <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-padding-2)]">
          <span className="truncate [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-main-text)]">
            {creator.displayName}
          </span>
          {description !== null ? (
            <span className="truncate [font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b2)] text-[color:var(--color-font-sub-text)]">
              {description}
            </span>
          ) : null}
        </div>
      </div>
      {/* Remix BTN(4181:35788): 줄에 마우스를 올리거나 키보드 포커스가 오면 보인다(늘 Tab 으로 닿는다) */}
      <button
        type="button"
        aria-label={COPY['P-30'].replace('{name}', creator.displayName)}
        onClick={() => onRemix(creator.id)}
        className="flex shrink-0 cursor-pointer items-center rounded-[var(--radius-max)] border-0 bg-[color:var(--color-fill-brand)] p-[var(--space-padding-2)] text-[color:var(--color-font-main-text)] opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
      >
        <Icon name="arrow-outward" size={20} />
      </button>
    </li>
  );
}

function Count({ children }: { children: ReactNode }) {
  return (
    <span className="text-[length:var(--font-size-profile-small)] leading-[var(--line-height-default)] tracking-[var(--letter-spacing-body-b2)] text-[color:var(--color-font-helper-text)]">
      {children}
    </span>
  );
}

/**
 * Identity 탭 오른쪽 "Other Creators"(Filter Panel 4181:35591).
 * Search · Similarity to you · Identity(사분면 2장) · Creators(걸러진 목록, 줄마다 리믹스 화살표).
 */
export function CreatorFilterPanel({
  filter,
  onFilterChange,
  matches,
  focalName,
  onHighlight,
  onRemix,
}: CreatorFilterPanelProps) {
  const similarityLabel =
    focalName === null ? COPY['P-27a'] : COPY['P-27b'].replace('{name}', focalName);
  const setQuadrant = (chart: ChartKey, quadrant: Quadrant | null) =>
    onFilterChange({ ...filter, quadrants: { ...filter.quadrants, [chart]: quadrant } });
  return (
    <>
      {/* 걸러진 수가 바뀌면 낭독기가 알린다(보이는 수는 Creators 제목 옆) */}
      <p role="status" className="sr-only">
        {`${matches.length} ${COPY['P-28b']}`}
      </p>
      <SearchSection
        value={filter.query}
        onChange={(query) => onFilterChange({ ...filter, query })}
      />
      <SimilaritySection
        value={filter.similarityMax}
        label={similarityLabel}
        onChange={(similarityMax) => onFilterChange({ ...filter, similarityMax })}
      />
      <div className={SECTION}>
        <div className="flex items-center justify-between">
          <span className={SECTION_LABEL}>{COPY['P-01b']}</span>
          <button
            type="button"
            onClick={() => onFilterChange({ ...filter, quadrants: { ai: null, decision: null } })}
            className="cursor-pointer rounded-[var(--radius-1)] border-0 bg-transparent p-0 [font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b2)] text-[color:var(--color-font-helper-text)] underline"
          >
            {COPY['P-26']}
          </button>
        </div>
        <div className="flex gap-[var(--space-gap-3)]">
          <Matrix
            chart="ai"
            title={COPY['P-29a']}
            selected={filter.quadrants.ai}
            onSelect={(quadrant) => setQuadrant('ai', quadrant)}
          />
          <Matrix
            chart="decision"
            title={COPY['P-29b']}
            selected={filter.quadrants.decision}
            onSelect={(quadrant) => setQuadrant('decision', quadrant)}
          />
        </div>
      </div>
      <CollapsibleSection
        title={COPY['P-28a']}
        spacing="filter"
        grow
        aside={
          <Count>
            {matches.length} {COPY['P-28b']}
          </Count>
        }
      >
        <ul className="m-0 min-h-[var(--size-profile-creator-list-min)] flex-1 list-none overflow-y-auto p-0 [scrollbar-color:var(--color-grayscale-3)_transparent] [scrollbar-width:thin]">
          {matches.map((entry) => (
            <Row key={entry.creator.id} entry={entry} onHighlight={onHighlight} onRemix={onRemix} />
          ))}
        </ul>
      </CollapsibleSection>
    </>
  );
}
