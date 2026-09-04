import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProfileService } from './profile.service';

@Controller()
export class ProfileEventsController {
  constructor(private readonly profileService: ProfileService) {}

  @EventPattern('avatar.updated')
  async handleAvatarUpdated(
    @Payload() data: { userId: string; avatarUrl: string },
  ) {
    await this.profileService.updateAvatarUrl(data.userId, data.avatarUrl);
  }
}
