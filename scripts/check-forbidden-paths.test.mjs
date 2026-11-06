import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findForbidden, isForbidden } from './check-forbidden-paths.mjs';

test('허용되는 경로', () => {
  for (const file of [
    '.env.example',
    'README.md',
    'src/env.ts',
    '.envrc',
    'apps/server/.env.example',
  ]) {
    assert.equal(isForbidden(file), false, file);
  }
});

test('금지되는 경로', () => {
  for (const file of [
    '.env',
    '.env.local',
    'apps/server/.env.local',
    'docs/design-ref/a.png',
    'design-ref/a.png',
    '.tome-docs/a.md',
    'apps/client/src/assets/icons/a.svg',
    'apps/client/src/assets/brand/logo.svg',
  ]) {
    assert.equal(isForbidden(file), true, file);
  }
});

test('findForbidden 은 금지 경로만 돌려준다', () => {
  assert.deepEqual(findForbidden(['README.md', '.env', 'src/a.ts']), ['.env']);
});
