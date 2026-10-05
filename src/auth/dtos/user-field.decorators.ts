import { applyDecorators } from '@nestjs/common';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const SPECIAL_CHARS = '!-\\/:-@\\[-`{-~';
const NICKNAME_PATTERN = new RegExp(
  `^[A-Za-z0-9가-힣][A-Za-z0-9가-힣${SPECIAL_CHARS}]*$`,
);
const PASSWORD_PATTERN = new RegExp(
  `^(?=.*[A-Za-z])(?=.*\\d)(?=.*[${SPECIAL_CHARS}])[A-Za-z\\d${SPECIAL_CHARS}]+$`,
);

export const IsValidNickname = () =>
  applyDecorators(
    IsNotEmpty({ message: '닉네임을 입력해주세요.' }),
    IsString(),
    MinLength(2, { message: '닉네임은 최소 2자 이상이어야 합니다.' }),
    MaxLength(20, { message: '닉네임은 최대 20자까지 가능합니다.' }),
    Matches(NICKNAME_PATTERN, {
      message:
        '닉네임은 영문, 한글, 숫자, 특수문자만 사용 가능하며 특수문자로 시작할 수 없습니다.',
    }),
    Matches(/^\S+$/, { message: '닉네임에 공백이 포함될 수 없습니다.' }),
  );

export const IsValidPassword = () =>
  applyDecorators(
    IsNotEmpty({ message: '비밀번호를 입력해주세요.' }),
    IsString(),
    MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' }),
    MaxLength(20, { message: '비밀번호는 최대 20자까지 가능합니다.' }),
    Matches(PASSWORD_PATTERN, {
      message:
        '비밀번호는 영문자, 숫자, 특수문자를 각각 1개 이상 포함해야 하며 공백이나 한글은 사용할 수 없습니다.',
    }),
  );
