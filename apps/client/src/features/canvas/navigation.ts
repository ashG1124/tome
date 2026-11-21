import { createContext } from 'react';

export const CanvasNavigation = createContext<{
  active: Record<string, string>;
  focus: (id: string) => void;
  move: (id: string, key: string) => void;
}>({ active: {}, focus: () => {}, move: () => {} });
