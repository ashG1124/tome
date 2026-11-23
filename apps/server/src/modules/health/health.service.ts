import { readFileSync } from 'node:fs';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { HealthResponseSchema, type HealthResponse } from '@tome/shared';
import { APP_ENV, type Env } from '../../config';
import { PrismaService } from '../../prisma/prisma.service';

// 배포 때 CI 가 커밋 해시를 써서 이미지에 넣는 파일(Dockerfile, #177).
export const VERSION_FILE_PATH = '/app/build-info/version.txt';
// 테스트에서 파일 경로를 바꿀 때 쓴다.
export const VERSION_FILE = Symbol('VERSION_FILE');

// 파일 값이 있으면 그 값, 없거나 비어 있으면 undefined.
function readVersionFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class HealthService {
  // 시작할 때 한 번만 읽는다(요청마다 디스크를 읽지 않는다).
  private readonly version: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: Env,
    @Optional() @Inject(VERSION_FILE) versionFile: string = VERSION_FILE_PATH,
  ) {
    this.version = readVersionFile(versionFile) ?? this.env.APP_VERSION;
  }

  async check(): Promise<HealthResponse> {
    let db: HealthResponse['db'] = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return HealthResponseSchema.parse({
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      time: new Date().toISOString(),
      version: this.version,
    });
  }
}
