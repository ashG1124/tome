import { Module } from '@nestjs/common';
import { APP_ENV, type Env } from '../config';
import { AI_PROVIDER, type AiProvider } from './ai-provider';
import { MockAiProvider } from './mock-ai.provider';

@Module({
  providers: [
    MockAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [APP_ENV, MockAiProvider],
      useFactory: (env: Env, mock: MockAiProvider): AiProvider => {
        switch (env.AI_PROVIDER) {
          case 'mock':
            return mock;
        }
      },
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
