import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Answer, AnswerSummary } from '@tome/shared';
import { CanvasSurface } from './CanvasSurface';
import { CANVAS_COPY } from '../../../shared/copy';
import { AnswerVersions } from './AnswerVersions';
afterEach(cleanup);
const labels = {
  previous: 'Previous version',
  next: 'Next version',
  pin: 'Pin answer',
  unpin: 'Unpin answer',
};
const first = {
  id: 'first',
  number: 1,
  status: 'accepted',
  pinned: false,
  createdAt: '2026-11-19T00:00:00Z',
} as Answer;
const second = { ...first, id: 'second', number: 2 };
it('disables both chevrons for one version and renders a sample without inventing a version', () => {
  const { rerender } = render(
    <AnswerVersions
      answer={first}
      answers={[first]}
      labels={labels}
      onSelect={vi.fn()}
      onPin={vi.fn()}
    />,
  );
  expect(
    (screen.getByRole('button', { name: labels.previous }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole('button', { name: labels.next }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  rerender(
    <AnswerVersions
      answer={{ ...first, number: null }}
      answers={[{ ...first, number: null }]}
      labels={labels}
      onSelect={vi.fn()}
      onPin={vi.fn()}
    />,
  );
  expect(screen.getByText('Sample result')).toBeTruthy();
});
it('orders versions and selects by answer ID, including disabled boundary buttons', () => {
  const onSelect = vi.fn();
  const { rerender } = render(
    <AnswerVersions
      answer={first}
      answers={[second, first]}
      labels={labels}
      onSelect={onSelect}
      onPin={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: labels.next }));
  expect(onSelect).toHaveBeenCalledWith('second');
  rerender(
    <AnswerVersions
      answer={second}
      answers={[second, first]}
      labels={labels}
      onSelect={onSelect}
      onPin={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: labels.previous }));
  expect(onSelect).toHaveBeenLastCalledWith('first');
});
it('pins the displayed answer and locks mutation controls while pending', () => {
  const onPin = vi.fn().mockResolvedValue(undefined);
  const { rerender } = render(
    <AnswerVersions
      answer={first}
      answers={[first]}
      labels={labels}
      onSelect={vi.fn()}
      onPin={onPin}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: labels.pin }));
  expect(onPin).toHaveBeenCalledWith('first', true);
  rerender(
    <AnswerVersions
      answer={{ ...first, pinned: true }}
      answers={[first] as AnswerSummary[]}
      labels={labels}
      pinning
      onSelect={vi.fn()}
      onPin={onPin}
    />,
  );
  expect(screen.getByRole('button', { name: labels.unpin }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect((screen.getByRole('button', { name: labels.unpin }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('replaces the default answer footer without repeating the version label', () => {
  render(
    <CanvasSurface
      data={{
        kind: 'answer',
        setId: 'set',
        column: 6,
        row: 0,
        label: 'Answer 01',
        labels: CANVAS_COPY,
        state: 'done',
      }}
      answerFooter={
        <AnswerVersions
          answer={first}
          answers={[first]}
          labels={labels}
          onSelect={vi.fn()}
          onPin={vi.fn()}
        />
      }
    />,
  );
  expect(screen.getAllByText('Answer 01')).toHaveLength(1);
});
it('shows the chip and stacks up to two earlier versions behind the card', () => {
  const third = { ...first, id: 'third', number: 3 };
  const fourth = { ...first, id: 'fourth', number: 4 };
  const all = [fourth, third, second, first];
  const { container, rerender } = render(
    <AnswerVersions
      answer={fourth}
      answers={all}
      labels={labels}
      onSelect={vi.fn()}
      onPin={vi.fn()}
    />,
  );
  expect(screen.getByText('Answer 04').className).toContain('canvas-answer-chip');
  expect(container.querySelectorAll('.canvas-answer-layer')).toHaveLength(2);
  rerender(
    <AnswerVersions
      answer={second}
      answers={all}
      labels={labels}
      onSelect={vi.fn()}
      onPin={vi.fn()}
    />,
  );
  expect(container.querySelectorAll('.canvas-answer-layer')).toHaveLength(1);
  rerender(
    <AnswerVersions
      answer={first}
      answers={all}
      labels={labels}
      onSelect={vi.fn()}
      onPin={vi.fn()}
    />,
  );
  expect(container.querySelectorAll('.canvas-answer-layer')).toHaveLength(0);
});
