import { Global, Module } from '@nestjs/common';
import { APP_ENV, type Env } from '../config';
import { LocalAssetsController } from './local-assets.controller';
import { LocalObjectStorage } from './local-object-storage';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';
import { R2ObjectStorage } from './r2-object-storage';

export function createObjectStorage(env: Env): ObjectStorage {
  if (env.STORAGE_DRIVER === 'r2') {
    // 네 값이 모두 있는지는 환경변수 검증(superRefine)이 이미 확인했다.
    return new R2ObjectStorage({
      endpoint: env.R2_ENDPOINT!,
      bucket: env.R2_BUCKET!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    });
  }
  // 기본 폴더는 서버를 켠 위치(apps/server) 기준이다.
  return new LocalObjectStorage({
    dir: env.STORAGE_LOCAL_DIR ?? '.storage',
    secret: env.STORAGE_LOCAL_SECRET,
  });
}

@Global()
@Module({
  controllers: [LocalAssetsController],
  providers: [{ provide: OBJECT_STORAGE, inject: [APP_ENV], useFactory: createObjectStorage }],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
