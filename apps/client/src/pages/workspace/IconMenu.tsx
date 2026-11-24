import type { Id } from '@tome/shared';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { COPY, type CopyKey } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import type { PageMenu } from './pageMenu';
import { RemixLabel, type RemixPerson } from './remix/RemixPanel';

/** 접힌 손잡이 안 화살표 한 변(px). 시안 2513:225785 의 12.706 */
const HANDLE_ARROW_SIZE = 12.706;

export interface FinishSlot {
  enabled: boolean;
  /** 꺼져 있을 때 버튼 옆에 한 줄로 보여 줄 이유 문구(G1 등) */
  reason: CopyKey | null;
  onOpen: () => void;
}

export interface RemixSlot {
  open: boolean;
  /**
   * 지금 리믹스 상대(이름·사진). 패널이 닫혀 있으면 버튼 왼쪽에 접힌 손잡이가 보이고,
   * 손잡이를 누르면 "Remix with 이름" 알약이 펼쳐진다
   */
  partner: RemixPerson | undefined;
  panelId: string;
  onOpen: () => void;
  onClose: () => void;
  /** 열렸을 때 버튼 왼쪽에 그릴 패널 */
  panel: ReactNode;
}

interface IconMenuProps {
  menu: PageMenu;
  onSelectPage: (id: Id) => void;
  onAddPage: () => void;
  /** 페이지를 만드는 중이면 true(+ 를 잠근다) */
  addingPage?: boolean;
  /** 끝내기(save) 칸. 없으면 그리지 않는다(완료 모달 #34 와 함께 연결). */
  finish?: FinishSlot;
  /** 리믹스 칸(#41). 없으면 그리지 않는다. */
  remix?: RemixSlot;
}

/** 아이콘 메뉴 동그라미. 고른 상태는 진한 면으로 바뀌고, 비활성은 공통 규칙을 따른다. */
function circle(selected: boolean): string {
  return [
    'relative box-border flex size-[var(--size-icon-menu-button)] shrink-0 cursor-pointer items-center justify-center p-0',
    'rounded-[var(--radius-max)] border border-solid border-[length:var(--stroke-weight-light)] border-[color:var(--color-fill-card)]',
    'shadow-[var(--shadow-icon-menu)]',
    selected
      ? 'bg-[color:var(--color-fill-neutral)] text-[color:var(--color-font-on-fill)]'
      : 'bg-[color:var(--color-background-default)] text-[color:var(--color-font-sub-text)]',
    'disabled:cursor-not-allowed disabled:border-[color:var(--color-border-default)]',
    'disabled:bg-[color:var(--color-gray-20)] disabled:text-[color:var(--color-font-disable)]',
  ].join(' ');
}

/**
 * 리믹스 버튼(Icon Menu remix 1185:59842). 누르면 왼쪽에 "Remix with" 패널이 열리고, 버튼은 진한 면이 된다.
 * 닫혀 있고 상대가 있으면 버튼 왼쪽에 접힌 손잡이(remix_change 2513:226126, Remix 03)를 둔다.
 * 손잡이를 누르면 흰 "Remix with 이름" 알약(Control done 1720:80415, Remix 04)이 펼쳐지고, 알약을 누르면 패널을 다시 연다.
 * 패널·알약은 Esc·바깥 클릭으로 닫히고, 닫힐 때 포커스가 그 안에 있었으면 리믹스 버튼(알약은 손잡이)으로 돌아온다.
 */
function RemixButton({ slot }: { slot: RemixSlot }) {
  const { open, onOpen, onClose, partner } = slot;
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  // 손잡이를 눌러 알약을 펼쳤는지. 패널이 열리면 다시 접힌다.
  const [peek, setPeek] = useState(false);
  const showPill = peek && !open && partner !== undefined;
  const refocusHandle = useRef(false);

  const openPanel = () => {
    setPeek(false);
    onOpen();
  };
  const foldPill = (refocus: boolean) => {
    refocusHandle.current = refocus;
    setPeek(false);
  };

  useEffect(() => {
    if (!open && !showPill) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (wrap.current === null || wrap.current.contains(event.target as Node)) return;
      // 프롬프트 바의 리믹스 칩은 스스로 패널을 열고 닫는다(바깥 누름으로 닫았다가 다시 열지 않게)
      if (event.target instanceof Element && event.target.closest('[data-remix-opener]')) return;
      if (open) onClose();
      else setPeek(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open, showPill, onClose]);

  useEffect(() => {
    if (showPill) pill.current?.focus();
    else if (refocusHandle.current) {
      refocusHandle.current = false;
      handle.current?.focus();
    }
  }, [showPill]);

  useEffect(() => {
    if (wasOpen.current && !open) {
      const active = document.activeElement;
      const lost = active === null || active === document.body;
      if (lost || (wrap.current?.contains(active) ?? false)) button.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <div
      ref={wrap}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        if (open) {
          event.stopPropagation();
          onClose();
        } else if (showPill) {
          event.stopPropagation();
          foldPill(true);
        }
      }}
      className="relative flex items-center"
    >
      {open ? (
        <div className="absolute top-0 right-[calc(100%+var(--space-remix-panel-gap))]">
          {slot.panel}
        </div>
      ) : showPill ? (
        <button
          ref={pill}
          type="button"
          aria-expanded={false}
          onClick={openPanel}
          className="absolute top-0 right-[calc(100%+var(--space-remix-panel-gap))] flex cursor-pointer rounded-[var(--radius-max)] border-0 bg-transparent p-0"
        >
          <RemixLabel partner={partner} open={false} />
        </button>
      ) : partner !== undefined ? (
        // 접힌 손잡이(2513:225784): 높이 34, DIM 면, 왼쪽 화살표. 누르면 "Remix with 이름" 알약이 펼쳐진다
        <button
          ref={handle}
          type="button"
          data-remix-handle=""
          aria-label={`${COPY['RX-01']} ${partner.displayName}`}
          aria-expanded={false}
          onClick={() => setPeek(true)}
          className={[
            'absolute top-1/2 right-[calc(100%+var(--space-remix-handle-gap))] box-border flex h-[var(--size-remix-handle-height)] -translate-y-1/2',
            'cursor-pointer items-center rounded-[var(--radius-max)] border-0 p-[var(--space-remix-handle-padding)]',
            'bg-[color:var(--color-background-dim)] text-[color:var(--color-font-on-fill)] shadow-[var(--shadow-remix-handle)]',
          ].join(' ')}
        >
          {/* 시안 화살표 모양은 large_arrow_left(1187:63769)와 같다 */}
          <Icon name="large-arrow-left" size={HANDLE_ARROW_SIZE} />
        </button>
      ) : null}
      <button
        ref={button}
        type="button"
        aria-label={COPY['RX-05']}
        aria-expanded={open}
        aria-controls={open ? slot.panelId : undefined}
        onClick={open ? onClose : openPanel}
        className={circle(open)}
      >
        <Icon name="glyph-remix" />
      </button>
    </div>
  );
}

/**
 * 워크스페이스 오른쪽 세로 아이콘 메뉴. 위에서부터 페이지 인덱스(페이지 수 표시) · 끝내기 · (구분선) 리믹스.
 * 인덱스를 누르면 왼쪽에 "Page N" 목록이 열리고, 끝내기 자리에 + (페이지 추가)가 나온다.
 * Esc 나 바깥 클릭으로 닫히고, 닫히면 포커스는 인덱스 버튼으로 돌아온다.
 */
export function IconMenu({
  menu,
  onSelectPage,
  onAddPage,
  addingPage = false,
  finish,
  remix,
}: IconMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const indexButton = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    indexButton.current?.focus();
  };

  const finishReason = finish !== undefined && !finish.enabled ? finish.reason : null;

  return (
    <div
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          close();
        }
      }}
      className="relative flex flex-col items-center gap-[var(--space-gap-5)]"
    >
      <button
        ref={indexButton}
        type="button"
        aria-label={`${COPY['W-02']} ${menu.count}`}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((now) => !now)}
        className={circle(open)}
      >
        <span className="relative inline-flex">
          <Icon name="process" />
          <span
            aria-hidden="true"
            className={[
              'absolute top-[8.33%] right-[37.5%] bottom-1/4 left-[20.83%] flex items-center justify-center',
              '[font:var(--text-body-b2-m)] leading-none',
              open
                ? 'text-[color:var(--color-font-sub-text)]'
                : 'text-[color:var(--color-font-on-fill)]',
            ].join(' ')}
          >
            {menu.count}
          </span>
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          className={[
            'absolute top-0 right-[calc(100%+var(--space-remix-panel-gap))] m-0 flex w-[var(--size-page-list-width)] list-none flex-col',
            'gap-[var(--space-padding-2)] rounded-[var(--radius-node)] border border-solid border-[length:var(--stroke-weight-light)]',
            'border-[color:var(--color-fill-card)] bg-[color:var(--color-background-default)] p-[var(--space-padding-3)] shadow-[var(--shadow-floating)]',
          ].join(' ')}
        >
          {menu.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.current ? 'page' : undefined}
                onClick={() => {
                  close();
                  if (!item.current) onSelectPage(item.id);
                }}
                className={[
                  'flex w-full cursor-pointer items-center justify-between border-0 bg-transparent',
                  'rounded-[var(--radius-2)] px-[var(--space-padding-5)] py-[var(--space-padding-3)]',
                  '[font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-main-text)]',
                  'aria-[current=page]:bg-[color:var(--color-fill-neutral-weak)]',
                ].join(' ')}
              >
                <span>{`${COPY['W-01']} ${item.number}`}</span>
                {item.current ? <Icon name="done" size={20} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <button
          type="button"
          aria-label={COPY['W-03']}
          aria-busy={addingPage || undefined}
          disabled={!menu.canAdd || addingPage}
          onClick={onAddPage}
          className={circle(false)}
        >
          <Icon name="add" />
        </button>
      ) : finish !== undefined ? (
        <div className="group relative flex items-center">
          {finishReason !== null ? (
            <p
              id={reasonId}
              // 안내는 손을 올리거나(hover) 포커스가 있을 때만 보인다. 숨겨도 낭독기는 aria-describedby 로 읽는다.
              className={[
                'pointer-events-none absolute right-[calc(100%+var(--space-padding-3))] m-0 whitespace-nowrap',
                'opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
                'rounded-[var(--radius-max)] bg-[color:var(--color-background-default)] px-[var(--space-padding-5)] py-[var(--space-padding-2)]',
                'shadow-[var(--shadow-icon-menu)] [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]',
              ].join(' ')}
            >
              {COPY[finishReason]}
            </p>
          ) : null}
          <button
            type="button"
            aria-label={COPY['W-04']}
            aria-describedby={finishReason !== null ? reasonId : undefined}
            disabled={!finish.enabled}
            onClick={finish.onOpen}
            className={circle(false)}
          >
            <Icon name="file-done" />
          </button>
        </div>
      ) : null}

      {remix !== undefined ? (
        <>
          {/* 구분선 2332:159744: 높이 0 칸 안에 굵기 2 · 폭 27 선(메뉴 간격 16 안에 들어간다) */}
          <span aria-hidden="true" className="relative block h-0 w-[var(--size-icon-menu-divider)]">
            <span className="absolute inset-x-0 top-[calc(var(--stroke-weight-bold)/-2)] h-[var(--stroke-weight-bold)] bg-[color:var(--color-border-default)]" />
          </span>
          <RemixButton slot={remix} />
        </>
      ) : null}
    </div>
  );
}
