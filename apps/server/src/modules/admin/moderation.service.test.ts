import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common';
import { ModerationService } from './moderation.service';
import type { ModerationRepository } from './moderation.repository';
import type { ResetService } from './reset.service';

const makeService = (row: { hiddenAt: Date | null } | null) => {
  const repo = {
    findProjectHiddenAt: vi.fn().mockResolvedValue(row),
    setProjectHiddenAt: vi.fn().mockResolvedValue(undefined),
    findCommentHiddenAt: vi.fn().mockResolvedValue(row),
    setCommentHiddenAt: vi.fn().mockResolvedValue(undefined),
  };
  const reset = { reset: vi.fn().mockResolvedValue({ deleted: 2, ms: 1 }) };
  const service = new ModerationService(
    repo as unknown as ModerationRepository,
    reset as unknown as ResetService,
  );
  return { service, repo, reset };
};

describe('ModerationService', () => {
  it('throws NOT_FOUND when the row does not exist', async () => {
    const { service, repo } = makeService(null);
    await expect(service.hideProject('p', true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.hideComment('c', true)).rejects.toBeInstanceOf(AppError);
    expect(repo.setProjectHiddenAt).not.toHaveBeenCalled();
    expect(repo.setCommentHiddenAt).not.toHaveBeenCalled();
  });

  it('sets the time when hiding a visible row', async () => {
    const { service, repo } = makeService({ hiddenAt: null });
    await service.hideProject('p', true);
    expect(repo.setProjectHiddenAt).toHaveBeenCalledWith('p', expect.any(Date));
    await service.hideComment('c', true);
    expect(repo.setCommentHiddenAt).toHaveBeenCalledWith('c', expect.any(Date));
  });

  it('keeps the first hidden time when hiding again', async () => {
    const { service, repo } = makeService({ hiddenAt: new Date('2026-01-01T00:00:00Z') });
    await service.hideProject('p', true);
    await service.hideComment('c', true);
    expect(repo.setProjectHiddenAt).not.toHaveBeenCalled();
    expect(repo.setCommentHiddenAt).not.toHaveBeenCalled();
  });

  it('clears the time when unhiding', async () => {
    const { service, repo } = makeService({ hiddenAt: new Date() });
    await service.hideProject('p', false);
    await service.hideComment('c', false);
    expect(repo.setProjectHiddenAt).toHaveBeenCalledWith('p', null);
    expect(repo.setCommentHiddenAt).toHaveBeenCalledWith('c', null);
  });

  it('purges only on the exact confirmation text', () => {
    const { service, reset } = makeService(null);
    for (const bad of ['', 'delete visitor data', ' DELETE VISITOR DATA', 'DELETE VISITOR DATA ']) {
      expect(() => service.purgeVisitors(bad)).toThrow(AppError);
    }
    expect(reset.reset).not.toHaveBeenCalled();
    return expect(service.purgeVisitors('DELETE VISITOR DATA')).resolves.toEqual({
      deleted: 2,
      ms: 1,
    });
  });
});
