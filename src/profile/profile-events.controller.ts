import { Controller, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProfileService } from './profile.service';
import { AvatarUpdatedEventDto } from './dto/avatar-updated-event.dto';

@Controller()
export class ProfileEventsController {
  private readonly logger = new Logger(ProfileEventsController.name);

  constructor(private readonly profileService: ProfileService) {}

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @EventPattern('avatar.updated')
  async handleAvatarUpdated(@Payload() data: AvatarUpdatedEventDto) {
    try {
      await this.profileService.updateAvatarUrl(data.userId, data.avatarUrl);
    } catch (error) {
      this.logger.error(
        `Не удалось обработать avatar.updated для userId=${data.userId}: ${error}`,
      );
    }
  }
}
