import { useQuery } from '@tanstack/react-query';
import type { AgoraHomeResponse, AgoraProjectCard, CreatorSummary } from '@tome/shared';
import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice } from '../../shared/ui';
import { isAgoraEmpty, topicTiles } from './agora';
import { AgoraFrame } from './AgoraFrame';
import { AgoraImage } from './AgoraImage';
import { AuthorAvatar } from './AuthorAvatar';

const SECTION_TITLE =
  'm-0 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-strong)]';

/** 제목과 가로 한 줄. 넘치면 줄 안에서 가로로 스크롤된다(시안처럼 오른쪽이 잘려 보인다). */
function Row({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-[var(--space-gap-5)]">
      <h2 id={id} className={SECTION_TITLE}>
        {title}
      </h2>
      <ul className="m-0 flex list-none gap-[var(--space-gap-5)] overflow-x-auto p-0 pb-[var(--space-padding-3)]">
        {children}
      </ul>
    </section>
  );
}

/** 추천 프로젝트 카드(Recommended Project 3188:177873): 사진, 아래 흰 제목, 오른쪽 아래 작성자 사진. */
function RecommendedCard({ card }: { card: AgoraProjectCard }) {
  return (
    <Link
      to={`/agora/projects/${encodeURIComponent(card.id)}`}
      className="relative isolate block h-[var(--size-agora-recommended-height)] w-[var(--size-agora-recommended-width)] overflow-hidden rounded-[var(--radius-agora-card)]"
    >
      <AgoraImage path={card.coverThumbUrl} className="-z-10" />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-[linear-gradient(to_top,var(--color-shelf-cover-shade),transparent)]"
      />
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-[var(--space-padding-3)] p-[var(--space-padding-6)] text-[color:var(--color-font-on-fill)]">
        <span className="min-w-0 truncate [font:var(--text-subtitle-st1-sb)] tracking-[var(--letter-spacing-default)]">
          {card.title}
        </span>
        <AuthorAvatar creator={card.author} sizeClass="size-[var(--size-avatar-other)]" />
      </span>
    </Link>
  );
}

/** 라이징 크리에이터(Creater 3188:178010): 사진·이름·한 줄 소개 알약. 누르면 그 사람 프로필로 간다. */
export function CreatorPill({ creator }: { creator: CreatorSummary }) {
  return (
    <Link
      to={`/creators/${encodeURIComponent(creator.id)}`}
      className={[
        'flex items-center gap-[var(--space-padding-3)] rounded-[var(--radius-max)] whitespace-nowrap',
        'border border-solid border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-default)]',
        'bg-[color:var(--color-background-default)] py-[var(--space-padding-3)] pr-[var(--space-padding-8)] pl-[var(--space-padding-4)]',
      ].join(' ')}
    >
      <AuthorAvatar creator={creator} sizeClass="size-[var(--size-avatar-creator)]" />
      <span className="flex flex-col">
        <span className="[font:var(--text-subtitle-st1-sb)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]">
          {creator.displayName}
        </span>
        {creator.bio !== null ? (
          <span className="[font:var(--text-body-b2-m)] text-[color:var(--color-font-sub-text)]">
            {creator.bio}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * 핫토픽 묶음: 표지 4장(2×2)과 아래 주제 제목. 누르면 핫토픽 목록으로 간다.
 * 시안의 "+N"(주제의 나머지 공개 프로젝트 수)은 홈 응답이 주제당 일부만 주고 전체 수가 없어 표시하지 않는다.
 */
function TopicBundle({ entry }: { entry: AgoraHomeResponse['hotTopics'][number] }) {
  const tiles = topicTiles(entry.projects);
  return (
    <Link
      to={`/agora/topics/${encodeURIComponent(entry.topic.id)}`}
      className="flex w-[var(--size-agora-topic-width)] flex-col gap-[var(--space-padding-5)]"
    >
      <span className="relative grid h-[var(--size-agora-topic-height)] grid-cols-2 grid-rows-2 gap-[var(--space-agora-tile-gap)] overflow-hidden rounded-[var(--radius-agora-card)]">
        {tiles.covers.map((cover, index) => (
          <span key={index} className="relative">
            <AgoraImage path={cover} />
          </span>
        ))}
      </span>
      <span className="[font:var(--text-subtitle-st1-m)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]">
        {entry.topic.title}
      </span>
    </Link>
  );
}

/** 아고라 홈(1720:101534): Recommended Project · Rising Creator · Hot Topic. 게시물이 없으면 S-02. */
export function AgoraHomePage() {
  const home = useQuery({ queryKey: ['agora-home'], queryFn: api.getAgoraHome });

  const redirectTo = authRedirectTarget(home.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const data = home.data;
  return (
    <AgoraFrame busy={home.isPending}>
      <h1 className="sr-only">{COPY['HD-01']}</h1>
      {home.isError ? (
        <ErrorNotice message={COPY[errorCopyKey(home.error)]} onRetry={() => void home.refetch()} />
      ) : null}
      {data && isAgoraEmpty(data) ? (
        <p
          role="status"
          className="m-0 py-[var(--space-agora-section)] text-center text-[color:var(--color-font-sub-text)]"
        >
          {COPY['S-02']}
        </p>
      ) : null}
      {data && !isAgoraEmpty(data) ? (
        <div className="flex flex-col gap-[var(--space-agora-section)] pt-[var(--space-padding-8)]">
          {data.recommended.length > 0 ? (
            <Row id="agora-recommended" title={COPY['A-09']}>
              {data.recommended.map((card) => (
                <li key={card.id} className="shrink-0">
                  <RecommendedCard card={card} />
                </li>
              ))}
            </Row>
          ) : null}
          {data.risingCreators.length > 0 ? (
            <Row id="agora-rising" title={COPY['A-10']}>
              {data.risingCreators.map((creator) => (
                <li key={creator.id} className="shrink-0">
                  <CreatorPill creator={creator} />
                </li>
              ))}
            </Row>
          ) : null}
          {data.hotTopics.length > 0 ? (
            <Row id="agora-topics" title={COPY['A-01']}>
              {data.hotTopics.map((entry) => (
                <li key={entry.topic.id} className="shrink-0">
                  <TopicBundle entry={entry} />
                </li>
              ))}
            </Row>
          ) : null}
        </div>
      ) : null}
    </AgoraFrame>
  );
}
