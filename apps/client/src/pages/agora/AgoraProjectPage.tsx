import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { BusyMark, ErrorNotice } from '../../shared/ui';
import { deriveFailure, derivedFromView } from './agora';
import { AgoraFrame } from './AgoraFrame';
import { AgoraImage } from './AgoraImage';
import { AuthorAvatar } from './AuthorAvatar';
import { CommentsSection } from './CommentsSection';
import { ProjectTile } from './ProjectTile';

/**
 * 아고라 프로젝트 상세(3099:130760). 왼쪽 큰 그림·작성자·제목·Go to derive·댓글, 오른쪽 파생작 목록.
 * 열 때 한 번 조회를 센다. Go to derive 는 원작을 내 워크스페이스로 복사하고 그 워크스페이스로 간다.
 */
export function AgoraProjectPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ['agora-project', id],
    queryFn: () => api.getAgoraProject(id),
  });

  // 조회 집계는 열 때 한 번만(개발 모드의 두 번 실행도 막는다)
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (counted.current === id) return;
    counted.current = id;
    void api.recordAgoraView(id).catch(() => undefined);
  }, [id]);

  const derive = useMutation({
    mutationFn: () => api.deriveProject(id),
    onSuccess: ({ project }) => void navigate(`/projects/${encodeURIComponent(project.id)}`),
  });

  const redirectTo = authRedirectTarget(detail.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const data = detail.data;
  const source = data ? derivedFromView(data.derivedFrom) : null;
  const failure = derive.isError ? deriveFailure(derive.error) : null;

  return (
    <AgoraFrame busy={detail.isPending}>
      {detail.isError ? (
        <ErrorNotice
          message={COPY[errorCopyKey(detail.error)]}
          onRetry={() => void detail.refetch()}
        />
      ) : null}
      {data ? (
        <div className="flex items-start gap-[var(--space-agora-columns)]">
          <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-padding-8)]">
            <div
              data-testid="agora-hero"
              className="relative h-[var(--size-agora-hero-height)] overflow-hidden [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent),linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
            >
              <AgoraImage path={data.coverImageUrl} />
            </div>
            <p className="m-0 flex items-center gap-[var(--space-padding-3)] [font:var(--text-subtitle-st1-m)] text-[color:var(--color-font-strong)]">
              <AuthorAvatar creator={data.author} sizeClass="size-[var(--size-avatar-other)]" />
              {data.author.displayName}
            </p>
            <div className="flex items-end justify-between gap-[var(--space-gap-5)]">
              <div className="flex min-w-0 flex-col gap-[var(--space-padding-2)]">
                <h1 className="m-0 [font:var(--text-heading-t1)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-strong)]">
                  {data.project.title}
                </h1>
                {source?.kind === 'source' ? (
                  <p className="m-0 [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]">
                    {COPY['A-06']}{' '}
                    <Link to={`/agora/projects/${encodeURIComponent(source.projectId)}`}>
                      {source.title}
                    </Link>
                  </p>
                ) : null}
                {source?.kind === 'deleted' ? (
                  <p className="m-0 [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]">
                    {COPY['A-06']} {COPY['S-06']}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!derive.isPending) derive.mutate();
                }}
                disabled={derive.isPending}
                aria-busy={derive.isPending || undefined}
                className={[
                  'inline-flex h-[var(--size-derive-button-height)] shrink-0 cursor-pointer items-center gap-[var(--space-padding-3)]',
                  'rounded-[var(--radius-max)] border-0 bg-[color:var(--color-fill-brand)] px-[var(--space-padding-8)]',
                  '[font:var(--text-subtitle-st2-m)] tracking-[var(--letter-spacing-subtitle-st2)] text-[color:var(--color-font-strong)]',
                  'disabled:cursor-not-allowed disabled:bg-[color:var(--color-gray-20)] disabled:text-[color:var(--color-font-disable)]',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className="size-[var(--space-padding-4)] bg-current [clip-path:polygon(0_0,100%_50%,0_100%)]"
                />
                {COPY['A-05']}
                <BusyMark busy={derive.isPending} />
              </button>
            </div>
            {failure ? (
              <ErrorNotice
                message={COPY[failure.copy]}
                onRetry={failure.retry ? () => derive.mutate() : undefined}
              />
            ) : null}
            <CommentsSection projectId={data.project.id} count={data.commentCount} />
          </div>
          <aside
            aria-labelledby="agora-derivatives"
            className="flex w-[var(--size-agora-side)] shrink-0 flex-col gap-[var(--space-gap-5)]"
          >
            <h2
              id="agora-derivatives"
              className="m-0 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-strong)]"
            >
              {COPY['A-04']}
            </h2>
            {data.derivatives.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-[var(--grid-gutter)] p-0">
                {data.derivatives.map((card) => (
                  <li key={card.id}>
                    <ProjectTile card={card} variant="derivative" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[color:var(--color-font-sub-text)]">{COPY['S-02']}</p>
            )}
          </aside>
        </div>
      ) : null}
    </AgoraFrame>
  );
}
