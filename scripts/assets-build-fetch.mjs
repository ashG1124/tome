// Vercel 빌드 때 비공개 자산 저장소에서 아이콘·로고만 받아 저장소 안으로 복사한다.
// 외부 패키지 없이 node 내장 모듈만 쓴다. 토큰·저장소 이름·주소는 어떤 출력에도 내보내지 않는다.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 스크립트 위치 기준으로 저장소 루트를 계산한다(실행 위치 cwd 에 의존하지 않는다).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 복사 대상은 이 세 경로로만 한정한다(design-ref 는 배포에 필요 없어 받지 않는다).
export const COPY_PATHS = [
  'apps/client/src/assets/icons',
  'apps/client/src/assets/brand',
  'apps/client/src/assets/onboarding',
];

// clone 이 이 시간(ms) 안에 끝나지 않으면 강제로 끊고 실패로 처리한다.
export const CLONE_TIMEOUT_MS = 120000;

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export const MESSAGES = {
  skippedNoEnv: '자산 받기 건너뜀(환경변수 없음) — 아이콘은 빈 자리로 빌드됩니다',
  skippedPartial: (name) =>
    `자산 받기 건너뜀: 환경변수 ${name} 이(가) 없습니다 — 아이콘은 빈 자리로 빌드됩니다`,
  badRepo: 'ASSETS_REPO 형식이 올바르지 않습니다(<owner>/<repo> 형식이어야 합니다)',
  cloneFailed: '자산 저장소를 받지 못했습니다. 환경변수 값과 토큰 권한을 확인하세요.',
  skipped: (path) => `건너뜀: ${path}`,
  copied: (path, count) => `복사함: ${path} (파일 ${count}개)`,
};

// clone 명령·인자·환경변수를 만든다. 토큰은 인자·URL 에 넣지 않고 env 로만 넘긴다.
export function buildCloneCommand(repo, token, dir, baseEnv = process.env) {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return {
    command: 'git',
    args: ['clone', '--depth', '1', '--quiet', `https://github.com/${repo}.git`, dir],
    env: {
      ...baseEnv,
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
      // 빈 값은 상위 설정의 자격 증명 도우미 목록을 지워, 401 때 입력 대기로 멈추는 일을 막는다.
      GIT_CONFIG_KEY_1: 'credential.helper',
      GIT_CONFIG_VALUE_1: '',
      GCM_INTERACTIVE: 'never',
      GIT_TERMINAL_PROMPT: '0',
    },
  };
}

// 셸 없이 인자 배열로 git 을 부른다. spawn 은 테스트에서 바꿔 끼울 수 있다.
export function defaultClone({ repo, token, dir, env = process.env, spawn = spawnSync }) {
  const { command, args, env: cmdEnv } = buildCloneCommand(repo, token, dir, env);
  return spawn(command, args, { encoding: 'utf8', env: cmdEnv, timeout: CLONE_TIMEOUT_MS });
}

// 출력에 섞일 수 있는 민감한 값을 모두 ***로 가린다.
function mask(text, secrets) {
  let out = String(text ?? '');
  for (const s of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.split(s).join('***');
  }
  return out;
}

function countFiles(path) {
  if (!statSync(path).isDirectory()) return 1;
  return readdirSync(path).reduce((sum, name) => sum + countFiles(join(path, name)), 0);
}

// 환경변수 확인, 얕은 clone, 두 경로 복사. 종료 코드를 돌려준다(0 성공).
export function fetchBuildAssets({ env = process.env, root = ROOT, clone = defaultClone } = {}) {
  const repo = env.ASSETS_REPO;
  const token = env.ASSETS_REPO_TOKEN;

  if (!repo && !token) {
    console.log(MESSAGES.skippedNoEnv);
    return 0;
  }
  if (!repo || !token) {
    console.warn(MESSAGES.skippedPartial(repo ? 'ASSETS_REPO_TOKEN' : 'ASSETS_REPO'));
    return 0;
  }
  if (!REPO_PATTERN.test(repo)) {
    console.error(MESSAGES.badRepo);
    return 1;
  }

  const secrets = [
    token,
    Buffer.from(`x-access-token:${token}`).toString('base64'),
    Buffer.from(token).toString('base64'),
    `https://github.com/${repo}.git`,
    repo,
  ];
  const dir = mkdtempSync(join(tmpdir(), 'tome-assets-'));
  try {
    const res = clone({ repo, token, dir });
    if (res?.error || res?.signal || res?.status !== 0) {
      console.error(MESSAGES.cloneFailed);
      const detail = mask(
        `${res?.stderr ?? ''}${res?.stdout ?? ''}${res?.error?.message ?? ''}`,
        secrets,
      ).trim();
      if (detail) console.error(detail);
      return 1;
    }
    for (const path of COPY_PATHS) {
      const src = join(dir, path);
      if (!existsSync(src)) {
        console.log(MESSAGES.skipped(path));
        continue;
      }
      cpSync(src, join(root, path), { recursive: true, force: true });
      console.log(MESSAGES.copied(path, countFiles(src)));
    }
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(fetchBuildAssets());
