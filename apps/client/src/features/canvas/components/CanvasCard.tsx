import { memo, useContext, useRef, type CSSProperties, type ReactNode } from 'react';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import { viewableOrigin, type CanvasNode } from '../model';
import { CanvasNavigation, openRole } from '../navigation';
import { COPY } from '../../../shared/copy';
import { Icon } from '../../../shared/ui';
import { AnswerVersions } from './AnswerVersions';
import { ConnectionPopover } from './ConnectionPopover';
import { connectionForCard } from '../remix-model';
import { CanvasSurface } from './CanvasSurface';

import { CommentBand } from './CommentBand';

/** 단계 이름표(알약). 시안: Step 1226:69439. 번호는 열 번호, 이름은 단계 이름이다. */
function StepPill({ number, label }: { number: number; label: string }) {
  return (
    <div className="canvas-step" data-step={number}>
      <span className="canvas-step-handle" aria-hidden="true" />
      <div className="canvas-step-pill">
        <span className="canvas-step-number" aria-hidden="true">
          {number}
        </span>
        <strong>{label}</strong>
        {number === 1 ? <span className="canvas-step-badge" aria-hidden="true" /> : null}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="canvas-step-dot"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="canvas-step-dot"
      />
    </div>
  );
}

/**
 * 코멘트 창 자리. 노드 도구의 코멘트 아이콘 자리(도구 위끝 왼쪽)에서 펼쳐지고 노드와 함께 움직이지만(#230),
 * 캔버스 확대 배율만큼 되돌려 글자가 늘 같은 크기(화면 기준)로 보이게 한다.
 */
function CommentAnchor({ children }: { children: ReactNode }) {
  const zoom = useStore((state) => state.transform[2]);
  return (
    <div
      className="canvas-comments-anchor"
      style={{ '--canvas-comments-scale': String(1 / (zoom || 1)) } as CSSProperties}
    >
      {children}
    </div>
  );
}

export const CanvasCard = memo(function CanvasCard({ id, data }: NodeProps<CanvasNode>) {
  const navigation = useContext(CanvasNavigation);
  // 마우스로 누른 포커스면 화면을 옮기지 않는다(누르는 사이 노드가 움직이면 누름이 빈 캔버스로 빗나간다).
  const pointing = useRef(false);
  const reveal = () => {
    const fromPointer = pointing.current;
    pointing.current = false;
    navigation.focus(id, !fromPointer);
  };
  /** 펼치기 전 닫힌 카드 높이를 캔버스에 적어 두고 연다. 펼친 노드는 이 높이에서 늘어나고, 접을 때 이 높이로 돌아간다. */
  const openFrom = (card: Element | null) => {
    if (!data.output) return;
    if (card instanceof HTMLElement)
      card
        .closest<HTMLElement>('.generation-canvas')
        ?.style.setProperty('--node-closed-height', `${card.offsetHeight}px`);
    navigation.editor?.open(data.setId, data.output.id);
  };
  const markPointer = () => {
    pointing.current = true;
    // 포커스가 바뀌지 않은 누름이면 다음 키보드 포커스에 남지 않게 바로 지운다(포커스는 이보다 먼저 온다).
    window.setTimeout(() => (pointing.current = false), 0);
  };
  if (data.kind === 'heading' && data.variant === 'step')
    return <StepPill number={data.column} label={data.label} />;
  if (data.kind === 'heading')
    return (
      <div
        className="canvas-heading"
        data-variant={data.variant}
        data-inactive={data.inactive || undefined}
      >
        {data.text ? <span>{data.text}</span> : null}
        <strong>{data.label}</strong>
      </div>
    );
  const canComment =
    !!data.output &&
    !!data.answerId &&
    !!navigation.history?.canComment(data.setId, data.answerId, data.output.id);
  // 불일치 노드는 펼쳐 보기만 한다(F-003). 노드 도구의 편집 버튼은 두지 않고 카드를 눌러 연다.
  const canEdit =
    !!data.output &&
    data.output.kind !== 'mismatch' &&
    !!navigation.editor?.canOpen(data.setId, data.output.id);
  const role = openRole(navigation.editor?.selected, data.setId, data.output, data.groupPosition);
  const editing = role === 'open';
  const draft = navigation.editor?.draft;
  const drafted =
    data.output && draft?.setId === data.setId
      ? draft.nodes.find((node) => node.id === data.output!.id)
      : undefined;
  // 리믹스 표시는 카드당 1개. 묶음(우선순위·검증 기준)은 첫 줄에만 붙인다(#229).
  const connection = data.output
    ? connectionForCard(
        navigation.remix,
        data.answerId,
        data.groupIds ??
          (data.output.kind === 'priority' || data.output.kind === 'criterion'
            ? []
            : [data.output.id]),
      )
    : undefined;
  const commenting =
    !!data.output &&
    navigation.history?.selectedComment?.answerId === data.answerId &&
    navigation.history?.selectedComment?.nodeId === data.output.id;
  // 코멘트 아이콘이 그 자리에서 입력 창으로 펼쳐진다(#230). 펼친 동안 도구 막대는 창 뒤에 숨는다.
  const commentPanel = commenting && !editing ? navigation.history?.commentPanel : undefined;
  // 답변(그림) 카드는 눌러서(또는 Enter) 크게 보기 모달을 연다(#230).
  // 파생의 흐린(비활성) 카드는 먼저 활성으로 돌아가고(덮개 버튼), 활성인 카드를 누르면 모달이 열린다.
  // 미리보기(아직 확정 전)·만드는 중인 카드는 열지 않는다.
  // 파생의 원작 답변 카드도 같은 규칙이다(#237): 활성일 때 원작 그림(카드에 보이는 그림)을 원작 제목으로 연다. 원작이 지워졌으면 열지 않는다.
  const answerToOpen =
    data.state === 'done' && !data.inactive && !data.previewing && navigation.openAnswer
      ? data.kind === 'answer'
        ? data.answer
        : data.kind === 'origin'
          ? viewableOrigin(data.origin)
          : undefined
      : undefined;
  return (
    <>
      {data.kind !== 'prompt' ? (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          className={
            data.kind === 'answer' || data.kind === 'origin' ? 'canvas-answer-dot' : undefined
          }
        />
      ) : null}
      <CanvasSurface
        data={data}
        open={editing}
        enabled={drafted?.enabled}
        covered={role === 'covered'}
        answerFooter={
          data.kind === 'answer' && data.answer && !data.previewing && navigation.history ? (
            <AnswerVersions
              answer={data.answer}
              answers={(navigation.history.answersBySet[data.setId] ?? []).filter(
                (entry) => !data.hiddenVersionIds?.includes(entry.id),
              )}
              labels={navigation.history.labels}
              loading={navigation.history.selectingSet === data.setId}
              pinning={navigation.history.pinning}
              disabled={navigation.history.disabled}
              onSelect={(answerId) => navigation.history!.select(data.setId, answerId)}
              onPin={navigation.history.pin}
              numberOffset={data.numberOffset}
            />
          ) : null
        }
        data-canvas-card={id}
        data-opens-answer={answerToOpen ? true : undefined}
        aria-keyshortcuts={answerToOpen ? 'Enter' : undefined}
        tabIndex={navigation.active[data.setId] === id ? 0 : -1}
        onPointerDownCapture={markPointer}
        onFocus={reveal}
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('button, input, [role="slider"]')
          )
            return;
          if (editing) return;
          if (answerToOpen) {
            // 모달을 닫으면 포커스가 이 카드로 돌아오게, 열기 전에 카드에 포커스를 둔다(마우스 누름은 포커스를 옮기지 않을 수 있다).
            if (document.activeElement !== event.currentTarget)
              event.currentTarget.focus({ preventScroll: true });
            navigation.openAnswer?.(answerToOpen);
            return;
          }
          if (data.output && navigation.editor?.canOpen(data.setId, data.output.id))
            openFrom(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && event.key === 'Enter' && answerToOpen) {
            event.preventDefault();
            event.stopPropagation();
            navigation.openAnswer?.(answerToOpen);
            return;
          }
          if (
            event.target !== event.currentTarget ||
            !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          navigation.move(id, event.key);
        }}
      >
        {/* 파생: 비활성 답변 카드를 누르면 그 답변으로 돌아가 활성이 된다(#229) */}
        {data.inactive && data.activateAnswerId && navigation.history ? (
          <button
            type="button"
            className="canvas-answer-activate nopan"
            aria-label={data.label}
            aria-busy={navigation.history.selectingSet === data.setId || undefined}
            disabled={navigation.history.disabled || navigation.history.selectingSet === data.setId}
            onClick={() => navigation.history!.select(data.setId, data.activateAnswerId!)}
          />
        ) : null}
        {editing ? (
          <div
            ref={navigation.editor?.slot}
            className="canvas-node-open-slot"
            data-closing={navigation.editor?.closing || undefined}
          />
        ) : null}
        {connection ? (
          <div className="canvas-connections" data-column={data.column}>
            <ConnectionPopover
              key={`${data.answerId}:${connection.id}`}
              answerId={data.answerId!}
              connection={connection}
              disabled={navigation.remixDisabled}
            />
          </div>
        ) : null}
      </CanvasSurface>
      {canComment && navigation.history?.listComments ? (
        <CommentBand
          answerId={data.answerId!}
          nodeId={data.output!.id}
          list={navigation.history.listComments}
        />
      ) : null}
      {(canComment || canEdit) && !editing && role !== 'covered' ? (
        <div
          className="canvas-node-tool nodrag nopan nowheel"
          data-open={commenting || undefined}
          data-expanded={commentPanel ? true : undefined}
          role="group"
          onPointerDownCapture={markPointer}
          onFocus={reveal}
        >
          <div className="canvas-node-tool-bar">
            {canComment ? (
              <button
                type="button"
                className="canvas-node-tool-button"
                aria-label={`${COPY['S-07a']}: ${data.label}`}
                aria-expanded={commenting}
                data-active={commenting || undefined}
                data-comment-tool={`${data.answerId}:${data.output!.id}`}
                onClick={() =>
                  navigation.history!.comment(data.setId, data.answerId!, data.output!.id)
                }
              >
                <Icon name="comment" size={24} />
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="canvas-node-tool-button"
                aria-label={navigation.editor!.label}
                aria-expanded={editing}
                data-active={editing || undefined}
                onClick={() =>
                  openFrom(document.querySelector(`[data-canvas-card="${CSS.escape(id)}"]`))
                }
              >
                <Icon name="edit" size={24} />
              </button>
            ) : null}
          </div>
          {/* 코멘트 창은 코멘트 아이콘 자리에서 펼쳐진다(노드와 함께 움직인다) */}
          {commentPanel ? <CommentAnchor>{commentPanel}</CommentAnchor> : null}
        </div>
      ) : null}

      {data.kind !== 'answer' && data.kind !== 'origin' ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          className={data.kind === 'prompt' ? 'canvas-answer-dot' : undefined}
        />
      ) : null}
    </>
  );
});
