import { IsEmail, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { IsValidNickname, IsValidPassword } from './user-field.decorators';

export class SignUpDto {
  @IsNotEmpty({ message: '이메일을 입력하셔야 합니다.' })
  @IsEmail({}, { message: '유효하지 않은 이메일 형식입니다.' })
  @MaxLength(50, { message: '이메일은 50자 이내여야 합니다.' })
  @Matches(/^\S+$/, { message: '이메일에 공백이 포함될 수 없습니다.' })
  email: string;

  @IsValidNickname()
  nickname: string;

  @IsValidPassword()
  password: string;
}
