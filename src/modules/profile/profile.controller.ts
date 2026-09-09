import { Controller, Get, Req, UseGuards, Patch, Body } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '@common/auth/jwt-auth.guard';
import { AuthenticatedRequest } from '@common/auth/authenticated-request.interface';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.profileService.getProfile(req.user.userId);
  }

  @Patch('me')
  updateMe(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(req.user.userId, dto);
  }
}
