import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

function EditorSession({
  base,
  nodeId,
  options,
  onClose,
  onApplyingChange,
  previewOpen,
  onPreviewOpenChange,
}: {
  base: Answer;
  nodeId: string;
  options: CanvasEditorOptions;
  onClose: () => void;
  onApplyingChange: (value: boolean) => void;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
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
  const progress = useQuery<GetJobResponse | null>({
    queryKey: ['revision-preview', base.id],
    queryFn: skipToken,
  });
  const next = progress.data?.job.nextStage;
  const stage = next ? (visibleStage(next) ?? 'draft') : null;
  const node = editor.snapshot.nodes.find((entry) => entry.id === nodeId);
  if (!node) return null;
  const preview = editor.preview;
  const error = editor.applyError ?? (preview.status === 'error' ? preview.error : undefined);
  return (
    <>
      <aside className="canvas-editor-panels">
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
        />
      </aside>
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
  const [selected, setSelected] = useState<{ setId: string; nodeId: string }>();
  const opener = useRef<HTMLElement | null>(null);
  const selectedBase = sets.find((set) => set.id === selected?.setId)?.latestAnswer;
  const [geometry, setGeometry] = useState<CanvasGeometry | null>(null);
  useLayoutEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const css = getComputedStyle(document.documentElement);
      setGeometry(
        Object.fromEntries(
          Object.entries(CANVAS_GEOMETRY_TOKENS).map(([key, token]) => [
            key,
            Number.parseFloat(css.getPropertyValue(token)),
          ]),
        ) as unknown as CanvasGeometry,
      );
    });
    return () => {
      active = false;
    };
  }, []);
  const generationWorkspace = useMemo(
    () => (selected ? { ...workspace, activeJob: undefined } : workspace),
    [workspace, selected],
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
                    setSelected(undefined);
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
                    setCommentTarget(undefined);
                    setStacked(false);
                    setPreviewOpen(true);
                    setSelected({ setId, nodeId });
                  },
                }
              : undefined
          }
        />
      ) : null}
      {editor && !(selected && selectedBase?.status === 'accepted') ? (
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
            onOpenChange={setPreviewOpen}
            onApply={async () => {}}
          />
        </div>
      ) : null}
      {editor && selected && selectedBase?.status === 'accepted' ? (
        <EditorSession
          key={selectedBase.id}
          onApplyingChange={setEditingBusy}
          previewOpen={previewOpen}
          onPreviewOpenChange={setPreviewOpen}
          base={selectedBase}
          nodeId={selected.nodeId}
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
              setSelected(undefined);
              editor.onAccepted?.(answer);
              void client.invalidateQueries({ queryKey: ['workspace', projectId] });
              requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
            },
          }}
          onClose={() => {
            setSelected(undefined);
            opener.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </div>
  );
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  return <PageCanvas key={`${props.projectId}:${props.pageId}`} {...props} />;
}
