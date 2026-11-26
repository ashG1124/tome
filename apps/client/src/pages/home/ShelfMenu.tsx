import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { COPY } from '../../shared/copy';
import { Icon } from '../../shared/ui';

interface ShelfMenuProps {
  /** 메뉴 왼쪽 위 자리(화면 좌표). 화면 밖으로 넘치면 안쪽으로 당긴다. */
  x: number;
  y: number;
  /** 메뉴 이름(어느 프로젝트의 메뉴인지). */
  label: string;
  /** Delete 를 골랐을 때. 메뉴는 쓰는 쪽이 닫는다. */
  onDelete: () => void;
  /** 닫을 때. refocus 면 메뉴를 연 카드로 포커스를 돌려준다(Esc·Tab). 바깥을 누르면 false. */
  onClose: (refocus: boolean) => void;
}

/**
 * 서가 카드의 우클릭 메뉴(#254). 포인터 자리(키보드로 열면 카드 위)에 뜨는 작은 떠 있는 메뉴다.
 * 열리면 첫 항목에 포커스가 가고, ↑↓·Home·End 로 움직이고 Enter·Space 로 고른다.
 * Esc·Tab 은 닫고 카드로 돌아가며, 바깥을 누르거나 창 크기·스크롤이 바뀌어도 닫힌다.
 * 화면 맨 위에 그려지도록 body 에 붙인다.
 */
export function ShelfMenu({ x, y, label, onDelete, onClose }: ShelfMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // 그린 뒤 크기를 재서 화면 안으로 당기고, 첫 항목에 포커스를 둔다.
  useLayoutEffect(() => {
    const element = menu.current;
    if (element === null) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(0, Math.min(x, window.innerWidth - width)),
      top: Math.max(0, Math.min(y, window.innerHeight - height)),
    });
    element.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [x, y]);

  // 최신 onClose 를 쓰되, 문서 이벤트는 한 번만 붙인다.
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current?.contains(event.target as Node)) return;
      close.current(false);
    };
    const dismiss = () => close.current(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('blur', dismiss);
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
      return;
    }
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (at + 1) % items.length
        : event.key === 'ArrowUp'
          ? (at - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      aria-orientation="vertical"
      onKeyDown={handleKeyDown}
      // 메뉴 위에서 다시 우클릭해도(키보드 메뉴 키 포함) 브라우저 메뉴를 띄우지 않는다.
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position.left, top: position.top }}
      className={[
        'fixed z-30 box-border flex min-w-[var(--size-dialog-button)] flex-col',
        'rounded-[var(--radius-2)] p-[var(--space-padding-2)]',
        // 사진 카드 위에도 뜨므로 반투명 유리 대신 흰 면(오류 색 글자 대비 4.5:1 유지) + 떠 있는 그림자
        'bg-[color:var(--color-background-default)] shadow-[var(--shadow-floating)]',
      ].join(' ')}
    >
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={onDelete}
        className={[
          'box-border flex w-full cursor-pointer items-center gap-[var(--space-gap-1)] border-0',
          'rounded-[var(--radius-max)] bg-transparent px-[var(--space-padding-4)] py-[var(--space-padding-2)] text-left',
          // 지우기(되돌릴 수 없음)는 오류 색 글자 + 휴지통 아이콘으로 구분한다(색 하나로만 구분하지 않는다).
          '[font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-peach-text)]',
          'hover:bg-[color:var(--color-shadow-weak)] focus:bg-[color:var(--color-shadow-weak)]',
        ].join(' ')}
      >
        <Icon name="trash-can" size={20} />
        {COPY['S-07b']}
      </button>
    </div>,
    document.body,
  );
}
