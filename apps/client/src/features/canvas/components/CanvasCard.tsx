import { memo, useCallback, useContext, useRef, type CSSProperties } from 'react';
import { Handle, Position, useStore, type NodeProps, type ReactFlowState } from '@xyflow/react';
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
 * 묶음(우선순위·검증 기준) 첫 줄에서 묶음 카드 전체의 높이(캔버스 좌표). 첫 줄 위끝부터 마지막 줄 아래끝까지.
 * 닫힌 묶음은 한 노드처럼 동작해서 코멘트 코너·노드 도구를 이 높이에 맞춰 그린다(#241). 묶음이 아니면 undefined.
 */
function useGroupHeight(id: string, lastId: string | undefined): number | undefined {
  const select = useCallback(
    (state: ReactFlowState) => {
      if (!lastId) return undefined;
      const head = state.nodeLookup.get(id);
      const last = state.nodeLookup.get(lastId);
      if (!head || !last || !last.measured.height) return undefined;
      const height =
        last.internals.positionAbsolute.y +
        last.measured.height -
        head.internals.positionAbsolute.y;
      return height > 0 ? Math.round(height) : undefined;
    },
    [id, lastId],
  );
  return useStore(select);
}

/** 묶음의 다른 줄에 마우스가 올라가면 첫 줄의 묶음 틀에 알린다(코멘트 띠 미리보기·노드 위로 올리기, history.css). */
function markGroupHover(from: Element, headId: string, on: boolean) {
  from
    .closest('.react-flow__nodes')
    ?.querySelector(`[data-node-frame="${CSS.escape(headId)}"]`)
    ?.toggleAttribute('data-group-hover', on);
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
  // 묶음 첫 줄은 묶음 카드 전체 높이에 맞춰 코멘트 코너·노드 도구를 그린다(#241).
  const groupIds = data.groupIds && data.groupIds.length > 1 ? data.groupIds : undefined;
  const groupHeight = useGroupHeight(id, groupIds ? `${data.setId}:${groupIds.at(-1)}` : undefined);
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
  // 묶음의 다른 줄은 첫 줄에 맡긴다: 코너·도구를 그리지 않고, 포커스도 첫 줄로 보낸다(닫힌 묶음은 한 노드, #241).
  const groupHead = data.groupHead;
  // 불일치 노드는 보기만 한다(F-003): 코멘트·편집 도구가 없고 카드를 눌러 연다.
  const canComment =
    !groupHead &&
    !!data.output &&
    data.output.kind !== 'mismatch' &&
    !!data.answerId &&
    !!navigation.history?.canComment(data.setId, data.answerId, data.output.id);
  const canEdit =
    !groupHead &&
    !!data.output &&
    data.output.kind !== 'mismatch' &&
    !!navigation.editor?.canOpen(data.setId, data.output.id);
  const nodeName = data.groupLabel ?? data.label;
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
  const selectedComment = navigation.history?.selectedComment;
  const commenting =
    !!data.output &&
    selectedComment?.answerId === data.answerId &&
    selectedComment?.nodeId === data.output.id;
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
        tabIndex={!groupHead && navigation.active[data.setId] === id ? 0 : -1}
        onPointerDownCapture={markPointer}
        onPointerEnter={
          groupHead ? (event) => markGroupHover(event.currentTarget, groupHead, true) : undefined
        }
        onPointerLeave={
          groupHead ? (event) => markGroupHover(event.currentTarget, groupHead, false) : undefined
        }
        onFocus={(event) => {
          if (event.target !== event.currentTarget || !groupHead) {
            reveal();
            return;
          }
          // 묶음의 다른 줄이 포커스를 받으면(누름) 묶음 첫 줄로 넘긴다. 도구·코너는 첫 줄에 있다.
          const head = event.currentTarget
            .closest('.react-flow__nodes')
            ?.querySelector<HTMLElement>(`[data-canvas-card="${CSS.escape(groupHead)}"]`);
          if (head) head.focus({ preventScroll: true });
          else reveal();
        }}
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
      {/* 코멘트 코너·띠와 노드 도구를 두는 틀. 보통은 카드 크기, 묶음 첫 줄은 묶음 카드 전체 크기다(#241).
          펼친 묶음은 첫 줄 카드가 묶음 전체를 대신하므로 카드 크기를 쓴다. */}
      {data.output && !groupHead ? (
        <div
          className="canvas-node-frame"
          data-node-frame={id}
          data-group={groupIds ? true : undefined}
          // 코너·띠·도구에 포커스가 오면 노드를 화면 안으로 옮긴다(마우스로 누른 포커스는 옮기지 않는다).
          onPointerDownCapture={markPointer}
          onFocus={reveal}
          style={
            groupIds && groupHeight && !editing
              ? ({ '--canvas-node-frame-height': `${groupHeight}px` } as CSSProperties)
              : undefined
          }
        >
          {canComment && navigation.history?.commentsApi ? (
            <CommentBand
              answerId={data.answerId!}
              nodeIds={groupIds ?? [data.output.id]}
              label={nodeName}
              api={navigation.history.commentsApi}
              labels={navigation.history.commentLabels}
              active={commenting}
              open={commenting && !!selectedComment?.open}
              onOpenChange={(open) =>
                navigation.history!.comment(data.setId, data.answerId!, data.output!.id, open)
              }
              onClose={navigation.history.closeComment}
            />
          ) : null}
          {(canComment || canEdit) && !editing && role !== 'covered' ? (
            <div
              className="canvas-node-tool nodrag nopan nowheel"
              data-open={commenting || undefined}
              role="group"
            >
              <div className="canvas-node-tool-bar">
                {canComment ? (
                  <button
                    type="button"
                    className="canvas-node-tool-button"
                    aria-label={`${COPY['S-07a']}: ${nodeName}`}
                    data-active={commenting || undefined}
                    data-comment-tool={`${data.answerId}:${data.output.id}`}
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
            </div>
          ) : null}
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
