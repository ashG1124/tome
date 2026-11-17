import { Icon } from './Icon';

interface StatusBannerProps {
  message: string;
  /** 경고 아이콘을 붙일지. 연결 끊김(E-03)은 붙이고, 서버 깨우는 중(S-05)은 붙이지 않는다. */
  withIcon?: boolean;
}

/**
 * 화면 맨 위 전체 폭에 뜨는 상태 띠. 새로 뜨면 보조기기가 읽도록 role="status" 를 쓴다.
 * 내용 위에 겹치지 않고 띠 높이만큼 아래 내용을 밀어 낸다.
 * 레이아웃(main)의 안쪽 여백만큼 바깥으로 넓혀 화면 가장자리까지 채운다.
 */
export function StatusBanner({ message, withIcon = true }: StatusBannerProps) {
  return (
    <div
      role="status"
      className={[
        'sticky top-0 z-10 flex items-center gap-[var(--space-gap-4)]',
        '-mx-[var(--space-padding-8)] -mt-[var(--space-padding-8)] mb-[var(--space-padding-8)]',
        'px-[var(--space-padding-8)] py-[var(--space-padding-3)]',
        'bg-[color:var(--color-fill-neutral)] text-[color:var(--color-font-on-fill)]',
      ].join(' ')}
    >
      {withIcon ? <Icon name="warning" size={20} /> : null}
      <span className="[font:var(--text-body-b1-m)]">{message}</span>
    </div>
  );
}
