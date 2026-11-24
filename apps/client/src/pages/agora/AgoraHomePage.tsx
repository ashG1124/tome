import { useQuery } from '@tanstack/react-query';
import type { AgoraProjectCard } from '@tome/shared';
import type { ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice, legacyAgoraTabHref, useAgoraSearch } from '../../shared/ui';
import { agoraHomeResultCount, filterAgoraHome, isAgoraEmpty } from './agora';
import { AgoraFrame, SearchStatus } from './AgoraFrame';
import { AgoraImage } from './AgoraImage';
import { AgoraSection } from './AgoraSection';
import { AuthorAvatar } from './AuthorAvatar';
import { CreatorPill } from './CreatorPill';
import { TopicBundle } from './TopicBundle';

/**
 * 제목 아래 가로 한 줄(Content Feed 5170:135848). 줄은 왼쪽 18에서 시작해 화면 오른쪽 끝까지 가고,
 * 넘치는 카드는 줄 안에서 가로로 스크롤된다(시안처럼 오른쪽이 잘려 보이고 스크롤바는 그리지 않는다).
 * 줄 둘레의 작은 여백은 포커스 테두리가 잘리지 않게 하려는 것이고, 같은 크기의 음수 여백으로 위치를 되돌린다.
 */
function Row({
  id,
  title,
  gapClass,
  children,
}: {
  id: string;
  title: string;
  /** 카드 사이 간격 클래스 */
  gapClass: string;
  children: ReactNode;
}) {
  return (
    <AgoraSection id={id} title={title}>
      <ul
        className={[
          'm-0 -mt-[var(--space-padding-2)] -mb-[var(--space-padding-2)] -ml-[var(--space-padding-2)] flex list-none overflow-x-auto p-[var(--space-padding-2)]',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          gapClass,
        ].join(' ')}
      >
        {children}
      </ul>
    </AgoraSection>
  );
}

/** 추천 프로젝트 카드(Project Preview 3188:177923): 364×284 사진 전체, 아래 흰 제목, 오른쪽 아래 작성자 사진. */
function RecommendedCard({ card }: { card: AgoraProjectCard }) {
  return (
    <Link
      to={`/agora/projects/${encodeURIComponent(card.id)}`}
      className="relative isolate flex h-[var(--size-agora-recommended-height)] w-[var(--size-agora-recommended-width)] flex-col justify-end overflow-hidden rounded-[var(--radius-agora-card)] px-[var(--space-padding-6)] py-[var(--space-agora-recommended-y)]"
    >
      <AgoraImage path={card.coverThumbUrl} className="-z-20" />
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[image:var(--gradient-agora-recommended-shade)]"
      />
      <span className="flex items-end justify-between gap-[var(--space-padding-3)] text-[color:var(--color-font-on-fill)]">
        <span className="min-w-0 truncate [font:var(--text-subtitle-st1-sb)] tracking-[var(--letter-spacing-heading-h1)]">
          {card.title}
        </span>
        <AuthorAvatar
          creator={card.author}
          sizeClass="size-[var(--size-avatar-recommended)] border-[length:var(--stroke-weight-bold)] border-solid border-[color:var(--color-background-default)]"
        />
      </span>
    </Link>
  );
}

/**
 * 아고라 Project 탭 = 아고라 홈(Agora 5170:135845): Recommended Project · Rising Creator · Hot Topic. 게시물이 없으면 S-02.
 * 헤더 검색어(?q=…)가 있으면 이미 받은 데이터를 프로젝트 제목으로 거른다. 핫토픽 전체 목록은 헤더 Topic 탭이 맡는다.
 */
export function AgoraHomePage() {
  const home = useQuery({ queryKey: ['agora-home'], queryFn: api.getAgoraHome });
  const search = useAgoraSearch();
  const [params] = useSearchParams();

  // 예전 주소(?in=creator|topic)는 그 탭 화면으로 옮긴다.
  const legacy = legacyAgoraTabHref(params);
  if (legacy !== null) return <Navigate to={legacy} replace />;
  const redirectTo = authRedirectTarget(home.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const data = home.data;
  const shown = data ? filterAgoraHome(data, search.q) : undefined;
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
      {data && shown && !isAgoraEmpty(data) ? (
        <div className="flex flex-col gap-[var(--space-agora-feed-gap)] pt-[var(--space-padding-8)] pb-[var(--space-agora-bottom)]">
          <SearchStatus search={search} count={agoraHomeResultCount(shown)} />
          {shown.recommended.length > 0 ? (
            <Row
              id="agora-recommended"
              title={COPY['A-09']}
              gapClass="gap-[var(--space-agora-row-gap)]"
            >
              {shown.recommended.map((card) => (
                <li key={card.id} className="shrink-0">
                  <RecommendedCard card={card} />
                </li>
              ))}
            </Row>
          ) : null}
          {shown.risingCreators.length > 0 ? (
            <Row id="agora-rising" title={COPY['A-10']} gapClass="gap-[var(--space-agora-row-gap)]">
              {shown.risingCreators.map((creator) => (
                <li key={creator.id} className="shrink-0">
                  <CreatorPill creator={creator} />
                </li>
              ))}
            </Row>
          ) : null}
          {shown.hotTopics.length > 0 ? (
            <Row id="agora-topics" title={COPY['A-01']} gapClass="gap-[var(--grid-gutter)]">
              {shown.hotTopics.map((entry) => (
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
