import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { docsPull } from './docs-pull.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'docs-pull-'));
  try {
    fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 콘솔 출력을 잠시 가로채 안내 메시지를 모은다.
function capture(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(' '));
  try {
    return { code: fn(), text: lines.join('\n') };
  } finally {
    console.error = original;
  }
}

test('폴더가 없으면 clone 안내와 실패 코드', () => {
  withTmp((tmp) => {
    const { code, text } = capture(() => docsPull(join(tmp, '.tome-docs')));
    assert.equal(code, 1);
    assert.match(text, /clone/);
  });
});

test('git 저장소가 아닌 폴더(예전 zip)는 실패하고 지우지 않는다', () => {
  withTmp((tmp) => {
    const dir = join(tmp, '.tome-docs');
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.md'), 'x');
    const { code, text } = capture(() => docsPull(dir));
    assert.equal(code, 1);
    assert.match(text, /clone/);
    assert.ok(existsSync(join(dir, 'a.md')));
  });
});

test('상위 저장소 안에 있는 git 아닌 폴더도 실패한다', () => {
  withTmp((tmp) => {
    git(tmp, 'init');
    const dir = join(tmp, '.tome-docs');
    mkdirSync(dir);
    const { code } = capture(() => docsPull(dir));
    assert.equal(code, 1);
  });
});

test('정상 clone 이면 pull 이 0 으로 끝난다', () => {
  withTmp((tmp) => {
    const bare = join(tmp, 'remote.git');
    const seed = join(tmp, 'seed');
    const clone = join(tmp, '.tome-docs');
    git(tmp, 'init', '--bare', bare);
    git(tmp, 'init', seed);
    writeFileSync(join(seed, 'a.md'), '1');
    git(seed, 'add', '.');
    git(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'one');
    const branch = git(seed, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
    git(seed, 'push', bare, `HEAD:refs/heads/${branch}`);
    git(bare, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`);
    git(tmp, 'clone', bare, clone);

    // 원격에 새 커밋을 올린 뒤 pull 로 받아지는지 확인한다.
    writeFileSync(join(seed, 'b.md'), '2');
    git(seed, 'add', '.');
    git(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'two');
    git(seed, 'push', bare, `HEAD:refs/heads/${branch}`);

    const code = docsPull(clone);
    assert.equal(code, 0);
    assert.ok(existsSync(join(clone, 'b.md')));
  });
});
