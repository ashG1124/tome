import type { CreatorSummary } from '@tome/shared';
import { ApiPhoto } from '../../shared/ui';

interface AvatarProps {
  creator: CreatorSummary;
  /** 크기 클래스(예: size-[var(--size-profile-avatar)]) */
  sizeClass: string;
  /** 흰 테두리 2px(겹친 사진 묶음, 4181:35729) */
  ring?: boolean;
  /** 그 밖의 클래스(그림자·빛 등) */
  className?: string;
}

/**
 * 둥근 프로필 사진. 사진이 없거나 받지 못하면 이름 첫 글자를 넣은 카드색 동그라미.
 * 장식이라 이름은 옆 글자나 감싸는 쪽이 읽힌다. 서버 사진은 로그인 토큰을 붙여 받는다(#208).
 */
export function Avatar({ creator, sizeClass, ring = false, className = '' }: AvatarProps) {
  const box = [
    'box-border block shrink-0 rounded-[var(--radius-max)] bg-[color:var(--color-fill-card)]',
    ring
      ? 'border-solid border-[length:var(--stroke-weight-bold)] border-[color:var(--color-background-default)]'
      : '',
    sizeClass,
    className,
  ].join(' ');
  const initial = (
    <span
      aria-hidden="true"
      className={`${box} flex items-center justify-center [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]`}
    >
      {creator.displayName.slice(0, 1)}
    </span>
  );
  return <ApiPhoto path={creator.avatarUrl} className={`${box} object-cover`} fallback={initial} />;
}
