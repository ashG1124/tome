import { useQuery } from '@tanstack/react-query';
import type { IdentityResponse } from '@tome/shared';
import { Navigate, useNavigate, useParams } from 'react-router';
import { api, ApiRequestError, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice } from '../../shared/ui';
import { ProfileView } from './ProfileView';

/** 남의 비공개 아이덴티티(403 IDENTITY_PRIVATE)는 오류 안내 대신 'private' 로 받아 좌표 자리에 P-20 을 보여 준다. */
async function identityOrPrivate(creatorId: string): Promise<IdentityResponse | 'private'> {
  try {
    return await api.getIdentity(creatorId);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'IDENTITY_PRIVATE') return 'private';
    throw error;
  }
}

/**
 * 프로필 화면 `/creators/:id`. 프로필·아이덴티티·Compare 를 받아 ProfileView 에 넘긴다.
 * 없는 사람(NOT_FOUND)이나 연결 실패는 오류 안내와 다시 시도. 세션이 끊기면 입장 화면으로 보낸다.
 */
export function ProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const profile = useQuery({ queryKey: ['creator', id], queryFn: () => api.getCreator(id) });
  const identity = useQuery({
    queryKey: ['creator', id, 'identity'],
    queryFn: () => identityOrPrivate(id),
  });
  const compare = useQuery({ queryKey: ['identity-compare'], queryFn: api.getCompare });

  const error = profile.error ?? identity.error ?? compare.error;
  const redirectTo = authRedirectTarget(error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const retry = () => {
    void profile.refetch();
    void identity.refetch();
    void compare.refetch();
  };

  const busy = profile.isPending || identity.isPending;
  return (
    <section aria-busy={busy || undefined} className="flex flex-col gap-[var(--space-gap-5)]">
      {profile.data ? <h1 className="sr-only">{profile.data.creator.displayName}</h1> : null}
      {error ? <ErrorNotice message={COPY[errorCopyKey(error)]} onRetry={retry} /> : null}
      {profile.data && identity.isSuccess ? (
        <ProfileView
          // 다른 사람 프로필로 옮겨 가면 탭을 처음(Work)부터 다시 보여 준다
          key={id}
          creator={profile.data.creator}
          works={profile.data.works}
          identity={identity.data === 'private' ? null : identity.data}
          identityPrivate={identity.data === 'private'}
          compare={compare.data ?? null}
          onSelectPartner={(creatorId) =>
            void navigate(`/creators/${encodeURIComponent(creatorId)}`)
          }
        />
      ) : null}
    </section>
  );
}
