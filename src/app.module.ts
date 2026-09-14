import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '@common/prisma/prisma.module';
import { AuthModule } from '@common/auth/auth.module';
import { RedisModule } from '@common/redis/redis.module';
import { ProfileModule } from '@modules/profile/profile.module';
import { GrpcInternalModule } from '@modules/profile/grpc-internal/grpc-user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ProfileModule,
    AuthModule,
    RedisModule,
    GrpcInternalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
