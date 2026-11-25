import type { AnswerSummary, Node, NodeComment } from '@tome/shared';
import type { CanvasRemixOptions } from './remix-model';
import type { AnswerVersionLabels } from './components/AnswerVersions';
import { createContext, type ContextType, type ReactNode } from 'react';
import { GROUP_KINDS } from './edit-model';
import type { ViewableAnswer } from './model';

export interface CanvasEditorSelection {
  setId: string;
  nodeId: string;
  /** 고른 노드 종류. 검색 우선순위·검증 기준은 묶음 전체가 한 카드로 펼쳐진다. */
  kind?: string;
}

export interface CanvasEditorConnection {
  label: string;
  selected?: CanvasEditorSelection;
  /** 접히는 중(애니메이션)이면 true */
  closing?: boolean;
  /** Apply 전 고친 값. 접힌 노드도 이 값(켜짐·꺼짐)으로 그린다. */
  draft?: { setId: string; nodes: readonly Node[] };
  canOpen: (setId: string, nodeId: string) => boolean;
  open: (setId: string, nodeId: string) => void;
  close?: () => void;
  /** 펼친 노드 카드 안의 빈 자리. 편집 화면이 이 자리에 그려진다. */
  slot?: (element: HTMLElement | null) => void;
}

/** 펼친 노드의 위치. 검색 우선순위·검증 기준은 묶음 첫 줄 카드가 묶음 전체를 대신한다. */
export function openRole(
  selected: CanvasEditorSelection | undefined,
  setId: string,
  output: { id: string; kind: string } | undefined,
  groupPosition: string | undefined,
): 'open' | 'covered' | null {
  if (!selected || !output || selected.setId !== setId) return null;
  if (selected.kind && GROUP_KINDS.has(selected.kind) && output.kind === selected.kind)
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
    /** 열린 코멘트 창. selectedComment 노드의 도구 자리에서 펼쳐 그린다(#230). */
    commentPanel?: ReactNode;
  };
  remix?: CanvasRemixOptions;
  remixDisabled?: boolean;
  active: Record<string, string>;
  /** reveal 이 false 면(마우스로 누른 포커스) 화면을 옮기지 않는다. 누르는 동안 노드가 움직이면 누름이 빗나간다. */
  focus: (id: string, reveal?: boolean) => void;
  move: (id: string, key: string) => void;
  editor?: CanvasEditorConnection;
  /** 답변(그림) 카드·파생의 원작 답변 카드를 누르면(또는 Enter) 크게 보기 모달을 연다(#230·#237). */
  openAnswer?: (answer: ViewableAnswer) => void;
}>({ active: {}, focus: () => {}, move: () => {} });

export type CanvasHistoryConnection = NonNullable<ContextType<typeof CanvasNavigation>['history']>;
