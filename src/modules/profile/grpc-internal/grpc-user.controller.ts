import { Controller, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { InternalGrpcAuthGuard } from './internal-grpc-auth.guard';
import { ProfileService } from '@modules/profile/profile.service';

@UseGuards(InternalGrpcAuthGuard)
@Controller()
export class GrpcUserController {
  constructor(private readonly profileService: ProfileService) {}

  @GrpcMethod('UserInternal', 'GetProfiles')
  async getProfiles(data: { userIds: string[] }) {
    const profiles = await this.profileService.findManyByUserIds(
      data.userIds ?? [],
    );

    return {
      profiles: profiles.map((profile) => ({
        userId: profile.userId,
        username: profile.username,
        avatarUrl: profile.avatarUrl ?? '',
      })),
    };
  }
}
