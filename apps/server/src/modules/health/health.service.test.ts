import { HealthResponseSchema } from '@tome/shared';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config';
import type { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from './health.service';

const env = parseEnv({ DATABASE_URL: 'postgresql://x', APP_VERSION: '1.2.3' });

function serviceWith(queryRaw: () => Promise<unknown>): HealthService {
  return new HealthService({ $queryRaw: vi.fn(queryRaw) } as unknown as PrismaService, env);
}

describe('HealthService', () => {
  it('reports ok / up when SELECT 1 succeeds', async () => {
    const body = await serviceWith(() => Promise.resolve([{ '?column?': 1 }])).check();
    expect(HealthResponseSchema.parse(body)).toMatchObject({
      status: 'ok',
      db: 'up',
      version: '1.2.3',
    });
  });

  it('reports degraded / down when the query fails', async () => {
    const body = await serviceWith(() => Promise.reject(new Error('connection refused'))).check();
    expect(HealthResponseSchema.parse(body)).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
