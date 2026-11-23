import { COPY } from '../../../shared/copy';
import {
  CRITERIA,
  COL3_X,
  COL4_X,
  COL5_X,
  CRITERIA_LABEL,
  DISCREPANCIES,
  DRAFT_GROUPS,
  EVIDENCE,
  EVIDENCE_H,
  EVIDENCE_LABEL,
  EVIDENCE_PITCH,
  EVIDENCE_TOP,
  MAP_COLUMNS,
  type Chip,
} from './dv-data';

/** 기준안 좌표(1728×1117 기준): 지도 안 칩·알약의 위치는 1920×1080 판 좌표(연출용 숫자)다. */

/** 가운데 정렬 칩 묶음 */
function ChipGroup({
  x,
  label,
  top,
  chips,
}: {
  x: number;
  label: string;
  top: number;
  chips: readonly Chip[];
}) {
  return (
    <>
      <span className="dv-map-label" style={{ left: x, top }}>
        {label}
      </span>
      {chips.map(([y, h, text]) => (
        <span key={text} className="dv-chip dv-chip-center" style={{ left: x, top: y, height: h }}>
          {text}
        </span>
      ))}
    </>
  );
}

/** 단계 알약(번호 + 제목) 위의 손잡이 막대와 양쪽 연결 점 */
function StepPill({ x, step, title }: { x: number; step: number; title: string }) {
  return (
    <>
      <span className="dv-handle" style={{ left: x + 106.75, top: 133.7 }} />
      <span className="dv-pill" style={{ left: x, top: 149.4 }}>
        <span className="dv-pill-no">{step}</span>
        <span className="dv-pill-title">{title}</span>
      </span>
      <i className="dv-pdot" style={{ left: x - 4.52, top: 172 }} />
      <i className="dv-pdot" style={{ left: x + 255.84, top: 172 }} />
    </>
  );
}

/** 검증 기준 줄 끝의 "빼기" 동그라미 아이콘 */
function MinusCircle() {
  return (
    <svg className="dv-minus" width="21" height="21" viewBox="0 0 21 21" fill="none">
      <circle cx="10.4" cy="10.4" r="7.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.9 10.4h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** 오른쪽 아래로 이어지는 노드 지도(3~5단계 열). 장식이라 aria-hidden 안에서만 쓴다. */
export function NodeMap() {
  const [evLabel, evLabelTop] = EVIDENCE_LABEL;
  const [crLabel, crLabelTop] = CRITERIA_LABEL;
  return (
    <div className="dv-map">
      {MAP_COLUMNS.map((c) => (
        <StepPill key={c.step} x={c.x} step={c.step} title={COPY[c.title]} />
      ))}
      <svg className="dv-conn" width="1" height="1" fill="none">
        <path d="M208.2 176.5C239.8 183 258.4 168.7 290.5 176.5" />
        <path d="M551 176.5C582.7 183 601.3 168.7 633.4 176.5" />
      </svg>

      <span className="dv-map-label" style={{ left: COL3_X, top: evLabelTop }}>
        {evLabel}
      </span>
      {EVIDENCE.map(([text, on], i) => (
        <span
          key={text}
          className={`dv-chip dv-chip-ev${on ? '' : ' dv-chip-off'}`}
          style={{ left: COL3_X, top: EVIDENCE_TOP + i * EVIDENCE_PITCH, height: EVIDENCE_H }}
        >
          <span className="dv-chip-text">{text}</span>
          <span className={`dv-toggle${on ? ' dv-toggle-on' : ''}`} />
        </span>
      ))}

      {DRAFT_GROUPS.map((g) => (
        <ChipGroup key={g.label} x={COL4_X} label={g.label} top={g.top} chips={g.chips} />
      ))}

      <span className="dv-map-label" style={{ left: COL5_X, top: crLabelTop }}>
        {crLabel}
      </span>
      <span className="dv-chip dv-criteria" style={{ left: COL5_X, top: 244.6, height: 159.7 }}>
        {CRITERIA.map((text) => (
          <span key={text} className="dv-criteria-row">
            {text}
            <MinusCircle />
          </span>
        ))}
      </span>
      <ChipGroup
        x={COL5_X}
        label={DISCREPANCIES.label}
        top={DISCREPANCIES.top}
        chips={DISCREPANCIES.chips}
      />

      <svg className="dv-corner" width="39" height="39" viewBox="0 0 39 39" aria-hidden="true">
        <path d="M32.6 0v22.2c0 5.8-4.7 10.4-10.4 10.4H0v5.6h38.2V0z" />
      </svg>
    </div>
  );
}
