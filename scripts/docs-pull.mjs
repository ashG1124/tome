// 기획 문서 폴더(.tome-docs)를 최신으로 받는다. 폴더 안의 로컬 변경은 건드리지 않는다.
// 외부 패키지 없이 node 내장 모듈만 쓴다.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 스크립트 위치 기준으로 저장소 루트를 계산한다(실행 위치 cwd 에 의존하지 않는다).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DOCS_DIR = join(ROOT, '.tome-docs');

export const MESSAGES = {
  missing: '.tome-docs 폴더가 없습니다. 팀 안내에 따라 문서 저장소를 .tome-docs 에 clone 하세요.',
  notGit:
    '.tome-docs 가 git 저장소가 아닙니다(예전 zip 폴더). 폴더를 직접 지운 뒤, 팀 안내에 따라 문서 저장소를 .tome-docs 에 clone 하세요. 이 스크립트는 폴더를 지우지 않습니다.',
};

function samePath(a, b) {
  const norm = (p) => resolve(p).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

// .tome-docs 가 자기 자신이 최상위인 git 저장소인지 확인한다.
// 폴더 안에 .git 이 없으면 상위 저장소(TOME)가 잡힐 수 있어 최상위 경로를 비교한다.
function isOwnGitRepo(dir) {
  if (!existsSync(join(dir, '.git'))) return false;
  const res = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (res.status !== 0) return false;
  return samePath(res.stdout.trim(), dir);
}

// 판정과 실행. 종료 코드를 돌려준다(0 성공).
export function docsPull(dir = DOCS_DIR) {
  if (!existsSync(dir)) {
    console.error(MESSAGES.missing);
    return 1;
  }
  if (!isOwnGitRepo(dir)) {
    console.error(MESSAGES.notGit);
    return 1;
  }
  const res = spawnSync('git', ['-C', dir, 'pull', '--ff-only'], { stdio: 'inherit' });
  if (res.error) {
    console.error(res.error.message);
    return 1;
  }
  return res.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(docsPull());
