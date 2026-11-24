import { LIMITS, type AnswerSummary, type FinishProjectRequest, type Id } from '@tome/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { errorCopyKey } from '../../../shared/api';
import { COPY } from '../../../shared/copy';
import { ErrorNotice, Switch, TitleInput } from '../../../shared/ui';
import { ConfirmFinishView } from './ConfirmFinishView';
import { DialogButton } from './DialogButton';
import { checkFinishForm, pickCover, type FinishSteps } from './finish';
import { FinishDialogFrame } from './FinishDialogFrame';
import { useFinishRequest } from './useFinishRequest';
import { VersionPicker } from './VersionPicker';

const FIELD_LABEL = [
  'm-0 p-0 [font:var(--text-subtitle-st2-m)] tracking-[var(--letter-spacing-subtitle-st2)]',
  'text-[color:var(--color-font-sub-text)]',
].join(' ');

function focusById(id: string) {
  document.getElementById(id)?.focus();
}

/** 화면이 바뀐 뒤 포커스를 둘 곳: 확인 창 제목 / 제목 입력칸 / Next 버튼 */
type FocusTarget = 'heading' | 'title' | 'next';

interface FinishModalProps {
  open: boolean;
  /** Skip·X·Esc 로 닫으면 false. 닫기만 하고 아무것도 바꾸지 않는다. */
  onOpenChange: (open: boolean) => void;
  /** 대표 버전 후보. undefined 면 아직 불러오는 중 */
  candidates: readonly AnswerSummary[] | undefined;
  /** 후보를 못 불러왔을 때의 오류. 있으면 오류 안내와 다시 시도를 보여 준다 */
  candidatesError?: unknown;
  onRetryCandidates?: () => void;
  steps: FinishSteps;
  /** 완료가 끝난 뒤(결과 크게 보기·홈으로 이동·플래시 등은 부모가 한다). coverAnswerId 는 완료한 대표 버전 */
  onFinished: (result: 'finished' | 'posted', coverAnswerId: Id) => void;
  /** 모달이 닫힐 때 포커스를 돌려줄 곳(워크스페이스의 끝내기 버튼 등) */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * 완료 모달. 시안 순서대로 제목 → 대표 버전 → 이유 → 게시 스위치, 아래에 Skip·Next.
 * Next 는 입력을 검사한 뒤 같은 창을 확인 화면으로 바꾼다(시안처럼 확인 창만 보인다).
 * 확인 화면에서 Cancel·X·Esc 는 입력 화면으로 돌아가고, 입력은 그대로 남는다.
 */
export function FinishModal({
  open,
  onOpenChange,
  candidates,
  candidatesError = null,
  onRetryCandidates,
  steps,
  onFinished,
  onCloseAutoFocus,
}: FinishModalProps) {
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [cover, setCover] = useState<Id | null>(null);
  const [post, setPost] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [request, setRequest] = useState<FinishProjectRequest | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterSwitch = useRef<FocusTarget | null>(null);
  const titleId = useId();
  const titleErrorId = useId();
  const reasonId = useId();
  const postLabelId = useId();
  const guardId = useId();

  const coverId = pickCover(candidates ?? [], cover);
  const loading = candidates === undefined;
  const noVersions = candidates !== undefined && candidates.length === 0;
  const confirming = request !== null;

  const confirm = useFinishRequest(steps, {
    onFinished: (result, coverAnswerId) => {
      setRequest(null);
      onFinished(result, coverAnswerId);
    },
    onTitleRejected: () => {
      focusAfterSwitch.current = 'title';
      setTitleError(true);
      setRequest(null);
    },
  });

  // 입력 화면 ↔ 확인 화면이 바뀐 뒤 포커스를 옮긴다. 바뀌기 전 포커스가 있던 버튼은 사라지기 때문이다.
  useEffect(() => {
    const target = focusAfterSwitch.current;
    if (target === null) return;
    focusAfterSwitch.current = null;
    if (target === 'heading') heading.current?.focus();
    else if (target === 'title') focusById(titleId);
    else nextButton.current?.focus();
  }, [confirming, titleId]);

  const next = (event: FormEvent) => {
    event.preventDefault();
    const check = checkFinishForm({ title, coverAnswerId: coverId, reason });
    if (check.ok) {
      confirm.reset();
      focusAfterSwitch.current = 'heading';
      setRequest(check.request);
      return;
    }
    if (check.error === 'E-04') {
      setTitleError(true);
      focusById(titleId);
    }
  };

  const backToForm = () => {
    focusAfterSwitch.current = 'next';
    setRequest(null);
  };

  const leaveFinished = () => {
    // 게시만 실패한 뒤 Done: 완료한 것으로 넘어간다. 대표 버전은 확인 화면에서 보낸 값이다.
    const finishedCover = request?.coverAnswerId ?? coverId;
    setRequest(null);
    if (finishedCover !== null) onFinished('finished', finishedCover);
  };

  // X·Esc·바깥 클릭: 입력 화면이면 닫기, 확인 화면이면 입력 화면으로, 게시만 실패한 뒤면 완료로 넘어가기.
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    if (!confirming) onOpenChange(false);
    else if (confirm.phase === 'post-failed') leaveFinished();
    else backToForm();
  };

  return (
    <FinishDialogFrame
      open={open}
      onOpenChange={handleOpenChange}
      title={confirming ? COPY['D-08a'] : COPY['D-01']}
      description={confirming ? COPY['D-08b'] : COPY['D-02']}
      size={confirming ? 'narrow' : 'wide'}
      dismissible={confirm.phase !== 'sending'}
      titleRef={heading}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        focusById(titleId);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {request !== null ? (
        <ConfirmFinishView
          phase={confirm.phase}
          failure={confirm.failure}
          onCancel={backToForm}
          onDone={() => void confirm.finish(request, post)}
          onRetryFinish={() => void confirm.finish(request, post)}
          onRetryPost={() => void confirm.retryPost(request.coverAnswerId)}
          onLeave={leaveFinished}
        />
      ) : (
        <form noValidate onSubmit={next} className="flex flex-col gap-[var(--space-padding-8)]">
          <div className="flex flex-col gap-[var(--space-gap-field)]">
            <div className="flex flex-col gap-[var(--space-padding-3)]">
              <label htmlFor={titleId} className={FIELD_LABEL}>
                {COPY['D-03a']}
              </label>
              <TitleInput
                look="modal"
                id={titleId}
                aria-label={COPY['D-03a']}
                aria-invalid={titleError || undefined}
                aria-describedby={titleError ? titleErrorId : undefined}
                placeholder={COPY['D-03b']}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (event.target.value.trim() !== '') setTitleError(false);
                }}
                autoComplete="off"
              />
              {titleError ? (
                <div id={titleErrorId}>
                  <ErrorNotice message={COPY['E-04']} />
                </div>
              ) : null}
            </div>
            <VersionPicker candidates={candidates} value={coverId} onChange={setCover} />
            {candidatesError !== null && candidatesError !== undefined ? (
              <ErrorNotice
                message={COPY[errorCopyKey(candidatesError)]}
                onRetry={onRetryCandidates}
              />
            ) : null}
            <div className="flex flex-col gap-[var(--space-padding-3)]">
              <label htmlFor={reasonId} className={FIELD_LABEL}>
                {COPY['D-05a']}
              </label>
              <TitleInput
                look="modal"
                id={reasonId}
                aria-label={COPY['D-05a']}
                placeholder={COPY['D-05b']}
                maxLength={LIMITS.REASON_MAX}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-[var(--space-gap-5)]">
            <span id={postLabelId} className={FIELD_LABEL}>
              {COPY['D-06']}
            </span>
            <Switch checked={post} onCheckedChange={setPost} aria-labelledby={postLabelId} />
          </div>
          {noVersions ? (
            <p
              id={guardId}
              className="m-0 [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]"
            >
              {COPY.G1}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-[var(--space-padding-4)]">
            <DialogButton variant="secondary" onClick={() => onOpenChange(false)}>
              {COPY['D-07a']}
            </DialogButton>
            <DialogButton
              ref={nextButton}
              variant="primary"
              type="submit"
              disabled={loading || noVersions}
              aria-describedby={noVersions ? guardId : undefined}
            >
              {COPY['D-07b']}
            </DialogButton>
          </div>
        </form>
      )}
    </FinishDialogFrame>
  );
}
