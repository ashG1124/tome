import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnswerSummary } from '@tome/shared';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, NetworkError } from '../../../shared/api';
import { COPY, SKELETON_COPY } from '../../../shared/copy';
import { DialogButton } from './DialogButton';
import type { FinishSteps } from './finish';
import { FinishModal } from './FinishModal';

function QueryWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

// Radix 스위치는 form 안에서 크기를 재려고 ResizeObserver 를 쓴다. jsdom 에는 없어서 빈 대역을 둔다.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const A1 = '3f2b8a1e-5c4d-4e6f-8a7b-9c0d1e2f3a4b';
const A2 = '7d9e1c2a-6b5f-4a3e-9d8c-1b2a3c4d5e6f';
const A3 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function answer(id: string, number: number): AnswerSummary {
  return {
    id,
    number,
    pinned: true,
    isSample: false,
    thumbUrl: `/assets/answers/${id}/thumb`,
    createdAt: '2026-11-03T10:30:00.000Z',
  };
}

const CANDIDATES = [answer(A1, 1), answer(A2, 2), answer(A3, 1)];

function setup({
  candidates = CANDIDATES,
  steps = {
    finish: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ postedAt: '2026-11-03T10:31:00.000Z' }),
  },
}: { candidates?: readonly AnswerSummary[] | 'loading'; steps?: FinishSteps } = {}) {
  const onOpenChange = vi.fn();
  const onFinished = vi.fn();
  render(
    <FinishModal
      open
      onOpenChange={onOpenChange}
      candidates={candidates === 'loading' ? undefined : candidates}
      steps={steps}
      onFinished={onFinished}
    />,
    // 버전 썸네일이 그림을 받으려고 TanStack Query 를 쓴다
    { wrapper: QueryWrapper },
  );
  return { steps, onOpenChange, onFinished };
}

const titleBox = () => screen.getByRole('textbox', { name: COPY['D-03a'] }) as HTMLInputElement;
const reasonBox = () => screen.getByRole('textbox', { name: COPY['D-05a'] }) as HTMLInputElement;
const confirmDialog = () => screen.queryByRole('dialog', { name: COPY['D-08a'] });
const button = (name: string) => screen.getByRole('button', { name });

function fillAndConfirm(title = 'Neon street') {
  fireEvent.change(titleBox(), { target: { value: title } });
  fireEvent.click(button(COPY['D-07b']));
  const dialog = confirmDialog();
  if (dialog === null) throw new Error('확인 창이 열리지 않았다');
  return within(dialog);
}

// 서버의 제목 400 은 details.fields 에 title 이 온다(#113 부터 이때만 E-04)
const TITLE_FIELDS = { fields: [{ path: 'title', message: 'Required' }] };

const apiError = (code: 'NOT_FINISHABLE' | 'VALIDATION_FAILED', retryable = false) =>
  new ApiRequestError(code === 'NOT_FINISHABLE' ? 409 : 400, {
    code,
    message: code,
    retryable,
    ...(code === 'VALIDATION_FAILED' ? { details: TITLE_FIELDS } : {}),
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('FinishModal', () => {
  it('시안 순서대로 제목 → 대표 버전 → 이유 → 게시 스위치 → Skip·Next 를 보여 준다', () => {
    setup();

    const dialog = screen.getByRole('dialog', { name: COPY['D-01'] });
    expect(dialog).toHaveProperty('textContent', expect.stringContaining(COPY['D-02']));
    const order = [
      titleBox(),
      screen.getByRole('group', { name: COPY['D-04'] }),
      reasonBox(),
      screen.getByRole('switch', { name: COPY['D-06'] }),
      button(COPY['D-07a']),
      button(COPY['D-07b']),
    ];
    for (let i = 1; i < order.length; i += 1) {
      const before = order[i - 1] as Node;
      expect(before.compareDocumentPosition(order[i] as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(titleBox().placeholder).toBe(COPY['D-03b']);
    expect(reasonBox().placeholder).toBe(COPY['D-05b']);
  });

  it('열리면 포커스가 제목 칸으로 들어간다', async () => {
    setup();
    await waitFor(() => expect(document.activeElement).toBe(titleBox()));
  });

  it('버전은 라디오로 고르고, 처음에는 첫 번째가 골라져 있다', () => {
    setup();

    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
      `${COPY['D-12']} 1`,
      `${COPY['D-12']} 2`,
      `${COPY['D-12']} 3`,
    ]);
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);

    fireEvent.click(radios[2] as HTMLInputElement);
    expect(radios.map((r) => r.checked)).toEqual([false, false, true]);
  });

  it('Skip 은 닫기만 하고 아무것도 보내지 않는다', () => {
    const { steps, onOpenChange } = setup();

    fireEvent.click(button(COPY['D-07a']));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(steps.finish).not.toHaveBeenCalled();
  });

  it('제목이 비어 있으면 E-04 를 제목 칸 아래에 보이고 포커스를 옮긴다', () => {
    setup();

    fireEvent.change(titleBox(), { target: { value: '   ' } });
    fireEvent.click(button(COPY['D-07b']));

    expect(screen.getByRole('alert').textContent).toContain(COPY['E-04']);
    expect(titleBox().getAttribute('aria-invalid')).toBe('true');
    expect(titleBox().getAttribute('aria-describedby')).not.toBeNull();
    expect(document.activeElement).toBe(titleBox());
    expect(confirmDialog()).toBeNull();

    fireEvent.change(titleBox(), { target: { value: 'Neon' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('확인 창에서 Done 을 연달아 눌러도 완료·게시를 한 번씩만 보낸다', async () => {
    const { steps, onFinished } = setup();

    fireEvent.click(screen.getAllByRole('radio')[1] as HTMLInputElement);
    fireEvent.change(reasonBox(), { target: { value: ' The light feels right. ' } });
    const toggle = screen.getByRole('switch', { name: COPY['D-06'] });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    const confirm = fillAndConfirm('  Neon street ');
    const done = confirm.getByRole('button', { name: COPY['D-09b'] });
    fireEvent.click(done);
    fireEvent.click(done);

    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('posted', A2));
    expect(steps.finish).toHaveBeenCalledTimes(1);
    expect(steps.finish).toHaveBeenCalledWith({
      title: 'Neon street',
      coverAnswerId: A2,
      reason: 'The light feels right.',
    });
    expect(steps.post).toHaveBeenCalledTimes(1);
  });

  it('Next 를 누르면 같은 창이 확인 화면으로 바뀌고, 입력 화면은 보이지 않는다', async () => {
    setup();

    fillAndConfirm();

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: COPY['D-03a'] })).toBeNull();
    expect(screen.queryByRole('button', { name: COPY['D-07b'] })).toBeNull();
    await waitFor(() => expect(document.activeElement?.textContent).toBe(COPY['D-08a']));
  });

  it('확인 화면에서 Esc 는 닫지 않고 입력 화면으로 돌아간다', async () => {
    const { onOpenChange, steps } = setup();

    fillAndConfirm('Neon street');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(titleBox().value).toBe('Neon street');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(steps.finish).not.toHaveBeenCalled();
  });

  it('보내는 동안 role="status" 로 처리 중임을 알린다', async () => {
    let release: () => void = () => undefined;
    const steps = {
      finish: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
      post: vi.fn(),
    };
    const { onFinished } = setup({ steps });

    const confirm = fillAndConfirm();
    expect(confirm.getByRole('status').textContent).toBe('');

    fireEvent.click(confirm.getByRole('button', { name: COPY['D-09b'] }));
    expect(confirm.getByRole('status').textContent).toBe(SKELETON_COPY.loading);

    release();
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('finished', A1));
  });

  it('게시를 끄면 완료만 보낸다', async () => {
    const { steps, onFinished } = setup();

    const confirm = fillAndConfirm();
    fireEvent.click(confirm.getByRole('button', { name: COPY['D-09b'] }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('finished', A1));
    expect(steps.post).not.toHaveBeenCalled();
  });

  it('Cancel 은 확인 창만 닫고 입력은 남기며 포커스를 Next 로 돌려준다', async () => {
    const { steps } = setup();

    const confirm = fillAndConfirm('Neon street');
    fireEvent.click(confirm.getByRole('button', { name: COPY['D-09a'] }));

    expect(confirmDialog()).toBeNull();
    expect(titleBox().value).toBe('Neon street');
    expect(steps.finish).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(button(COPY['D-07b'])));
  });

  it('게시만 실패하면 E-05 와 Retry 를 보이고, Retry 는 게시만 다시 보낸다', async () => {
    const steps = {
      finish: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockRejectedValueOnce(new NetworkError()).mockResolvedValue({ postedAt: null }),
    };
    const { onFinished } = setup({ steps });

    fireEvent.click(screen.getByRole('switch', { name: COPY['D-06'] }));
    const confirm = fillAndConfirm();
    fireEvent.click(confirm.getByRole('button', { name: COPY['D-09b'] }));

    expect((await confirm.findByRole('alert')).textContent).toContain(COPY['E-05']);
    expect(confirm.queryByRole('button', { name: COPY['D-09a'] })).toBeNull();
    expect(onFinished).not.toHaveBeenCalled();

    fireEvent.click(confirm.getByRole('button', { name: COPY['E-01b'] }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('posted', A1));
    expect(steps.finish).toHaveBeenCalledTimes(1);
    expect(steps.post).toHaveBeenCalledTimes(2);
  });

  it('게시 실패 뒤 Done 을 누르면 완료한 것으로 넘어간다', async () => {
    const steps = {
      finish: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockRejectedValue(new NetworkError()),
    };
    const { onFinished } = setup({ steps });

    fireEvent.click(screen.getByRole('switch', { name: COPY['D-06'] }));
    const confirm = fillAndConfirm();
    fireEvent.click(confirm.getByRole('button', { name: COPY['D-09b'] }));
    await confirm.findByRole('alert');

    fireEvent.click(confirm.getByRole('button', { name: COPY['D-09b'] }));
    expect(onFinished).toHaveBeenCalledWith('finished', A1);
  });

  it('서버가 완료를 거절하면(G1) 확인 창에 문구를 보이고 Retry 는 없다', async () => {
    const steps = { finish: vi.fn().mockRejectedValue(apiError('NOT_FINISHABLE')), post: vi.fn() };
    const { onFinished } = setup({ steps });

    const confirm = fillAndConfirm();
    fireEvent.click(confirm.getByRole('button', { name: COPY['D-09b'] }));

    expect((await confirm.findByRole('alert')).textContent).toContain(COPY.G1);
    expect(confirm.queryByRole('button', { name: COPY['E-01b'] })).toBeNull();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('서버가 제목을 거절하면(E-04) 확인 창을 닫고 제목 칸 아래에 오류를 보인다', async () => {
    const steps = {
      finish: vi.fn().mockRejectedValue(apiError('VALIDATION_FAILED')),
      post: vi.fn(),
    };
    setup({ steps });

    const confirm = fillAndConfirm();
    fireEvent.click(confirm.getByRole('button', { name: COPY['D-09b'] }));

    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(screen.getByRole('alert').textContent).toContain(COPY['E-04']);
    expect(titleBox().getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(titleBox()));
  });

  it('후보가 0개면 G1 이유를 보이고 Next 를 막는다', () => {
    setup({ candidates: [] });

    const next = button(COPY['D-07b']) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    const reasonId = next.getAttribute('aria-describedby');
    expect(reasonId).not.toBeNull();
    expect(document.getElementById(reasonId ?? '')?.textContent).toBe(COPY.G1);
  });

  it('후보를 불러오는 동안은 Next 를 막고 목록을 처리 중으로 표시한다', () => {
    setup({ candidates: 'loading' });

    expect((button(COPY['D-07b']) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('group', { name: COPY['D-04'] }).getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('후보를 못 불러오면 오류와 다시 시도를 보여 주고, 누르면 다시 부른다', () => {
    const onRetryCandidates = vi.fn();
    render(
      <FinishModal
        open
        onOpenChange={vi.fn()}
        candidates={undefined}
        candidatesError={new Error('offline')}
        onRetryCandidates={onRetryCandidates}
        steps={{ finish: vi.fn(), post: vi.fn() }}
        onFinished={vi.fn()}
      />,
      { wrapper: QueryWrapper },
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(button(COPY['E-01b']));
    expect(onRetryCandidates).toHaveBeenCalledTimes(1);
    expect((button(COPY['D-07b']) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('DialogButton', () => {
  it('처리 중이면 바로 잠그고, 300ms 가 지나야 원형 표시를 띄운다', () => {
    vi.useFakeTimers();
    render(
      <DialogButton variant="primary" busy>
        {COPY['D-09b']}
      </DialogButton>,
    );

    const done = button(COPY['D-09b']) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(done.getAttribute('aria-busy')).toBe('true');
    expect(done.querySelector('[data-busy-mark]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(done.querySelector('[data-busy-mark]')).not.toBeNull();
  });
});
