import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async createProfile(data: {
    userId: string;
    email: string;
    username: string;
  }) {
    const existing = await this.prismaService.profile.findUnique({
      where: { userId: data.userId },
    });
    if (existing) {
      this.logger.warn(
        `Профиль для userId=${data.userId} уже существует, пропускаем`,
      );
      return;
    }

    await this.prismaService.profile.create({
      data: { userId: data.userId, email: data.email, username: data.username },
    });

    this.logger.log(`Профиль создан для userId=${data.userId}`);
  }

  async getProfile(userId: string) {
    const cacheKay = `profile:$${userId}`;
    const cached = await this.redisService.client.get(cacheKay);
    if (cached) {
      return JSON.parse(cached);
    }

    const profile = await this.prismaService.profile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Профиль не найден');
    }

    await this.redisService.client.set(
      cacheKay,
      JSON.stringify(profile),
      'EX',
      300,
    );
    return profile;
  }
}
