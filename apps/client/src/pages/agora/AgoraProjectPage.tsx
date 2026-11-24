import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { BusyMark, ErrorNotice, Icon } from '../../shared/ui';
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
        <div className="-mt-[var(--space-agora-detail-overlap)] flex items-start gap-[var(--space-agora-detail-gap)] px-[var(--space-header-x)]">
          <div className="flex min-w-0 flex-1 flex-col gap-[var(--grid-gutter)] pb-[var(--space-agora-detail-bottom)]">
            {/* 큰 그림(3099:130761): 헤더 뒤까지 깔리고 가장자리가 흰색으로 사라진다. 아래 작가 줄은 그림 위에 겹쳐 놓인다. */}
            <div className="relative h-[var(--size-agora-detail-hero-space)]">
              <div
                data-testid="agora-hero"
                className="absolute -top-[var(--space-agora-detail-hero-top)] -left-[var(--space-header-x)] -z-10 h-[var(--size-agora-detail-hero-height)] w-[calc(100%+var(--space-header-x))] overflow-hidden"
              >
                <AgoraImage path={data.coverImageUrl} />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-[image:var(--gradient-agora-hero-fade)]"
                />
              </div>
            </div>
            <div className="-mt-[var(--grid-gutter)] flex items-end justify-between gap-[var(--space-gap-5)]">
              <div className="flex min-w-0 flex-col gap-[var(--space-gap-4)]">
                <div className="flex items-center gap-[var(--space-gap-4)]">
                  <AuthorAvatar
                    creator={data.author}
                    sizeClass="size-[var(--size-agora-detail-avatar)]"
                  />
                  <p className="m-0 [font:var(--text-heading-h2)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)]">
                    {data.author.displayName}
                  </p>
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
                <h1 className="m-0 [font:var(--text-agora-poppins-title)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]">
                  {data.project.title}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!derive.isPending) derive.mutate();
                }}
                disabled={derive.isPending}
                aria-busy={derive.isPending || undefined}
                className={[
                  'inline-flex h-[var(--size-derive-button-height-figma)] shrink-0 cursor-pointer items-center gap-[var(--space-gap-3)]',
                  'rounded-[var(--radius-derive-button)] border-0 bg-[color:var(--color-fill-brand)] py-[var(--space-derive-button-y)] pr-[var(--space-derive-button-right)] pl-[var(--space-derive-button-left)]',
                  '[font:var(--text-subtitle-st2-m)] tracking-[var(--letter-spacing-subtitle-st2)] text-[color:var(--color-font-main-text)]',
                  'disabled:cursor-not-allowed disabled:bg-[color:var(--color-gray-20)] disabled:text-[color:var(--color-font-disable)]',
                ].join(' ')}
              >
                <Icon name="go-to-derive-play" size={24} />
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
            className="flex w-[var(--size-agora-side)] shrink-0 flex-col gap-[var(--space-agora-derivative-title-gap)]"
          >
            <h2
              id="agora-derivatives"
              className="m-0 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-strong)]"
            >
              {COPY['A-04']}
            </h2>
            {data.derivatives.length > 0 ? (
              <ul className="m-0 -mx-[var(--space-padding-2)] -my-[var(--space-padding-2)] flex max-h-[calc(100dvh-var(--space-agora-derivative-list-top)-var(--space-agora-detail-bottom))] list-none flex-col gap-[var(--grid-gutter)] overflow-y-auto p-[var(--space-padding-2)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {data.derivatives.map((card) => (
                  <li key={card.id} className="shrink-0">
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
