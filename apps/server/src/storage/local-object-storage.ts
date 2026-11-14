import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { AppError } from '../common';
import { type ObjectStorage, safeDownloadName, type SignedUrlOptions } from './object-storage';

/** 서버가 직접 서빙하는 서명 URL 의 경로 접두어. */
export const LOCAL_ASSET_PREFIX = '/assets/local';

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

interface TokenPayload {
  k: string;
  e: number;
  d?: string;
}

export interface LocalAsset {
  bytes: Uint8Array;
  contentType: string;
  downloadName?: string;
}

export interface LocalStorageOptions {
  dir: string;
  /** 없으면 프로세스를 시작할 때 무작위로 만든다(서버를 다시 켜면 이전 URL 은 무효). */
  secret?: string | undefined;
  /** 시험용 시계 */
  now?: () => number;
}

const sign = (secret: Buffer, body: string) =>
  createHmac('sha256', secret).update(body).digest('base64url');

/** 파일 시스템에 저장하고, HMAC 서명 토큰이 든 자기 경로를 서명 URL 로 쓴다. */
export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string;
  private readonly secret: Buffer;
  private readonly now: () => number;

  constructor(options: LocalStorageOptions) {
    this.root = resolve(options.dir);
    this.secret = options.secret ? Buffer.from(options.secret) : randomBytes(32);
    this.now = options.now ?? Date.now;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    await writeFile(`${path}.type`, contentType);
  }

  async signedGetUrl(key: string, opts: SignedUrlOptions): Promise<string> {
    this.pathOf(key); // 잘못된 키는 서명하지 않는다.
    const payload: TokenPayload = { k: key, e: this.now() + opts.ttlSeconds * 1000 };
    if (opts.downloadName !== undefined) payload.d = safeDownloadName(opts.downloadName);
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${LOCAL_ASSET_PREFIX}/${body}.${sign(this.secret, body)}`;
  }

  async delete(key: string): Promise<void> {
    const path = this.pathOf(key);
    await rm(path, { force: true });
    await rm(`${path}.type`, { force: true });
  }

  /** 토큰을 확인하고 바이트를 읽는다. 서명이 틀리거나 만료됐거나 파일이 없으면 NOT_FOUND. */
  async readSigned(token: string): Promise<LocalAsset> {
    const payload = this.verify(token);
    let path: string;
    try {
      path = this.pathOf(payload.k);
    } catch {
      throw new AppError('NOT_FOUND');
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      throw new AppError('NOT_FOUND');
    }
    const contentType = await readFile(`${path}.type`, 'utf8').catch(
      () => 'application/octet-stream',
    );
    const asset: LocalAsset = { bytes, contentType };
    if (payload.d !== undefined) asset.downloadName = payload.d;
    return asset;
  }

  private verify(token: string): TokenPayload {
    const [body, signature, ...rest] = token.split('.');
    if (!body || !signature || rest.length > 0) throw new AppError('NOT_FOUND');
    const expected = Buffer.from(sign(this.secret, body));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new AppError('NOT_FOUND');
    }
    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    } catch {
      throw new AppError('NOT_FOUND');
    }
    if (typeof payload.k !== 'string' || typeof payload.e !== 'number' || payload.e <= this.now()) {
      throw new AppError('NOT_FOUND');
    }
    return payload;
  }

  /** 키를 저장 폴더 안의 경로로 바꾼다. `..`·절대 경로·이상한 글자는 거부한다. */
  private pathOf(key: string): string {
    const parts = key.split('/');
    if (!KEY_PATTERN.test(key) || parts.some((p) => p === '' || p === '.' || p === '..')) {
      throw new AppError('INTERNAL', 'Invalid storage key.');
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new AppError('INTERNAL', 'Invalid storage key.');
    return path;
  }
}
