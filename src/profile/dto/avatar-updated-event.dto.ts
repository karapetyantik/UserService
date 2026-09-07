import { IsString, IsUrl } from 'class-validator';

export class AvatarUpdatedEventDto {
  @IsString()
  userId!: string;

  @IsUrl()
  avatarUrl!: string;
}
