import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('users')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: any) {
    return this.profileService.getProfile(req.user.userId);
  }

  @EventPattern('user.registered')
  async handleUserRegistered(
    @Payload() data: { userId: string; email: string; username: string },
  ) {
    await this.profileService.createProfile(data);
  }
}
