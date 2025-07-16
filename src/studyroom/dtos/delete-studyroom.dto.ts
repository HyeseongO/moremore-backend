import { IsNumberString } from 'class-validator';

export class DeleteStudyRoomDto {
  @IsNumberString()
  id: string;
}
