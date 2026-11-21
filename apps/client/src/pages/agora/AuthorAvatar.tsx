import type { CreatorSummary } from '@tome/shared';
import { useRef } from 'react';
import { useApiImage } from '../../shared/api';

interface AuthorAvatarProps {
  creator: CreatorSummary;
  /** 크기 토큰 클래스(예: size-[var(--size-avatar-card)]) */
  sizeClass: string;
}

/** 둥근 작성자 사진. 사진이 없으면 이름 첫 글자를 넣은 동그라미. 장식이라 이름은 옆 글자가 읽힌다. */
export function AuthorAvatar({ creator, sizeClass }: AuthorAvatarProps) {
  const ref = useRef<HTMLImageElement>(null);
  const { directSrc, failed } = useApiImage(creator.avatarUrl, ref);
  const box = [
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-max)]',
    sizeClass,
  ].join(' ');
  if (creator.avatarUrl === null || failed) {
    return (
      <span
        aria-hidden="true"
        className={`${box} bg-[color:var(--color-fill-card)] [font:var(--text-body-b2-m)] text-[color:var(--color-font-sub-text)]`}
      >
        {creator.displayName.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={box}>
      <img ref={ref} src={directSrc} alt="" className="size-full object-cover" />
    </span>
  );
}
