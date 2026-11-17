import { Inject, Injectable, Logger } from '@nestjs/common';
import { IdempotencyKeySchema } from '@tome/shared';
import { AI_PROVIDER, type AiProvider, type AiResult, type InputCheck } from '../../ai';
import { AppError } from '../../common';
import { UsageService } from '../usage/usage.service';

/** 멱등 키가 올바른 UUID 인지(아니면 어차피 요청이 거절되므로 검사를 건너뛴다). */
export const isValidKey = (key: string | undefined): key is string =>
  key !== undefined && IdempotencyKeySchema.safeParse(key).success;

/**
 * 생성 전 입력 안전 검사. DB 트랜잭션 밖에서 부른다.
 * - unsafe 면 422 SAFETY_BLOCKED(details: { stage: 'input', categories }).
 * - 검사 호출이 실패하면 통과시키고 사유 코드만 기록한다(프롬프트 원문은 남기지 않는다).
 * - 응답이 와서 neurons 가 있으면(통과든 거부든) 오늘 사용량에 더한다.
 */
@Injectable()
export class InputSafetyService {
  private readonly logger = new Logger('InputSafety');

  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly usage: UsageService,
  ) {}

  async assertSafe(text: string): Promise<void> {
    let result: AiResult<InputCheck>;
    try {
      result = await this.ai.checkInput(text);
    } catch {
      this.logger.warn('input check failed; passing through');
      return;
    }
    await this.recordUsage(result);
    if (!result.value.safe) {
      throw new AppError('SAFETY_BLOCKED', undefined, {
        stage: 'input',
        categories: result.value.categories,
      });
    }
  }

  /** 검사 1회 = 텍스트 호출 1회로 세고 neurons 를 더한다. neurons 가 없거나 0 이면(mock·호출 실패) 세지 않는다. */
  private async recordUsage(result: AiResult<InputCheck>): Promise<void> {
    const neurons = result.neurons ?? 0;
    if (neurons <= 0) return;
    try {
      await this.usage.record({
        called: true,
        kind: 'text',
        textCalls: 1,
        imageCount: 0,
        fallbackCount: 0,
        neurons,
      });
    } catch {
      this.logger.warn('input check usage record failed');
    }
  }
}
