import { useQuery } from '@tanstack/react-query';
import type { CreatorSummary } from '@tome/shared';
import { Navigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice, useAgoraSearch } from '../../shared/ui';
import { filterCreators, isCreatorsEmpty } from './agora';
import { AgoraFrame, SearchStatus } from './AgoraFrame';
import { AgoraSection } from './AgoraSection';
import { CreatorPill } from './CreatorPill';

/**
 * 창작자 칸 목록. Figma 에 이 화면 프레임이 없어, 같은 알약(Creator 3190:178168)을 Agora Example 의
 * Creator List(3190:179201)처럼 여러 줄로 늘어놓는다: 칸 293 + 간격 16(가로·세로) = 칸 간격 309(시안 308.75),
 * 화면 폭만큼 칸이 는다(1536 은 4칸, 1728 은 5칸, 1920 은 6칸). 알약은 칸 왼쪽에 붙고, 칸보다 길면 말줄임한다.
 */
function CreatorGrid({
  id,
  title,
  creators,
}: {
  id: string;
  title: string;
  creators: readonly CreatorSummary[];
}) {
  return (
    <AgoraSection id={id} title={title}>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,var(--size-agora-creator-column))] gap-[var(--space-agora-row-gap)] p-0 pr-[var(--space-agora-content-x)]">
        {creators.map((creator) => (
          <li key={creator.id} className="flex min-w-0">
            <CreatorPill creator={creator} />
          </li>
        ))}
      </ul>
    </AgoraSection>
  );
}

/**
 * 아고라 Creator 탭(/agora/creators, #214): 창작자만 모은 화면. Rising Creator(점수 순)와 New Creator(첫 공개 게시가 최근인 순).
 * Figma 프레임이 없는 화면이라 아고라 홈과 같은 자리·글자·간격(제목 y 124, 구역 사이 50, 제목과 목록 사이 12)을 쓴다.
 * 헤더 검색어(?q=…)가 있으면 창작자 이름으로 거른다. 공개 프로젝트가 있는 창작자가 없으면 S-02.
 */
export function AgoraCreatorsPage() {
  const home = useQuery({ queryKey: ['agora-home'], queryFn: api.getAgoraHome });
  const search = useAgoraSearch();

  const redirectTo = authRedirectTarget(home.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const data = home.data;
  const rising = data ? filterCreators(data.risingCreators, search.q) : [];
  const fresh = data ? filterCreators(data.newCreators, search.q) : [];
  return (
    <AgoraFrame busy={home.isPending}>
      <h1 className="sr-only">{COPY['AGS-05']}</h1>
      {home.isError ? (
        <ErrorNotice message={COPY[errorCopyKey(home.error)]} onRetry={() => void home.refetch()} />
      ) : null}
      {data && isCreatorsEmpty(data) ? (
        <p
          role="status"
          className="m-0 py-[var(--space-agora-section)] text-center text-[color:var(--color-font-sub-text)]"
        >
          {COPY['S-02']}
        </p>
      ) : null}
      {data && !isCreatorsEmpty(data) ? (
        <div className="flex flex-col gap-[var(--space-agora-feed-gap)] pt-[var(--space-padding-8)] pb-[var(--space-agora-bottom)]">
          <SearchStatus search={search} count={rising.length + fresh.length} />
          {rising.length > 0 ? (
            <CreatorGrid id="agora-creators-rising" title={COPY['A-10']} creators={rising} />
          ) : null}
          {fresh.length > 0 ? (
            <CreatorGrid id="agora-creators-new" title={COPY['AT-01']} creators={fresh} />
          ) : null}
        </div>
      ) : null}
    </AgoraFrame>
  );
}
