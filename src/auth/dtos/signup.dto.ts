import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SignUpDto {
  @IsNotEmpty({ message: '이메일을 입력하셔야 합니다.' })
  @IsEmail({}, { message: '유효하지 않은 이메일 형식입니다.' })
  @MaxLength(50, { message: '이메일은 50자 이내여야 합니다.' })
  @Matches(/^\S+$/, { message: '이메일에 공백이 포함될 수 없습니다.' })
  email: string;

  @IsNotEmpty({ message: '메세지를 입력해야 합니다.' })
  @IsString()
  @MinLength(2, { message: '닉네임은 최소 2자 이상이어야 합니다.' })
  @MaxLength(20, { message: '닉네임은 최대 20자까지 가능합니다.' })
  @Matches(/^(?=[A-Za-z0-9가-힣])[A-Za-z0-9가-힣@$!%*?&]+$/, {
    message:
      '닉네임은 영문, 한글, 숫자, 특수문자만 사용 가능하며 특수문자로 시작할 수 없습니다.',
  })
  @Matches(/^\S+$/, { message: '닉네임에 공백이 포함될 수 없습니다.' })
  nickname: string;

  @IsNotEmpty({ message: '비밀번호를 입력해주세요.' })
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message:
      '비밀번호는 최소 1개의 영문자, 숫자, 특수문자를 각각 포함해야 합니다.',
  })
  password: string;
}
