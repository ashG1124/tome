import type { Parser } from './client';

/** 본문 없는 응답(204) */
export const NoContentParser: Parser<undefined> = { parse: () => undefined };
