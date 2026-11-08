import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) });
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
