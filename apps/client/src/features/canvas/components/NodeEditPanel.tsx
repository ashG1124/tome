import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import type { Node, NodeSnapshot } from '@tome/shared';
import { Icon, Tabs } from '../../../shared/ui';
import { SNAP_KINDS, canEditNode, nodePad, nodeWeight } from '../edit-model';
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
  delete?: string;
  comment?: string;
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
  /** 코멘트를 남길 수 있으면 노드 도구 맨 위에 코멘트 버튼을 둔다. */
  onComment?: () => void;
  /** 접히는 중이면 true — 닫힌 카드 높이로 줄어든다 */
  closing?: boolean;
}

/** 펼침 움직임 값(토큰 --motion-expand·--ease-out-soft). 움직임 줄이기면 null */
function expandMotion(element: Element): { duration: number; easing: string } | null {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  const css = getComputedStyle(element);
  const duration = Number.parseFloat(css.getPropertyValue('--motion-expand'));
  if (!duration) return null;
  return { duration, easing: css.getPropertyValue('--ease-out-soft').trim() || 'ease-out' };
}

/**
 * 닫힌 카드 높이(--node-closed-height)에서 내용 높이로 늘어나고, 접힐 때 다시 그 높이로 줄어든다.
 * 높이가 0까지 내려가지 않아 제목 글자가 사라졌다 나타나지 않는다. React Flow 가 매 프레임 높이를 재서 아래 노드도 함께 밀린다.
 */
function useExpandHeight(closing: boolean, enabled: boolean) {
  const body = useRef<HTMLDivElement>(null);
  const closedHeight = () => {
    const element = body.current;
    if (!element) return 0;
    return (
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--node-closed-height')) || 0
    );
  };
  useLayoutEffect(() => {
    const element = body.current;
    if (!enabled || !element || typeof element.animate !== 'function') return;
    const motion = expandMotion(element);
    const from = closedHeight();
    if (!motion || !from) return;
    const to = element.scrollHeight;
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], motion);
    return () => animation.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 펼칠 때 한 번만 움직인다.
  }, []);
  useLayoutEffect(() => {
    const element = body.current;
    if (!enabled || !closing || !element || typeof element.animate !== 'function') return;
    const motion = expandMotion(element);
    const to = closedHeight();
    if (!motion || !to) return;
    const animation = element.animate(
      [{ height: `${element.getBoundingClientRect().height}px` }, { height: `${to}px` }],
      { ...motion, fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [closing, enabled]);
  return body;
}

/** 노드 안 켜짐 스위치(시안 active switch 1226:67917, 40×22). Radix Switch 를 감싼다. */
function NodeSwitch({
  checked,
  label,
  disabled,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <RadixSwitch.Root
      className="canvas-node-switch node-open-switch"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      data-on={String(checked)}
      onCheckedChange={onCheckedChange}
    >
      <RadixSwitch.Thumb className="node-open-switch-thumb" />
    </RadixSwitch.Root>
  );
}

export function KeywordEditor({
  node,
  labels,
  disabled = false,
  onChange,
  initialTab = 'weight',
  description,
}: {
  node: Node;
  labels: NodeEditorLabels;
  disabled?: boolean;
  onChange: (node: Node) => void;
  initialTab?: 'weight' | 'meaning';
  /** 숫자 휠 위 설명. 없으면 키보드 안내(instructions)가 설명 자리에 보인다(노드 펼침). */
  description?: string;
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
            {description ? <p className="node-edit-description">{description}</p> : null}
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

/** 2단계 검색 우선순위 목록(시안 [Step2] open=on 2971:66085). 손잡이를 끌거나 ↑↓ 키로 순서를 바꾼다. */
function PriorityList({
  snapshot,
  labels,
  disabled,
  onChange,
  onReorder,
}: Pick<NodeEditPanelProps, 'snapshot' | 'labels' | 'disabled' | 'onChange' | 'onReorder'>) {
  const dragged = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const priorities = snapshot.nodes
    .filter((item) => item.kind === 'priority')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const move = (index: number, step: -1 | 1) => {
    const target = priorities[index + step];
    if (!disabled && target) onReorder(priorities[index]!.id, target.id);
  };
  return (
    <ol aria-label={labels.priority} className="node-open-list">
      {priorities.map((item, index) => (
        <li
          key={item.id}
          className="node-open-list-item"
          data-enabled={String(item.enabled)}
          data-over={over === item.id || undefined}
          onDragOver={(event) => {
            if (disabled || !dragged.current) return;
            event.preventDefault();
            setOver(item.id);
          }}
          onDragLeave={() => setOver((current) => (current === item.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            const source = dragged.current;
            dragged.current = null;
            setOver(null);
            if (!disabled && source && source !== item.id) onReorder(source, item.id);
          }}
        >
          <button
            type="button"
            className="node-open-handle"
            disabled={disabled}
            draggable={!disabled}
            aria-label={`${labels.priority}: ${item.text}`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            onDragStart={(event) => {
              dragged.current = item.id;
              event.dataTransfer.setData('text/plain', item.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              dragged.current = null;
              setOver(null);
            }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              event.stopPropagation();
              move(index, event.key === 'ArrowUp' ? -1 : 1);
            }}
          >
            <Icon name="drag-handle" size={24} />
          </button>
          <span className="node-open-list-text">{item.text}</span>
          <RadixSwitch.Root
            className="node-open-remove"
            checked={item.enabled}
            disabled={disabled}
            aria-label={`${labels.enabled}: ${item.text}`}
            onCheckedChange={(enabled) => onChange({ ...item, enabled })}
          >
            <Icon name="minus-circle" size={24} />
          </RadixSwitch.Root>
        </li>
      ))}
    </ol>
  );
}

/** 2단계 데이터 유형 목록(시안 [Step2] data type open=on 1226:67889). 칸마다 넣고 뺀다. */
function DataTypeList({
  snapshot,
  disabled,
  onChange,
}: Pick<NodeEditPanelProps, 'snapshot' | 'disabled' | 'onChange'>) {
  return (
    <ul className="node-open-checks">
      {snapshot.nodes
        .filter((item) => item.kind === 'dataType')
        .map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={item.enabled}
              disabled={disabled}
              className="node-open-check"
              onClick={() => onChange({ ...item, enabled: !item.enabled })}
            >
              <Icon name={item.enabled ? 'check-on' : 'check-off'} size={24} />
              <span>{item.text}</span>
            </button>
          </li>
        ))}
    </ul>
  );
}

/**
 * 노드 제자리 펼침(시안 Node open=on: 키워드 1427:132650, 초안 1427:133413, 근거 2971:69002,
 * 데이터 유형 1226:67889, 우선순위 2971:66085). 노드 카드 안에 그려지고 오른쪽에 노드 도구(1187:62182)가 붙는다.
 * Esc 로 접는다.
 */
export const NodeEditPanel = memo(function NodeEditPanel({
  node,
  snapshot,
  labels,
  disabled = false,
  onChange,
  onReorder,
  onReset,
  onClose,
  onComment,
  closing = false,
}: NodeEditPanelProps) {
  const root = useRef<HTMLElement>(null);
  // 제목이 없는 노드(근거·우선순위)는 펼쳐도 높이가 거의 같아 움직이지 않는다(#204).
  const bodyRef = useExpandHeight(closing, !SNAP_KINDS.has(node.kind));
  useEffect(() => {
    root.current
      ?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"], input, button:not([disabled]):not([hidden]), [role="switch"]',
      )
      ?.focus({ preventScroll: true });
  }, []);
  const editable = canEditNode(node);
  const title = <p className="node-open-title">{node.text}</p>;
  let body;
  if (node.kind === 'keyword')
    body = (
      <>
        {title}
        <KeywordEditor node={node} labels={labels} disabled={disabled} onChange={onChange} />
      </>
    );
  else if (node.kind === 'attribute')
    body = (
      <>
        {title}
        <div className="node-edit-keyword-weight">
          <WeightDial
            value={nodeWeight(node)}
            label={labels.weighting}
            instructions={labels.weightInstructions}
            disabled={disabled}
            onChange={(weight) => onChange({ ...node, weight })}
          />
        </div>
      </>
    );
  else if (node.kind === 'evidence')
    body = (
      <div className="node-open-row">
        <p className="node-open-sentence" data-enabled={String(node.enabled)}>
          {node.text}
        </p>
        <NodeSwitch
          checked={node.enabled}
          label={labels.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange({ ...node, enabled })}
        />
      </div>
    );
  else if (node.kind === 'dataType')
    body = (
      <>
        {title}
        <DataTypeList snapshot={snapshot} disabled={disabled} onChange={onChange} />
      </>
    );
  else if (node.kind === 'priority')
    body = (
      <PriorityList
        snapshot={snapshot}
        labels={labels}
        disabled={disabled}
        onChange={onChange}
        onReorder={onReorder}
      />
    );
  else body = title;
  return (
    <section
      ref={root}
      className="node-open nodrag nopan nowheel"
      data-kind={node.kind}
      data-enabled={String(node.enabled)}
      aria-label={`${labels.title}: ${node.text}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !disabled) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div ref={bodyRef} className="node-open-body">
        <div className="node-open-inner">{body}</div>
      </div>
      <div className="node-open-tool" role="group" aria-label={labels.title}>
        {onComment ? (
          <button
            type="button"
            className="canvas-node-tool-button"
            aria-label={labels.comment ?? labels.title}
            disabled={disabled}
            onClick={onComment}
          >
            <Icon name="comment" size={24} />
          </button>
        ) : null}
        {editable ? (
          <button
            type="button"
            className="canvas-node-tool-button"
            aria-label={labels.regenerate}
            disabled={disabled}
            onClick={() => onReset(node.id)}
          >
            <Icon name="regenerate" size={24} />
          </button>
        ) : null}
        {/* 3단계 근거는 지우지 않고 켜고 끄기만 한다(시안 node tool type=step 3). 삭제는 enabled:false 로 보낸다. */}
        {editable && node.kind !== 'evidence' && node.kind !== 'priority' ? (
          <button
            type="button"
            className="canvas-node-tool-button"
            aria-label={labels.delete ?? labels.enabled}
            disabled={disabled || !node.enabled}
            onClick={() => onChange({ ...node, enabled: false })}
          >
            <Icon name="trash-can" size={24} />
          </button>
        ) : null}
      </div>
    </section>
  );
});
