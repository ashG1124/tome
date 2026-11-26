import type { AnswerSummary, Node } from '@tome/shared';
import type { CanvasRemixOptions } from './remix-model';
import type { AnswerVersionLabels } from './components/AnswerVersions';
import type { NodeCommentLabels } from './components/CommentBand';
import type { NodeCommentsApi } from './hooks/useNodeComments';
import { createContext, type ContextType } from 'react';
import { GROUP_KINDS } from './edit-model';
import type { ViewableAnswer } from './model';

export interface CanvasEditorSelection {
  setId: string;
  nodeId: string;
  /** 고른 노드 종류. 검색 우선순위·검증 기준은 묶음 전체가 한 카드로 펼쳐진다. */
  kind?: string;
  /** 접히는 중(애니메이션)이면 true */
  closing?: boolean;
}

/** 펼친 노드를 가리키는 키(세트 + 노드). 펼친 자리(slot)·접기 타이머를 이 키로 찾는다. */
export function selectionKey(selection: Pick<CanvasEditorSelection, 'setId' | 'nodeId'>): string {
  return `${selection.setId}:${selection.nodeId}`;
}

/**
 * 이 노드가 그 펼침에 들어 있는가. 묶음(우선순위·검증 기준)은 같은 종류 한 줄이 열려 있으면 묶음 전체가 열린 것이다.
 */
export function selectionCovers(
  selection: CanvasEditorSelection,
  setId: string,
  nodeId: string,
  kind?: string,
): boolean {
  if (selection.setId !== setId) return false;
  return (
    selection.nodeId === nodeId || (!!kind && GROUP_KINDS.has(kind) && selection.kind === kind)
  );
}

export interface CanvasEditorConnection {
  label: string;
  /**
   * 펼쳐 둔 노드들(연 순서). 여러 개를 함께 펼쳐 둘 수 있다(#261).
   * 다른 노드를 열거나 빈 곳을 눌러도 닫히지 않고, 펼친 노드를 다시 누르면 그 노드만 닫힌다.
   */
  selected?: readonly CanvasEditorSelection[];
  /** Apply 전 고친 값. 접힌 노드도 이 값(켜짐·꺼짐)으로 그린다. */
  draft?: { setId: string; nodes: readonly Node[] };
  canOpen: (setId: string, nodeId: string) => boolean;
  open: (setId: string, nodeId: string) => void;
  /** 펼친 노드를 다시 눌렀을 때 그 노드만 접는다. */
  close?: (setId: string, nodeId: string) => void;
  /** 펼친 노드 카드 안의 빈 자리. 편집 화면이 이 자리에 그려진다(노드마다 하나). */
  slot?: (setId: string, nodeId: string, element: HTMLElement | null) => void;
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

/** 펼쳐 둔 노드들 가운데 이 카드가 맡은 것과 그 자리(펼친 카드·덮인 줄). 없으면 undefined */
export function openMatch(
  selected: readonly CanvasEditorSelection[] | undefined,
  setId: string,
  output: { id: string; kind: string } | undefined,
  groupPosition: string | undefined,
): { selection: CanvasEditorSelection; role: 'open' | 'covered' } | undefined {
  for (const selection of selected ?? []) {
    const role = openRole(selection, setId, output, groupPosition);
    if (role) return { selection, role };
  }
  return undefined;
}

export const CanvasNavigation = createContext<{
  history?: {
    answersBySet: Record<string, readonly AnswerSummary[]>;
    labels: AnswerVersionLabels;
    /** 코멘트 대상 노드(묶음이면 첫 줄 id). open 이면 분홍 띠가 펼쳐져 입력 중이다(#241). */
    selectedComment?: { answerId: string; nodeId: string; open: boolean };
    selectingSet?: string;
    pinning: boolean;
    disabled: boolean;
    select: (setId: string, answerId: string) => void;
    pin: (answerId: string, pinned: boolean) => Promise<void>;
    canComment: (setId: string, answerId: string, nodeId: string) => boolean;
    /** 노드를 코멘트 대상으로 한다. open 이면 띠를 펼친다(코너를 눌렀다), 아니면 코너만 만든다(노드 도구의 코멘트 아이콘). */
    comment: (setId: string, answerId: string, nodeId: string, open?: boolean) => void;
    /** 코멘트 대상을 푼다. restoreFocus(기본 true)면 포커스를 대상을 만든 버튼(코멘트 아이콘·코너)으로 돌려준다. */
    closeComment: (restoreFocus?: boolean) => void;
    commentsApi?: NodeCommentsApi;
    commentLabels: NodeCommentLabels;
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
