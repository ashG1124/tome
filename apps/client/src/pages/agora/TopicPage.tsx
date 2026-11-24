import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice, useAgoraSearch } from '../../shared/ui';
import { filterTopicProjects, isTopicEmpty } from './agora';
import { AgoraFrame, SearchStatus } from './AgoraFrame';
import { ProjectTile } from './ProjectTile';

/**
 * 핫토픽(3099:130540): 가운데 "Hot Topic"과 주제 제목, 아래 3열(간격 20) 프로젝트 카드. 헤더에서는 Topic 탭 아래 화면이다.
 * 헤더 검색어가 있으면 이 주제의 프로젝트를 제목으로 거른다.
 */
export function TopicPage() {
  const { id = '' } = useParams();
  const topic = useQuery({ queryKey: ['agora-topic', id], queryFn: () => api.getTopic(id) });
  const search = useAgoraSearch();

  const redirectTo = authRedirectTarget(topic.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const empty = topic.data !== undefined && isTopicEmpty(topic.data);
  const projects = topic.data ? filterTopicProjects(topic.data, search.q) : [];
  return (
    <AgoraFrame busy={topic.isPending}>
      <div className="px-[var(--space-header-x)] pb-[var(--space-agora-topic-bottom)]">
        <div className="flex flex-col items-center gap-[var(--space-gap-4)] pt-[var(--space-agora-topic-title-top)] pb-[var(--space-agora-topic-title-bottom)] text-center">
          <p className="m-0 [font:var(--text-heading-h2)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)]">
            {COPY['A-01']}
          </p>
          <h1 className="m-0 [font:var(--text-agora-poppins-title)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]">
            {topic.data?.topic.title}
          </h1>
        </div>
        {topic.data ? <SearchStatus search={search} count={projects.length} /> : null}
        {topic.isError ? (
          <ErrorNotice
            message={COPY[errorCopyKey(topic.error)]}
            onRetry={() => void topic.refetch()}
          />
        ) : null}
        {empty ? (
          <p role="status" className="m-0 text-center text-[color:var(--color-font-sub-text)]">
            {COPY['S-02']}
          </p>
        ) : null}
        {topic.data && !empty ? (
          <ul className="m-0 grid list-none grid-cols-3 gap-[var(--grid-gutter)] p-0">
            {projects.map((card) => (
              <li key={card.id}>
                <ProjectTile card={card} variant="topic" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AgoraFrame>
  );
}
