import * as RadixDialog from '@radix-ui/react-dialog';
import type { ProjectSummary } from '@tome/shared';
import { useRef, useState } from 'react';
import { api, ApiRequestError, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { BusyMark, ErrorNotice } from '../../shared/ui';

interface DeleteProjectDialogProps {
  /** 지울지 묻는 프로젝트. null 이면 닫혀 있다. */
  project: ProjectSummary | null;
  /** Cancel·Esc·바깥 클릭으로 닫을 때. */
  onCancel: () => void;
  /** 서버에서 지운 뒤(이미 지워져 404 인 경우 포함). 창은 쓰는 쪽이 닫는다. */
  onDeleted: (project: ProjectSummary) => void;
  /** 창이 닫힌 뒤 포커스를 둘 곳을 정한다(Radix 기본 동작 대신). */
  onCloseAutoFocus: (event: Event) => void;
}

const BUTTON = [
  'box-border inline-flex w-[var(--size-dialog-button)] cursor-pointer items-center justify-center',
  'gap-[var(--space-padding-3)] rounded-[var(--radius-max)] border border-solid border-transparent',
  'px-[var(--space-padding-7)] py-[calc(var(--space-padding-3)-var(--stroke-weight-light))]',
  '[font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)]',
  'disabled:cursor-not-allowed disabled:bg-[color:var(--color-gray-20)]',
  'disabled:border-[color:var(--color-border-default)] disabled:text-[color:var(--color-font-disable)]',
].join(' ');

/**
 * 서가 프로젝트 지우기 확인 창(#254). 모양은 완료 확인 창(좁은 창, Yellow Dim 배경)과 같다.
 * 열리면 Cancel 에 포커스가 간다(실수로 Enter 를 눌러도 지우지 않게). Delete 를 누르면 응답이 올 때까지
 * 두 버튼을 잠그고 창도 닫히지 않는다. 실패하면 창 안에 오류 문장(role=alert)을 띄우고 창은 그대로 둔다.
 */
export function DeleteProjectDialog({
  project,
  onCancel,
  onDeleted,
  onCloseAutoFocus,
}: DeleteProjectDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [asked, setAsked] = useState(project);
  if (project !== asked) {
    // 다른 프로젝트를 물으면 전 오류는 지운다.
    setAsked(project);
    setError(null);
  }

  const confirm = async () => {
    if (project === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProject(project.id);
    } catch (failure) {
      // 이미 지워진 프로젝트(다른 탭에서 지움)는 지운 것과 같다.
      if (!(failure instanceof ApiRequestError && failure.code === 'NOT_FOUND')) {
        setBusy(false);
        setError(failure);
        return;
      }
    }
    setBusy(false);
    onDeleted(project);
  };

  const title = project?.title ?? '';
  return (
    <RadixDialog.Root
      open={project !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={[
            'fixed inset-0 z-40 grid place-items-center overflow-y-auto p-[var(--space-padding-8)]',
            'backdrop-blur-[var(--blur-dim)]',
            'bg-[linear-gradient(to_top,var(--color-dim-from)_27.13%,var(--color-dim-to)_87.87%)]',
          ].join(' ')}
        >
          <RadixDialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancel.current?.focus();
            }}
            onCloseAutoFocus={onCloseAutoFocus}
            className={[
              'relative box-content w-[var(--size-dialog-width)] max-w-[calc(100vw-4*var(--space-padding-8))]',
              'flex flex-col gap-[var(--space-padding-8)] text-center',
              'rounded-[var(--radius-dialog)] bg-[color:var(--color-background-default)] shadow-[var(--shadow-floating)]',
              'px-[var(--space-padding-8)] pt-[var(--space-padding-7)] pb-[var(--space-padding-8)]',
            ].join(' ')}
          >
            <div className="flex flex-col gap-[var(--space-padding-2)]">
              <RadixDialog.Title className="m-0 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] break-words text-[color:var(--color-font-main-text)]">
                {COPY['H-08'].replace('{title}', title)}
              </RadixDialog.Title>
              <RadixDialog.Description className="m-0 [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]">
                {COPY['H-09']}
              </RadixDialog.Description>
            </div>
            {error !== null ? (
              <div className="flex justify-center">
                <ErrorNotice message={COPY[errorCopyKey(error)]} />
              </div>
            ) : null}
            <div className="flex items-center justify-center gap-[var(--space-padding-4)]">
              <button
                ref={cancel}
                type="button"
                disabled={busy}
                onClick={onCancel}
                className={`${BUTTON} bg-[color:var(--color-shadow-weak)] text-[color:var(--color-font-main-text)]`}
              >
                {COPY['D-09a']}
              </button>
              <button
                type="button"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => void confirm()}
                className={`${BUTTON} bg-[color:var(--color-fill-neutral)] text-[color:var(--color-font-on-fill)]`}
              >
                {COPY['S-07b']}
                <BusyMark busy={busy} />
              </button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
