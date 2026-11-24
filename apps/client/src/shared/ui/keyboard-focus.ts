import { useEffect, useState, type FocusEvent } from 'react';

/**
 * 마지막 입력이 키보드였는지 기억한다.
 * 글 입력칸은 마우스로 눌러도 :focus-visible 이 켜져서, 키보드로 들어왔을 때만 테두리를 보이려면 따로 알아야 한다.
 */
let lastInputWasKeyboard = false;
let listeners = 0;

function onKey() {
  lastInputWasKeyboard = true;
}
function onPointer() {
  lastInputWasKeyboard = false;
}

function track(): () => void {
  if (listeners++ === 0) {
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
  }
  return () => {
    if (--listeners === 0) {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    }
  };
}

/**
 * 키보드로 포커스가 들어왔는지. 들어오면 true, 나가면 false.
 * 돌려준 onFocus·onBlur 를 입력칸에 달고, keyboardFocus 로 바깥 테두리를 그린다.
 */
export function useKeyboardFocus<T extends Element>(handlers: {
  onFocus?: (event: FocusEvent<T>) => void;
  onBlur?: (event: FocusEvent<T>) => void;
}) {
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  useEffect(() => track(), []);
  return {
    keyboardFocus,
    onFocus: (event: FocusEvent<T>) => {
      setKeyboardFocus(lastInputWasKeyboard);
      handlers.onFocus?.(event);
    },
    onBlur: (event: FocusEvent<T>) => {
      setKeyboardFocus(false);
      handlers.onBlur?.(event);
    },
  };
}
