import { createContext } from 'react';

export interface CanvasEditorConnection {
  label: string;
  selected?: { setId: string; nodeId: string };
  canOpen: (setId: string, nodeId: string) => boolean;
  open: (setId: string, nodeId: string) => void;
}

export const CanvasNavigation = createContext<{
  active: Record<string, string>;
  focus: (id: string) => void;
  move: (id: string, key: string) => void;
  editor?: CanvasEditorConnection;
}>({ active: {}, focus: () => {}, move: () => {} });
