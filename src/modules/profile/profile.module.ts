import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ProfileEventsController } from './profile-events.controller';
import { PrismaModule } from '@common/prisma/prisma.module';
import { RedisModule } from '@common/redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ClientsModule.registerAsync([
      {
        name: 'USER_EVENTS_DLQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'user_events_dlq',
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [ProfileService],
  controllers: [ProfileController, ProfileEventsController],
  exports: [ProfileService],
})
export class ProfileModule {}
