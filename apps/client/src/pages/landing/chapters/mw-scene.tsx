/**
 * 기준안 좌표(1728×1117 기준)
 * MY WORK 장면을 이루는 조각들(DOM 만 만든다. 움직임은 mw-timeline).
 */
import { COPY } from '../../../shared/copy';
import { DEMO_PLOT_LABELS, DEMO_PROMPT, DEMO_STEPS } from './demoData';
import { Cursor, Crop, Pic } from './mw-parts';
import { cx } from './mw-dom';
import { Connector, NodeColumn, PromptNode } from './nodes';
import { AttachIcon, ConnIcon, MicIcon, PhotoIcon, SendIcon } from './nodes-icons';
import { COLUMN_X, MY_WORK_LINKS, PROMPT_NODE } from './nodes-layout';
import { APP_H, APP_W, ob } from './shared';

/** 틀 위쪽 메뉴 막대 높이 */
const MENU_H = 34;
/** 아래 두 장면에서 쓰는 앱 화면 조각(로고·아이콘·미리보기 버튼) */
const CHROME = {
  logo: { x: 14, y: 48, w: 110, h: 56 },
  icons: { x: 1648, y: 44, w: 72, h: 212 },
  preview: { x: 14, y: 1016, w: 214, h: 76 },
} as const;

const MENUBAR = { x: 0, y: 0, w: APP_W, h: MENU_H };
const FULL = { x: 0, y: 0, w: APP_W, h: APP_H };

/** 틀 안 화면: 홈 → (새 프로젝트 고르기) → 작업 화면 */
export function MwApp() {
  return (
    <div className="mw-app">
      <div className="mw-lay mw-lay-bg" />
      <div className="mw-lay mw-lay-entry">
        <Pic file={ob('mw_wsbg')} box={{ x: 0, y: MENU_H, w: APP_W, h: APP_H - MENU_H }} eager />
        <Pic file={ob('menubar')} box={MENUBAR} eager />
        <Crop file={ob('mw_entry2')} box={CHROME.preview} />
      </div>
      <div className="mw-lay mw-lay-home">
        <Pic file={ob('mw_home2')} box={FULL} eager />
        <div className="mw-dim" />
      </div>
      <div className="mw-pick" style={{ left: 42, top: 166, width: 108, height: 192 }}>
        <div className="mw-pick-fill" />
        <Crop
          file={ob('mw_home2')}
          box={{ x: 0, y: 0, w: 108, h: 192 }}
          from={[42, 166]}
          className="mw-pick-tile"
        />
      </div>
      <Cursor className="mw-app-cursor" />
    </div>
  );
}

/** 작업 영역이 화면을 덮을 때 위에 남는 기기 틀(메뉴 막대·로고·아이콘·미리보기) */
export function MwBezel() {
  return (
    <div className="mw-bz" aria-hidden="true">
      <div className="mw-bzi">
        <Pic file={ob('menubar')} box={MENUBAR} />
        <Crop file={ob('mw_entry2')} box={CHROME.logo} className="mw-bc" />
        <Crop file={ob('mw_entry2')} box={CHROME.icons} className="mw-bc" />
        <Crop file={ob('mw_entry2')} box={CHROME.preview} className="mw-bc" />
        <Pic file={ob('rx2_s1')} box={FULL} className="mw-rxs" />
      </div>
    </div>
  );
}

/** 처음 틀로 돌아갈 때 오른쪽에 붙는 아이콘 메뉴 */
export function MwIconMenu() {
  return (
    <div className="mw-fbi" aria-hidden="true">
      <Crop
        file={ob('mw_entry2')}
        box={{ x: 0, y: 0, w: CHROME.icons.w, h: CHROME.icons.h }}
        from={[CHROME.icons.x, CHROME.icons.y]}
      />
    </div>
  );
}

/** 단계 설명 일곱 줄(번호·이름·한 문장). 번호는 단계 칸에만 붙는다. */
const CAPTIONS: ReadonlyArray<{ no?: string; title: string; text: string }> = [
  { no: '01', title: COPY['ON-37a'], text: COPY['ON-36a'] },
  { title: COPY['ON-37b'], text: COPY['ON-36b'] },
  { no: '02', title: COPY['ON-37c'], text: COPY['ON-36c'] },
  { no: '03', title: COPY['ON-37d'], text: COPY['ON-36d'] },
  { no: '04', title: COPY['ON-37e'], text: COPY['ON-36e'] },
  { no: '05', title: COPY['ON-37f'], text: COPY['ON-36f'] },
  { title: COPY['ON-26'], text: COPY['ON-27'] },
];

export function MwCaptions() {
  return (
    <>
      <div className="mw-heads" aria-hidden="true">
        {CAPTIONS.map((c) => (
          <div key={c.title} className="mw-cap">
            <div className="mw-cap-e">
              {c.no && <b>{c.no}</b>}
              {c.title}
            </div>
            <h3 className="mw-cap-h">{c.text}</h3>
          </div>
        ))}
      </div>
      {/* 움직이는 캡션은 장식이라 숨기고, 같은 내용을 목록으로 읽을 수 있게 한다 */}
      <ol className="mw-sr">
        {CAPTIONS.map((c) => (
          <li key={c.title}>
            {c.title}. {c.text}
          </li>
        ))}
      </ol>
    </>
  );
}

/** 작업 영역 캔버스(3423×1457): 점 바탕·프롬프트·연결선·다섯 단계·노드 컨트롤·답변 */
export function MwCanvas() {
  return (
    <div className="mw-cv">
      <div className="mw-dots" />
      <PromptNode
        text={DEMO_PROMPT}
        className="mw-v-p"
        style={{ left: PROMPT_NODE.x, top: PROMPT_NODE.y }}
      />
      {MY_WORK_LINKS.map(([x1, y1, x2, y2], i) => (
        <Connector
          key={i}
          from={[x1, y1]}
          to={[x2, y2]}
          className={cx('mw-link', `mw-link-${i}`)}
        />
      ))}
      {DEMO_STEPS.map((step) => (
        <NodeColumn key={step.id} step={step} x={COLUMN_X[step.id]} hook="mw" />
      ))}

      {/* 노드 컨트롤: 열린 키워드와 2차원 판, 점, 이유 쪽지 */}
      <Pic
        file={ob('v2_s1o')}
        box={{ x: 686, y: 82, w: 381, h: 806 }}
        className="mw-fe mw-s1o"
        eager
      />
      <div className="mw-plot">
        <div className="mw-plot-field" />
        <span className="mw-plot-label mw-plot-top">{DEMO_PLOT_LABELS.top}</span>
        <span className="mw-plot-label mw-plot-bottom">{DEMO_PLOT_LABELS.bottom}</span>
        <span className="mw-plot-label mw-plot-left">{DEMO_PLOT_LABELS.left}</span>
        <span className="mw-plot-label mw-plot-right">{DEMO_PLOT_LABELS.right}</span>
      </div>
      <span className="mw-dot" />
      <svg className="mw-corner" viewBox="0 0 44 44" aria-hidden="true">
        <rect x="16" y="16" width="24" height="24" className="mw-corner-fill" />
        <path
          d="M37.6 0V25.6C37.6 32.24 32.24 37.6 25.6 37.6H0V44H44V0H37.6Z"
          className="mw-corner-edge"
        />
      </svg>
      <Pic
        file={ob('mw_note2')}
        box={{ x: 958, y: 818, w: 394.5, h: 62 }}
        className="mw-note"
        eager
      />

      {/* 답변 */}
      <Pic
        file={ob('v2_vhback')}
        box={{ x: 2742, y: 218, w: 633, h: 468 }}
        className="mw-fe mw-v-vh"
        eager
      />
      <div className="mw-vclip">
        <Pic file={ob('v2_c05')} box={{ x: 22, y: 66, w: 532, h: 350 }} className="mw-c05" eager />
        <Pic file={ob('v2_c06')} box={{ x: 22, y: 66, w: 532, h: 350 }} className="mw-c06" eager />
      </div>
    </div>
  );
}

/** 하단 작성줄. 처음엔 안내 문구만 있다가, 타자가 들어오고 프롬프트 노드로 바뀐다. */
export function MwComposer() {
  return (
    <div className="mw-cmp" aria-hidden="true">
      <div className="mw-cb">
        <AttachIcon />
      </div>
      <div className="mw-cb">
        <PhotoIcon />
      </div>
      <div className="mw-cbox">
        <div className="mw-cbox-glow" />
        <div className="mw-cbox-skin" />
        <div className="mw-cclip">
          <div className="mw-cin">
            <div className="mw-nhd">
              <span>{COPY['ON-34']}</span>
              <ConnIcon className="mw-nhd-mark" />
            </div>
            <div className="mw-row1">
              <ConnIcon className="mw-row1-mark" />
              <span className="mw-ph">{COPY['ON-35']}</span>
              <MicIcon />
            </div>
            <div className="mw-row2">
              <p className="mw-txt" />
              <div className="mw-bar">
                <ConnIcon className="mw-row1-mark" />
                <SendIcon className="mw-snd" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
