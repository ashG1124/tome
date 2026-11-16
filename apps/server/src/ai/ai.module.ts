import { Module } from '@nestjs/common';
import { APP_ENV, type Env } from '../config';
import { AI_PROVIDER, type AiProvider } from './ai-provider';
import { MockAiProvider } from './mock-ai.provider';
import { WorkersAiProvider } from './workers-ai';

/** AI_PROVIDER 설정으로 공급자를 고른다. 공급자를 바꿀 때 바꾸는 것은 이 설정뿐이다. */
export function createAiProvider(env: Env): AiProvider {
  switch (env.AI_PROVIDER) {
    case 'mock':
      return new MockAiProvider();
    case 'workers-ai':
      // env 검증이 두 값의 존재를 보장한다.
      return new WorkersAiProvider({
        accountId: env.WORKERS_AI_ACCOUNT_ID!,
        apiToken: env.WORKERS_AI_API_TOKEN!,
      });
  }
}

@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [APP_ENV],
      useFactory: (env: Env): AiProvider => createAiProvider(env),
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
