import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { buildCloneCommand, defaultClone, fetchBuildAssets } from './assets-build-fetch.mjs';

const REPO = 'acme-org/secret-assets';
const TOKEN = 'ghp_FAKE_token_1234567890';
const B64 = Buffer.from(`x-access-token:${TOKEN}`).toString('base64');

function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'assets-build-fetch-'));
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
  const orig = { error: console.error, log: console.log, warn: console.warn };
  const lines = [];
  const push = (...a) => lines.push(a.join(' '));
  console.error = push;
  console.log = push;
  console.warn = push;
  try {
    return { code: fn(), text: lines.join('\n') };
  } finally {
    Object.assign(console, orig);
  }
}

function spyClone(impl) {
  const calls = [];
  const fn = (arg) => {
    calls.push(arg);
    return impl ? impl(arg) : { status: 0, stdout: '', stderr: '' };
  };
  fn.calls = calls;
  return fn;
}

const okClone = () =>
  spyClone(({ dir }) => {
    write(dir, 'apps/client/src/assets/icons/i.svg', 'I');
    write(dir, 'apps/client/src/assets/brand/b.svg', 'B');
    write(dir, 'apps/client/src/assets/onboarding/landing-hero-01.webp', 'O');
    write(dir, 'design-ref/a.png', 'A');
    return { status: 0, stdout: '', stderr: '' };
  });

test('두 변수가 없으면 건너뛰고 0, clone 안 부른다', () => {
  withTmp((root) => {
    const clone = spyClone();
    const { code, text } = capture(() => fetchBuildAssets({ env: {}, root, clone }));
    assert.equal(code, 0);
    assert.match(text, /건너뜀/);
    assert.equal(clone.calls.length, 0);
    assert.deepEqual(readdirSync(root), []);
  });
});

test('하나만 있으면 빠진 변수 이름만 경고하고 0', () => {
  withTmp((root) => {
    for (const [env, missing] of [
      [{ ASSETS_REPO: REPO }, 'ASSETS_REPO_TOKEN'],
      [{ ASSETS_REPO_TOKEN: TOKEN }, 'ASSETS_REPO'],
    ]) {
      const clone = spyClone();
      const { code, text } = capture(() => fetchBuildAssets({ env, root, clone }));
      assert.equal(code, 0);
      assert.ok(text.includes(missing));
      assert.ok(!text.includes(REPO) && !text.includes(TOKEN));
      assert.equal(clone.calls.length, 0);
    }
  });
});

test('잘못된 ASSETS_REPO 는 1, clone 안 부르고 값도 출력하지 않는다', () => {
  withTmp((root) => {
    const bad = 'not a repo; rm -rf /';
    const clone = spyClone();
    const env = { ASSETS_REPO: bad, ASSETS_REPO_TOKEN: TOKEN };
    const { code, text } = capture(() => fetchBuildAssets({ env, root, clone }));
    assert.equal(code, 1);
    assert.equal(clone.calls.length, 0);
    assert.ok(!text.includes(bad) && !text.includes(TOKEN));
  });
});

test('정상이면 icons·brand·onboarding 만 복사하고 design-ref 는 만들지 않는다', () => {
  withTmp((root) => {
    const env = { ASSETS_REPO: REPO, ASSETS_REPO_TOKEN: TOKEN };
    const { code, text } = capture(() => fetchBuildAssets({ env, root, clone: okClone() }));
    assert.equal(code, 0);
    assert.ok(existsSync(join(root, 'apps/client/src/assets/icons/i.svg')));
    assert.ok(existsSync(join(root, 'apps/client/src/assets/brand/b.svg')));
    assert.ok(existsSync(join(root, 'apps/client/src/assets/onboarding/landing-hero-01.webp')));
    assert.ok(!existsSync(join(root, 'design-ref')));
    assert.match(text, /복사함: apps\/client\/src\/assets\/icons \(파일 1개\)/);
    assert.ok(!text.includes(REPO) && !text.includes(TOKEN));
  });
});

test('받은 쪽에 경로가 없으면 건너뜀 출력', () => {
  withTmp((root) => {
    const clone = spyClone(({ dir }) => {
      write(dir, 'apps/client/src/assets/icons/i.svg');
      return { status: 0 };
    });
    const env = { ASSETS_REPO: REPO, ASSETS_REPO_TOKEN: TOKEN };
    const { code, text } = capture(() => fetchBuildAssets({ env, root, clone }));
    assert.equal(code, 0);
    assert.match(text, /건너뜀: apps\/client\/src\/assets\/brand/);
    assert.match(text, /건너뜀: apps\/client\/src\/assets\/onboarding/);
  });
});

test('clone 실패면 1, 출력에 토큰·base64·저장소 이름이 없다', () => {
  withTmp((root) => {
    const clone = spyClone(() => ({
      status: 128,
      stdout: `out ${TOKEN}`,
      stderr: `fatal: https://github.com/${REPO}.git failed; header ${B64}; repo ${REPO}; tok ${TOKEN}`,
    }));
    const env = { ASSETS_REPO: REPO, ASSETS_REPO_TOKEN: TOKEN };
    const { code, text } = capture(() => fetchBuildAssets({ env, root, clone }));
    assert.equal(code, 1);
    assert.ok(text.includes('***'));
    for (const secret of [TOKEN, B64, REPO, 'secret-assets', 'github.com/']) {
      assert.ok(!text.includes(secret), `출력에 노출됨: ${secret.slice(0, 6)}…`);
    }
    assert.deepEqual(readdirSync(root), []);
  });
});

test('시간 초과(signal 만 있고 status 가 null)도 실패 1', () => {
  withTmp((root) => {
    const clone = spyClone(() => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' }));
    const env = { ASSETS_REPO: REPO, ASSETS_REPO_TOKEN: TOKEN };
    const { code, text } = capture(() => fetchBuildAssets({ env, root, clone }));
    assert.equal(code, 1);
    assert.match(text, /자산 저장소를 받지 못했습니다/);
  });
});

test('임시 폴더는 성공·실패 뒤 모두 지워진다', () => {
  withTmp((root) => {
    const env = { ASSETS_REPO: REPO, ASSETS_REPO_TOKEN: TOKEN };
    const dirs = [];
    const ok = okClone();
    capture(() =>
      fetchBuildAssets({
        env,
        root,
        clone: (a) => (dirs.push(a.dir), ok(a)),
      }),
    );
    capture(() =>
      fetchBuildAssets({
        env,
        root,
        clone: (a) => (dirs.push(a.dir), { status: 1, stderr: '' }),
      }),
    );
    assert.equal(dirs.length, 2);
    for (const d of dirs) assert.ok(!existsSync(d));
  });
});

test('buildCloneCommand 는 토큰을 인자에 넣지 않고 env 로만 넘긴다', () => {
  const { command, args, env } = buildCloneCommand(REPO, TOKEN, '/tmp/x', { PATH: 'p' });
  assert.equal(command, 'git');
  assert.ok(args.includes('--depth') && args.includes('1'));
  assert.ok(!args.join(' ').includes(TOKEN) && !args.join(' ').includes(B64));
  assert.equal(env.GIT_CONFIG_COUNT, '2');
  assert.equal(env.GIT_CONFIG_KEY_1, 'credential.helper');
  assert.equal(env.GIT_CONFIG_VALUE_1, '');
  assert.equal(env.GCM_INTERACTIVE, 'never');
  assert.equal(env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.equal(env.GIT_CONFIG_VALUE_0, `AUTHORIZATION: basic ${B64}`);
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(env.PATH, 'p');
});

test('defaultClone 은 셸 없이 spawn 에 인자 배열과 env 를 넘긴다', () => {
  let seen;
  const spawn = (cmd, args, opts) => ((seen = { cmd, args, opts }), { status: 0 });
  defaultClone({ repo: REPO, token: TOKEN, dir: '/tmp/x', env: {}, spawn });
  assert.equal(seen.cmd, 'git');
  assert.ok(Array.isArray(seen.args));
  assert.ok(!seen.args.join(' ').includes(TOKEN));
  assert.ok(!seen.opts.shell);
  assert.equal(seen.opts.timeout, 120000);
  assert.ok(seen.opts.env.GIT_CONFIG_VALUE_0.includes(B64));
});
