/** 이미지 같은 바이트 덩어리를 두는 곳. 드라이버(local·r2)를 바꿀 때 이 인터페이스의 구현만 바꾼다. */
export interface SignedUrlOptions {
  /** 서명 URL 수명(초) */
  ttlSeconds: number;
  /** 있으면 첨부 파일로 내려받게 하는 파일 이름 */
  downloadName?: string;
}

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** 짧은 수명의 읽기 URL. local 드라이버는 서버 자기 경로(상대 경로)를 돌려준다. */
  signedGetUrl(key: string, opts: SignedUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** 답변 이미지의 객체 키 규칙. */
export function answerImageKey(answerId: string, variant: 'full' | 'thumb'): string {
  return `answers/${answerId}/${variant}.png`;
}

/** content-disposition 에 넣어도 안전한 파일 이름(따옴표·경로 구분자·제어 문자를 뺀다). */
export function safeDownloadName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned === '' ? 'download' : cleaned.slice(0, 100);
}
