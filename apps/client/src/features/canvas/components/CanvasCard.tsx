import { memo, useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../model';
import { CanvasNavigation } from '../navigation';
import { COPY } from '../../../shared/copy';
import { AnswerVersions } from './AnswerVersions';
import { CanvasSurface } from './CanvasSurface';

export const CanvasCard = memo(function CanvasCard({ id, data }: NodeProps<CanvasNode>) {
  const navigation = useContext(CanvasNavigation);
  if (data.kind === 'heading')
    return (
      <div className="canvas-heading">
        {data.text ? <span>{data.text}</span> : null}
        <strong>{data.label}</strong>
      </div>
    );
  return (
    <>
      {data.kind !== 'prompt' ? (
        <Handle type="target" position={Position.Left} isConnectable={false} />
      ) : null}
      <CanvasSurface
        data={data}
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
        onFocus={() => navigation.focus(id)}
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('button, input, [role="slider"]')
          )
            return;
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
        {data.output &&
        data.answerId &&
        navigation.history?.canComment(data.setId, data.answerId, data.output.id) ? (
          <button
            type="button"
            className="canvas-comment-corner nodrag nopan nowheel"
            aria-label={`${COPY['S-07a']}: ${data.label}`}
            aria-expanded={
              navigation.history.selectedComment?.answerId === data.answerId &&
              navigation.history.selectedComment?.nodeId === data.output.id
            }
            onClick={() => navigation.history!.comment(data.setId, data.answerId!, data.output!.id)}
          />
        ) : null}
      </CanvasSurface>
      {data.output && navigation.editor?.canOpen(data.setId, data.output.id) ? (
        <button
          type="button"
          className="canvas-retry nodrag nopan nowheel"
          aria-expanded={
            navigation.editor.selected?.setId === data.setId &&
            navigation.editor.selected.nodeId === data.output.id
          }
          onClick={() => navigation.editor?.open(data.setId, data.output!.id)}
        >
          {navigation.editor.label}
        </button>
      ) : null}

      {data.kind !== 'answer' ? (
        <Handle type="source" position={Position.Right} isConnectable={false} />
      ) : null}
    </>
  );
});
