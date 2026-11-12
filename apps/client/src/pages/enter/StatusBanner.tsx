import { Icon } from '../../shared/ui';

interface StatusBannerProps {
  message: string;
}

/**
 * 화면 맨 위 전체 폭에 뜨는 상태 띠. 새로 뜨면 보조기기가 읽도록 role="status" 를 쓴다.
 * 여러 화면이 함께 쓸 공통 부품이 생기기 전까지 이 화면 폴더에 임시로 둔다.
 */
export function StatusBanner({ message }: StatusBannerProps) {
  return (
    <div
      role="status"
      className={[
        'fixed inset-x-0 top-0 z-10 flex items-center gap-[var(--space-gap-4)]',
        'px-[var(--space-padding-8)] py-[var(--space-padding-3)]',
        'bg-[color:var(--color-fill-neutral)] text-[color:var(--color-font-on-fill)]',
      ].join(' ')}
    >
      <Icon name="warning" size={20} />
      <span className="[font:var(--text-body-b1-m)]">{message}</span>
    </div>
  );
}
