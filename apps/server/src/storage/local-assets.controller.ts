import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '../common';
import { Public } from '../modules/session/auth.decorators';
import { LocalObjectStorage } from './local-object-storage';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';

/** local 드라이버의 서명 URL 을 받는 경로. 인증 대신 URL 안의 서명·만료로 지킨다. r2 드라이버에서는 404. */
@Controller('assets/local')
export class LocalAssetsController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  @Public()
  @Get(':token')
  async read(@Param('token') token: string, @Res() res: Response): Promise<void> {
    if (!(this.storage instanceof LocalObjectStorage)) throw new AppError('NOT_FOUND');
    const asset = await this.storage.readSigned(token);
    res.setHeader('content-type', asset.contentType);
    res.setHeader('cache-control', 'private, no-store');
    if (asset.downloadName !== undefined) {
      res.setHeader('content-disposition', `attachment; filename="${asset.downloadName}"`);
    }
    res.status(200).send(Buffer.from(asset.bytes));
  }
}
