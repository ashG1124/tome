import type { AnswerSummary, NodeComment } from '@tome/shared';
import type { CanvasRemixOptions } from './remix-model';
import type { AnswerVersionLabels } from './components/AnswerVersions';
import { createContext, type ContextType } from 'react';

export interface CanvasEditorConnection {
  label: string;
  selected?: { setId: string; nodeId: string };
  canOpen: (setId: string, nodeId: string) => boolean;
  open: (setId: string, nodeId: string) => void;
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
  focus: (id: string) => void;
  move: (id: string, key: string) => void;
  editor?: CanvasEditorConnection;
}>({ active: {}, focus: () => {}, move: () => {} });

export type CanvasHistoryConnection = NonNullable<ContextType<typeof CanvasNavigation>['history']>;
