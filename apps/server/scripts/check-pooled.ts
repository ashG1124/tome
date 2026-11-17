// pooled 연결 주소에서 pg 드라이버와 Prisma 가 제대로 동작하는지 확인한다.
// 사용: POOLED_DATABASE_URL=<pooled 주소> pnpm --filter @tome/server check:pooled
// 성공/실패만 출력하며 주소·호스트·쿼리 값은 출력하지 않는다.
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';

const url = process.env.POOLED_DATABASE_URL;
if (!url) {
  console.error('POOLED_DATABASE_URL is not set.');
  process.exit(2);
}

type Check = { name: string; run: () => Promise<void> };

const pool = new Pool({ connectionString: url, max: 1 });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });

const checks: Check[] = [
  {
    // 같은 이름 없는 쿼리를 같은 연결에서 반복한다. pooled 모드에서 prepared statement 가 깨지면 실패한다.
    name: 'repeated parameterized query (pg)',
    run: async () => {
      for (let i = 0; i < 20; i += 1) {
        const res = await pool.query('SELECT $1::int AS n', [i]);
        if (res.rows[0]?.n !== i) throw new Error('unexpected result');
      }
    },
  },
  {
    name: 'query inside a transaction (pg)',
    run: async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query('SELECT $1::int AS n', [7]);
        if (res.rows[0]?.n !== 7) throw new Error('unexpected result');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  },
  {
    name: 'repeated parameterized query (prisma)',
    run: async () => {
      for (let i = 0; i < 20; i += 1) {
        const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT ${i}::int AS n`;
        if (rows[0]?.n !== i) throw new Error('unexpected result');
      }
    },
  },
  {
    name: 'interactive transaction (prisma)',
    run: async () => {
      await prisma.$transaction(async (tx) => {
        const first = await tx.$queryRaw<{ n: number }[]>`SELECT ${1}::int AS n`;
        const second = await tx.$queryRaw<{ n: number }[]>`SELECT ${2}::int AS n`;
        if (first[0]?.n !== 1 || second[0]?.n !== 2) throw new Error('unexpected result');
      });
    },
  },
];

async function main(): Promise<void> {
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS  ${check.name}`);
    } catch (error) {
      failed += 1;
      // 오류 메시지에 주소나 값이 섞일 수 있어 종류만 출력한다.
      const kind = error instanceof Error ? error.name : 'unknown error';
      console.log(`FAIL  ${check.name} (${kind})`);
    }
  }
  await pool.end().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  console.log(failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

void main();
