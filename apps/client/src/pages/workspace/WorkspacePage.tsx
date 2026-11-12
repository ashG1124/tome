import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { ErrorNotice } from '../../shared/ui';
import { PromptBar } from './PromptBar';
import { promptBarInfo } from './prompt';

export function WorkspacePage() {
  const { id = '' } = useParams();
  const workspace = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => api.getWorkspace(id),
  });
  // 입력 중인 글은 페이지마다 화면에만 보존한다(새로고침 전까지).
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const redirectTo = authRedirectTarget(workspace.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const pageId = workspace.data?.currentPageId ?? '';
  const bar = workspace.data ? promptBarInfo(workspace.data) : null;

  return (
    <section
      aria-busy={workspace.isPending || undefined}
      className="flex flex-col gap-[var(--space-gap-5)]"
    >
      <Link to="/" className="text-[color:var(--color-font-sub-text)]">
        {SKELETON_COPY.backToHome}
      </Link>
      <h1 className="m-0 [font:var(--text-heading-h1)] text-[color:var(--color-font-strong)]">
        {workspace.data ? workspace.data.project.title : SKELETON_COPY.workspace}
      </h1>
      {workspace.isError ? (
        <ErrorNotice
          message={COPY[errorCopyKey(workspace.error)]}
          onRetry={() => void workspace.refetch()}
        />
      ) : null}
      {workspace.data ? (
        <p className="m-0 text-[color:var(--color-font-sub-text)]">
          {SKELETON_COPY.pages(workspace.data.pages.length)}
        </p>
      ) : null}
      {bar ? (
        <PromptBar
          state={bar.state}
          emptyPage={bar.emptyPage}
          value={drafts[pageId] ?? ''}
          onChange={(value) => setDrafts((all) => ({ ...all, [pageId]: value }))}
          // 세트 만들기(createSet)는 공용 API가 생기면 여기서 부른다(#57). 지금은 보내지 않는다.
          onSubmit={() => undefined}
        />
      ) : null}
    </section>
  );
}
