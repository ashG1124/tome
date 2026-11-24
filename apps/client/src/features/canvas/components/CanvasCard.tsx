import { memo, useContext, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../model';
import { CanvasNavigation, openRole } from '../navigation';
import { COPY } from '../../../shared/copy';
import { Icon } from '../../../shared/ui';
import { AnswerVersions } from './AnswerVersions';
import { ConnectionPopover } from './ConnectionPopover';
import { connectionsForNode } from '../remix-model';
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

export const CanvasCard = memo(function CanvasCard({ id, data }: NodeProps<CanvasNode>) {
  const navigation = useContext(CanvasNavigation);
  // 마우스로 누른 포커스면 화면을 옮기지 않는다(누르는 사이 노드가 움직이면 누름이 빈 캔버스로 빗나간다).
  const pointing = useRef(false);
  const reveal = () => {
    const fromPointer = pointing.current;
    pointing.current = false;
    navigation.focus(id, !fromPointer);
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
      <div className="canvas-heading" data-variant={data.variant}>
        {data.text ? <span>{data.text}</span> : null}
        <strong>{data.label}</strong>
      </div>
    );
  const canComment =
    !!data.output &&
    !!data.answerId &&
    !!navigation.history?.canComment(data.setId, data.answerId, data.output.id);
  const canEdit = !!data.output && !!navigation.editor?.canOpen(data.setId, data.output.id);
  const role = openRole(navigation.editor?.selected, data.setId, data.output, data.groupPosition);
  const editing = role === 'open';
  const commenting =
    !!data.output &&
    navigation.history?.selectedComment?.answerId === data.answerId &&
    navigation.history?.selectedComment?.nodeId === data.output.id;
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
        covered={role === 'covered'}
        answerFooter={
          data.kind === 'answer' && data.answer && navigation.history ? (
            <AnswerVersions
              answer={data.answer}
              answers={navigation.history.answersBySet[data.setId] ?? []}
              labels={navigation.history.labels}
              loading={navigation.history.selectingSet === data.setId}
              pinning={navigation.history.pinning}
              disabled={navigation.history.disabled}
              onSelect={(answerId) => navigation.history!.select(data.setId, answerId)}
              onPin={navigation.history.pin}
            />
          ) : null
        }
        data-canvas-card={id}
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
          if (data.output && navigation.editor?.canOpen(data.setId, data.output.id))
            navigation.editor.open(data.setId, data.output.id);
        }}
        onKeyDown={(event) => {
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
        {editing ? (
          <div
            ref={navigation.editor?.slot}
            className="canvas-node-open-slot"
            data-closing={navigation.editor?.closing || undefined}
          />
        ) : null}
        <div className="canvas-connections" data-column={data.column}>
          {connectionsForNode(navigation.remix, data.answerId, data.output?.id).map(
            (connection) => (
              <ConnectionPopover
                key={`${data.answerId}:${connection.id}`}
                answerId={data.answerId!}
                connection={connection}
                disabled={navigation.remixDisabled}
                onDismiss={navigation.remix!.onDismiss}
              />
            ),
          )}
        </div>
      </CanvasSurface>
      {canComment && navigation.history?.listComments ? (
        <CommentBand
          answerId={data.answerId!}
          nodeId={data.output!.id}
          list={navigation.history.listComments}
          open={commenting}
        />
      ) : null}
      {(canComment || canEdit) && !editing && role !== 'covered' ? (
        <div
          className="canvas-node-tool nodrag nopan nowheel"
          data-open={commenting || undefined}
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
                onClick={() => navigation.editor?.open(data.setId, data.output!.id)}
              >
                <Icon name="edit" size={24} />
              </button>
            ) : null}
          </div>
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
