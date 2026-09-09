import { Controller, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProfileService } from './profile.service';
import { AvatarUpdatedEventDto } from './dto/avatar-updated-event.dto';
import { UserRegisteredEventDto } from './dto/user-registered-event.dto';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller()
export class ProfileEventsController {
  private readonly logger = new Logger(ProfileEventsController.name);

  constructor(private readonly profileService: ProfileService) {}

  @EventPattern('user.registered')
  async handleUserRegistered(@Payload() data: UserRegisteredEventDto) {
    try {
      await this.profileService.createProfile(data);
    } catch (error) {
      this.logger.error(
        `Не удалось обработать user.registered для userId=${data.userId}: ${error}`,
      );
    }
  }

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
