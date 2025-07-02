import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SignUpDto } from './dtos/signup.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async signUp(signUpDto: SignUpDto) {
    const { email, nickname, password } = signUpDto;

    const repeatedEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (repeatedEmail) {
      throw new ConflictException('이미 사용 중인 이메일 입니다.');
    }

    const repeatedNickname = await this.prisma.user.findUnique({
      where: { nickname },
    });
    if (repeatedNickname) {
      throw new ConflictException('이미 사용 중인 닉네임 입니다.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        nickname,
        password: hashedPassword,
        authProvider: 'EMAIL',
      },
      select: {
        id: true,
        nickname: true,
        email: true,
        authProvider: true,
        createdAt: true,
      },
    });

    return {
      message: '회원가입이 완료되었습니다!',
      user,
    };
  }

  async checkRepeatedNickname(nickname: string) {
    const user = await this.prisma.user.findUnique({
      where: { nickname },
    });
    return {
      available: !user,
      message: user
        ? '이미 사용중인 닉네임 입니다.'
        : '사용이 가능한 닉네임 입니다.',
    };
  }

  async checkRepeatedEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    return {
      available: !user,
      message: user
        ? '이미 존재하는 이메일 입니다.'
        : '사용이 가능한 이메일 입니다.',
    };
  }
}
