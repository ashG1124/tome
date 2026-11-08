import { Inject, Injectable } from '@nestjs/common';
import { HealthResponseSchema, type HealthResponse } from '@tome/shared';
import { APP_ENV, type Env } from '../../config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

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
      version: this.env.APP_VERSION,
    });
  }
}
