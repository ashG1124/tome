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
import { ErrorNotice, Flash } from '../../shared/ui';
import { useGeneration } from './hooks/useGeneration';
import { VISIBLE_STAGES, visibleStage, type CanvasGeometry } from './model';
import { GenerationCanvas } from './components/GenerationCanvas';
import { NodeEditPanel, type NodeEditorLabels } from './components/NodeEditPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { createEditorRequests, useNodeEditor } from './hooks/useNodeEditor';
import { canEditNode } from './edit-model';
import { NodeComments, type NodeCommentLabels } from './components/NodeComments';
import type { AnswerVersionLabels } from './components/AnswerVersions';
import { useAnswerHistory, type AnswerHistoryApi } from './hooks/useAnswerHistory';
import type { NodeCommentsApi } from './hooks/useNodeComments';
import type { CanvasRemixOptions } from './remix-model';
import './history.css';

/** 시안 전체 화면 수치(#185-W). 기본 지오메트리 토큰 위에 덮어쓴다. */
const FIGMA_GEOMETRY_TOKENS = {
  columnGap: '--canvas-figma-column-gap',
  promptGap: '--canvas-figma-prompt-gap',
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
}

export interface WorkspaceCanvasProps {
  projectId: string;
  pageId: string;
  workspace: WorkspaceResponse;
  onOpenResult?: (answerId: string) => void;
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
  onApplyingChange,
  previewOpen,
  onPreviewOpenChange,
  onPreviewAutoOpen,
  closing = false,
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
  onApplyingChange: (value: boolean) => void;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  /** 미리보기가 만들어질 때 Preview 를 연다. 사용자가 닫아 둔 상태면 열지 않는다. */
  onPreviewAutoOpen: () => void;
  /** 펼친 노드가 접히는 중 */
  closing?: boolean;
}) {
  const labels = { ...NODE_EDITOR_COPY, ...options.labels };
  const client = useQueryClient();
  const [requests] = useState(() => createEditorRequests(base, client));
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
  const snapshotNodes = editor.snapshot.nodes;
  useEffect(() => {
    onDraft({ setId: base.setId, nodes: snapshotNodes });
  }, [base.setId, snapshotNodes, onDraft]);
  useEffect(() => () => onDraft(undefined), [onDraft]);
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
  const client = useQueryClient();
  const [editingBusy, setEditingBusy] = useState(false);
  const [stacked, setStacked] = useState(false);
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
  const endSession = useCallback(() => {
    setSessionSet(undefined);
    setDraft(undefined);
  }, []);
  const [closing, setClosing] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const opener = useRef<HTMLElement | null>(null);
  /** 펼친 노드를 접는다. 접히는 애니메이션이 끝난 뒤 편집을 닫는다. */
  const closeEditor = useCallback((restoreFocus: boolean) => {
    window.clearTimeout(closeTimer.current);
    const finish = () => {
      setClosing(false);
      setSelected(undefined);
      if (restoreFocus) opener.current?.focus({ preventScroll: true });
    };
    const duration = expandDuration();
    if (duration <= 0) {
      finish();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(finish, duration);
  }, []);
  const sessionBase = sets.find((set) => set.id === sessionSet)?.latestAnswer;
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
      {history &&
      historyApi &&
      commentTarget &&
      displayedCommentAnswer?.id === commentTarget.answerId ? (
        <NodeComments
          key={`${commentTarget.answerId}:${commentTarget.nodeId}`}
          answerId={commentTarget.answerId}
          nodeId={commentTarget.nodeId}
          api={historyApi}
          labels={historyLabels.comments}
          onClose={() => {
            setCommentTarget(undefined);
            commentOpener.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {loadError ? (
        <div className="canvas-load-error">
          <ErrorNotice message={COPY[errorCopyKey(loadError)]} onRetry={reload} />
        </div>
      ) : null}
      {geometry ? (
        <GenerationCanvas
          sets={sets}
          remix={remix}
          remixDisabled={busy || editingBusy}
          generation={displayedGeneration}
          labels={CANVAS_COPY}
          geometry={geometry}
          derivedFrom={workspace.project.kind === 'derive' ? workspace.derivedFrom : undefined}
          announcement={announcement}
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
                    if (selected && !editingBusy) closeEditor(false);
                  },
                  canOpen: (setId, nodeId) => {
                    const base = sets.find((set) => set.id === setId)?.latestAnswer;
                    const node = base?.nodes.nodes.find((entry) => entry.id === nodeId);
                    return (
                      !busy &&
                      !editingBusy &&
                      base?.status === 'accepted' &&
                      !!node &&
                      canEditNode(node)
                    );
                  },
                  open: (setId, nodeId) => {
                    opener.current =
                      document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    const kind = sets
                      .find((set) => set.id === setId)
                      ?.latestAnswer?.nodes.nodes.find((entry) => entry.id === nodeId)?.kind;
                    window.clearTimeout(closeTimer.current);
                    setClosing(false);
                    setCommentTarget(undefined);
                    setStacked(false);
                    // 다른 세트의 노드를 열면 그 세트로 세션을 옮긴다(앞 세트의 Apply 전 값은 버린다).
                    if (sessionSet !== setId) setDraft(undefined);
                    setSessionSet(setId);
                    setSelected({ setId, nodeId, kind });
                  },
                }
              : undefined
          }
        />
      ) : null}
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
