/**
 * 기준안 좌표(1728×1117 기준)
 * REMIX 장면을 이루는 조각들(DOM 만 만든다. 움직임은 rx-timeline).
 */
import { COPY } from '../../../shared/copy';
import {
  DEMO_PROMPT,
  DEMO_STEPS,
  REMIX_CHANGED,
  REMIX_COMMENT,
  REMIX_DIM_COLUMN,
  REMIX_DIM_ENTRY,
  type StepId,
} from './demoData';
import { Crop, Cursor, Pic } from './mw-parts';
import { NodeColumn, PromptNode } from './nodes';
import { MAP_ANSWER, MAP_COLUMNS, MAP_MARKERS, MAP_PROMPT } from './rx-data';
import { APP_H, APP_W, ob } from './shared';

const FULL = { x: 0, y: 0, w: APP_W, h: APP_H };

/** 커넥션이 없는 열(1·5단계)은 열 전체가, 나머지는 바뀌지 않는 칸만 물러선다 */
function dimOf(id: StepId) {
  return (part: 'header' | 'entry', index: number): number | undefined => {
    if (id === 's1' || id === 's5') return undefined;
    if (part === 'header') return REMIX_DIM_ENTRY;
    return REMIX_CHANGED[id]?.includes(index) ? undefined : REMIX_DIM_ENTRY;
  };
}

/** 다른 창작자의 의견 배너(펼쳐지는 알약). 안쪽은 634 폭 원본 크기로 짜고 줄여 쓴다. */
function Banner() {
  return (
    <div className="rx-ban">
      <div className="rx-ban-in">
        <svg className="rx-ban-corner rx-ban-corner--tl" viewBox="0 0 39 39" aria-hidden="true">
          <path d="M32.7381 0V21.0459C32.7381 27.5156 27.5156 32.7381 21.0459 32.7381H0V38.9739H38.9739V0H32.7381Z" />
        </svg>
        <div className="rx-ban-body">
          <div className="rx-ban-avatar">
            <Pic file={ob('rx2_av')} box={{ x: 0, y: 0, w: 42, h: 42 }} />
          </div>
          <div className="rx-ban-text">
            <p>
              {REMIX_COMMENT.map((line) => (
                <span key={line} className="rx-ban-line">
                  {line}
                </span>
              ))}
            </p>
            <span className="rx-ban-dots">
              <i />
              <i />
            </span>
          </div>
          <span className="rx-ban-apply">{COPY['ON-41']}</span>
        </div>
        <svg className="rx-ban-corner rx-ban-corner--br" viewBox="0 0 39 39" aria-hidden="true">
          <path d="M6.23583 38.9739V17.928C6.23583 11.4583 11.4583 6.23583 17.928 6.23583H38.9739V0H0V38.9739H6.23583Z" />
        </svg>
      </div>
    </div>
  );
}

/** 노드 전체 지도(프롬프트·다섯 단계·답변·연결선·커넥션 표시·배너) */
export function RxMap() {
  return (
    <div className="rx-map">
      <svg className="rx-links" data-dim="0.6" viewBox={`0 0 ${APP_W} ${APP_H}`} aria-hidden="true">
        {Array.from({ length: 6 }, (_, k) => (
          <path key={k} className={`rx-link-${k}`} />
        ))}
      </svg>
      <Pic
        file={ob('rx2_vh')}
        box={{ x: MAP_ANSWER.x, y: MAP_ANSWER.y, w: MAP_ANSWER.w, h: MAP_ANSWER.h }}
        className="rx-answer"
        dim={0.65}
      />
      <PromptNode
        text={DEMO_PROMPT}
        className="rx-node"
        style={{ left: MAP_PROMPT.x, top: MAP_PROMPT.y }}
        dim={REMIX_DIM_COLUMN}
      />
      {DEMO_STEPS.map((step) => (
        <NodeColumn
          key={step.id}
          step={step}
          x={MAP_COLUMNS[step.id].x}
          y={MAP_COLUMNS[step.id].y}
          hook="rx"
          className="rx-node"
          columnDim={step.id === 's1' || step.id === 's5' ? REMIX_DIM_COLUMN : undefined}
          dimOf={dimOf(step.id)}
        />
      ))}
      {MAP_MARKERS.map(([x, y], i) => (
        <svg
          key={i}
          className={`rx-cn rx-cn-${i + 1}`}
          style={{ left: x, top: y }}
          viewBox="0 0 35 35"
          aria-hidden="true"
        >
          <path d="M14.7 0V9.45C14.7 12.355 12.355 14.7 9.45 14.7H0V17.5H17.5V0H14.7Z M20.3 35V25.55C20.3 22.645 22.645 20.3 25.55 20.3H35V17.5H17.5V35H20.3Z" />
        </svg>
      ))}
      <Banner />
    </div>
  );
}

/** 틀 안 화면: 내 작업 화면 → 크리에이터 고르기 → 노드 지도 */
export function RxApp() {
  return (
    <div className="rx-app">
      <div className="rx-lay rx-dots" />
      <div className="rx-lay rx-s3">
        <Pic
          file={ob('rx2_bg3')}
          box={{ x: 0, y: 34, w: APP_W, h: APP_H - 34 }}
          className="rx-s3bg"
        />
        <RxMap />
        <div className="rx-s3dim" />
        <Pic file={ob('menubar')} box={{ x: 0, y: 0, w: APP_W, h: 34 }} className="rx-s3c" />
        <Pic file={ob('rx2_title3')} box={{ x: 0, y: 54, w: APP_W, h: 48 }} className="rx-s3c" />
        <Pic file={ob('prompt')} box={{ x: 538, y: 1009, w: 652, h: 91 }} className="rx-s3c" />
      </div>
      <div className="rx-lay rx-s1l">
        <Pic file={ob('rx2_s1')} box={FULL} eager />
        <Crop file={ob('rx2_s2')} box={{ x: 1648, y: 46, w: 70, h: 208 }} className="rx-s2i" />
        <Crop file={ob('rx2_s2')} box={{ x: 1310, y: 180, w: 356, h: 420 }} className="rx-s2p" />
      </div>
      <Cursor className="rx-app-cursor" />
    </div>
  );
}

/** "Try Remix!" 말풍선: 화면 가장자리 밖으로 튀어나와서 틀 안쪽(잘리는 상자)이 아니라 바깥에 둔다 */
export function RxBubble() {
  return (
    <div className="rx-fx" aria-hidden="true">
      <Pic
        file={ob('rx2_bub')}
        box={{ x: 1601.8, y: 243.1, w: 163.2, h: 101.9 }}
        className="rx-bub"
      />
    </div>
  );
}
