import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey, useSessionStore } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { Button, Dialog, ErrorNotice } from '../../shared/ui';

export function ConsentPage() {
  const navigate = useNavigate();
  const noticeVersion = useSessionStore((state) => state.noticeVersion);
  // 화면이 다시 그려지기 전에 연달아 눌러도 요청이 한 번만 가도록 ref 로 막는다.
  const sending = useRef(false);

  const consent = useMutation({
    mutationFn: (version: string) => api.consent(version),
    onSuccess: () => {
      void navigate('/', { replace: true });
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const redirectTo = authRedirectTarget(consent.error);
  if (redirectTo === '/enter') return <Navigate to="/enter" replace />;

  return (
    <Dialog open dismissible={false} title={COPY['C-01']} description={COPY['C-02']}>
      <div className="mt-[var(--space-gap-5)] flex flex-col gap-[var(--space-gap-4)]">
        {consent.isError ? <ErrorNotice message={COPY[errorCopyKey(consent.error)]} /> : null}
        <Button
          busy={consent.isPending}
          disabled={noticeVersion === null}
          onClick={() => {
            if (noticeVersion === null || sending.current) return;
            sending.current = true;
            consent.mutate(noticeVersion);
          }}
        >
          {COPY['C-03']}
        </Button>
      </div>
    </Dialog>
  );
}
