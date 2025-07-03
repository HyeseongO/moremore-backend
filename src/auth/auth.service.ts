import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { SignUpDto } from './dtos/signup.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dtos/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

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

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해주세요.',
      );
    }

    if (user.authProvider === 'GOOGLE' && !user.password) {
      throw new UnauthorizedException('구글 계정으로 로그인 해주세요.');
    }

    if (!user.password) {
      throw new UnauthorizedException('잘못된 사용자 입니다.');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: '로그인 성공',
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        authProvider: user.authProvider,
      },
      ...tokens,
    };
  }

  private async generateTokens(userId: number, email: string) {
    const payload = {
      sub: userId,
      email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '7d',
        ),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async updateRefreshToken(userId: number, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }

  async refreshTokens(userId: number, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access Denied');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );

    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Access Denied');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    return {
      message: '로그아웃 성공',
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
