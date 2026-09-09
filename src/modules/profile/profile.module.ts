import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ProfileEventsController } from './profile-events.controller';
import { PrismaModule } from '@common/prisma/prisma.module';
import { RedisModule } from '@common/redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [ProfileService],
  controllers: [ProfileController, ProfileEventsController],
})
export class ProfileModule {}
