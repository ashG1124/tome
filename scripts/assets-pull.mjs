// 디자인 자산 저장소(.tome-assets)를 최신으로 받고, 정해진 경로만 저장소 안으로 복사한다.
// 외부 패키지 없이 node 내장 모듈만 쓴다.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 스크립트 위치 기준으로 저장소 루트를 계산한다(실행 위치 cwd 에 의존하지 않는다).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETS_DIR = join(ROOT, '.tome-assets');

// 복사 대상은 이 네 경로로만 한정한다.
export const COPY_PATHS = [
  'design-ref',
  'apps/client/src/assets/icons',
  'apps/client/src/assets/brand',
  'apps/client/src/assets/onboarding',
];

export const MESSAGES = {
  missing:
    '.tome-assets 폴더가 없습니다. 팀 안내에 따라 자산 저장소를 .tome-assets 에 clone 하세요.',
  notGit:
    '.tome-assets 가 git 저장소가 아닙니다. 폴더를 직접 지운 뒤, 팀 안내에 따라 자산 저장소를 .tome-assets 에 clone 하세요. 이 스크립트는 폴더를 지우지 않습니다.',
  skipped: (path) => `건너뜀: ${path} (자산 저장소에 없습니다)`,
  copied: (path, count) => `복사함: ${path} (파일 ${count}개)`,
};

function samePath(a, b) {
  const norm = (p) => resolve(p).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

// 폴더가 자기 자신이 최상위인 git 저장소인지 확인한다.
function isOwnGitRepo(dir) {
  if (!existsSync(join(dir, '.git'))) return false;
  const res = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (res.status !== 0) return false;
  return samePath(res.stdout.trim(), dir);
}

function countFiles(path) {
  if (!statSync(path).isDirectory()) return 1;
  return readdirSync(path).reduce((sum, name) => sum + countFiles(join(path, name)), 0);
}

// 판정, pull, 복사. 종료 코드를 돌려준다(0 성공).
export function assetsPull({ root = ROOT, assetsDir = join(root, '.tome-assets') } = {}) {
  if (!existsSync(assetsDir)) {
    console.error(MESSAGES.missing);
    return 1;
  }
  if (!isOwnGitRepo(assetsDir)) {
    console.error(MESSAGES.notGit);
    return 1;
  }
  const res = spawnSync('git', ['-C', assetsDir, 'pull', '--ff-only'], { stdio: 'inherit' });
  if (res.error) {
    console.error(res.error.message);
    return 1;
  }
  if (res.status !== 0) return res.status ?? 1;

  for (const path of COPY_PATHS) {
    const src = join(assetsDir, path);
    if (!existsSync(src)) {
      console.log(MESSAGES.skipped(path));
      continue;
    }
    cpSync(src, join(root, path), { recursive: true, force: true });
    console.log(MESSAGES.copied(path, countFiles(src)));
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(assetsPull());
