import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** `Idempotency-Key` 헤더 원문. 없으면 undefined. 형식 검사는 IdempotencyService 가 한다. */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const header = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>().headers[
      'idempotency-key'
    ];
    return Array.isArray(header) ? header.join(',') : header;
  },
);
