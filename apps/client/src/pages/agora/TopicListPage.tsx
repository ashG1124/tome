import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice } from '../../shared/ui';
import { AgoraFrame } from './AgoraFrame';
import { TopicBundle } from './TopicBundle';

/**
 * 핫토픽 전체 목록(Topic List 3190:179268): 모자이크와 제목 묶음을 3열로 늘어놓는다.
 * 새 API 없이 아고라 홈 응답의 hotTopics 를 그대로 쓴다. 홈 응답에 전체 주제 수는 없어서 받은 것만 보여 준다.
 */
export function TopicListPage() {
  const home = useQuery({ queryKey: ['agora-home'], queryFn: api.getAgoraHome });

  const redirectTo = authRedirectTarget(home.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const topics = home.data?.hotTopics ?? [];
  return (
    <AgoraFrame busy={home.isPending}>
      <h1 className="m-0 pt-[var(--space-padding-8)] pb-[var(--space-gap-5)] [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-strong)]">
        {COPY['A-01']}
      </h1>
      {home.isError ? (
        <ErrorNotice message={COPY[errorCopyKey(home.error)]} onRetry={() => void home.refetch()} />
      ) : null}
      {home.data && topics.length === 0 ? (
        <p role="status" className="m-0 text-center text-[color:var(--color-font-sub-text)]">
          {COPY['S-02']}
        </p>
      ) : null}
      {topics.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(3,var(--size-agora-topic-width))] gap-[var(--space-padding-7)] p-0">
          {topics.map((entry) => (
            <li key={entry.topic.id}>
              <TopicBundle entry={entry} />
            </li>
          ))}
        </ul>
      ) : null}
    </AgoraFrame>
  );
}
