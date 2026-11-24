import type { AnswerSummary, NodeComment } from '@tome/shared';
import type { CanvasRemixOptions } from './remix-model';
import type { AnswerVersionLabels } from './components/AnswerVersions';
import { createContext, type ContextType } from 'react';

export interface CanvasEditorSelection {
  setId: string;
  nodeId: string;
  /** 고른 노드 종류. 검색 우선순위는 묶음 전체가 한 카드로 펼쳐진다. */
  kind?: string;
}

export interface CanvasEditorConnection {
  label: string;
  selected?: CanvasEditorSelection;
  /** 접히는 중(애니메이션)이면 true */
  closing?: boolean;
  canOpen: (setId: string, nodeId: string) => boolean;
  open: (setId: string, nodeId: string) => void;
  close?: () => void;
  /** 펼친 노드 카드 안의 빈 자리. 편집 화면이 이 자리에 그려진다. */
  slot?: (element: HTMLElement | null) => void;
}

/** 펼친 노드의 위치. 검색 우선순위는 묶음 첫 줄 카드가 묶음 전체를 대신한다. */
export function openRole(
  selected: CanvasEditorSelection | undefined,
  setId: string,
  output: { id: string; kind: string } | undefined,
  groupPosition: string | undefined,
): 'open' | 'covered' | null {
  if (!selected || !output || selected.setId !== setId) return null;
  if (selected.kind === 'priority' && output.kind === 'priority')
    return groupPosition === 'first' || groupPosition === 'only' ? 'open' : 'covered';
  return selected.nodeId === output.id ? 'open' : null;
}

export const CanvasNavigation = createContext<{
  history?: {
    answersBySet: Record<string, readonly AnswerSummary[]>;
    labels: AnswerVersionLabels;
    selectedComment?: { answerId: string; nodeId: string };
    selectingSet?: string;
    pinning: boolean;
    disabled: boolean;
    select: (setId: string, answerId: string) => void;
    pin: (answerId: string, pinned: boolean) => Promise<void>;
    canComment: (setId: string, answerId: string, nodeId: string) => boolean;
    comment: (setId: string, answerId: string, nodeId: string) => void;
    listComments?: (answerId: string) => Promise<readonly NodeComment[]>;
  };
  remix?: CanvasRemixOptions;
  remixDisabled?: boolean;
  active: Record<string, string>;
  /** reveal 이 false 면(마우스로 누른 포커스) 화면을 옮기지 않는다. 누르는 동안 노드가 움직이면 누름이 빗나간다. */
  focus: (id: string, reveal?: boolean) => void;
  move: (id: string, key: string) => void;
  editor?: CanvasEditorConnection;
}>({ active: {}, focus: () => {}, move: () => {} });

export type CanvasHistoryConnection = NonNullable<ContextType<typeof CanvasNavigation>['history']>;
