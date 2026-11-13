import { Injectable } from '@nestjs/common';
import type { AdminAccessCodeRequest, AdminAccessCodeResponse } from '@tome/shared';
import { AppError } from '../../common';
import { hashCode } from '../session/code-hash';
import { AccessCodesRepository } from './access-codes.repository';

@Injectable()
export class AccessCodesService {
  constructor(private readonly repository: AccessCodesRepository) {}

  async upsert(label: string, body: AdminAccessCodeRequest): Promise<AdminAccessCodeResponse> {
    const creatorId = body.target === 'creator' ? (body.creatorId ?? null) : null;
    if (creatorId !== null && !(await this.repository.creatorExists(creatorId))) {
      throw new AppError('VALIDATION_FAILED', undefined, {
        fields: [{ path: 'creatorId', message: 'Creator does not exist' }],
      });
    }
    const row = await this.repository.upsertByLabel(label, {
      codeHash: await hashCode(body.code),
      target: body.target,
      creatorId,
      active: body.active,
    });
    return {
      accessCode: {
        id: row.id,
        label: row.label,
        target: row.target,
        creatorId: row.creatorId,
        active: row.active,
        createdAt: row.createdAt.toISOString(),
      },
    };
  }
}
