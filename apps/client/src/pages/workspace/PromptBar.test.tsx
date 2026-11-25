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

  it('보내는 즉시 생성 중(S-03)을 보여 주고 입력칸은 읽기 전용, 끝나면 다시 쓸 수 있다', async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<Harness onSubmit={onSubmit} />);

    type('a quiet harbor');
    enter();
    expect(input().readOnly).toBe(true);
    expect(input().getAttribute('aria-busy')).toBe('true');
    // 서버 응답(입력 안전 검사로 늦을 수 있음)을 기다리지 않고 바로 보인다
    expect(screen.getByText(COPY['S-03'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: COPY['S-11a'] })).toBeNull();

    finish();
    await screen.findByRole('textbox', { name: COPY['S-08'] });
    await vi.waitFor(() => expect(input().readOnly).toBe(false));
    expect(screen.queryByText(COPY['S-03'])).toBeNull();
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

    // 생성 뒤에도 자리표시 문구는 그대로 남는다
    expect(input().placeholder).toBe(COPY['S-08']);
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('PromptBar 여러 줄 모양(#228, 3468:30233)', () => {
  const pill = () => input().parentElement as HTMLElement;
  const send = () => screen.queryByRole('button', { name: COPY['FG-05'] });
  const mic = () => screen.queryByRole('button', { name: COPY['FG-03'] });

  it('한 줄이면 지금 모양: 반짝임·입력칸·마이크, 보내기 버튼 없음', () => {
    render(<Harness emptyPage={false} onSubmit={vi.fn()} />);
    type('a quiet harbor');
    expect(pill().hasAttribute('data-prompt-multiline')).toBe(false);
    expect(mic()).not.toBeNull();
    expect(send()).toBeNull();
  });

  it('두 줄 이상이면 글이 위, 아래 줄에 + 와 보내기. 모델 이름·마이크는 없다', () => {
    render(<Harness emptyPage={false} onSubmit={vi.fn()} />);
    type('first line\nsecond line');
    expect(pill().getAttribute('data-prompt-multiline')).toBe('true');
    expect(pill().className).toContain("[grid-template-areas:'text_text_text'_'lead_._tool']");
    expect(pill().querySelector('[data-prompt-plus] [data-icon="sparkle"]')).not.toBeNull();
    expect(send()?.querySelector('[data-icon="send"]')).not.toBeNull();
    expect(mic()).toBeNull();
    expect(pill().textContent).not.toMatch(/GPT/);
  });

  it('입력칸은 모양이 바뀌어도 같은 요소라 포커스가 남는다', () => {
    render(<Harness emptyPage={false} onSubmit={vi.fn()} />);
    const before = input();
    before.focus();
    type('first\nsecond');
    expect(input()).toBe(before);
    expect(document.activeElement).toBe(before);
    type('one');
    expect(pill().hasAttribute('data-prompt-multiline')).toBe(false);
  });

  it('보내기 버튼은 Enter 와 같이 보낸다', () => {
    const onSubmit = vi.fn();
    render(<Harness emptyPage={false} onSubmit={onSubmit} />);
    type('  first line\nsecond line ');
    fireEvent.click(send()!);
    expect(onSubmit).toHaveBeenCalledWith({ prompt: 'first line\nsecond line' });
  });

  it('여러 줄에서도 Enter 는 보내고 Shift+Enter 는 보내지 않는다', () => {
    const onSubmit = vi.fn();
    render(<Harness emptyPage={false} onSubmit={onSubmit} />);
    type('first\nsecond');
    enter({ shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    enter();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('공백·줄바꿈뿐이면 보내기 버튼이 비활성이다', () => {
    render(<Harness emptyPage={false} onSubmit={vi.fn()} />);
    type(' \n ');
    expect((send() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('PromptBar 리믹스 칩(4898:93342)', () => {
  const partner = { displayName: 'Milla', avatarUrl: null };
  function render2({ emptyPage, open = false }: { emptyPage: boolean; open?: boolean }) {
    const onToggle = vi.fn();
    render(
      <PromptBar
        state="ready"
        emptyPage={emptyPage}
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        greetingName="Jiho"
        remix={{ partner, open, panelId: 'remix-panel', onToggle }}
      />,
    );
    return { onToggle };
  }
  const chip = () => screen.queryByRole('button', { name: `${COPY['RX-01']} Milla` });

  it('빈 페이지면 반짝이 대신 상대 칩과 "Start a new project with 이름"을 보인다', () => {
    const { onToggle } = render2({ emptyPage: true });
    expect(input().placeholder).toBe(COPY['FG-04'].replace('{name}', 'Milla'));
    expect(chip()?.textContent).toBe('M');
    expect(chip()?.getAttribute('aria-expanded')).toBe('false');
    // 닫혀 있으면 오른쪽 화살표는 손을 올리거나 키보드로 올 때만 보인다(4897:96773)
    expect(chip()?.querySelector('[data-icon="arrow-right"]')?.parentElement?.className).toContain(
      'group-hover:flex',
    );
    fireEvent.click(chip()!);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('패널이 열려 있으면 아래 화살표(4706:159190)', () => {
    render2({ emptyPage: true, open: true });
    expect(chip()?.getAttribute('aria-controls')).toBe('remix-panel');
    expect(chip()?.querySelector('[data-icon="arrow-down"]')).not.toBeNull();
  });

  it('세트가 있는 페이지는 평소 인사말과 반짝이를 그대로 쓴다', () => {
    render2({ emptyPage: false });
    expect(chip()).toBeNull();
    expect(input().placeholder).toBe(COPY['FG-01'].replace('{name}', 'Jiho'));
  });
});
