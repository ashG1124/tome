import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../../src/config';
import { PrismaClient } from '../../src/generated/prisma/client';
import { SEED_CREATORS } from './creators';

async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL }),
  });
  try {
    for (const creator of SEED_CREATORS) {
      const fields = {
        kind: creator.kind,
        displayName: creator.displayName,
        seedOrder: creator.seedOrder,
      };
      await prisma.creator.upsert({
        where: { id: creator.id },
        update: fields,
        create: { id: creator.id, ...fields },
      });
    }
    console.log(`Seeded ${SEED_CREATORS.length} creators.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.name : 'unknown error');
  process.exitCode = 1;
});
