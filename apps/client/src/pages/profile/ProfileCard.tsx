import type { CreatorSummary } from '@tome/shared';

interface ProfileCardProps {
  creator: CreatorSummary;
}

/** 프로필 사진 카드. 사진 위 아래쪽에 이름과 한 줄 소개. 글자가 잘 보이게 아래로 갈수록 어두워지는 막을 깐다. */
export function ProfileCard({ creator }: ProfileCardProps) {
  return (
    <section className="relative h-[var(--size-profile-photo-height)] overflow-hidden rounded-[var(--radius-profile-card)] bg-[color:var(--color-fill-card)]">
      {creator.avatarUrl !== null ? (
        <img src={creator.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--color-fill-neutral)_75%,transparent),transparent_60%)]" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-[var(--space-padding-2)] p-[var(--space-padding-6)]">
        <h2 className="m-0 [font:var(--text-heading-t1)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-on-fill)]">
          {creator.displayName}
        </h2>
        {creator.bio !== null ? (
          <p className="m-0 [font:var(--text-body-b2-r)] text-[color:var(--color-font-on-fill)]">
            {creator.bio}
          </p>
        ) : null}
      </div>
    </section>
  );
}
