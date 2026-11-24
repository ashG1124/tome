import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../../src/config';
import { PrismaClient } from '../../src/generated/prisma/client';
import { seedCreatorIds } from '../../src/seed/creators';
import { DEFAULT_SEED_ASSETS_DIR, uploadSeedImages } from '../../src/seed/images';
import { loadSeedContent, upsertSeedCreators, upsertSeedTopics } from '../../src/seed/load';
import { createObjectStorage } from '../../src/storage';
import { loadSampleResults } from './sample-results';

// 시드 데이터·적재 로직은 src/seed 에 있다(리셋 API 와 같은 코드). 이 파일은 진입점이다.
async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL }),
  });
  try {
    const storage = createObjectStorage(env);
    const images = await uploadSeedImages(storage, {
      assetsDir: env.SEED_ASSETS_DIR ?? DEFAULT_SEED_ASSETS_DIR,
    });
    console.log(
      `Uploaded ${images.objects} seed image objects ` +
        `(${images.figmaProjects} projects with design images, ${images.avatars.size} avatars).`,
    );
    const summary = await prisma.$transaction(
      async (tx) => {
        const creators = await upsertSeedCreators(tx, images.avatars);
        const topics = await upsertSeedTopics(tx);
        const content = await loadSeedContent(tx, [
          ...seedCreatorIds('seed'),
          ...seedCreatorIds('persona'),
        ]);
        return { creators, topics, ...content };
      },
      { timeout: 300_000, maxWait: 30_000 },
    );
    console.log(`Seeded ${JSON.stringify(summary)}.`);
    const samples = await loadSampleResults(prisma, storage);
    console.log(`Seeded ${samples} sample results.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.name : 'unknown error');
  process.exitCode = 1;
});
