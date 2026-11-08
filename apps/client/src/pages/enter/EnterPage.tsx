import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, errorCopyKey, setSession } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { Button, ErrorNotice, TitleInput } from '../../shared/ui';

export function EnterPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  const createSession = useMutation({
    mutationFn: (value: string) => api.createSession(value),
    onSuccess: (session) => {
      setSession(session.token, session.noticeVersion);
      void navigate(session.consentRequired ? '/consent' : '/', { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed === '' || createSession.isPending) return;
    createSession.mutate(trimmed);
  };

  return (
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
      {createSession.isError ? (
        <ErrorNotice message={COPY[errorCopyKey(createSession.error)]} />
      ) : null}
      <Button type="submit" busy={createSession.isPending} disabled={code.trim() === ''}>
        {COPY['C-05a']}
      </Button>
    </form>
  );
}
