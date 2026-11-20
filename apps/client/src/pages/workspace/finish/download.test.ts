import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api';
import { apiConfig } from '../../../shared/api/config';
import { downloadFileName, downloadImage, downloadPath, saveBlob } from './download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearSession();
});

describe('downloadPath', () => {
  it('서버 그림 경로에는 ?download=1 을 붙이고, 그림 데이터 주소·완성된 주소는 그대로 둔다', () => {
    expect(downloadPath('/assets/answers/a1/full')).toBe('/assets/answers/a1/full?download=1');
    expect(downloadPath('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(downloadPath('https://example.com/a.png')).toBe('https://example.com/a.png');
  });
});

describe('downloadFileName', () => {
  it('제목에서 파일 이름에 못 쓰는 글자를 빼고 그림 형식에 맞는 확장자를 붙인다', () => {
    expect(downloadFileName('Neon: street/at "night"?', 'image/png')).toBe(
      'Neon streetat night.png',
    );
    expect(downloadFileName('Lamp', 'image/jpeg')).toBe('Lamp.jpg');
  });

  it('제목이 비면 tome 으로 한다', () => {
    expect(downloadFileName('  ', 'image/png')).toBe('tome.png');
    expect(downloadFileName('<>|', '')).toBe('tome.png');
  });
});

describe('saveBlob', () => {
  it('임시 주소로 링크를 눌러 저장하고 주소를 바로 해제한다', () => {
    const create = vi.fn().mockReturnValue('blob:tome-test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    let clicked: { download: string; href: string } | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = { download: this.download, href: this.href };
    });

    saveBlob(new Blob(['x'], { type: 'image/png' }), 'Neon.png');

    expect(clicked).toEqual({ download: 'Neon.png', href: 'blob:tome-test' });
    expect(revoke).toHaveBeenCalledWith('blob:tome-test');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});

describe('downloadImage', () => {
  it('가짜 응답 모드에서는 그림 데이터 주소에서 받아 저장한다(토큰 없이)', async () => {
    expect(apiConfig.mode).toBe('fake');
    // 테스트 환경의 Blob 은 Response 와 맞지 않아서 필요한 부분만 가진 가짜 응답을 쓴다
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn().mockReturnValue('blob:x'),
        revokeObjectURL: vi.fn(),
      }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    setSession('fake-token', 'n1');

    await downloadImage('data:image/png;base64,AAAA', 'Neon street');

    expect(fetchMock).toHaveBeenCalledWith('data:image/png;base64,AAAA');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('받지 못하면 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(downloadImage('data:image/png;base64,AAAA', 'Neon')).rejects.toThrow(
      'download failed: 404',
    );
  });
});
