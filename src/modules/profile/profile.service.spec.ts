import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { RedisService } from 'src/common/redis/redis.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let redisStore: Map<string, string>;
  let prisma: {
    profile: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const profile = {
    id: 'p1',
    userId: 'u1',
    username: 'alice',
    email: 'alice@example.com',
    avatarUrl: null,
    bio: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    redisStore = new Map();
    prisma = {
      profile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const redisClientMock = {
      get: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      set: jest.fn((key: string, value: string) => {
        redisStore.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => {
        redisStore.delete(key);
        return Promise.resolve(1);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: { client: redisClientMock } },
      ],
    }).compile();

    service = module.get(ProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('caches the profile under the same key it later invalidates on update', async () => {
    // Populate the cache first.
    prisma.profile.findUnique.mockResolvedValueOnce(profile);
    await service.getProfile('u1');
    expect(redisStore.has('profile:u1')).toBe(true);

    // Update must invalidate the exact same key that was just set.
    prisma.profile.findUnique.mockResolvedValueOnce(profile);
    prisma.profile.update.mockResolvedValue({ ...profile, bio: 'hi' });
    await service.updateProfile('u1', { bio: 'hi' });

    expect(redisStore.has('profile:u1')).toBe(false);
  });

  it('invalidates the cache after an avatar update event', async () => {
    prisma.profile.findUnique.mockResolvedValueOnce(profile);
    await service.getProfile('u1');
    expect(redisStore.has('profile:u1')).toBe(true);

    prisma.profile.update.mockResolvedValue({
      ...profile,
      avatarUrl: 'https://cdn.example.com/a.png',
    });
    await service.updateAvatarUrl('u1', 'https://cdn.example.com/a.png');

    expect(redisStore.has('profile:u1')).toBe(false);
  });

  it('serves a cached profile without hitting the database', async () => {
    redisStore.set('profile:u1', JSON.stringify(profile));

    const result = await service.getProfile('u1');

    expect(result).toEqual(JSON.parse(JSON.stringify(profile)));
    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it('throws when the profile does not exist', async () => {
    prisma.profile.findUnique.mockResolvedValueOnce(null);

    await expect(service.getProfile('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
