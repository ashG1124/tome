import { memo, useEffect, useRef } from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import type { Node } from '@tome/shared';
import { ErrorNotice, Icon } from '../../../shared/ui';
import type { NodeEditorLabels } from './NodeEditPanel';
import { isCloseClick } from '../close-click';
import '../node-edit.css';

export interface VerificationPanelProps {
  /** 고른 검증 노드. 기준이면 같은 묶음(criteria) 전체가 한 카드로 펼쳐진다. */
  node: Node;
  /** 펼친 카드에 보일 기준 목록(기준일 때) */
  criteria: readonly Node[];
  labels: NodeEditorLabels;
  /** 저장 중인 기준 id. 저장이 끝날 때까지 모든 빼기 버튼을 잠근다. */
  saving?: readonly string[];
  errorMessage?: string;
  onToggle: (id: string, enabled: boolean) => void;
  /** 처음 값으로 되돌릴 기준이 있으면 다시 생성 버튼이 이 일을 한다. */
  onRestore?: () => void;
  /** 코멘트를 남길 수 있으면(기준 묶음) 노드 도구 맨 위에 코멘트 버튼을 둔다(#241). */
  onComment?: () => void;
  onClose: () => void;
}

/**
 * 5단계 검증 노드 제자리 펼침(시안 [Step5] verification criteria open=on 2971:69385, Discrepancies open=on 2971:70740).
 * 기준: 굵은 글 + 빼기(켜고 끄기, 바로 저장). 불일치: 가운데 굵은 글(표시만, F-003).
 * 노드 도구(1187:62182)에는 실제로 할 수 있는 일만 둔다 — 기준은 코멘트(묶음 첫 줄 id 에 모인다, #241)와
 * 다시 생성(처음 값으로 되돌림)이 있다. 삭제는 줄마다 빼기가 대신한다. 불일치는 보기 전용이라 도구를 두지 않는다.
 */
export const VerificationPanel = memo(function VerificationPanel({
  node,
  criteria,
  labels,
  saving,
  errorMessage,
  onToggle,
  onRestore,
  onComment,
  onClose,
}: VerificationPanelProps) {
  const root = useRef<HTMLElement>(null);
  const locked = !!saving;
  useEffect(() => {
    // 펼칠 때 한 번만 포커스를 옮긴다. 불일치는 누를 것이 없어 카드 자체에 둔다(Esc 로 접힌다).
    const target = root.current?.querySelector<HTMLElement>('[role="switch"]') ?? root.current;
    target?.focus({ preventScroll: true });
  }, []);
  const isCriterion = node.kind === 'criterion';
  return (
    <section
      ref={root}
      className="node-open nodrag nopan nowheel"
      data-kind={node.kind}
      aria-label={`${labels.title}: ${node.text}`}
      tabIndex={-1}
      onClick={(event) => {
        // 펼친 노드를 다시 누르면 접는다(#261). 빼기·도구 단추를 누를 때는 접지 않는다.
        if (!locked && isCloseClick(event)) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !locked) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="node-open-body">
        <div className="node-open-inner">
          {isCriterion ? (
            <ul className="node-open-list" aria-busy={locked || undefined}>
              {criteria.map((item) => (
                <li
                  key={item.id}
                  className="node-open-list-item"
                  data-enabled={String(item.enabled)}
                >
                  <span className="node-open-list-text">{item.text}</span>
                  <RadixSwitch.Root
                    className="node-open-remove"
                    checked={item.enabled}
                    disabled={locked}
                    aria-busy={saving?.includes(item.id) || undefined}
                    aria-label={`${labels.enabled}: ${item.text}`}
                    onCheckedChange={(enabled) => onToggle(item.id, enabled)}
                  >
                    <Icon name="minus-circle" size={24} />
                  </RadixSwitch.Root>
                </li>
              ))}
            </ul>
          ) : (
            <p className="node-open-title" data-enabled={String(node.enabled)}>
              {node.text}
            </p>
          )}
          {errorMessage ? (
            <div className="node-open-error">
              <ErrorNotice message={errorMessage} />
            </div>
          ) : null}
        </div>
      </div>
      {isCriterion ? (
        <div className="node-open-tool" role="group" aria-label={labels.title}>
          {onComment ? (
            <button
              type="button"
              className="canvas-node-tool-button"
              aria-label={labels.comment ?? labels.title}
              disabled={locked}
              onClick={onComment}
            >
              <Icon name="comment" size={24} />
            </button>
          ) : null}
          <button
            type="button"
            className="canvas-node-tool-button"
            aria-label={labels.regenerate}
            disabled={locked || !onRestore}
            onClick={onRestore}
          >
            <Icon name="regenerate" size={24} />
          </button>
        </div>
      ) : null}
    </section>
  );
});
