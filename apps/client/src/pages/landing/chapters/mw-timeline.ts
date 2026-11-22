/**
 * MY WORK 연출 시간표. 스크롤 한 번으로 아래 순서가 이어서 재생된다.
 * 틀 → 새 프로젝트 고르기 → 작업 화면으로 커지기 → 프롬프트 입력·전송 → 단계별 카메라 이동
 * → 노드 컨트롤 → 답변 쌓기 → REMIX 틀로 돌아가기.
 * 모든 좌표는 기준안 좌표(1728×1117 기준)이고, 화면 크기에 따라 달라지는 값은 getGeo() 로 그때그때 읽는다.
 */
import { gsap } from '../motion';
import { DEMO_PROMPT } from './demoData';
import { all, must } from './mw-dom';
import { buildNodeFlow } from './mw-timeline-flow';
import type { MwGeo, Rect } from './mw-geo';
import { cursorClick, pinOptions, stretchRange, windowShadow, wipeRight, APP_W } from './shared';

/** 프롬프트를 단어 단위로 보여 주는 값(0~단어 수+2). 이미 나온 단어는 또렷하게, 막 나온 단어는 흐리게. */
export function typedWords(words: readonly string[], value: number): Array<[string, number]> {
  const q = Math.round(value * 12) / 12;
  if (q <= 0) return [];
  const shown = Math.min(words.length, Math.ceil(q));
  return words
    .slice(0, shown)
    .map((word, i): [string, number] => [word, Math.max(0, Math.min(1, (q - i) / 2.2))]);
}

export interface MyWorkApi {
  /** 창 크기가 바뀌면 타자 상태 캐시를 비운다 */
  resetTyping: () => void;
}

export function setupMyWork(
  root: HTMLElement,
  getGeo: () => MwGeo,
  onHeaderClear: (clear: boolean) => void,
): MyWorkApi {
  const M = getGeo;
  const stage = must(root, '.mw-stage');
  const app = must(root, '.mw-app');
  const appCursor = must(app, '.mw-app-cursor');
  const frame = must(stage, '.mw-frame');
  const ws = must(stage, '.mw-ws');
  const canvas = must(stage, '.mw-cv');
  const cmp = must(stage, '.mw-cmp');
  const cbox = must(cmp, '.mw-cbox');
  const cin = must(cmp, '.mw-cin');
  const txt = must(cmp, '.mw-txt');
  const bar = must(cmp, '.mw-bar');
  const nhd = must(cmp, '.mw-nhd');
  const wc = must(stage, '.mw-wcur');
  const caps = all(stage, '.mw-cap');
  const bz = must(stage, '.mw-bz');
  const bzi = must(bz, '.mw-bzi');
  const fbi = must(stage, '.mw-fbi');
  const q = (selector: string) => must(stage, selector);

  const tl = gsap.timeline({ scrollTrigger: pinOptions(stage, 32.5) });

  gsap.set(ws, { autoAlpha: 0 });
  gsap.set(caps, { autoAlpha: 0, y: 16 });
  gsap.set(
    [...all(stage, '.mw-v-p, .mw-link, .mw-header, .mw-entry'), q('.mw-v-vh'), q('.mw-vclip')],
    { opacity: 0 },
  );
  gsap.set(appCursor, { x: 1350, y: 820, opacity: 0 });
  gsap.set(cmp, { transformOrigin: '0% 100%' });

  // ---- 작성줄(composer) ----
  const words = DEMO_PROMPT.split(' ');
  let last = -1;
  const fit = () => {
    cbox.style.height = `${cin.offsetHeight}px`;
  };
  const setText = (value: number) => {
    const key = Math.round(value * 12) / 12;
    if (key === last) return;
    last = key;
    cbox.style.transition = '';
    const parts = typedWords(words, value);
    cmp.classList.toggle('is-typing', parts.length > 0);
    const frag = document.createDocumentFragment();
    parts.forEach(([word, alpha], i) => {
      if (i) frag.append(' ');
      if (alpha >= 1) {
        frag.append(word);
        return;
      }
      const span = document.createElement('span');
      span.style.opacity = alpha.toFixed(2);
      span.textContent = word;
      frag.append(span);
    });
    txt.replaceChildren(frag);
    fit();
  };
  setText(0);

  // 작성줄이 놓이는 세 자리(틀 안 / 화면 가운데 / 프롬프트 노드 자리)
  const cPos = {
    frame: () => ({
      x: M().big.x + 557 * M().big.s,
      y: -(M().vh - (M().big.y + 1084 * M().big.s)),
      scale: M().big.s,
    }),
    center: () => ({
      x: (M().vw - 620 * M().composerScale) / 2,
      y: -(M().vh * 0.4),
      scale: M().composerScale,
    }),
    node: () => ({
      x: M().tx(0) + 70 * M().kz,
      y: -(M().vh - (M().ty + 562 * M().kz)),
      scale: M().kz,
    }),
  };
  const spot = (px: number, py: number) => ({
    x: M().txNode + px * M().kz,
    y: M().tyEdit + py * M().kz,
  });

  const swap = (from: number, to: number, at: number) =>
    tl
      .to(caps[from] ?? [], { autoAlpha: 0, y: -14, duration: 0.3, ease: 'power1.in' }, at)
      .fromTo(
        caps[to] ?? [],
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' },
        at + 0.4,
      );

  // 한 단계가 "튀어나옴": 연결선이 그려지고, 헤더가 튀고, 칸이 하나씩 따라온다
  const pop = (n: number, link: number | null, at: number) => {
    if (link !== null) wipeRight(tl, q(`.mw-link-${link}`), at, 0.3);
    tl.fromTo(
      q(`.mw-header-s${n}`),
      { opacity: 0, scale: 0.8, y: 10 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.45,
        ease: 'back.out(2.2)',
        transformOrigin: '50% 60%',
      },
      at + 0.22,
    );
    tl.fromTo(
      all(stage, `.mw-entry-s${n}`),
      { opacity: 0, y: 22, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.4,
        ease: 'back.out(1.6)',
        stagger: 0.08,
        transformOrigin: '50% 0%',
      },
      at + 0.45,
    );
  };

  // ---- 기기 틀: 하나의 사각형이 틀·메뉴 막대·작업 영역 자르기를 함께 움직인다 ----
  const setBezel = (r: Rect) => {
    const g = M();
    const s = r.w / APP_W;
    const radius = 24 * s;
    Object.assign(bz.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
      borderRadius: `${radius}px`,
      boxShadow: windowShadow(s),
    });
    bzi.style.transform = `scale(${s})`;
    ws.style.clipPath = `inset(${r.y + 34 * s}px ${g.vw - r.x - r.w}px ${g.vh - r.y - r.h}px ${r.x}px round 0 0 ${radius}px ${radius}px)`;
  };
  const rectTo = (at: number, duration: number, from: () => Rect, to: () => Rect, ease: string) => {
    const o = { t: 0 };
    const ez = gsap.parseEase(ease);
    tl.fromTo(
      o,
      { t: 0 },
      {
        t: 1,
        duration,
        ease: 'none',
        immediateRender: false,
        onUpdate: () => {
          const a = from();
          const b = to();
          const e = ez(o.t);
          const mix = (key: keyof Rect) => a[key] + (b[key] - a[key]) * e;
          setBezel({ x: mix('x'), y: mix('y'), w: mix('w'), h: mix('h') });
        },
      },
      at,
    );
  };

  // 1. 제목 아래 틀 안의 홈 화면. 커서가 New Project 를 고른다
  tl.to(appCursor, { opacity: 1, duration: 0.15 }, 0.1).to(
    appCursor,
    { x: 96, y: 262, duration: 0.7, ease: 'power2.inOut' },
    0.15,
  );
  cursorClick(tl, appCursor, 0.95);
  const pick = must(app, '.mw-pick');
  tl.to(pick, { scale: 1.08, '--lift': 1, duration: 0.3, ease: 'power2.out' }, 1.0)
    .to(must(app, '.mw-dim'), { opacity: 0.85, duration: 0.45, ease: 'power1.inOut' }, 1.0)
    .to(appCursor, { opacity: 0, duration: 0.2 }, 1.1)
    // 2. 고른 타일이 작업 화면으로 열리고 틀이 커진다
    .to(
      pick,
      {
        left: 0,
        top: 34,
        width: APP_W,
        height: 1083,
        scale: 1,
        borderRadius: 0,
        '--lift': 0,
        duration: 1.0,
        ease: 'expo.inOut',
      },
      1.3,
    )
    .to(must(pick, '.mw-pick-fill'), { opacity: 1, duration: 1.0, ease: 'expo.inOut' }, 1.3)
    .to(
      must(pick, '.mw-pick-tile'),
      { opacity: 0, scale: 2.2, transformOrigin: '50% 50%', duration: 0.5, ease: 'power1.in' },
      1.35,
    )
    .to(must(app, '.mw-lay-entry'), { opacity: 1, duration: 0.45, ease: 'power1.inOut' }, 2.0)
    .set(must(app, '.mw-lay-home'), { opacity: 0 }, 2.45)
    .set(pick, { opacity: 0 }, 2.45)
    .fromTo(
      frame,
      {
        x: () => M().start.x - M().big.x,
        y: () => M().start.y - M().big.y,
        scale: () => M().startRatio,
      },
      { x: 0, y: 0, scale: 1, ease: 'expo.inOut', duration: 1.2 },
      1.3,
    )
    .to(q('.mw-title--start'), { opacity: 0, y: -36, duration: 0.6, ease: 'power2.in' }, 1.25)
    // 3. 빈 작업 화면에 작성줄이 올라온다
    .fromTo(
      cmp,
      {
        opacity: 0,
        x: () => cPos.frame().x,
        y: () => cPos.frame().y + 26 * M().big.s,
        scale: () => cPos.frame().scale,
      },
      { opacity: 1, y: () => cPos.frame().y, duration: 0.5, ease: 'back.out(1.7)' },
      2.5,
    );

  // 4. 틀이 화면 밖까지 커진다. 헤더 바탕은 투명해진다
  tl.to(
    {},
    {
      duration: 0.01,
      onStart: () => onHeaderClear(true),
      onReverseComplete: () => onHeaderClear(false),
    },
    0.02,
  );
  tl.set(
    canvas,
    {
      x: () => M().tx(0),
      y: () => M().ty,
      scale: () => M().kz * 0.86,
      transformOrigin: '0 0',
    },
    3.3,
  )
    .set(ws, { autoAlpha: 1 }, 3.3)
    .set(bz, { autoAlpha: 1 }, 3.3)
    .set(frame, { autoAlpha: 0 }, 3.3)
    .fromTo(ws, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 3.3);
  rectTo(
    3.3,
    1.3,
    () => M().big,
    () => M().bleed,
    'expo.inOut',
  );
  tl.to(all(bz, '.mw-bc'), { opacity: 0, duration: 0.35 }, 3.5)
    .to(canvas, { scale: () => M().kz, duration: 1.2, ease: 'expo.inOut' }, 3.4)
    .to(
      cmp,
      {
        x: () => cPos.center().x,
        y: () => cPos.center().y,
        scale: () => cPos.center().scale,
        duration: 1.2,
        ease: 'expo.inOut',
      },
      3.4,
    );

  // 5. 타자: 단어가 부드러운 물결처럼 나오고 작성줄이 줄마다 자란다
  const typing = { n: 0 };
  tl.to(
    typing,
    {
      n: words.length + 2.2,
      duration: 0.8,
      ease: 'power1.inOut',
      onUpdate: () => setText(typing.n),
    },
    4.75,
  );
  tl.to(must(cmp, '.mw-snd'), { scale: 0.8, duration: 0.08, yoyo: true, repeat: 1 }, 6.7);

  // 6. 전송: 작성줄이 그대로 프롬프트 노드가 된다
  const mt = 6.9;
  const md = 1.0;
  tl.to(all(cmp, '.mw-cb'), { width: 0, opacity: 0, duration: 0.35, ease: 'power2.in' }, mt)
    .to(cmp, { gap: 0, duration: 0.35, ease: 'power2.in' }, mt)
    .to(bar, { opacity: 0, height: 0, duration: 0.3 }, mt)
    .to(
      cmp,
      {
        x: () => cPos.node().x,
        y: () => cPos.node().y,
        scale: () => cPos.node().scale,
        duration: md,
        ease: 'expo.inOut',
      },
      mt,
    )
    .set(cbox, { transition: 'none' }, mt)
    .to(cbox, { width: 400, height: 260, borderRadius: 20, duration: md, ease: 'expo.inOut' }, mt)
    .to(must(cbox, '.mw-cbox-skin'), { opacity: 1, duration: md, ease: 'expo.inOut' }, mt)
    .to(must(cbox, '.mw-cbox-glow'), { opacity: 0, duration: md, ease: 'expo.inOut' }, mt)
    .to(
      cin,
      {
        paddingTop: 24,
        paddingBottom: 24,
        paddingLeft: 24,
        paddingRight: 24,
        duration: md,
        ease: 'expo.inOut',
      },
      mt,
    )
    .to(txt, { opacity: 0, duration: 0.2, ease: 'power1.out' }, mt)
    .to(must(cmp, '.mw-row2'), { gap: 0, duration: md * 0.5 }, mt)
    .to(
      nhd,
      { height: 24, marginBottom: 24, opacity: 1, duration: md * 0.7, ease: 'power2.out' },
      mt + md * 0.3,
    )
    .fromTo(
      q('.mw-v-p'),
      { opacity: 0 },
      { opacity: 1, duration: 0.35, ease: 'power1.inOut' },
      mt + md * 0.6,
    )
    .to(cmp, { opacity: 0, duration: 0.3, ease: 'power1.inOut' }, mt + md * 0.7);

  // 7. 1단계가 튀어나오고 카메라가 맞춘다
  tl.to(canvas, { x: () => M().tx(1), duration: 1, ease: 'power2.inOut' }, 8.1);
  tl.to(caps[0] ?? [], { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 8.2);
  pop(1, 0, 8.3);

  const column = (c: number): HTMLElement[] => {
    if (c === 0) return all(stage, '.mw-v-p');
    if (c === 6) return all(stage, '.mw-v-vh, .mw-vclip');
    const extras = c === 1 ? ', .mw-s1o, .mw-plot, .mw-dot, .mw-corner, .mw-note' : '';
    return all(stage, `.mw-header-s${c}, .mw-entry-s${c}${extras}`);
  };
  for (let c = 0; c < 7; c++) gsap.set(column(c), { filter: 'blur(0px)' });
  const focus = (focused: readonly number[], at: number) => {
    for (let c = 0; c < 7; c++) {
      tl.to(
        column(c),
        {
          filter: focused.includes(c) ? 'blur(0px)' : 'blur(2.6px)',
          duration: 0.6,
          ease: 'power1.inOut',
        },
        at,
      );
    }
  };
  focus([1, 2], 8.6);
  focus([1], 10.0);

  buildNodeFlow({ tl, stage, canvas, caps, wc, fbi, bz, M, q, spot, swap, pop, focus, rectTo });

  // 타자 구간이 짧아졌으니 뒤를 당기고, 노드 컨트롤 구간은 읽을 시간을 늘린다
  stretchRange(tl, 10.0, 14.3, 1.6);
  tl.shiftChildren(-1, false, 5.6);

  return {
    resetTyping: () => {
      last = -1;
    },
  };
}
