import { defineConfig } from 'prisma/config';

// Prisma 7 은 .env 를 자동으로 읽지 않는다. 로컬에서는 apps/server 또는 루트의 .env 를 읽는다.
for (const file of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // 파일이 없으면 무시
  }
}

// 마이그레이션은 직접 연결 주소가 있으면 그것으로, 없으면 DATABASE_URL 로 실행한다.
// generate 단계에는 연결이 필요 없어서 개발용 기본값을 둔다.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://tome:tome@localhost:55433/tome?schema=public',
  },
});
