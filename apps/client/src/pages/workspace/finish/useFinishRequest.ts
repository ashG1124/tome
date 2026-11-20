import type { FinishProjectRequest, Id } from '@tome/shared';
import { useCallback, useRef, useState } from 'react';
import {
  finishFailure,
  finishThenPost,
  tryPost,
  type FinishFailure,
  type FinishSteps,
} from './finish';

/** idle = 기다리는 중, sending = 보내는 중, post-failed = 완료는 됐고 게시만 실패 */
export type ConfirmPhase = 'idle' | 'sending' | 'post-failed';

/** 확인 창 안에 보여 줄 실패(제목 오류 E-04 는 입력 화면이 맡는다) */
export type FormFailure = Extract<FinishFailure, { place: 'form' }>;

interface FinishHandlers {
  /** 완료가 끝난 뒤. 게시까지 됐으면 'posted', 게시를 안 했으면 'finished'. coverAnswerId 는 완료한 대표 버전 */
  onFinished: (result: 'finished' | 'posted', coverAnswerId: Id) => void;
  /** 서버가 제목을 거절했을 때(E-04) */
  onTitleRejected: () => void;
}

/**
 * 확인 창의 Done·Retry 처리. 완료 → (게시를 켰으면) 게시 순서로 보내고, 연달아 눌러도 한 번만 보낸다.
 * 게시만 실패하면 'post-failed' 로 두고, Retry 는 게시만 다시 보낸다.
 */
export function useFinishRequest(
  steps: FinishSteps,
  { onFinished, onTitleRejected }: FinishHandlers,
) {
  const [phase, setPhase] = useState<ConfirmPhase>('idle');
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const sending = useRef(false);

  /** 확인 창을 새로 열 때 지난 결과를 지운다. */
  const reset = useCallback(() => {
    setPhase('idle');
    setFailure(null);
  }, []);

  const finish = async (request: FinishProjectRequest, post: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setPhase('sending');
    setFailure(null);
    try {
      const result = await finishThenPost(steps, request, post);
      if (result === 'post-failed') {
        setPhase('post-failed');
        return;
      }
      setPhase('idle');
      onFinished(result, request.coverAnswerId);
    } catch (error) {
      setPhase('idle');
      const next = finishFailure(error);
      if (next.place === 'title') onTitleRejected();
      else setFailure(next);
    } finally {
      sending.current = false;
    }
  };

  const retryPost = async (coverAnswerId: Id) => {
    if (sending.current) return;
    sending.current = true;
    setPhase('sending');
    try {
      if (await tryPost(steps.post)) {
        setPhase('idle');
        onFinished('posted', coverAnswerId);
      } else {
        setPhase('post-failed');
      }
    } finally {
      sending.current = false;
    }
  };

  return { phase, failure, finish, retryPost, reset };
}
