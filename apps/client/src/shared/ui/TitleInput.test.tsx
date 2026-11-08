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
});
