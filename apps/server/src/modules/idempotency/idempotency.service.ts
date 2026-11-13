import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { IdempotencyKeySchema } from '@tome/shared';
import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../common';
import { IdempotencyRepository, isUniqueViolation, type Tx } from './idempotency.repository';

/** 멱등 기록 보관 기간(24시간). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_ATTEMPTS = 3;

export interface IdempotentResult<T> {
  statusCode: number;
  body: T;
}

export interface IdempotencyRequest {
  sessionId: string;
  /** `@IdempotencyKey()` 가 준 헤더 원문(없으면 undefined). */
  key: string | undefined;
  /** 같은 키를 다른 라우트에 쓰면 409 가 되도록 라우트 이름(예: 'POST /projects'). */
  route: string;
  /** 검증을 마친 요청 본문(없으면 undefined). */
  body: unknown;
}

/** 키 순서와 상관없이 같은 JSON 문자열이 되게 한다. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? 'null';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

export function hashRequest(route: string, body: unknown): string {
  return createHash('sha256')
    .update(`${route}\n${canonicalJson(body)}`)
    .digest('hex');
}

/** 같은 키를 먼저 쓴 요청이 있을 때 따를 길: 재생·409·"기록이 사라졌으니 다시 시도". */
type Existing<T> = IdempotentResult<T> | 'retry';

class KeyTaken extends Error {}

/**
 * 쓰기 요청의 멱등 처리. 기록 INSERT → work → 결과 UPDATE 가 한 트랜잭션이라
 * work 가 던지면 기록도 롤백되어 같은 키로 다시 시도할 수 있다.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly repo: IdempotencyRepository) {}

  async run<T>(
    request: IdempotencyRequest,
    work: (tx: Tx) => Promise<IdempotentResult<T>>,
  ): Promise<IdempotentResult<T>> {
    const key = this.parseKey(request.key);
    const { sessionId, route } = request;
    const requestHash = hashRequest(route, request.body);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.repo.transaction(async (tx) => {
          await this.repo.deleteExpired(tx, sessionId, key, this.cutoff());
          try {
            await this.repo.insertPlaceholder(tx, { sessionId, key, route, requestHash });
          } catch (error) {
            // 같은 키가 이미 있다. 이 트랜잭션은 이미 실패 상태라 밖에서 기록을 다시 읽는다.
            if (isUniqueViolation(error)) throw new KeyTaken();
            throw error;
          }
          const result = await work(tx);
          await this.repo.complete(
            tx,
            sessionId,
            key,
            result.statusCode,
            result.body as Prisma.InputJsonValue,
          );
          return result;
        });
      } catch (error) {
        if (!(error instanceof KeyTaken)) throw error;
        const existing = await this.resolveExisting<T>(sessionId, key, route, requestHash);
        if (existing !== 'retry') return existing;
      }
    }
    // 기록이 계속 사라졌다 생기는 경우(거의 없음). 클라이언트가 같은 키로 다시 보내면 된다.
    throw new AppError('INTERNAL');
  }

  private parseKey(raw: string | undefined): string {
    if (raw === undefined || raw.trim() === '') throw new AppError('IDEMPOTENCY_KEY_MISSING');
    const parsed = IdempotencyKeySchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', undefined, {
        fields: [{ path: 'Idempotency-Key', message: 'Must be a UUID v4.' }],
      });
    }
    return parsed.data;
  }

  private cutoff(): Date {
    return new Date(Date.now() - IDEMPOTENCY_TTL_MS);
  }

  private async resolveExisting<T>(
    sessionId: string,
    key: string,
    route: string,
    requestHash: string,
  ): Promise<Existing<T>> {
    const record = await this.repo.find(sessionId, key);
    if (!record) return 'retry'; // 먼저 온 요청이 실패해 기록이 롤백됐다.
    if (record.createdAt.getTime() < this.cutoff().getTime()) return 'retry'; // 다음 시도의 deleteExpired 가 지운다.
    if (record.route !== route || record.requestHash !== requestHash) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED');
    }
    return { statusCode: record.statusCode, body: record.response as T };
  }
}
