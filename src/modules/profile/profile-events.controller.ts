import {
  Controller,
  Inject,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ClientProxy, EventPattern, Payload } from '@nestjs/microservices';
import { ProfileService } from './profile.service';
import { AvatarUpdatedEventDto } from './dto/avatar-updated-event.dto';
import { UserRegisteredEventDto } from './dto/user-registered-event.dto';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller()
export class ProfileEventsController {
  private readonly logger = new Logger(ProfileEventsController.name);

  constructor(
    private readonly profileService: ProfileService,
    @Inject('USER_EVENTS_DLQ') private readonly dlqClient: ClientProxy,
  ) {}

  @EventPattern('user.registered')
  async handleUserRegistered(@Payload() data: UserRegisteredEventDto) {
    try {
      await this.profileService.createProfile(data);
    } catch (error) {
      this.logger.error(
        `Не удалось обработать user.registered для userId=${data.userId}: ${error}`,
      );
      // A transient DB failure here otherwise loses the event forever (the
      // consumer acks regardless), leaving the user with no profile row and
      // every downstream getProfile/getProfiles call broken silently. Park it
      // for replay instead of swallowing it.
      this.deadLetter('user.registered', data, error);
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
      this.deadLetter('avatar.updated', data, error);
    }
  }

  private deadLetter(pattern: string, payload: unknown, error: unknown) {
    this.dlqClient.emit('user_events.dead_letter', {
      pattern,
      payload,
      error: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
    });
  }
}
