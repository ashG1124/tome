import type { CreatorSummary } from '@tome/shared';
import { ApiPhoto } from '../../shared/ui';

interface AvatarProps {
  creator: CreatorSummary;
  /** me = 좌표 위 내 아바타(크게), other = 다른 창작자(작게) */
  size: 'me' | 'other';
}

/** 둥근 프로필 사진. 사진이 없으면 이름 첫 글자를 넣은 빈 동그라미. 장식이라 이름은 감싸는 쪽이 붙인다. */
export function Avatar({ creator, size }: AvatarProps) {
  const box = [
    'box-border block shrink-0 rounded-[var(--radius-max)] border-solid',
    'border-[length:var(--stroke-weight-bold)] border-[color:var(--color-background-default)]',
    'shadow-[var(--shadow-03)]',
    size === 'me' ? 'size-[var(--size-avatar-me)]' : 'size-[var(--size-avatar-other)]',
  ].join(' ');
  const initial = (
    <span
      aria-hidden="true"
      className={`${box} flex items-center justify-center bg-[color:var(--color-fill-card)] [font:var(--text-body-b1-m)] text-[color:var(--color-font-sub-text)]`}
    >
      {creator.displayName.slice(0, 1)}
    </span>
  );
  // 서버 사진은 로그인 토큰을 붙여 받는다(#208). 없거나 못 받으면 머리글자.
  return <ApiPhoto path={creator.avatarUrl} className={`${box} object-cover`} fallback={initial} />;
}
