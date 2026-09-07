import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { PrismaModule } from '@db/prisma.module';
import { RedisModule } from '@redis/redis.module';
import { ProfileEventsController } from './profile-events.controller';

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [ProfileService],
  controllers: [ProfileController, ProfileEventsController],
})
export class ProfileModule {}
