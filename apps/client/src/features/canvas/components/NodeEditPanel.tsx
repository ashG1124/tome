import { memo, useEffect, useRef, useState } from 'react';
import type { Node, NodeSnapshot } from '@tome/shared';
import { Switch, Tabs } from '../../../shared/ui';
import { canEditNode, nodePad, nodeWeight } from '../edit-model';
import { WeightDial } from './WeightDial';
import { MeaningPad } from './MeaningPad';
import '../node-edit.css';

export interface NodeEditorLabels {
  title: string;
  weighting: string;
  meaning: string;
  enabled: string;
  regenerate: string;
  priority: string;
  moveUp: string;
  moveDown: string;
  close: string;
  weightInstructions?: string;
  meaningInstructions?: string;
}

export interface NodeEditPanelProps {
  node: Node;
  snapshot: NodeSnapshot;
  labels: NodeEditorLabels;
  disabled?: boolean;
  onChange: (node: Node) => void;
  onReorder: (source: string, target: string) => void;
  onReset: (id: string) => void;
  onClose: () => void;
}

export function KeywordEditor({
  node,
  labels,
  disabled = false,
  onChange,
  initialTab = 'weight',
}: {
  node: Node;
  labels: NodeEditorLabels;
  disabled?: boolean;
  onChange: (node: Node) => void;
  initialTab?: 'weight' | 'meaning';
}) {
  const [tab, setTab] = useState<'weight' | 'meaning'>(initialTab);
  return (
    <div className="node-edit-keyword">
      <Tabs
        value={tab}
        onValueChange={setTab}
        label={labels.title}
        items={[
          { value: 'weight', label: labels.weighting },
          { value: 'meaning', label: labels.meaning },
        ]}
      >
        {tab === 'weight' ? (
          <div className="node-edit-keyword-weight">
            <p className="node-edit-description">{node.text}</p>
            <WeightDial
              value={nodeWeight(node)}
              label={labels.weighting}
              instructions={labels.weightInstructions}
              disabled={disabled}
              onChange={(weight) => onChange({ ...node, weight })}
            />
          </div>
        ) : (
          <MeaningPad
            value={nodePad(node)}
            label={labels.meaning}
            instructions={labels.meaningInstructions}
            disabled={disabled}
            onChange={(pad) => onChange({ ...node, pad })}
          />
        )}
      </Tabs>
    </div>
  );
}

export const NodeEditPanel = memo(function NodeEditPanel({
  node,
  snapshot,
  labels,
  disabled = false,
  onChange,
  onReorder,
  onReset,
  onClose,
}: NodeEditPanelProps) {
  const dragged = useRef<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
  }, []);
  const priorities = snapshot.nodes
    .filter((item) => item.kind === 'priority')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const editable = canEditNode(node);
  const weighting = (
    <WeightDial
      value={nodeWeight(node)}
      label={labels.weighting}
      instructions={labels.weightInstructions}
      disabled={disabled}
      onChange={(weight) => onChange({ ...node, weight })}
    />
  );
  return (
    <section
      className="node-edit-panel nodrag nopan nowheel"
      aria-label={labels.title}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !disabled) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="node-edit-toolbar">
        <strong>{labels.title}</strong>
        <button ref={closeButton} type="button" disabled={disabled} onClick={onClose}>
          {labels.close}
        </button>
      </header>
      {node.kind !== 'keyword' ? <p className="node-edit-description">{node.text}</p> : null}
      {editable && node.kind !== 'dataType' && node.kind !== 'priority' ? (
        <Switch
          checked={node.enabled}
          disabled={disabled}
          aria-label={labels.enabled}
          onCheckedChange={(enabled) => onChange({ ...node, enabled })}
        />
      ) : null}
      {node.kind === 'keyword' ? (
        <KeywordEditor node={node} labels={labels} disabled={disabled} onChange={onChange} />
      ) : node.kind === 'attribute' ? (
        weighting
      ) : null}
      {node.kind === 'dataType'
        ? snapshot.nodes
            .filter((item) => item.kind === 'dataType')
            .map((item) => (
              <div key={item.id} className="node-edit-toolbar">
                <span>{item.text}</span>
                <Switch
                  checked={item.enabled}
                  disabled={disabled}
                  aria-label={item.text}
                  onCheckedChange={(enabled) => onChange({ ...item, enabled })}
                />
              </div>
            ))
        : null}
      {node.kind === 'priority' ? (
        <ol aria-label={labels.priority} className="node-edit-priorities">
          {priorities.map((item, index) => (
            <li
              key={item.id}
              onDragOver={(event) => {
                if (!disabled && dragged.current) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = dragged.current;
                dragged.current = null;
                if (!disabled && source) onReorder(source, item.id);
              }}
            >
              <button
                type="button"
                disabled={disabled}
                draggable={!disabled}
                aria-label={`${labels.priority}: ${item.text}`}
                onDragStart={(event) => {
                  dragged.current = item.id;
                  event.dataTransfer.setData('text/plain', item.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  dragged.current = null;
                }}
              >
                ⠿
              </button>
              <span>{item.text}</span>
              <Switch
                checked={item.enabled}
                disabled={disabled}
                aria-label={item.text}
                onCheckedChange={(enabled) => onChange({ ...item, enabled })}
              />
              <button
                type="button"
                aria-label={`${labels.moveUp}: ${item.text}`}
                disabled={disabled || index === 0}
                onClick={() => onReorder(item.id, priorities[index - 1]!.id)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`${labels.moveDown}: ${item.text}`}
                disabled={disabled || index === priorities.length - 1}
                onClick={() => onReorder(item.id, priorities[index + 1]!.id)}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {editable ? (
        <button type="button" disabled={disabled} onClick={() => onReset(node.id)}>
          {labels.regenerate}
        </button>
      ) : null}
    </section>
  );
});
