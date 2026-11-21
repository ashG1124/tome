import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice } from '../../shared/ui';
import { isTopicEmpty } from './agora';
import { AgoraFrame } from './AgoraFrame';
import { ProjectTile } from './ProjectTile';

/** 핫토픽 목록(3099:130540): 가운데 "Hot Topic"과 주제 제목, 아래 3열 프로젝트 카드. */
export function TopicPage() {
  const { id = '' } = useParams();
  const topic = useQuery({ queryKey: ['agora-topic', id], queryFn: () => api.getTopic(id) });

  const redirectTo = authRedirectTarget(topic.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const empty = topic.data !== undefined && isTopicEmpty(topic.data);
  return (
    <AgoraFrame busy={topic.isPending}>
      <div className="flex flex-col items-center gap-[var(--space-padding-3)] py-[var(--space-agora-section)] text-center">
        <p className="m-0 [font:var(--text-subtitle-st1-m)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]">
          {COPY['A-01']}
        </p>
        <h1 className="m-0 [font:var(--text-heading-t1)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]">
          {topic.data?.topic.title}
        </h1>
      </div>
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
          {topic.data.projects.map((card) => (
            <li key={card.id}>
              <ProjectTile card={card} variant="topic" />
            </li>
          ))}
        </ul>
      ) : null}
    </AgoraFrame>
  );
}
