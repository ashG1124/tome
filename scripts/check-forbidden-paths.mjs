// 저장소에 올라가면 안 되는 경로(내부 문서, 디자인 자산, 환경 파일)가 추적 중인지 검사한다.
// 외부 패키지 없이 러너 기본 node 로 실행한다.
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path/posix';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_PREFIXES = [
  '.tome-docs/',
  'apps/client/src/assets/icons/',
  'apps/client/src/assets/brand/',
];

export function isForbidden(file) {
  const path = file.replaceAll('\\', '/');
  if (FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (path.split('/').slice(0, -1).includes('design-ref')) return true;
  const name = basename(path);
  return (name === '.env' || name.startsWith('.env.')) && name !== '.env.example';
}

export function findForbidden(files) {
  return files.filter(isForbidden);
}

function main() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const bad = findForbidden(out.split('\0').filter(Boolean));
  if (bad.length === 0) {
    console.log('OK');
    return;
  }
  console.error('저장소에 올라가면 안 되는 파일이 있습니다 / Forbidden tracked files:');
  for (const file of bad) console.error(`  ${file}`);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
