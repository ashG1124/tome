import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice, useAgoraSearch } from '../../shared/ui';
import { filterTopicEntries } from './agora';
import { AgoraFrame, SearchStatus } from './AgoraFrame';
import { TopicBundle } from './TopicBundle';

/**
 * 핫토픽 전체 목록(Topic List 3190:179268): 393×308 묶음을 3열(간격 20)로 늘어놓는다.
 * Figma 에는 이 프레임 단독 배치만 있어 헤더 아래 위치는 홈 구역과 같게(왼쪽 18, 제목 y 124) 두고 제목 "Hot Topic" 을 붙였다.
 * 새 API 없이 아고라 홈 응답의 hotTopics 를 그대로 쓴다. 헤더 검색어가 있으면 거른다.
 */
export function TopicListPage() {
  const home = useQuery({ queryKey: ['agora-home'], queryFn: api.getAgoraHome });
  const search = useAgoraSearch();

  const redirectTo = authRedirectTarget(home.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const all = home.data?.hotTopics ?? [];
  const topics = filterTopicEntries(all, search);
  return (
    <AgoraFrame busy={home.isPending}>
      <div className="px-[var(--space-agora-content-x)] pt-[var(--space-padding-8)] pb-[var(--space-agora-bottom)]">
        <h1 className="m-0 pb-[var(--space-gap-4)] [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-strong)]">
          {COPY['A-01']}
        </h1>
        <SearchStatus search={search} count={topics.length} />
        {home.isError ? (
          <ErrorNotice
            message={COPY[errorCopyKey(home.error)]}
            onRetry={() => void home.refetch()}
          />
        ) : null}
        {home.data && all.length === 0 ? (
          <p role="status" className="m-0 text-center text-[color:var(--color-font-sub-text)]">
            {COPY['S-02']}
          </p>
        ) : null}
        {topics.length > 0 ? (
          <ul className="m-0 grid list-none grid-cols-[repeat(3,var(--size-agora-topic-width))] gap-[var(--grid-gutter)] p-0">
            {topics.map((entry) => (
              <li key={entry.topic.id}>
                <TopicBundle entry={entry} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AgoraFrame>
  );
}
