import { COPY } from '../copy';
import { Icon } from './Icon';

export type FlashKind = 'done' | 'update' | 'stack';

const FLASH = {
  done: { icon: 'done', text: COPY['D-10'] },
  update: { icon: 'history', text: COPY['W-05'] },
  stack: { icon: 'version-stacking', text: COPY['W-07'] },
} as const satisfies Record<FlashKind, { icon: string; text: string }>;

interface FlashProps {
  /** 보여 줄 플래시. null 이면 아무것도 보이지 않는다. */
  kind: FlashKind | null;
}

/**
 * 잠깐 뜨는 알림 알약(플래시 메시지). 시안: flash message 1187:62709 (done·Update·stack).
 * role="status" 칸은 늘 그려 두고 안의 글만 바꾼다. 그래야 새 글이 뜰 때 보조기기가 읽는다.
 * 위치와 언제 사라질지는 쓰는 화면이 정한다.
 */
export function Flash({ kind }: FlashProps) {
  const flash = kind === null ? null : FLASH[kind];
  return (
    <div role="status">
      {flash !== null ? (
        <div
          className={[
            'inline-flex items-center gap-[var(--space-gap-3)] rounded-[var(--radius-max)]',
            'px-[var(--space-padding-7)] py-[var(--space-padding-4)]',
            'bg-[color:var(--color-shadow-weak)] backdrop-blur-[var(--blur-background)]',
            'text-[color:var(--color-font-sub-text)]',
          ].join(' ')}
        >
          <Icon name={flash.icon} />
          <span className="[font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-default)] whitespace-nowrap">
            {flash.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
