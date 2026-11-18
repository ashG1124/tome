import type { Id } from '@tome/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { COPY, type CopyKey } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import type { PageMenu } from './pageMenu';

export interface FinishSlot {
  enabled: boolean;
  /** 꺼져 있을 때 버튼 옆에 한 줄로 보여 줄 이유 문구(G1 등) */
  reason: CopyKey | null;
  onOpen: () => void;
}

interface IconMenuProps {
  menu: PageMenu;
  onSelectPage: (id: Id) => void;
  onAddPage: () => void;
  /** 페이지를 만드는 중이면 true(+ 를 잠근다) */
  addingPage?: boolean;
  /** 끝내기(save) 칸. 없으면 그리지 않는다(완료 모달 #34 와 함께 연결). */
  finish?: FinishSlot;
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
 * 워크스페이스 오른쪽 세로 아이콘 메뉴. 위에서부터 페이지 인덱스(페이지 수 표시) · 끝내기.
 * 인덱스를 누르면 왼쪽에 "Page N" 목록이 열리고, 끝내기 자리에 + (페이지 추가)가 나온다.
 * Esc 나 바깥 클릭으로 닫히고, 닫히면 포커스는 인덱스 버튼으로 돌아온다.
 */
export function IconMenu({
  menu,
  onSelectPage,
  onAddPage,
  addingPage = false,
  finish,
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
            'absolute top-0 right-[calc(100%+var(--space-gap-5))] m-0 flex w-[var(--size-page-list-width)] list-none flex-col',
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
        <div className="relative flex items-center">
          {finishReason !== null ? (
            <p
              id={reasonId}
              className={[
                'absolute right-[calc(100%+var(--space-padding-3))] m-0 whitespace-nowrap',
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
    </div>
  );
}
