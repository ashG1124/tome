import { AwsClient } from 'aws4fetch';
import { AppError } from '../common';
import { type ObjectStorage, safeDownloadName, type SignedUrlOptions } from './object-storage';

export interface R2Options {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Cloudflare R2(S3 호환). aws4fetch 로 서명한다. 실패는 모두 INTERNAL 로 바꾼다(내용은 숨긴다). */
export class R2ObjectStorage implements ObjectStorage {
  private readonly aws: AwsClient;
  private readonly base: string;

  constructor(options: R2Options) {
    this.aws = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
    this.base = `${options.endpoint.replace(/\/+$/, '')}/${options.bucket}`;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.send(this.urlOf(key), {
      method: 'PUT',
      body: bytes as RequestInit['body'],
      headers: { 'content-type': contentType },
    });
  }

  async signedGetUrl(key: string, opts: SignedUrlOptions): Promise<string> {
    const query = new URLSearchParams({ 'X-Amz-Expires': String(opts.ttlSeconds) });
    if (opts.downloadName !== undefined) {
      query.set(
        'response-content-disposition',
        `attachment; filename="${safeDownloadName(opts.downloadName)}"`,
      );
    }
    try {
      const signed = await this.aws.sign(`${this.urlOf(key)}?${query.toString()}`, {
        aws: { signQuery: true },
      });
      return signed.url;
    } catch {
      throw new AppError('INTERNAL');
    }
  }

  async delete(key: string): Promise<void> {
    await this.send(this.urlOf(key), { method: 'DELETE' });
  }

  private urlOf(key: string): string {
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private async send(url: string, init: RequestInit): Promise<void> {
    let res: Response;
    try {
      res = await this.aws.fetch(url, init);
    } catch {
      throw new AppError('INTERNAL');
    }
    if (!res.ok) throw new AppError('INTERNAL');
  }
}
