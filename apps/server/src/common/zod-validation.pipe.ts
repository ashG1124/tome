import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError } from './app-error';

/** shared 의 zod 스키마로 body·query 를 검증한다. 실패하면 VALIDATION_FAILED 와 틀린 필드 목록을 돌려준다. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new AppError('VALIDATION_FAILED', undefined, { fields });
  }
}
