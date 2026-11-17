import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { ErrorNotice, Icon } from '../../shared/ui';

export function HomePage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });

  const redirectTo = authRedirectTarget(projects.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <section
      aria-busy={projects.isPending || undefined}
      className="flex flex-col gap-[var(--space-gap-5)]"
    >
      <h1 className="m-0 [font:var(--text-heading-h1)] text-[color:var(--color-font-strong)]">
        {SKELETON_COPY.home}
      </h1>
      {projects.isError ? (
        <ErrorNotice
          message={COPY[errorCopyKey(projects.error)]}
          onRetry={() => void projects.refetch()}
        />
      ) : null}
      {projects.data && projects.data.projects.length === 0 ? (
        <div className="flex flex-col items-center gap-[var(--space-gap-4)] text-[color:var(--color-font-helper-text)]">
          <Icon name="graphic-tome-home" size={32} />
          <p className="m-0 [font:var(--text-body-b1-m)] text-[color:var(--color-font-sub-text)]">
            {COPY['S-01']}
          </p>
        </div>
      ) : null}
      {projects.data && projects.data.projects.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-[var(--space-gap-4)] p-0">
          {projects.data.projects.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}`}
                className="text-[color:var(--color-font-main-text)] [font:var(--text-subtitle-st2-m)]"
              >
                {project.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
