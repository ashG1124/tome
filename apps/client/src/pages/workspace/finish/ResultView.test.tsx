import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COPY } from '../../../shared/copy';
import { ResultView } from './ResultView';

function setup(downloading = false) {
  const onOpenChange = vi.fn();
  const onDownload = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResultView
        open
        onOpenChange={onOpenChange}
        imagePath="/preview-result.png"
        alt="Neon street at night"
        onDownload={onDownload}
        downloading={downloading}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onDownload };
}

describe('ResultView', () => {
  it('큰 그림·닫기 버튼·Download 알약만 보이고, Share·Plugin 은 없다', () => {
    setup();

    const dialog = screen.getByRole('dialog', { name: 'Neon street at night' });
    expect(dialog).toBeTruthy();
    // 가짜 응답 모드에서는 경로를 그대로 쓴다(서버 모드에서는 useApiImage 가 토큰을 붙여 받아 넣는다)
    expect(screen.getByRole('img', { name: 'Neon street at night' }).getAttribute('src')).toBe(
      '/preview-result.png',
    );
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent),
    ).toEqual([COPY['D-11'], COPY['D-13']]);
  });

  it('Download 를 누르면 알리고, 받는 중이면 잠긴다', () => {
    const { onDownload } = setup();
    fireEvent.click(screen.getByRole('button', { name: COPY['D-13'] }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('받는 중이면 Download 가 잠긴다', () => {
    setup(true);
    const download = screen.getByRole('button', { name: COPY['D-13'] }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(download.getAttribute('aria-busy')).toBe('true');
  });

  it('닫기·Esc 로 닫힌다', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: COPY['D-11'] }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
