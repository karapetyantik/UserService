import { IsEmail, IsString, MaxLength } from 'class-validator';

export class UserRegisteredEventDto {
  @IsString()
  userId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(32)
  username!: string;
}
