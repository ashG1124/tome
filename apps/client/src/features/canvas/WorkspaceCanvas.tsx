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
import {
  VISIBLE_STAGES,
  commentNodeId,
  visibleStage,
  type CanvasGeometry,
  type ViewableAnswer,
} from './model';
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
import type { NodeCommentLabels } from './components/CommentBand';
import type { AnswerVersionLabels } from './components/AnswerVersions';
import { useAnswerHistory, type AnswerHistoryApi } from './hooks/useAnswerHistory';
import type { NodeCommentsApi } from './hooks/useNodeComments';
import type { CanvasRemixOptions } from './remix-model';
import { applyConnection } from './connection-apply';
import { dragStorageKey } from './drag-storage';
import { useConnectionApply, type PendingConnectionApply } from './hooks/useConnectionApply';
import { selectionCovers, selectionKey, type CanvasEditorSelection } from './navigation';
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
    NodeEditorLabels & {
      preview: string;
      apply: string;
      waiting: string;
      ready: string;
      previousEdit: string;
      nextEdit: string;
    }
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
  /**
   * 답변(그림) 카드를 누르면 크게 보기(Download) 모달을 연다(#230). 없으면 답변 카드는 눌러도 아무 일이 없다.
   * 파생의 원작 답변 카드도 같은 규칙으로 연다(#237). 그때 title 은 원작 제목이다.
   */
  onOpenResult?: (answer: ViewableAnswer) => void;
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

/** 미리보기 세션이 있어야 그릴 수 있는 펼친 노드(편집 노드). 5단계 검증 노드는 세션 없이 바로 저장한다. */
const needsSession = (entry: CanvasEditorSelection) =>
  entry.kind !== 'criterion' && entry.kind !== 'mismatch';

/** 펼쳐 둔 편집 노드 하나 */
interface EditorPanel {
  nodeId: string;
  /** 펼친 노드 카드 안의 자리. 편집 화면을 여기에 그린다. */
  slot: HTMLElement | null;
  /** 접히는 중 */
  closing: boolean;
}

function EditorSession({
  base,
  panels,
  options,
  onClose,
  onComment,
  onDraft,
  onApplyingChange,
  previewOpen,
  onPreviewOpenChange,
  onPreviewAutoOpen,
  appliedIds,
  pendingApply,
  onPendingApplied,
}: {
  base: Answer;
  /** 지금 펼쳐 둔 노드들(여러 개일 수 있다, #261). 모두 접어도 세션(고친 값·미리보기)은 남는다. */
  panels: readonly EditorPanel[];
  options: CanvasEditorOptions;
  onClose: (nodeId: string) => void;
  onComment?: (nodeId: string) => void;
  /** 고친 값(아직 Apply 전)을 캔버스의 접힌 노드에도 보이게 알린다. */
  onDraft: (draft: { setId: string; nodes: NodeSnapshot['nodes'] } | undefined) => void;
  onApplyingChange: (value: boolean) => void;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  /** 미리보기가 만들어질 때 Preview 를 연다. 사용자가 닫아 둔 상태면 열지 않는다. */
  onPreviewAutoOpen: () => void;
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
  // 미리보기(만드는 중·다 만든 것·실패)는 Preview 에서만 보인다. Apply 하기 전에는 캔버스의 답변 카드를 바꾸지 않는다(#261).
  const progress = useQuery<GetJobResponse | null>({
    queryKey: ['revision-preview', base.id],
    queryFn: skipToken,
  });
  const next = progress.data?.job.nextStage;
  const stage = next ? (visibleStage(next) ?? 'draft') : null;
  const preview = editor.preview;
  // 기록의 이 칸에서 전에 만들어 둔 미리보기. 그 값으로 다시 만드는 동안에도 그림을 보여 준다(Apply 는 새로 만든 뒤에).
  const earlier = preview.status === 'ready' ? undefined : editor.history.answer;
  const error = editor.applyError ?? (preview.status === 'error' ? preview.error : undefined);
  return (
    <>
      {panels.map((panel) => {
        const node = editor.snapshot.nodes.find((entry) => entry.id === panel.nodeId);
        return panel.slot && node
          ? createPortal(
              <NodeEditPanel
                node={node}
                snapshot={editor.snapshot}
                labels={labels}
                disabled={editor.applying}
                onChange={editor.edit}
                onReorder={editor.reorder}
                onReset={editor.reset}
                onClose={() => onClose(panel.nodeId)}
                onComment={onComment ? () => onComment(panel.nodeId) : undefined}
                closing={panel.closing}
              />,
              panel.slot,
              panel.nodeId,
            )
          : null;
      })}
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
          hasPreview={preview.status === 'ready' || !!earlier}
          applying={editor.applying}
          canApply={editor.canApply}
          stacked={editor.stacked}
          answer={
            preview.status === 'ready'
              ? preview.answer
              : (earlier ?? (preview.status === 'generating' ? base : undefined))
          }
          renderImage={options.renderImage}
          navigation={{
            index: editor.history.index,
            count: editor.history.count,
            previous: labels.previousEdit,
            next: labels.nextEdit,
            onPrevious: editor.history.previous,
            onNext: editor.history.next,
          }}
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
  // 코멘트 대상 노드(#241). 묶음이면 첫 줄 id 다. open 이면 분홍 띠가 펼쳐져 입력 중이다.
  const [commentTarget, setCommentTarget] = useState<{
    setId: string;
    answerId: string;
    nodeId: string;
    open: boolean;
  }>();
  const commentOpener = useRef<HTMLElement | null>(null);
  /** 코멘트 대상을 풀고 연 버튼으로 포커스를 돌려준다. 그 버튼이 사라졌으면 노드 도구의 코멘트 버튼으로 돌려준다. */
  const closeComments = (restoreFocus?: boolean) => {
    const target = commentTarget;
    const opener = commentOpener.current;
    setCommentTarget(undefined);
    // 사용자가 다른 곳을 눌러 포커스가 이미 옮겨 갔으면 되돌리지 않는다.
    if (restoreFocus === false) return;
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
  // 펼쳐 둔 노드들(연 순서). 다른 노드를 열거나 빈 곳을 눌러도 닫히지 않고, 그 노드를 다시 누르면 닫힌다(#261).
  const [opened, setOpened] = useState<readonly CanvasEditorSelection[]>([]);
  const openedNow = useRef(opened);
  useLayoutEffect(() => {
    openedNow.current = opened;
  }, [opened]);
  // 편집 세션(고친 값·미리보기)이 붙은 세트. 노드를 접어도 남고, Apply·버전 이동 때 끝난다.
  const [sessionSet, setSessionSet] = useState<string>();
  const [draft, setDraft] = useState<{ setId: string; nodes: NodeSnapshot['nodes'] }>();
  const endSession = useCallback(() => {
    setSessionSet(undefined);
    setDraft(undefined);
  }, []);
  // 펼친 노드 카드 안의 자리(노드마다 하나). 편집 화면을 그 자리에 그린다.
  const [slots, setSlots] = useState<ReadonlyMap<string, HTMLElement>>(() => new Map());
  const registerSlot = useCallback((setId: string, nodeId: string, element: HTMLElement | null) => {
    const key = selectionKey({ setId, nodeId });
    setSlots((previous) => {
      if (previous.get(key) === (element ?? undefined)) return previous;
      const next = new Map(previous);
      if (element) next.set(key, element);
      else next.delete(key);
      return next;
    });
  }, []);
  // 접히는 애니메이션이 끝나면 닫는 타이머(노드별)
  const closeTimers = useRef(new Map<string, number>());
  useEffect(() => {
    const timers = closeTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);
  // 노드를 열 때 포커스가 있던 곳(노드별). 접으면 그리로 돌려준다.
  const openers = useRef(new Map<string, HTMLElement | null>());
  const lastOpener = useRef<HTMLElement | null>(null);
  /** 펼친 노드를 애니메이션 없이 바로 닫는다. 고르는 함수가 없으면 모두 닫는다. */
  const dropOpened = useCallback((match?: (entry: CanvasEditorSelection) => boolean) => {
    for (const entry of openedNow.current) {
      if (match && !match(entry)) continue;
      const key = selectionKey(entry);
      window.clearTimeout(closeTimers.current.get(key));
      closeTimers.current.delete(key);
    }
    setOpened((previous) => {
      const kept = match ? previous.filter((entry) => !match(entry)) : [];
      return kept.length === previous.length ? previous : kept;
    });
  }, []);
  /** 펼친 노드 하나를 접는다. 접히는 애니메이션이 끝난 뒤 닫는다(움직이지 않는 노드는 바로). */
  const closeNode = useCallback((setId: string, nodeId: string, restoreFocus: boolean) => {
    const key = selectionKey({ setId, nodeId });
    const entry = openedNow.current.find((item) => selectionKey(item) === key);
    if (!entry) return;
    window.clearTimeout(closeTimers.current.get(key));
    const finish = () => {
      closeTimers.current.delete(key);
      // 그 사이 다른 일로 이미 닫혔으면(Apply·버전 이동) 포커스를 건드리지 않는다.
      const present = openedNow.current.some((item) => selectionKey(item) === key);
      setOpened((previous) => previous.filter((item) => selectionKey(item) !== key));
      if (present && restoreFocus) openers.current.get(key)?.focus({ preventScroll: true });
      openers.current.delete(key);
    };
    const duration = SNAP_KINDS.has(entry.kind ?? '') ? 0 : expandDuration();
    if (duration <= 0) {
      finish();
      return;
    }
    setOpened((previous) =>
      previous.map((item) => (selectionKey(item) === key ? { ...item, closing: true } : item)),
    );
    closeTimers.current.set(key, window.setTimeout(finish, duration));
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
  // 펼쳐 둔 검증 노드(기준 묶음·불일치). 미리보기 세션 없이 바로 저장하므로 편집 세션과 따로 그린다.
  const verificationPanels = opened.flatMap((entry) => {
    const { base, node } = findNode(entry.setId, entry.nodeId);
    return base && node && isVerificationNode(node) ? [{ entry, base, node }] : [];
  });
  /** 세트의 보이는 답변에서 코멘트를 달 수 있는 노드(1~4단계 노드 + 5단계 검증 기준). 불일치는 보기 전용이다. */
  const commentableNodes = useCallback(
    (setId: string, answerId: string) => {
      const answer = sets.find((set) => set.id === setId)?.latestAnswer;
      if (!answer || answer.id !== answerId) return undefined;
      return [...answer.nodes.nodes, ...(answer.verification?.criteria ?? [])];
    },
    [sets],
  );
  /**
   * 노드를 코멘트 대상으로 한다. 묶음(우선순위·검증 기준)은 어느 줄에서 열어도 첫 줄 id 에 모은다(#241).
   * 대상이 바뀔 때만 연 버튼(코멘트 아이콘·코너)을 기억해 둔다. 닫을 때 그리로 포커스를 돌려준다.
   * 그 노드가 펼쳐져 있으면 접는다(코멘트 코너는 닫힌 노드에 붙는다). 다른 펼친 노드는 그대로 둔다.
   */
  const openComment = useCallback(
    (setId: string, answerId: string, nodeId: string, open?: boolean) => {
      const nodes = commentableNodes(setId, answerId);
      const target = nodes ? commentNodeId(nodes, nodeId) : nodeId;
      const kind = nodes?.find((node) => node.id === nodeId)?.kind;
      dropOpened(
        (entry) =>
          selectionCovers(entry, setId, nodeId, kind) ||
          selectionCovers(entry, setId, target, kind),
      );
      setCommentTarget((previous) => {
        if (previous?.answerId !== answerId || previous.nodeId !== target)
          commentOpener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return { setId, answerId, nodeId: target, open: !!open };
      });
    },
    [commentableNodes, dropOpened],
  );
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
      // 세션이 다른 세트로 옮겨 가면 앞 세트에 펼쳐 둔 편집 노드는 닫는다.
      dropOpened((entry) => entry.setId !== setId && needsSession(entry));
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
          announcement={announcement}
          onOpenAnswer={onOpenResult}
          dragStorageKey={dragStorageKey(projectId, pageId)}
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
                    // 그 세트의 펼친 노드와, 세션이 끝나면 그릴 수 없는 편집 노드를 닫는다.
                    dropOpened((entry) => entry.setId === setId || needsSession(entry));
                    endSession();
                    versions.select(setId, answerId);
                  },
                  pin: versions.togglePin,
                  commentsApi: historyApi,
                  commentLabels: historyLabels.comments,
                  closeComment: closeComments,
                  canComment: (setId, answerId, nodeId) => {
                    const answer = sets.find((set) => set.id === setId)?.latestAnswer;
                    return (
                      !busy &&
                      !editingBusy &&
                      answer?.status === 'accepted' &&
                      !!commentableNodes(setId, answerId)?.some((node) => node.id === nodeId)
                    );
                  },
                  comment: openComment,
                }
              : undefined
          }
          editor={
            editor
              ? {
                  label: editor.labels?.title ?? NODE_EDITOR_COPY.title,
                  selected: opened,
                  draft,
                  slot: registerSlot,
                  close: (setId, nodeId) => {
                    if (!editingBusy && !verification.saving) closeNode(setId, nodeId, true);
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
                    const active =
                      document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    const node = findNode(setId, nodeId).node;
                    const kind = node?.kind;
                    setCommentTarget(undefined);
                    setStacked(false);
                    verification.clearError();
                    // 검증 노드는 미리보기 세션 없이 바로 저장한다(앞 세트의 Apply 전 값도 그대로 둔다).
                    const session = !node || !isVerificationNode(node);
                    if (session) {
                      // 다른 세트의 노드를 열면 그 세트로 세션을 옮긴다(앞 세트의 Apply 전 값은 버린다).
                      if (sessionSet !== setId) setDraft(undefined);
                      setSessionSet(setId);
                    }
                    const existing = opened.find((entry) =>
                      selectionCovers(entry, setId, nodeId, kind),
                    );
                    const key = selectionKey(existing ?? { setId, nodeId });
                    window.clearTimeout(closeTimers.current.get(key));
                    closeTimers.current.delete(key);
                    openers.current.set(key, active);
                    lastOpener.current = active;
                    setOpened((previous) => {
                      // 이미 펼쳐 둔 노드는 그대로 둔다. 세션이 옮겨 가면 앞 세트의 편집 노드만 닫는다.
                      const kept = session
                        ? previous.filter((entry) => entry.setId === setId || !needsSession(entry))
                        : previous;
                      const at = kept.findIndex((entry) =>
                        selectionCovers(entry, setId, nodeId, kind),
                      );
                      if (at < 0) return [...kept, { setId, nodeId, kind }];
                      // 접히던 중이면 다시 편다.
                      return kept.map((entry, index) =>
                        index === at
                          ? { setId: entry.setId, nodeId: entry.nodeId, kind: entry.kind }
                          : entry,
                      );
                    });
                  },
                }
              : undefined
          }
        />
      ) : null}
      {editor
        ? verificationPanels.map(({ entry, base, node }) => {
            const key = selectionKey(entry);
            const slot = slots.get(key);
            if (!slot) return null;
            const criteria = base.verification?.criteria ?? [];
            // 펼친 기준 묶음의 코멘트 버튼: 노드를 접고 묶음 첫 줄에 코너를 만든다(#241). 불일치는 보기 전용이다.
            const canComment =
              !!history &&
              !!historyApi &&
              base.status === 'accepted' &&
              node.kind === 'criterion' &&
              !busy &&
              !editingBusy;
            return createPortal(
              <VerificationPanel
                node={node}
                criteria={criteria}
                labels={{ ...NODE_EDITOR_COPY, ...editor.labels }}
                saving={
                  verification.saving?.answerId === base.id ? verification.saving.ids : undefined
                }
                errorMessage={
                  node.kind === 'criterion' && verification.error?.answerId === base.id
                    ? COPY[errorCopyKey(verification.error.error)]
                    : undefined
                }
                onToggle={(id, enabled) => void verification.change(base, [{ id, enabled }])}
                onComment={
                  canComment ? () => openComment(entry.setId, base.id, entry.nodeId) : undefined
                }
                onRestore={
                  restoreCriteria(criteria).length > 0
                    ? () => void verification.change(base, restoreCriteria(criteria))
                    : undefined
                }
                onClose={() => closeNode(entry.setId, entry.nodeId, true)}
              />,
              slot,
              `${key}:${base.id}:${node.kind}`,
            );
          })
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
          base={sessionBase}
          panels={opened
            .filter((entry) => entry.setId === sessionSet && needsSession(entry))
            .map((entry) => ({
              nodeId: entry.nodeId,
              slot: slots.get(selectionKey(entry)) ?? null,
              closing: !!entry.closing,
            }))}
          onDraft={setDraft}
          appliedIds={connectionApply.appliedIds}
          pendingApply={connectionApply.pending}
          onPendingApplied={connectionApply.done}
          onComment={
            history && historyApi && !busy && !editingBusy
              ? (nodeId) => openComment(sessionSet, sessionBase.id, nodeId)
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
              // 새 버전이 쌓이면 그 세트의 펼친 노드와 세션이 끝난다.
              dropOpened((entry) => entry.setId === answer.setId || needsSession(entry));
              endSession();
              editor.onAccepted?.(answer);
              void client.invalidateQueries({ queryKey: ['workspace', projectId] });
              requestAnimationFrame(() => lastOpener.current?.focus({ preventScroll: true }));
            },
          }}
          onClose={(nodeId) => closeNode(sessionSet, nodeId, true)}
        />
      ) : null}
    </div>
  );
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  return <PageCanvas key={`${props.projectId}:${props.pageId}`} {...props} />;
}
