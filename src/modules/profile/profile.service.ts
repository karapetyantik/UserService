import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Profile } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PrismaService } from '@common/prisma/prisma.service';
import { RedisService } from '@common/redis/redis.service';

const PROFILE_CACHE_TTL_SECONDS = 300;
const PRISMA_UNIQUE_CONSTRAINT_ERROR = 'P2002';

function profileCacheKey(userId: string): string {
  return `profile:${userId}`;
}

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
    try {
      await this.prismaService.profile.create({
        data: {
          userId: data.userId,
          email: data.email,
          username: data.username,
        },
      });
      this.logger.log(`Профиль создан для userId=${data.userId}`);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
      ) {
        this.logger.warn(
          `Профиль для userId=${data.userId} уже существует, пропускаем`,
        );
        return;
      }
      throw error;
    }
  }

  async getProfile(userId: string): Promise<Profile> {
    const cacheKey = profileCacheKey(userId);
    const cached = await this.redisService.client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Profile;
    }

    const profile = await this.prismaService.profile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Профиль не найден');
    }

    await this.redisService.client.set(
      cacheKey,
      JSON.stringify(profile),
      'EX',
      PROFILE_CACHE_TTL_SECONDS,
    );
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prismaService.profile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const updated = await this.prismaService.profile.update({
      where: { userId },
      data: dto,
    });

    await this.redisService.client.del(profileCacheKey(userId));
    return updated;
  }

  async updateAvatarUrl(userId: string, avatarUrl: string) {
    await this.prismaService.profile.update({
      where: { userId },
      data: { avatarUrl },
    });
    await this.redisService.client.del(profileCacheKey(userId));
  }
}
