import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_ENV, type Env } from '../config';
import { PrismaClient } from '../generated/prisma/client';

/** Prisma 7 은 드라이버 어댑터(pg)로 연결한다. 런타임에는 DATABASE_URL(pooled 주소)을 쓴다. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_ENV) env: Env) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
