// 시안 비교를 돌린다. design-ref/ 가 없으면 건너뛰고 정상 종료한다.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const refDir = resolve(clientDir, '../../design-ref/components');

if (!existsSync(refDir)) {
  console.log('design-ref/ not found: skipping design:check.');
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'playwright.design.config.ts'],
  {
    cwd: clientDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
process.exit(result.status ?? 1);
