import type { CSSProperties, ReactNode } from 'react';
import { COPY } from '../../../shared/copy';
import { cx } from './mw-dom';
import type { DemoEntry, DemoStep, StepId } from './demoData';
import { HandleIcon, MinusCircle, ConnIcon, PlusCircle } from './nodes-icons';
import {
  COLUMN_TOP,
  COLUMN_W,
  PILL_H,
  PILL_TOP,
  connectorPath,
  layoutColumn,
  type PlacedEntry,
} from './nodes-layout';
import './nodes.css';

/** 단계 헤더에 쓰는 이름(copy ID) */
const STEP_TITLE: Readonly<Record<StepId, string>> = {
  s1: COPY['ON-37a'],
  s2: COPY['ON-37c'],
  s3: COPY['ON-37d'],
  s4: COPY['ON-37e'],
  s5: COPY['ON-37f'],
};

/** 프롬프트 노드(400×260). 위치와 줄임은 바깥에서 style 로 정한다. */
export function PromptNode({
  text,
  className,
  style,
  dim,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
  dim?: number;
}) {
  return (
    <div className={cx('nodes-prompt', className)} style={style} data-dim={dim}>
      <div className="nodes-prompt-head">
        <span>{COPY['ON-34']}</span>
        <ConnIcon className="nodes-prompt-mark" size={24} />
      </div>
      <p className="nodes-prompt-text">{text}</p>
      <span className="nodes-dot nodes-dot--right" />
    </div>
  );
}

/** 단계 헤더: 손잡이 막대 + 번호·이름 알약 + 양쪽 연결점 */
export function StepHeader({
  step,
  className,
  dim,
}: {
  step: DemoStep;
  className?: string;
  dim?: number;
}) {
  return (
    <div className={cx('nodes-header', className)} data-dim={dim}>
      <span className="nodes-grip" />
      <div className="nodes-pill" style={{ top: PILL_TOP, height: PILL_H }}>
        <span className="nodes-no">{step.no}</span>
        <span className="nodes-title">{STEP_TITLE[step.id]}</span>
        {step.id === 's1' && <PlusCircle className="nodes-plus" />}
        <span className="nodes-dot nodes-dot--left" />
        <span className="nodes-dot nodes-dot--right" />
      </div>
    </div>
  );
}

function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <span className="nodes-lines">
      {lines.map((line) => (
        <span key={line} className="nodes-line">
          {line}
        </span>
      ))}
    </span>
  );
}

function ChipBody({ entry }: { entry: DemoEntry }) {
  if (entry.kind === 'rank' || entry.kind === 'check') {
    return (
      <>
        {entry.rows.map((row) => (
          <div key={row.join(' ')} className="nodes-row">
            {entry.kind === 'rank' && <HandleIcon className="nodes-icon" />}
            <Lines lines={row} />
            <MinusCircle className="nodes-icon" />
          </div>
        ))}
      </>
    );
  }
  const lines = entry.rows[0] ?? [];
  return (
    <>
      <Lines lines={lines} />
      {entry.kind === 'toggle' && (
        <span className="nodes-switch">
          <span className="nodes-switch-knob" />
        </span>
      )}
    </>
  );
}

/** 한 칸(라벨 + 칩). 위치는 열 안 좌표다. */
export function NodeEntry({
  placed,
  className,
  dim,
}: {
  placed: PlacedEntry;
  className?: string;
  dim?: number;
}) {
  const { entry, top, chipOffset, chipH, height } = placed;
  return (
    <div className={cx('nodes-entry', className)} style={{ top, height }} data-dim={dim}>
      {entry.label && <span className="nodes-label">{entry.label}</span>}
      <div
        className={cx('nodes-chip', `nodes-chip--${entry.kind}`)}
        style={{ top: chipOffset, height: chipH }}
      >
        <ChipBody entry={entry} />
      </div>
    </div>
  );
}

export interface NodeColumnProps {
  step: DemoStep;
  /** 열 왼쪽 x, 위쪽 y(바깥 좌표). y 를 안 주면 MY WORK 캔버스 위치를 쓴다. */
  x: number;
  y?: number;
  /** 연출이 붙잡을 이름 머리말(예: 'mw' → mw-header, mw-entry) */
  hook: string;
  className?: string;
  style?: CSSProperties;
  /** 열 전체가 물러서는 투명도(REMIX 지도) */
  columnDim?: number;
  /** 칸·헤더별로 물러서는 투명도(REMIX 지도) */
  dimOf?: (part: 'header' | 'entry', index: number) => number | undefined;
  children?: ReactNode;
}

/** 단계 열 하나: 헤더와 칸들을 열 좌표로 놓는다. */
export function NodeColumn({
  step,
  x,
  y = COLUMN_TOP,
  hook,
  className,
  style,
  columnDim,
  dimOf,
  children,
}: NodeColumnProps) {
  const placed = layoutColumn(step);
  return (
    <div
      className={cx('nodes-col', `${hook}-col`, `${hook}-col-${step.id}`, className)}
      style={{ left: x, top: y, width: COLUMN_W, ...style }}
      data-dim={columnDim}
    >
      <StepHeader
        step={step}
        className={cx(`${hook}-header`, `${hook}-header-${step.id}`)}
        dim={dimOf?.('header', 0)}
      />
      {placed.map((p) => (
        <NodeEntry
          key={p.index}
          placed={p}
          className={cx(`${hook}-entry`, `${hook}-entry-${step.id}`)}
          dim={dimOf?.('entry', p.index)}
        />
      ))}
      {children}
    </div>
  );
}

const LINK_PAD = 14;

/** 두 노드를 잇는 연결선(작은 svg 한 장). 좌표는 캔버스 기준. */
export function Connector({
  from,
  to,
  className,
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  className?: string;
}) {
  const left = Math.min(from[0], to[0]) - LINK_PAD;
  const top = Math.min(from[1], to[1]) - LINK_PAD;
  const width = Math.abs(to[0] - from[0]) + LINK_PAD * 2;
  const height = Math.abs(to[1] - from[1]) + LINK_PAD * 2;
  const d = connectorPath(from[0] - left, from[1] - top, to[0] - left, to[1] - top);
  return (
    <svg
      className={cx('nodes-link', className)}
      style={{ left, top, width, height }}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
