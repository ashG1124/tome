// preinstall 스크립트: pnpm 이 아닌 패키지 매니저(npm, yarn 등)로 설치하면 중단한다.
const agent = process.env.npm_config_user_agent ?? '';

if (!agent.startsWith('pnpm/')) {
  console.error(
    '이 저장소는 pnpm만 씁니다. 처음 한 번 `npm install -g pnpm` 후 `pnpm install` 을 실행하세요.',
  );
  console.error(
    'This repository uses pnpm only. Run `npm install -g pnpm` once, then `pnpm install`.',
  );
  process.exit(1);
}
