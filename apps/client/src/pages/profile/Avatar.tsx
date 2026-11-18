import type { CreatorSummary } from '@tome/shared';

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
  if (creator.avatarUrl !== null) {
    return <img src={creator.avatarUrl} alt="" className={`${box} object-cover`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} flex items-center justify-center bg-[color:var(--color-fill-card)] [font:var(--text-body-b1-m)] text-[color:var(--color-font-sub-text)]`}
    >
      {creator.displayName.slice(0, 1)}
    </span>
  );
}
