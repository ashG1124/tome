// pnpm install 때 실행되는 prepare 스크립트: .githooks 를 git hooksPath 로 지정한다.
// git 작업 트리가 아니거나(Docker 빌드 등) git 이 없으면 조용히 건너뛴다.
import { execFileSync } from 'node:child_process';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  if (git('rev-parse', '--is-inside-work-tree') !== 'true') process.exit(0);

  let current = '';
  try {
    current = git('config', '--local', 'core.hooksPath');
  } catch {
    // 설정 없음 (git config 가 exit 1)
  }

  if (current === '.githooks') process.exit(0);
  if (current) {
    console.log(
      `[hooks] core.hooksPath 가 이미 '${current}' 로 설정돼 있어 덮어쓰지 않았습니다. 쓰려면: git config core.hooksPath .githooks`,
    );
    process.exit(0);
  }

  git('config', 'core.hooksPath', '.githooks');
  console.log('[hooks] core.hooksPath = .githooks 설정 완료 (main 직접 push 차단)');
} catch {
  // git 없음 / 저장소 아님
}
process.exit(0);
