import { IsValidNickname } from '../../auth/dtos/user-field.decorators';

export class UpdateNicknameDto {
  @IsValidNickname()
  nickname: string;
}
