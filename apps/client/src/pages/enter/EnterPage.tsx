import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, errorCopyKey, NetworkError, setSession } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { Button, ErrorNotice, TitleInput } from '../../shared/ui';
import { StatusBanner } from './StatusBanner';

/** 첫 요청이 이 시간(ms)을 넘겨도 끝나지 않으면 상단 띠로 알린다. */
const SLOW_FIRST_REQUEST_MS = 1000;

export function EnterPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  // 화면이 다시 그려지기 전에 연달아 제출해도 요청이 한 번만 가도록 ref 로 막는다.
  const sending = useRef(false);
  const [firstSettled, setFirstSettled] = useState(false);
  const [firstSlow, setFirstSlow] = useState(false);

  const createSession = useMutation({
    mutationFn: (value: string) => api.createSession(value),
    onSuccess: (session) => {
      setSession(session.token, session.noticeVersion);
      void navigate(session.consentRequired ? '/consent' : '/', { replace: true });
    },
    onSettled: () => {
      sending.current = false;
      setFirstSettled(true);
    },
  });

  useEffect(() => {
    if (!createSession.isPending || firstSettled) return;
    const timer = setTimeout(() => setFirstSlow(true), SLOW_FIRST_REQUEST_MS);
    return () => clearTimeout(timer);
  }, [createSession.isPending, firstSettled]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed === '' || sending.current) return;
    sending.current = true;
    createSession.mutate(trimmed);
  };

  const connectionLost = createSession.error instanceof NetworkError;
  const wakingServer = firstSlow && createSession.isPending && !firstSettled;

  // 연결 끊김 띠가 떠 있는 동안 브라우저가 다시 연결되면 띠를 내린다.
  const { reset } = createSession;
  useEffect(() => {
    if (!connectionLost) return;
    const clear = () => reset();
    window.addEventListener('online', clear);
    return () => window.removeEventListener('online', clear);
  }, [connectionLost, reset]);

  return (
    <>
      {wakingServer ? <StatusBanner message={COPY['S-05']} /> : null}
      {connectionLost ? <StatusBanner message={COPY['E-03']} /> : null}
      <form onSubmit={submit} className="flex max-w-md flex-col gap-[var(--space-gap-5)]">
        <h1 className="m-0 [font:var(--text-heading-h1)] text-[color:var(--color-font-strong)]">
          {COPY['C-04']}
        </h1>
        <TitleInput
          aria-label={COPY['C-04']}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={createSession.isPending}
          autoComplete="off"
        />
        {createSession.isError && !connectionLost ? (
          <ErrorNotice message={COPY[errorCopyKey(createSession.error)]} />
        ) : null}
        <Button type="submit" busy={createSession.isPending} disabled={code.trim() === ''}>
          {COPY['C-05a']}
        </Button>
      </form>
    </>
  );
}
