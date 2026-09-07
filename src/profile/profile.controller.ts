import {
  Controller,
  Get,
  Req,
  UseGuards,
  Patch,
  Body,
  UsePipes,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '@auth/jwt-auth.guard';
import { AuthenticatedRequest } from '@auth/authenticated-request.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserRegisteredEventDto } from './dto/user-registered-event.dto';

@Controller('users')
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(private readonly profileService: ProfileService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.profileService.getProfile(req.user.userId);
  }

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
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

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(req.user.userId, dto);
  }
}
