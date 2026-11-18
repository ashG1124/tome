import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ModerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectHiddenAt(id: string): Promise<{ hiddenAt: Date | null } | null> {
    return this.prisma.project.findUnique({ where: { id }, select: { hiddenAt: true } });
  }

  async setProjectHiddenAt(id: string, hiddenAt: Date | null): Promise<void> {
    await this.prisma.project.update({ where: { id }, data: { hiddenAt } });
  }

  findCommentHiddenAt(id: string): Promise<{ hiddenAt: Date | null } | null> {
    return this.prisma.agoraComment.findUnique({ where: { id }, select: { hiddenAt: true } });
  }

  async setCommentHiddenAt(id: string, hiddenAt: Date | null): Promise<void> {
    await this.prisma.agoraComment.update({ where: { id }, data: { hiddenAt } });
  }
}
