import type { Id } from '@tome/shared';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice, Icon } from '../../shared/ui';

interface NewProjectCellProps {
  /** 프롬프트 없이 새 프로젝트를 만들고 그 id 를 돌려준다(공용 API createProject). */
  onCreate: () => Promise<Id>;
}

/**
 * 서가 첫 칸 "+ Project". 누르면 빈 새 프로젝트를 만들고 그 워크스페이스(새 프로젝트 첫 화면)로 간다.
 * 연달아 눌러도 한 번만 만든다. 실패하면 칸 아래에 오류 문장을 보여 준다.
 */
export function NewProjectCell({ onCreate }: NewProjectCellProps) {
  const navigate = useNavigate();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const create = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const id = await onCreate();
      void navigate(`/projects/${id}`);
    } catch (failure) {
      setError(failure);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-[var(--space-padding-3)]">
      <button
        type="button"
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => void create()}
        className={[
          'box-border flex flex-col items-center justify-center gap-[var(--space-gap-2)]',
          'h-[var(--size-shelf-card-height)] w-[var(--size-shelf-card-width)] rounded-[var(--radius-shelf-card)]',
          'border border-dashed border-[length:var(--stroke-weight-default)] border-[color:var(--color-border-input)]',
          'cursor-pointer bg-transparent [font:var(--text-body-b2-r)] text-[color:var(--color-font-helper-text)]',
          'disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <Icon name="add" />
        {COPY['H-01']}
      </button>
      {error !== null ? <ErrorNotice message={COPY[errorCopyKey(error)]} /> : null}
    </div>
  );
}
