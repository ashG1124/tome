import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  UpdateVerificationResponseSchema,
  type Answer,
  type GetJobResponse,
  type UpdateVerificationRequest,
  type UpdateVerificationResponse,
  type Verification,
  type WorkspaceResponse,
} from '@tome/shared';
import { useSessionStore } from '../../../shared/api';
import { verificationNodes, withVerificationEnabled } from '../edit-model';
import { answerKey } from './useAnswerHistory';

export type UpdateVerificationApi = (
  answerId: string,
  body: UpdateVerificationRequest,
) => Promise<UpdateVerificationResponse>;

/**
 * 한 답변의 검증 결과를 캔버스가 읽는 캐시 전부에서 고친다.
 * 보이는 답변(canvas-answer) · 워크스페이스의 최신 답변 · 방금 끝난 생성 job 의 단계 결과(접힌 5단계 카드가 읽는다).
 */
export function updateVerificationCaches(
  client: QueryClient,
  target: { projectId: string; token: string | null; answerId: string },
  update: (verification: Verification) => Verification,
): void {
  const { projectId, token, answerId } = target;
  const apply = (answer: Answer): Answer => {
    if (answer.id !== answerId || !answer.verification) return answer;
    const verification = update(answer.verification);
    return verification === answer.verification ? answer : { ...answer, verification };
  };
  client.setQueryData<Answer>(answerKey(token, answerId), (answer) =>
    answer ? apply(answer) : answer,
  );
  client.setQueriesData<WorkspaceResponse>({ queryKey: ['workspace', projectId] }, (workspace) =>
    workspace
      ? {
          ...workspace,
          sets: workspace.sets.map((set) =>
            set.latestAnswer?.id === answerId
              ? { ...set, latestAnswer: apply(set.latestAnswer) }
              : set,
          ),
        }
      : workspace,
  );
  client.setQueriesData<GetJobResponse>({ queryKey: ['generation', projectId] }, (job) => {
    if (!job || !job.steps.some((step) => step.answer?.id === answerId)) return job;
    return {
      ...job,
      steps: job.steps.map((step) => ({
        ...step,
        ...(step.answer ? { answer: apply(step.answer) } : {}),
        ...(step.verification ? { verification: update(step.verification) } : {}),
      })),
    };
  });
}

/**
 * 5단계 검증 기준의 켜짐을 바로 저장한다(미리보기·새 버전이 아니다, F-004 검증 기록).
 * 화면을 먼저 바꾸고(낙관적), 실패하면 바꾸기 전 값으로 되돌린다. 저장하는 동안에는 다음 변경을 받지 않는다.
 * PATCH 는 같은 값을 다시 보내도 결과가 같아(자연 멱등) 서버가 멱등 키를 받지 않는다.
 */
export function useVerificationEditor(projectId: string, save: UpdateVerificationApi) {
  const client = useQueryClient();
  const token = useSessionStore((state) => state.token);
  const lock = useRef(false);
  const [saving, setSaving] = useState<{ answerId: string; ids: readonly string[] }>();
  const [error, setError] = useState<{ answerId: string; error: unknown }>();
  const latestSave = useRef(save);
  useLayoutEffect(() => {
    latestSave.current = save;
  }, [save]);

  const change = useCallback(
    async (answer: Answer, changes: readonly { id: string; enabled: boolean }[]) => {
      if (lock.current || changes.length === 0 || !answer.verification) return;
      const known = new Map(verificationNodes(answer.verification).map((node) => [node.id, node]));
      if (changes.some((entry) => !known.has(entry.id))) return;
      const target = { projectId, token, answerId: answer.id };
      const next = new Map(changes.map((entry) => [entry.id, entry.enabled]));
      const previous = new Map(changes.map((entry) => [entry.id, known.get(entry.id)!.enabled]));
      lock.current = true;
      setError(undefined);
      setSaving({ answerId: answer.id, ids: changes.map((entry) => entry.id) });
      updateVerificationCaches(client, target, (verification) =>
        withVerificationEnabled(verification, next),
      );
      try {
        const response = UpdateVerificationResponseSchema.parse(
          await latestSave.current(answer.id, {
            nodes: changes.map(({ id, enabled }) => ({ id, enabled })),
          }),
        );
        const saved = new Map(
          verificationNodes(response.verification).map((node) => [node.id, node.enabled]),
        );
        updateVerificationCaches(client, target, (verification) =>
          withVerificationEnabled(verification, saved),
        );
      } catch (caught) {
        updateVerificationCaches(client, target, (verification) =>
          withVerificationEnabled(verification, previous),
        );
        setError({ answerId: answer.id, error: caught });
      } finally {
        lock.current = false;
        setSaving(undefined);
      }
    },
    [client, projectId, token],
  );

  return {
    change,
    saving,
    error,
    clearError: useCallback(() => setError(undefined), []),
  };
}
