import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  AcceptAnswerResponse,
  Answer,
  GetJobResponse,
  NodeSnapshot,
  WorkspaceResponse,
} from '@tome/shared';
import { Navigate } from 'react-router';
import { CANVAS_COPY, COPY, NODE_EDITOR_COPY, CANVAS_HISTORY_COPY } from '../../shared/copy';
import { CANVAS_GEOMETRY_TOKENS } from '../../shared/tokens';
import { api, ApiRequestError, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { ErrorNotice, Flash, FLASH_MS } from '../../shared/ui';
import { useGeneration } from './hooks/useGeneration';
import { VISIBLE_STAGES, visibleStage, type CanvasGeometry, type DerivePreview } from './model';
import { GenerationCanvas } from './components/GenerationCanvas';
import { NodeEditPanel, type NodeEditorLabels } from './components/NodeEditPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { createEditorRequests, useNodeEditor } from './hooks/useNodeEditor';
import {
  SNAP_KINDS,
  canOpenNode,
  isVerificationNode,
  restoreCriteria,
  verificationNodes,
} from './edit-model';
import { VerificationPanel } from './components/VerificationPanel';
import { useVerificationEditor, type UpdateVerificationApi } from './hooks/useVerificationEditor';
import { NodeComments, type NodeCommentLabels } from './components/NodeComments';
import type { AnswerVersionLabels } from './components/AnswerVersions';
import { useAnswerHistory, type AnswerHistoryApi } from './hooks/useAnswerHistory';
import type { NodeCommentsApi } from './hooks/useNodeComments';
import type { CanvasRemixOptions } from './remix-model';
import { applyConnection } from './connection-apply';
import { useConnectionApply, type PendingConnectionApply } from './hooks/useConnectionApply';
import './history.css';

/** 시안 전체 화면 수치(#185-W). 기본 지오메트리 토큰 위에 덮어쓴다. */
const FIGMA_GEOMETRY_TOKENS = {
  columnGap: '--canvas-figma-column-gap',
  promptGap: '--canvas-figma-prompt-gap',
  promptWidth: '--canvas-prompt-width',
  answerGap: '--canvas-figma-answer-gap',
  answerWidth: '--canvas-figma-answer-width',
} as const;

const HISTORY_API: AnswerHistoryApi & NodeCommentsApi = {
  getAnswer: api.getAnswer,
  setPinned: async (id, pinned) => {
    await api.pinAnswer(id, pinned);
  },
  listComments: async (id) => (await api.listNodeComments(id)).comments,
  addComment: async (id, body, key) => (await api.createNodeComment(id, body, key)).comment,
  deleteComment: api.deleteNodeComment,
};

export interface CanvasHistoryOptions {
  api?: AnswerHistoryApi & NodeCommentsApi;
  labels?: { versions: AnswerVersionLabels; comments: NodeCommentLabels };
}

export interface CanvasEditorOptions {
  labels?: Partial<
    NodeEditorLabels & { preview: string; apply: string; waiting: string; ready: string }
  >;
  requestPreview?: (
    setId: string,
    baseAnswerId: string,
    nodes: NodeSnapshot,
    signal: AbortSignal,
  ) => Promise<Answer>;
  acceptPreview?: (answerId: string) => Promise<AcceptAnswerResponse>;
  renderImage?: (answer: Answer) => ReactNode;
  onAccepted?: (answer: Answer) => void;
  /** 5단계 검증 기준 켜짐 저장(검증 기록). 없으면 api.updateVerification */
  updateVerification?: UpdateVerificationApi;
}

export interface WorkspaceCanvasProps {
  projectId: string;
  pageId: string;
  workspace: WorkspaceResponse;
  /** 답변(그림) 카드를 누르면 크게 보기(Download) 모달을 연다(#230). 없으면 답변 카드는 눌러도 아무 일이 없다. */
  onOpenResult?: (answer: Answer) => void;
  editor?: CanvasEditorOptions | false;
  history?: CanvasHistoryOptions | false;
  remix?: CanvasRemixOptions;
}

/** 펼침·접힘 애니메이션 시간(ms). 토큰 --motion-expand 를 읽고, 움직임 줄이기 설정이면 0 이다. */
function expandDuration(): number {
  if (typeof window === 'undefined') return 0;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--motion-expand');
  return Number.parseFloat(value) || 0;
}

function EditorSession({
  base,
  nodeId,
  slot,
  options,
  onClose,
  onComment,
  onDraft,
  onPreview,
  onApplyingChange,
  previewOpen,
  onPreviewOpenChange,
  onPreviewAutoOpen,
  closing = false,
  appliedIds,
  pendingApply,
  onPendingApplied,
}: {
  base: Answer;
  /** 지금 펼친 노드. 노드를 접어도 세션(고친 값·미리보기)은 남는다. */
  nodeId?: string;
  /** 펼친 노드 카드 안의 자리. 편집 화면을 여기에 그린다. */
  slot: HTMLElement | null;
  options: CanvasEditorOptions;
  onClose: () => void;
  onComment?: () => void;
  /** 고친 값(아직 Apply 전)을 캔버스의 접힌 노드에도 보이게 알린다. */
  onDraft: (draft: { setId: string; nodes: NodeSnapshot['nodes'] } | undefined) => void;
  /** 만드는 중(answer 없음)·다 만든 미리보기. 없으면 undefined */
  onPreview: (preview: DerivePreview | undefined) => void;
  onApplyingChange: (value: boolean) => void;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  /** 미리보기가 만들어질 때 Preview 를 연다. 사용자가 닫아 둔 상태면 열지 않는다. */
  onPreviewAutoOpen: () => void;
  /** 펼친 노드가 접히는 중 */
  closing?: boolean;
  /** 리믹스 Connection Apply(#151): revise 에 실을 id 와, 노드 값에 반영할 Apply 한 건 */
  appliedIds: () => readonly string[];
  pendingApply?: PendingConnectionApply;
  onPendingApplied: () => void;
}) {
  const labels = { ...NODE_EDITOR_COPY, ...options.labels };
  const client = useQueryClient();
  const [requests] = useState(() => createEditorRequests(base, client, appliedIds));
  const request = useRef(options.requestPreview);
  useLayoutEffect(() => {
    request.current = options.requestPreview;
  }, [options.requestPreview]);
  const [requestPreview] = useState(
    () => (nodes: NodeSnapshot, signal: AbortSignal) =>
      request.current
        ? request.current(base.setId, base.id, nodes, signal)
        : requests.preview(nodes, signal),
  );
  const editor = useNodeEditor({
    base,
    requestPreview,
    acceptPreview: options.acceptPreview ?? requests.accept,
    onAccepted: (answer) => options.onAccepted?.(answer),
  });
  useEffect(() => {
    onApplyingChange(editor.applying);
    return () => onApplyingChange(false);
  }, [editor.applying, onApplyingChange]);
  // 노드를 펼칠 때는 Preview 를 열지 않는다(시안 Remix 01: 노드가 열려 있어도 Preview 는 닫힌 알약).
  // 값을 바꿔 미리보기를 만들기 시작하거나(빠르면 바로 준비됨) 실패하면 그때 연다.
  const previewStatus = editor.preview.status;
  useEffect(() => {
    if (previewStatus === 'generating' || previewStatus === 'ready' || previewStatus === 'error')
      onPreviewAutoOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 상태가 바뀔 때만 연다.
  }, [previewStatus]);
  // 말풍선 Apply 를 노드 값에 반영한다. 값이 바뀌면 미리보기가 저절로 만들어진다.
  // 세션이 막 열린 때는 마운트가 끝난 뒤(마이크로태스크) 반영해야 미리보기 예약이 정리 단계에서 지워지지 않는다.
  const { replace, snapshot } = editor;
  useEffect(() => {
    if (!pendingApply) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const next = applyConnection(snapshot, pendingApply);
      if (next) replace(next);
      onPendingApplied();
    });
    return () => {
      active = false;
    };
  }, [pendingApply, snapshot, replace, onPendingApplied]);
  const snapshotNodes = editor.snapshot.nodes;
  useEffect(() => {
    onDraft({ setId: base.setId, nodes: snapshotNodes });
  }, [base.setId, snapshotNodes, onDraft]);
  useEffect(() => () => onDraft(undefined), [onDraft]);
  // 미리보기를 만드는 중·다 만든 것을 캔버스에 알린다(파생의 My answer 자리, #229).
  const previewAnswer = editor.preview.status === 'ready' ? editor.preview.answer : undefined;
  const previewLive = previewStatus === 'generating' || previewStatus === 'ready';
  useEffect(() => {
    onPreview(
      previewLive
        ? { setId: base.setId, ...(previewAnswer ? { answer: previewAnswer } : {}) }
        : undefined,
    );
  }, [base.setId, previewLive, previewAnswer, onPreview]);
  useEffect(() => () => onPreview(undefined), [onPreview]);
  const progress = useQuery<GetJobResponse | null>({
    queryKey: ['revision-preview', base.id],
    queryFn: skipToken,
  });
  const next = progress.data?.job.nextStage;
  const stage = next ? (visibleStage(next) ?? 'draft') : null;
  const node = nodeId ? editor.snapshot.nodes.find((entry) => entry.id === nodeId) : undefined;
  const preview = editor.preview;
  const error = editor.applyError ?? (preview.status === 'error' ? preview.error : undefined);
  return (
    <>
      {slot && node
        ? createPortal(
            <NodeEditPanel
              key={nodeId}
              node={node}
              snapshot={editor.snapshot}
              labels={labels}
              disabled={editor.applying}
              onChange={editor.edit}
              onReorder={editor.reorder}
              onReset={editor.reset}
              onClose={onClose}
              onComment={onComment}
              closing={closing}
            />,
            slot,
          )
        : null}
      <div className="canvas-preview-dock">
        <PreviewPanel
          title={labels.preview}
          applyLabel={labels.apply}
          statusLabel={
            preview.status === 'generating'
              ? stage
                ? `${CANVAS_COPY.generating} ${CANVAS_COPY.step(VISIBLE_STAGES.indexOf(stage) + 1)}`
                : CANVAS_COPY.generating
              : preview.status === 'waiting'
                ? labels.waiting
                : preview.status === 'ready'
                  ? labels.ready
                  : ''
          }
          errorMessage={error ? COPY[errorCopyKey(error)] : undefined}
          generating={preview.status === 'generating'}
          hasPreview={preview.status === 'ready'}
          applying={editor.applying}
          canApply={editor.canApply}
          stacked={editor.stacked}
          answer={
            preview.status === 'ready'
              ? preview.answer
              : preview.status === 'generating'
                ? base
                : undefined
          }
          renderImage={options.renderImage}
          open={previewOpen}
          onOpenChange={onPreviewOpenChange}
          onApply={editor.apply}
          onRetry={
            preview.status === 'error' &&
            !(preview.error instanceof ApiRequestError && !preview.error.retryable)
              ? editor.retryPreview
              : undefined
          }
        />
      </div>
    </>
  );
}

function PageCanvas({
  projectId,
  pageId,
  workspace,
  editor = {},
  history = {},
  remix,
  onOpenResult,
}: WorkspaceCanvasProps) {
  const historyApi = history ? (history.api ?? HISTORY_API) : undefined;
  const historyLabels = history ? (history.labels ?? CANVAS_HISTORY_COPY) : CANVAS_HISTORY_COPY;
  const versions = useAnswerHistory(projectId, workspace.sets, historyApi);
  const sets = versions.sets;
  const [commentTarget, setCommentTarget] = useState<{
    setId: string;
    answerId: string;
    nodeId: string;
  }>();
  const commentOpener = useRef<HTMLElement | null>(null);
  const displayedCommentAnswer = sets.find((set) => set.id === commentTarget?.setId)?.latestAnswer;
  /** 코멘트 창을 닫고 연 버튼으로 포커스를 돌려준다. 펼친 노드의 도구에서 열었으면(그 버튼은 사라졌다) 노드 옆 코멘트 버튼으로 돌려준다. */
  const closeComments = () => {
    const target = commentTarget;
    const opener = commentOpener.current;
    setCommentTarget(undefined);
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      else if (target)
        document
          .querySelector<HTMLElement>(
            `[data-comment-tool="${CSS.escape(`${target.answerId}:${target.nodeId}`)}"]`,
          )
          ?.focus({ preventScroll: true });
    });
  };
  const client = useQueryClient();
  const [editingBusy, setEditingBusy] = useState(false);
  const [stacked, setStacked] = useState(false);
  // stack 플래시는 잠깐만 보인다(#230). role=status 칸은 늘 있어서 뜨자마자 보조기기가 읽는다.
  useEffect(() => {
    if (!stacked) return;
    const timer = window.setTimeout(() => setStacked(false), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [stacked]);
  const [previewOpen, setPreviewOpen] = useState(false);
  // 사용자가 Preview 를 직접 닫았으면, 미리보기를 다시 만들어도 저절로 열지 않는다(요청·결과는 그대로 둔다).
  const previewDismissed = useRef(false);
  const changePreviewOpen = useCallback((open: boolean) => {
    previewDismissed.current = !open;
    setPreviewOpen(open);
  }, []);
  const autoOpenPreview = useCallback(() => {
    if (!previewDismissed.current) setPreviewOpen(true);
  }, []);
  const [selected, setSelected] = useState<{ setId: string; nodeId: string; kind?: string }>();
  // 편집 세션(고친 값·미리보기)이 붙은 세트. 노드를 접어도 남고, Apply·버전 이동 때 끝난다.
  const [sessionSet, setSessionSet] = useState<string>();
  const [draft, setDraft] = useState<{ setId: string; nodes: NodeSnapshot['nodes'] }>();
  // 편집 세션의 미리보기. 파생 프로젝트에서 My answer 자리에 그린다(#229).
  const [preview, setPreview] = useState<DerivePreview>();
  const endSession = useCallback(() => {
    setSessionSet(undefined);
    setDraft(undefined);
  }, []);
  const [closing, setClosing] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const opener = useRef<HTMLElement | null>(null);
  const openKind = useRef<string | undefined>(undefined);
  /** 펼친 노드를 접는다. 접히는 애니메이션이 끝난 뒤 편집을 닫는다(움직이지 않는 노드는 바로). */
  const closeEditor = useCallback((restoreFocus: boolean) => {
    window.clearTimeout(closeTimer.current);
    const finish = () => {
      setClosing(false);
      setSelected(undefined);
      if (restoreFocus) opener.current?.focus({ preventScroll: true });
    };
    const duration = SNAP_KINDS.has(openKind.current ?? '') ? 0 : expandDuration();
    if (duration <= 0) {
      finish();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(finish, duration);
  }, []);
  const sessionBase = sets.find((set) => set.id === sessionSet)?.latestAnswer;
  const verification = useVerificationEditor(
    projectId,
    (editor && editor.updateVerification) || ((id, body) => api.updateVerification(id, body)),
  );
  /** 세트의 보이는 답변에서 노드를 찾는다. 5단계 검증 노드는 답변의 verification 에 있다. */
  const findNode = (setId: string, nodeId: string) => {
    const base = sets.find((set) => set.id === setId)?.latestAnswer;
    const node = base
      ? [...base.nodes.nodes, ...verificationNodes(base.verification)].find(
          (entry) => entry.id === nodeId,
        )
      : undefined;
    return { base, node };
  };
  const verificationOpen = selected ? findNode(selected.setId, selected.nodeId) : undefined;
  const verificationBase =
    verificationOpen?.node && isVerificationNode(verificationOpen.node)
      ? verificationOpen.base
      : undefined;
  const [geometry, setGeometry] = useState<CanvasGeometry | null>(null);
  useLayoutEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const css = getComputedStyle(document.documentElement);
      setGeometry(
        Object.fromEntries(
          Object.entries({ ...CANVAS_GEOMETRY_TOKENS, ...FIGMA_GEOMETRY_TOKENS }).map(
            ([key, token]) => [key, Number.parseFloat(css.getPropertyValue(token))],
          ),
        ) as unknown as CanvasGeometry,
      );
    });
    return () => {
      active = false;
    };
  }, []);
  const generationWorkspace = useMemo(
    () => (sessionSet ? { ...workspace, activeJob: undefined } : workspace),
    [workspace, sessionSet],
  );
  const { generation, announcement, busy, loadError, reload, error } = useGeneration(
    projectId,
    pageId,
    generationWorkspace,
  );
  const connectionApply = useConnectionApply({
    sets,
    remix,
    sessionSet,
    draft,
    blocked: busy || editingBusy,
    start: (setId) => {
      setCommentTarget(undefined);
      setStacked(false);
      if (sessionSet !== setId) setDraft(undefined);
      if (selected && selected.setId !== setId) setSelected(undefined);
      setSessionSet(setId);
    },
  });
  const redirect = authRedirectTarget(error ?? loadError ?? versions.error);
  const generatedAnswer = generation?.steps.find((step) => step.answer)?.answer;
  const latestAnswer = sets.find((set) => set.id === generation?.setId)?.latestAnswer;
  const displayedGeneration =
    (latestAnswer &&
      workspace.sets.find((set) => set.id === generation?.setId)?.latestAnswer?.id !==
        latestAnswer.id) ||
    (generation?.job.status === 'succeeded' &&
      generatedAnswer &&
      latestAnswer &&
      generatedAnswer.id !== latestAnswer.id)
      ? undefined
      : generation;
  if (redirect) return <Navigate to={redirect} replace />;
  return (
    <div className="workspace-canvas" aria-busy={busy || undefined}>
      {editor ? (
        <div className="canvas-editor-flash">
          <Flash kind={stacked ? 'stack' : null} />
        </div>
      ) : null}
      {versions.error ? (
        <div className="canvas-load-error">
          <ErrorNotice message={COPY[errorCopyKey(versions.error)]} />
        </div>
      ) : null}
      {loadError ? (
        <div className="canvas-load-error">
          <ErrorNotice message={COPY[errorCopyKey(loadError)]} onRetry={reload} />
        </div>
      ) : null}
      {geometry ? (
        <GenerationCanvas
          sets={sets}
          remix={connectionApply.remix}
          remixDisabled={busy || editingBusy}
          generation={displayedGeneration}
          labels={CANVAS_COPY}
          geometry={geometry}
          derivedFrom={workspace.project.kind === 'derive' ? workspace.derivedFrom : undefined}
          derivePreview={workspace.project.kind === 'derive' ? preview : undefined}
          announcement={announcement}
          onOpenAnswer={onOpenResult}
          history={
            history
              ? {
                  answersBySet: Object.fromEntries(
                    workspace.sets.map((set) => [set.id, set.answers]),
                  ),
                  labels: historyLabels.versions,
                  selectedComment: commentTarget,
                  selectingSet: versions.selectingSet,
                  pinning: versions.pinning,
                  disabled: busy || editingBusy,
                  select: (setId, answerId) => {
                    setCommentTarget(undefined);
                    window.clearTimeout(closeTimer.current);
                    setClosing(false);
                    setSelected(undefined);
                    endSession();
                    versions.select(setId, answerId);
                  },
                  pin: versions.togglePin,
                  listComments: historyApi?.listComments,
                  commentPanel:
                    historyApi &&
                    commentTarget &&
                    displayedCommentAnswer?.id === commentTarget.answerId ? (
                      <NodeComments
                        key={`${commentTarget.answerId}:${commentTarget.nodeId}`}
                        answerId={commentTarget.answerId}
                        nodeId={commentTarget.nodeId}
                        api={historyApi}
                        labels={historyLabels.comments}
                        onClose={closeComments}
                      />
                    ) : undefined,
                  canComment: (setId, answerId, nodeId) => {
                    const answer = sets.find((set) => set.id === setId)?.latestAnswer;
                    return (
                      !busy &&
                      !editingBusy &&
                      answer?.id === answerId &&
                      answer.status === 'accepted' &&
                      answer.nodes.nodes.some((node) => node.id === nodeId)
                    );
                  },
                  comment: (setId, answerId, nodeId) => {
                    commentOpener.current =
                      document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    window.clearTimeout(closeTimer.current);
                    setClosing(false);
                    setSelected(undefined);
                    setCommentTarget({ setId, answerId, nodeId });
                  },
                }
              : undefined
          }
          editor={
            editor
              ? {
                  label: editor.labels?.title ?? NODE_EDITOR_COPY.title,
                  selected,
                  closing,
                  draft,
                  slot: setSlot,
                  close: () => {
                    if (selected && !editingBusy && !verification.saving) closeEditor(false);
                  },
                  canOpen: (setId, nodeId) => {
                    const { base, node } = findNode(setId, nodeId);
                    return (
                      !busy &&
                      !editingBusy &&
                      base?.status === 'accepted' &&
                      !!node &&
                      canOpenNode(node)
                    );
                  },
                  open: (setId, nodeId) => {
                    opener.current =
                      document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    const node = findNode(setId, nodeId).node;
                    const kind = node?.kind;
                    window.clearTimeout(closeTimer.current);
                    setClosing(false);
                    setCommentTarget(undefined);
                    setStacked(false);
                    verification.clearError();
                    // 검증 노드는 미리보기 세션 없이 바로 저장한다(앞 세트의 Apply 전 값도 그대로 둔다).
                    if (!node || !isVerificationNode(node)) {
                      // 다른 세트의 노드를 열면 그 세트로 세션을 옮긴다(앞 세트의 Apply 전 값은 버린다).
                      if (sessionSet !== setId) setDraft(undefined);
                      setSessionSet(setId);
                    }
                    openKind.current = kind;
                    setSelected({ setId, nodeId, kind });
                  },
                }
              : undefined
          }
        />
      ) : null}
      {editor && slot && verificationBase && verificationOpen?.node
        ? createPortal(
            <VerificationPanel
              key={`${verificationBase.id}:${verificationOpen.node.kind}`}
              node={verificationOpen.node}
              criteria={verificationBase.verification?.criteria ?? []}
              labels={{ ...NODE_EDITOR_COPY, ...editor.labels }}
              saving={
                verification.saving?.answerId === verificationBase.id
                  ? verification.saving.ids
                  : undefined
              }
              errorMessage={
                verification.error?.answerId === verificationBase.id
                  ? COPY[errorCopyKey(verification.error.error)]
                  : undefined
              }
              onToggle={(id, enabled) =>
                void verification.change(verificationBase, [{ id, enabled }])
              }
              onRestore={
                restoreCriteria(verificationBase.verification?.criteria ?? []).length > 0
                  ? () =>
                      void verification.change(
                        verificationBase,
                        restoreCriteria(verificationBase.verification?.criteria ?? []),
                      )
                  : undefined
              }
              onClose={() => closeEditor(true)}
            />,
            slot,
          )
        : null}
      {editor && !(sessionSet && sessionBase?.status === 'accepted') ? (
        <div className="canvas-preview-dock">
          <PreviewPanel
            title={editor.labels?.preview ?? NODE_EDITOR_COPY.preview}
            applyLabel={editor.labels?.apply ?? NODE_EDITOR_COPY.apply}
            statusLabel=""
            generating={false}
            applying={false}
            canApply={false}
            stacked={false}
            open={previewOpen}
            onOpenChange={changePreviewOpen}
            onApply={async () => {}}
          />
        </div>
      ) : null}
      {editor && sessionSet && sessionBase?.status === 'accepted' ? (
        <EditorSession
          key={sessionBase.id}
          onApplyingChange={setEditingBusy}
          previewOpen={previewOpen}
          onPreviewOpenChange={changePreviewOpen}
          onPreviewAutoOpen={autoOpenPreview}
          closing={closing}
          base={sessionBase}
          nodeId={selected?.setId === sessionSet ? selected.nodeId : undefined}
          slot={selected?.setId === sessionSet ? slot : null}
          onDraft={setDraft}
          onPreview={setPreview}
          appliedIds={connectionApply.appliedIds}
          pendingApply={connectionApply.pending}
          onPendingApplied={connectionApply.done}
          onComment={
            history && historyApi && selected && !busy && !editingBusy
              ? () => {
                  const target = selected;
                  commentOpener.current =
                    document.activeElement instanceof HTMLElement ? document.activeElement : null;
                  window.clearTimeout(closeTimer.current);
                  setClosing(false);
                  setSelected(undefined);
                  setCommentTarget({
                    setId: target.setId,
                    answerId: sessionBase.id,
                    nodeId: target.nodeId,
                  });
                }
              : undefined
          }
          options={{
            ...editor,
            onAccepted: (answer) => {
              client.setQueriesData<WorkspaceResponse>(
                { queryKey: ['workspace', projectId] },
                (previous) =>
                  previous
                    ? {
                        ...previous,
                        activeJob:
                          previous.activeJob?.setId === answer.setId
                            ? undefined
                            : previous.activeJob,
                        sets: previous.sets.map((set) =>
                          set.id !== answer.setId
                            ? set
                            : {
                                ...set,
                                latestAnswer: answer,
                                answers: [
                                  ...set.answers.filter((entry) => entry.id !== answer.id),
                                  answer,
                                ],
                              },
                        ),
                      }
                    : previous,
              );
              versions.resetSelection(answer.setId);
              setStacked(true);
              window.clearTimeout(closeTimer.current);
              setClosing(false);
              setSelected(undefined);
              endSession();
              editor.onAccepted?.(answer);
              void client.invalidateQueries({ queryKey: ['workspace', projectId] });
              requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
            },
          }}
          onClose={() => closeEditor(true)}
        />
      ) : null}
    </div>
  );
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  return <PageCanvas key={`${props.projectId}:${props.pageId}`} {...props} />;
}
