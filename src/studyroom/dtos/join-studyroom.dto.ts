import { IsNotEmpty, IsString } from 'class-validator';

export class JoinStudyRoomDto {
  @IsNotEmpty()
  @IsString()
  inviteCode: string;
}
