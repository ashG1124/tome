import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthResponseSchema } from '@tome/shared';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config';
import type { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from './health.service';

const env = parseEnv({ DATABASE_URL: 'postgresql://x', APP_VERSION: '1.2.3' });

const noFile = join(tmpdir(), 'tome-no-such-version-file');

function serviceWith(
  queryRaw: () => Promise<unknown>,
  versionFile = noFile,
  e = env,
): HealthService {
  return new HealthService(
    { $queryRaw: vi.fn(queryRaw) } as unknown as PrismaService,
    e,
    versionFile,
  );
}

const ok = () => Promise.resolve([{ '?column?': 1 }]);

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

  describe('version', () => {
    it('prefers the value in the image version file', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'tome-health-'));
      try {
        const file = join(dir, 'version.txt');
        writeFileSync(file, 'abc1234\n');
        const body = await serviceWith(ok, file).check();
        expect(body.version).toBe('abc1234');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('falls back to APP_VERSION when the file is missing', async () => {
      const body = await serviceWith(ok).check();
      expect(body.version).toBe('1.2.3');
    });

    it('is undefined when neither the file nor APP_VERSION exists', async () => {
      const bare = parseEnv({ DATABASE_URL: 'postgresql://x' });
      const body = await serviceWith(ok, noFile, bare).check();
      expect(body.version).toBeUndefined();
    });
  });
});
