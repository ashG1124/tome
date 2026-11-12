import { LIMITS, PROMPT_PRESETS } from '@tome/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { COPY } from '../../shared/copy';
import { PromptBar, type PromptSubmit } from './PromptBar';
import type { PromptBarState } from './prompt';

function Harness({
  state = 'ready',
  emptyPage = true,
  onSubmit,
}: {
  state?: PromptBarState;
  emptyPage?: boolean;
  onSubmit: (request: PromptSubmit) => Promise<void> | void;
}) {
  const [value, setValue] = useState('');
  return (
    <PromptBar
      state={state}
      emptyPage={emptyPage}
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
    />
  );
}

const input = () => screen.getByRole('textbox', { name: COPY['S-08'] }) as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const enter = (init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(input(), { key: 'Enter', ...init });

describe('PromptBar', () => {
  it('빈 페이지면 인사말과 프리셋 5개를 보여 준다', () => {
    render(<Harness onSubmit={vi.fn()} />);

    expect(input().placeholder).toBe(COPY['S-08']);
    const presets = within(screen.getByRole('list')).getAllByRole('button');
    expect(presets.map((b) => b.textContent)).toEqual([
      COPY['S-11a'],
      COPY['S-11b'],
      COPY['S-11c'],
      COPY['S-11d'],
      COPY['S-11e'],
    ]);
  });

  it('프리셋을 누르면 입력창에 채우기만 하고 보내지 않는다', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: COPY['S-11b'] }));

    expect(input().value).toBe(PROMPT_PRESETS[1].prompt);
    expect(document.activeElement).toBe(input());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('프리셋을 고치지 않고 보내면 presetKey 를 같이 보낸다', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: COPY['S-11a'] }));
    enter();

    expect(onSubmit).toHaveBeenCalledWith({
      prompt: PROMPT_PRESETS[0].prompt,
      presetKey: PROMPT_PRESETS[0].key,
    });
  });

  it('직접 쓴 글은 presetKey 없이 앞뒤 공백을 빼고 보낸다', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    type('  a quiet harbor at dawn  ');
    enter();

    expect(onSubmit).toHaveBeenCalledWith({ prompt: 'a quiet harbor at dawn' });
  });

  it('빈 글은 보내지 않는다', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    type('   ');
    enter();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter 를 연달아 눌러도 보내는 중에는 한 번만 보낸다', () => {
    const onSubmit = vi.fn(() => new Promise<void>(() => {}));
    render(<Harness onSubmit={onSubmit} />);

    type('a quiet harbor');
    enter();
    enter();
    enter();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Shift+Enter 와 한글 조합 중 Enter 는 보내지 않는다', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    type('한글 입력');
    enter({ shiftKey: true });
    enter({ isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('500자를 넘게 쓸 수 없다', () => {
    render(<Harness onSubmit={vi.fn()} />);

    expect(input().maxLength).toBe(LIMITS.PROMPT_MAX);
  });

  it('생성 중이면 잠기고 S-03 이유를 입력창과 연결해 보여 준다', () => {
    render(<Harness state="generating" onSubmit={vi.fn()} />);

    expect(input().disabled).toBe(true);
    expect(screen.queryByRole('list')).toBeNull();
    const reason = screen.getByText(COPY['S-03']);
    expect(input().getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('세트 3개면 비활성이고 S-09 를 보여 준다', () => {
    render(<Harness state="full" emptyPage={false} onSubmit={vi.fn()} />);

    expect(input().disabled).toBe(true);
    expect(screen.getByText(COPY['S-09'])).toBeTruthy();
  });

  it('빈 페이지가 아니면 인사말·프리셋이 없다', () => {
    render(<Harness emptyPage={false} onSubmit={vi.fn()} />);

    expect(input().placeholder).toBe('');
    expect(screen.queryByRole('list')).toBeNull();
  });
});
