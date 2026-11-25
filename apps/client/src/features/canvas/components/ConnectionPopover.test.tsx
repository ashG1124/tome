import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Connection } from '@tome/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { COPY } from '../../../shared/copy';
import { CanvasNavigation } from '../navigation';
import type { CanvasRemixOptions } from '../remix-model';
import { ConnectionPopover } from './ConnectionPopover';
afterEach(cleanup);
const connection: Connection = {
  id: '00000000-0000-4000-8000-000000000001',
  nodeId: 'k1',
  predictedAction: 'Lean on evidence',
  sentence: 'Leaned on evidence 7 of 10 times',
  status: 'shown',
};
function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <article data-canvas-card="card" tabIndex={0}>
        <ConnectionPopover answerId="answer" connection={connection} />
      </article>
    </QueryClientProvider>,
  );
  const trigger = screen.getByRole('button', {
    name: `${COPY['RC-01']}: ${connection.predictedAction}`,
  });
  return { trigger };
}
it('opens the prediction first, pages to the actual evidence and returns focus on Escape', async () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  // 1쪽은 예측, 글을 누르면 2쪽(실제 기록에서 센 근거)
  const pager = screen.getByRole('button', { name: connection.predictedAction });
  expect(document.activeElement).toBe(pager);
  fireEvent.click(pager);
  expect(screen.getByRole('button', { name: connection.sentence })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: connection.sentence }), {
    key: 'Escape',
  });
  expect(screen.queryByRole('region')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  // 다시 열면 1쪽부터
  fireEvent.click(trigger);
  expect(screen.getByRole('button', { name: connection.predictedAction })).toBeTruthy();
});
it('closes on the trigger hook and on an outside press', () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  expect(screen.queryByRole('region')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('region')).toBeNull();
});
it('shows the partner initial in the photo slot from the canvas context', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CanvasNavigation.Provider
        value={{
          active: {},
          focus: () => {},
          move: () => {},
          remix: {
            connectionsByAnswer: {},
            onApply: vi.fn(),
            partnerFor: () => ({ displayName: 'lind', avatarUrl: null }),
          },
        }}
      >
        <ConnectionPopover answerId="answer" connection={connection} />
      </CanvasNavigation.Provider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: `${COPY['RC-01']}: ${connection.predictedAction}` }),
  );
  expect(document.querySelector('.canvas-connection-photo')?.textContent).toBe('L');
});
it('leaves Apply disabled while its node-change rule is undecided', () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  expect((screen.getByRole('button', { name: COPY['RC-02'] }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText(COPY['RC-04'])).toBeTruthy();
});
it('has no Hide button: the open bubble only offers the text pager and Apply (#229)', () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  const region = screen.getByRole('region', { name: COPY['RC-01'] });
  expect(screen.queryByRole('button', { name: COPY['RC-03'] })).toBeNull();
  expect(Array.from(region.querySelectorAll('button')).map((button) => button.textContent)).toEqual(
    [connection.predictedAction, COPY['RC-02']],
  );
});

function withRemix(
  applyStateFor: CanvasRemixOptions['applyStateFor'],
  requestApply = vi.fn(),
  onApply = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CanvasNavigation.Provider
        value={{
          active: {},
          focus: () => {},
          move: () => {},
          remix: {
            connectionsByAnswer: {},
            onApply,
            applyStateFor,
            requestApply,
          },
        }}
      >
        <ConnectionPopover answerId="answer" connection={connection} />
      </CanvasNavigation.Provider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: `${COPY['RC-01']}: ${connection.predictedAction}` }),
  );
  return { requestApply, onApply };
}
it('Apply (#151): records the Connection and asks the canvas to apply it once even on double click', async () => {
  const { requestApply, onApply } = withRemix(() => 'ready');
  const apply = screen.getByRole('button', { name: COPY['RC-02'] }) as HTMLButtonElement;
  expect(apply.disabled).toBe(false);
  expect(screen.queryByText(COPY['RC-04'])).toBeNull();
  fireEvent.click(apply);
  fireEvent.click(apply);
  await waitFor(() => expect(requestApply).toHaveBeenCalledTimes(1));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(requestApply).toHaveBeenCalledWith('answer', connection);
});
it('Apply (#151): previous-partner, no-change and applied states lock Apply with a reason', () => {
  withRemix(() => 'stale');
  expect((screen.getByRole('button', { name: COPY['RC-02'] }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText(COPY['RC-07'])).toBeTruthy();
  cleanup();
  withRemix(() => 'no-change');
  expect(screen.getByText(COPY['RC-08'])).toBeTruthy();
  cleanup();
  withRemix(() => 'applied');
  const applied = screen.getByRole('button', { name: COPY['RC-06'] }) as HTMLButtonElement;
  expect(applied.disabled).toBe(true);
  expect(applied.getAttribute('aria-describedby')).toBeNull();
});
