import { Module } from '@nestjs/common';
import { GrpcUserController } from './grpc-user.controller';
import { ProfileModule } from '@modules/profile/profile.module';

@Module({
  imports: [ProfileModule],
  controllers: [GrpcUserController],
})
export class GrpcInternalModule {}
