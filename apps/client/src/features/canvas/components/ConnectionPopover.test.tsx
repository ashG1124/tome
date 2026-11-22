import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Connection } from '@tome/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { COPY } from '../../../shared/copy';
import { ConnectionPopover } from './ConnectionPopover';
afterEach(cleanup);
const connection: Connection = {
  id: '00000000-0000-4000-8000-000000000001',
  nodeId: 'k1',
  predictedAction: 'Lean on evidence',
  sentence: 'Leaned on evidence 7 of 10 times',
  status: 'shown',
};
function setup(onDismiss = vi.fn().mockResolvedValue(undefined)) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <article data-canvas-card="card" tabIndex={0}>
        <ConnectionPopover answerId="answer" connection={connection} onDismiss={onDismiss} />
      </article>
    </QueryClientProvider>,
  );
  const trigger = screen.getByRole('button', {
    name: `${COPY['RC-01']}: ${connection.predictedAction}`,
  });
  return { trigger, onDismiss };
}
it('opens actual evidence as text, focuses Close and returns focus on Escape', async () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  expect(screen.getByText(connection.sentence)).toBeTruthy();
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(screen.getByRole('button', { name: COPY['D-11'] }));
  fireEvent.keyDown(screen.getByRole('button', { name: COPY['D-11'] }), { key: 'Escape' });
  expect(screen.queryByRole('region')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('leaves Apply disabled while its node-change rule is undecided', () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  expect((screen.getByRole('button', { name: COPY['RC-02'] }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText(COPY['RC-04'])).toBeTruthy();
});
it('locks duplicate dismissals, keeps evidence on failure and allows retry', async () => {
  const dismiss = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(undefined);
  const { trigger } = setup(dismiss);
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: COPY['RC-03'] }));
  fireEvent.click(screen.getByRole('button', { name: COPY['RC-03'] }));
  await screen.findByRole('alert');
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(screen.getByText(connection.sentence)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: COPY['RC-03'] }));
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: `${COPY['RC-01']}: ${connection.predictedAction}` }),
    ).toBeNull(),
  );
  expect(dismiss).toHaveBeenLastCalledWith('answer', connection);
});
