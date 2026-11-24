import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AvatarsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 창작자의 프로필 이미지 객체 키. 창작자가 없으면 undefined, 이미지가 없으면 null. */
  async findAvatarKey(creatorId: string): Promise<string | null | undefined> {
    const row = await this.prisma.creator.findUnique({
      where: { id: creatorId },
      select: { avatarKey: true },
    });
    return row === null ? undefined : row.avatarKey;
  }
}
