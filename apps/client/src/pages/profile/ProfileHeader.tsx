import type { CreatorReach, CreatorSummary } from '@tome/shared';
import { COPY } from '../../shared/copy';
import { Avatar } from './Avatar';

interface ProfileHeaderProps {
  creator: CreatorSummary;
  remixedBy: CreatorReach;
  derivedBy: CreatorReach;
}

/** Remixed by·Derived by 한 묶음: 겹친 사진(최대 3장) 아래 "이름표 + 숫자"(4181:35727). */
function Reach({ label, reach }: { label: string; reach: CreatorReach }) {
  return (
    <div className="flex flex-col items-start gap-[var(--space-gap-3)]">
      {/* 사진이 없어도 줄 높이는 지킨다. 장식이라 낭독기는 아래 글자만 읽는다 */}
      <div aria-hidden="true" className="isolate flex h-[var(--size-profile-reach-avatar)]">
        {reach.creators.map((creator, index) => (
          <span
            key={creator.id}
            className="relative mr-[var(--space-profile-reach-overlap)] last:mr-0"
            style={{ zIndex: reach.creators.length - index }}
          >
            <Avatar creator={creator} sizeClass="size-[var(--size-profile-reach-avatar)]" ring />
          </span>
        ))}
      </div>
      <p className="m-0 flex items-baseline gap-[var(--space-padding-2)] whitespace-nowrap">
        <span className="[font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]">
          {label}
        </span>{' '}
        <span className="text-[length:var(--font-size-h3)] leading-[var(--line-height-default)] [font-weight:var(--font-weight-medium)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-strong)]">
          {reach.count}
        </span>
      </p>
    </div>
  );
}

/**
 * 프로필 머리글(4181:35720). 왼쪽 사진 80 + 이름·한 줄 소개, 오른쪽 Remixed by·Derived by.
 * 이름이 화면 제목(h1)이다.
 */
export function ProfileHeader({ creator, remixedBy, derivedBy }: ProfileHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-[var(--space-padding-8)] pr-[var(--space-profile-header-right)]">
      <div className="flex min-w-0 items-center gap-[var(--space-padding-7)]">
        <Avatar creator={creator} sizeClass="size-[var(--size-profile-avatar)]" />
        <div className="flex min-w-0 flex-col gap-[var(--space-gap-3)]">
          <h1 className="m-0 truncate [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)]">
            {creator.displayName}
          </h1>
          {creator.bio !== null ? (
            <p className="m-0 [font:var(--text-body-b2-r)] tracking-[var(--letter-spacing-body-b2)] text-[color:var(--color-font-helper-text)]">
              {creator.bio}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-[var(--space-profile-reach-gap)]">
        <Reach label={COPY['P-21']} reach={remixedBy} />
        <Reach label={COPY['P-22']} reach={derivedBy} />
      </div>
    </div>
  );
}
