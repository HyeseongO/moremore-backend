import { IsNotEmpty, IsString } from 'class-validator';
import { IsValidPassword } from '../../auth/dtos/user-field.decorators';

export class ChangePasswordDto {
  @IsNotEmpty({ message: '현재 비밀번호를 입력해주세요.' })
  @IsString()
  currentPassword: string;

  @IsValidPassword()
  newPassword: string;
}
