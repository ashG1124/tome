import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { ErrorNotice } from '../../shared/ui';

export function WorkspacePage() {
  const { id = '' } = useParams();
  const workspace = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => api.getWorkspace(id),
  });

  const redirectTo = authRedirectTarget(workspace.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

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
    </section>
  );
}
