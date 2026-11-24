import type { CreatorSummary } from '@tome/shared';
import { Link } from 'react-router';
import { AuthorAvatar } from './AuthorAvatar';

/**
 * 크리에이터 알약(Creator 3190:178168): 사진 48 · 이름 20 SemiBold · 한 줄 소개 14 Medium. 누르면 그 사람 프로필로 간다.
 * 홈 Rising Creator 줄과 Creator 탭 칸 목록이 같이 쓴다. 칸보다 길면 이름·소개를 말줄임한다(칸 목록에서만 생긴다).
 */
export function CreatorPill({ creator }: { creator: CreatorSummary }) {
  return (
    <Link
      to={`/creators/${encodeURIComponent(creator.id)}`}
      className={[
        'flex h-[var(--size-agora-creator-height)] max-w-full min-w-0 items-center gap-[var(--space-gap-3)] rounded-[var(--radius-max)] whitespace-nowrap',
        'border border-solid border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-default)]',
        'bg-[color:var(--color-background-default)] pr-[var(--space-padding-8)] pl-[var(--space-padding-4)]',
      ].join(' ')}
    >
      <AuthorAvatar creator={creator} sizeClass="size-[var(--size-avatar-creator)]" />
      <span className="flex min-w-0 flex-col justify-center">
        <span className="truncate [font:var(--text-subtitle-st1-sb)] text-[color:var(--color-font-main-text)]">
          {creator.displayName}
        </span>
        {creator.bio !== null ? (
          <span className="truncate [font:var(--text-body-b2-m)] text-[color:var(--color-font-sub-text)]">
            {creator.bio}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
