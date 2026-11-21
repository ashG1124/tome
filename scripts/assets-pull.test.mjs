import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { assetsPull } from './assets-pull.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
const commit = (cwd, msg) =>
  git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', msg);

function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'assets-pull-'));
  try {
    fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function write(base, rel, text = 'x') {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// 콘솔 출력을 잠시 가로채 안내 메시지를 모은다.
function capture(fn) {
  const origErr = console.error;
  const origLog = console.log;
  const lines = [];
  console.error = (...a) => lines.push(a.join(' '));
  console.log = (...a) => lines.push(a.join(' '));
  try {
    return { code: fn(), text: lines.join('\n') };
  } finally {
    console.error = origErr;
    console.log = origLog;
  }
}

// bare 원격 + seed + clone(root/.tome-assets) 을 만든다.
function setup(tmp) {
  const bare = join(tmp, 'remote.git');
  const seed = join(tmp, 'seed');
  const root = join(tmp, 'root');
  mkdirSync(root);
  git(tmp, 'init', '--bare', bare);
  git(tmp, 'init', seed);
  write(seed, 'seed.txt', '0');
  git(seed, 'add', '.');
  commit(seed, 'zero');
  const branch = git(seed, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  git(seed, 'push', bare, `HEAD:refs/heads/${branch}`);
  git(bare, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`);
  const assetsDir = join(root, '.tome-assets');
  git(tmp, 'clone', bare, assetsDir);
  const publish = () => {
    git(seed, 'add', '.');
    commit(seed, 'more');
    git(seed, 'push', bare, `HEAD:refs/heads/${branch}`);
  };
  return { seed, root, assetsDir, publish };
}

test('폴더가 없으면 clone 안내와 실패 코드', () => {
  withTmp((tmp) => {
    const { code, text } = capture(() => assetsPull({ root: tmp }));
    assert.equal(code, 1);
    assert.match(text, /clone/);
  });
});

test('git 저장소가 아닌 폴더는 실패하고 지우지 않는다', () => {
  withTmp((tmp) => {
    const assetsDir = join(tmp, '.tome-assets');
    write(assetsDir, 'a.txt');
    const { code, text } = capture(() => assetsPull({ root: tmp, assetsDir }));
    assert.equal(code, 1);
    assert.match(text, /clone/);
    assert.ok(existsSync(join(assetsDir, 'a.txt')));
  });
});

test('상위 저장소 안에 있는 git 아닌 폴더도 실패한다', () => {
  withTmp((tmp) => {
    git(tmp, 'init');
    const assetsDir = join(tmp, '.tome-assets');
    mkdirSync(assetsDir);
    const { code } = capture(() => assetsPull({ root: tmp, assetsDir }));
    assert.equal(code, 1);
  });
});

test('정상이면 네 경로만 복사하고 나머지는 건드리지 않는다', () => {
  withTmp((tmp) => {
    const { seed, root, assetsDir, publish } = setup(tmp);
    write(seed, 'design-ref/a.png', 'A');
    write(seed, 'apps/client/src/assets/icons/i.svg', 'I');
    write(seed, 'apps/client/src/assets/brand/b.svg', 'B');
    write(seed, 'apps/client/src/assets/onboarding/landing-hero-01.webp', 'O');
    write(seed, 'README.md', 'readme');
    publish();
    write(root, 'design-ref/keep.txt', 'keep');

    const { code } = capture(() => assetsPull({ root, assetsDir }));
    assert.equal(code, 0);
    assert.equal(readFileSync(join(root, 'design-ref/a.png'), 'utf8'), 'A');
    assert.ok(existsSync(join(root, 'apps/client/src/assets/icons/i.svg')));
    assert.ok(existsSync(join(root, 'apps/client/src/assets/brand/b.svg')));
    assert.ok(existsSync(join(root, 'apps/client/src/assets/onboarding/landing-hero-01.webp')));
    assert.ok(!existsSync(join(root, 'README.md')));
    assert.ok(!existsSync(join(root, 'seed.txt')));
    assert.ok(existsSync(join(root, 'design-ref/keep.txt')));
  });
});

test('소스에 brand 경로가 없어도 0 이고 나머지는 복사된다', () => {
  withTmp((tmp) => {
    const { seed, root, assetsDir, publish } = setup(tmp);
    write(seed, 'design-ref/a.png', 'A');
    write(seed, 'apps/client/src/assets/icons/i.svg', 'I');
    publish();

    const { code, text } = capture(() => assetsPull({ root, assetsDir }));
    assert.equal(code, 0);
    assert.match(text, /건너뜀/);
    assert.ok(existsSync(join(root, 'design-ref/a.png')));
    assert.ok(existsSync(join(root, 'apps/client/src/assets/icons/i.svg')));
    assert.ok(!existsSync(join(root, 'apps/client/src/assets/brand')));
    assert.ok(!existsSync(join(root, 'apps/client/src/assets/onboarding')));
  });
});
