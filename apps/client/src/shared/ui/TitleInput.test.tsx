import { LIMITS } from '@tome/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TitleInput } from './TitleInput';

function Controlled() {
  const [value, setValue] = useState('');
  return (
    <TitleInput
      aria-label="Title"
      placeholder="Hint"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

describe('TitleInput', () => {
  it('접근 가능한 이름을 가진 텍스트 입력칸이다', () => {
    render(<TitleInput aria-label="Title" value="" onChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input.getAttribute('type')).toBe('text');
  });

  it('placeholder 를 props 로 받아 보여 준다', () => {
    render(<TitleInput aria-label="Title" placeholder="Hint" value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText('Hint')).toBeTruthy();
  });

  it('입력한 값을 반영한다', () => {
    render(<Controlled />);
    const input = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.value).toBe('abc');
  });

  it('최대 길이는 기본으로 제목 최대 길이(LIMITS.TITLE_MAX)다', () => {
    render(<TitleInput aria-label="Title" />);
    const input = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
    expect(input.maxLength).toBe(LIMITS.TITLE_MAX);
  });

  it('maxLength 를 넘겨 바꿀 수 있다', () => {
    render(<TitleInput aria-label="Title" maxLength={5} />);
    const input = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
    expect(input.maxLength).toBe(5);
  });

  it('비활성이면 입력할 수 없고 비활성 모양 클래스가 붙는다', () => {
    render(<TitleInput aria-label="Title" disabled />);
    const input = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.className).toContain('disabled:cursor-not-allowed');
  });

  it('aria-invalid 를 주면 오류 테두리(굵은 Peach)가 되고 오류 문장과 이어진다', () => {
    render(
      <>
        <TitleInput aria-label="Title" aria-invalid aria-describedby="err" />
        <p id="err">Give your project a title.</p>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.className).toContain(
      'aria-[invalid=true]:border-[color:var(--color-tome-peach-5)]',
    );
    expect(input.getAttribute('aria-describedby')).toBe('err');
  });

  it('기본 모양은 진한 테두리(--color-border-input)다', () => {
    render(<TitleInput aria-label="Title" />);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input.className).toContain('border-[color:var(--color-border-input)]');
    expect(input.className).not.toContain('focus-visible:outline-none!');
  });

  it('modal 모양은 시안처럼 연한 테두리·연한 안내 글자이고 안쪽 포커스 사각형을 끈다', () => {
    render(<TitleInput aria-label="Title" look="modal" />);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input.className).toContain('border-[color:var(--color-border-default)]');
    expect(input.className).toContain('placeholder:text-[color:var(--color-finish-placeholder)]');
    expect(input.className).toContain('focus:border-[color:var(--color-fill-neutral)]');
    expect(input.className).toContain('focus-visible:outline-none!');
    expect(input.className.split(' ')).not.toContain('border-[color:var(--color-border-input)]');
  });

  it('modal 모양은 키보드로 들어왔을 때만 바깥 테두리 표시(data-keyboard-focus)를 단다', () => {
    const seen: string[] = [];
    render(
      <TitleInput
        aria-label="Title"
        look="modal"
        onFocus={() => seen.push('focus')}
        onBlur={() => seen.push('blur')}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.pointerDown(window);
    fireEvent.focus(input);
    expect(input.hasAttribute('data-keyboard-focus')).toBe(false);
    fireEvent.blur(input);
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.focus(input);
    expect(input.hasAttribute('data-keyboard-focus')).toBe(true);
    fireEvent.blur(input);
    expect(input.hasAttribute('data-keyboard-focus')).toBe(false);
    expect(seen).toEqual(['focus', 'blur', 'focus', 'blur']);
  });

  it('기본 모양은 키보드 표시를 달지 않는다(전역 포커스 테두리를 그대로 쓴다)', () => {
    render(<TitleInput aria-label="Title" />);
    const input = screen.getByRole('textbox', { name: 'Title' });
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.focus(input);
    expect(input.hasAttribute('data-keyboard-focus')).toBe(false);
  });
});
