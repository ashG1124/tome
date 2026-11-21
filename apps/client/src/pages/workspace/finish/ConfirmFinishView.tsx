import { COPY, SKELETON_COPY } from '../../../shared/copy';
import { ErrorNotice } from '../../../shared/ui';
import { DialogButton } from './DialogButton';
import type { ConfirmPhase, FormFailure } from './useFinishRequest';

interface ConfirmFinishViewProps {
  phase: ConfirmPhase;
  failure: FormFailure | null;
  /** Cancel: 입력 화면으로 돌아간다(입력은 그대로) */
  onCancel: () => void;
  /** Done: 완료를 보낸다 */
  onDone: () => void;
  /** 완료가 실패했을 때 Retry */
  onRetryFinish: () => void;
  /** 게시만 실패했을 때 Retry(게시만 다시) */
  onRetryPost: () => void;
  /** 게시 실패 뒤 Done: 완료한 것으로 넘어간다 */
  onLeave: () => void;
}

/**
 * 완료 확인 창의 내용. 시안처럼 확인 창이 뜨면 입력 화면 대신 이것만 보인다.
 * 보내는 동안은 화면 낭독기가 읽도록 role="status" 에 처리 중 문구를 넣는다.
 * 게시만 실패하면 완료는 그대로 두고 E-05 와 Retry 를 보여 주고, Cancel 은 숨긴다.
 */
export function ConfirmFinishView({
  phase,
  failure,
  onCancel,
  onDone,
  onRetryFinish,
  onRetryPost,
  onLeave,
}: ConfirmFinishViewProps) {
  const busy = phase === 'sending';
  const postFailed = phase === 'post-failed';
  return (
    <>
      {/* 낭독 영역은 처음부터 있어야 글이 바뀔 때 읽힌다. 문구 ID가 생기면 Loading… 대신 그 문구로 바꾼다. */}
      <p role="status" className="sr-only">
        {busy ? SKELETON_COPY.loading : ''}
      </p>
      {postFailed ? (
        <div className="flex justify-center">
          <ErrorNotice message={COPY['E-05']} onRetry={onRetryPost} />
        </div>
      ) : null}
      {failure !== null ? (
        <div className="flex justify-center">
          <ErrorNotice
            message={COPY[failure.copy]}
            onRetry={failure.retry ? onRetryFinish : undefined}
          />
        </div>
      ) : null}
      <div className="flex items-center justify-center gap-[var(--space-padding-4)]">
        {postFailed ? null : (
          <DialogButton variant="secondary" onClick={onCancel} disabled={busy}>
            {COPY['D-09a']}
          </DialogButton>
        )}
        <DialogButton variant="primary" busy={busy} onClick={postFailed ? onLeave : onDone}>
          {COPY['D-09b']}
        </DialogButton>
      </div>
    </>
  );
}
