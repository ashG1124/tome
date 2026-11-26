// 쇼케이스 계정(Julian) 접속 코드 등록. 코드 값은 환경변수(SEED_SHOWCASE_CODE)로만 받고 저장소·로그에 남기지 않는다.
import { AdminAccessCodeRequestSchema } from '@tome/shared';
import type { PrismaClient } from '../generated/prisma/client';
import {
  type AccessCodeRecord,
  upsertAccessCodeByLabel,
} from '../modules/admin/access-codes.repository';
import { hashCode } from '../modules/session/code-hash';
import { SHOWCASE_CREATOR_ID } from './creators';

/** 쇼케이스 코드의 label. 다시 돌리면 같은 행의 코드만 바뀐다. */
export const SHOWCASE_CODE_LABEL = 'showcase';

/**
 * 관리 API(PUT /admin/access-codes/:label)와 같은 규칙으로 쇼케이스 계정 코드를 넣거나 바꾼다:
 * 같은 요청 검증, 같은 scrypt 해시(hashCode), 같은 label upsert(advisory lock).
 */
export async function registerShowcaseAccessCode(
  prisma: Pick<PrismaClient, '$transaction'>,
  code: string,
  label: string = SHOWCASE_CODE_LABEL,
): Promise<AccessCodeRecord> {
  const body = AdminAccessCodeRequestSchema.parse({
    code,
    target: 'creator',
    creatorId: SHOWCASE_CREATOR_ID,
    active: true,
  });
  const codeHash = await hashCode(body.code);
  return prisma.$transaction((tx) =>
    upsertAccessCodeByLabel(tx, label, {
      codeHash,
      target: 'creator',
      creatorId: SHOWCASE_CREATOR_ID,
      active: true,
    }),
  );
}
