import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { clientIpFromWorker } from './common/client-ip.middleware';
import { loadEnv } from './config';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 배포 환경에서는 Cloudflare Worker 가 실제 접속 IP를 X-Tome-Client-Ip 로 넘긴다.
  // 이 값을 req.ip 로 써야 전시 코드 연속 실패 제한이 접속별로 동작한다.
  app.use(clientIpFromWorker);
  app.set('trust proxy', true);
  app.enableCors({ origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) });
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
