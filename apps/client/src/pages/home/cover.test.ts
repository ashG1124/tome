import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverSource, fetchCoverBlob } from './cover';

const PATH = '/assets/answers/7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d/thumb';
const LIVE = { mode: 'live', baseUrl: 'https://api.example.test' } as const;

describe('coverSource', () => {
  it('가짜 응답 모드에서는 주소를 그대로 그림에 넣는다', () => {
    expect(coverSource(PATH, { mode: 'fake', baseUrl: '' })).toEqual({ direct: true, src: PATH });
  });

  it('서버 모드에서는 서버 주소를 붙여 따로 받아 온다', () => {
    expect(coverSource(PATH, LIVE)).toEqual({
      direct: false,
      url: `https://api.example.test${PATH}`,
    });
  });

  it('이미 완성된 주소는 그대로 쓴다(토큰을 다른 서버로 보내지 않는다)', () => {
    const signed = 'https://storage.example.test/thumb.png?sig=abc';
    expect(coverSource(signed, LIVE)).toEqual({ direct: true, src: signed });
  });
});

describe('fetchCoverBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** fetch 가 돌려줄 응답 흉내 */
  function respond(ok: boolean, status: number, blob?: Blob): Response {
    return { ok, status, blob: () => Promise.resolve(blob) } as Response;
  }

  it('로그인 토큰을 붙여 요청하고 받은 그림을 돌려준다', async () => {
    const picture = new Blob(['x']);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(true, 200, picture));

    const blob = await fetchCoverBlob(`https://api.example.test${PATH}`, 'token-1');

    expect(blob).toBe(picture);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test${PATH}`,
      expect.objectContaining({ headers: { Authorization: 'Bearer token-1' } }),
    );
  });

  it('토큰이 없으면 인증 헤더 없이 보낸다', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(respond(true, 200, new Blob(['x'])));

    await fetchCoverBlob(`https://api.example.test${PATH}`, null);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test${PATH}`,
      expect.objectContaining({ headers: {} }),
    );
  });

  it('서버가 오류를 주면 실패로 알린다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(false, 404));

    await expect(fetchCoverBlob(`https://api.example.test${PATH}`, 'token-1')).rejects.toThrow(
      '404',
    );
  });
});
