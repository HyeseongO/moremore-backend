import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SignUpDto } from './dtos/signup.dto';
import { LoginDto } from './dtos/login.dto';
import * as bcrypt from 'bcrypt';
import { AuthProvider, User } from '@prisma/client';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse {
  user: Omit<User, 'password' | 'refreshToken'>;
  tokens: AuthTokens;
}

interface GoogleAuthSuccessResponse {
  type: 'SUCCESS';
  user: Omit<User, 'password' | 'refreshToken'>;
  tokens: AuthTokens;
}

interface GoogleAuthPendingResponse {
  type: 'PENDING';
  requiresNickname: true;
  tempToken: string;
  googleData: {
    email: string;
    googleId: string;
    name: string;
    picture: string;
  };
}

type GoogleAuthResponse = GoogleAuthSuccessResponse | GoogleAuthPendingResponse;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async signUp(
    signUpDto: SignUpDto,
  ): Promise<Omit<User, 'password' | 'refreshToken'>> {
    const { email, nickname, password } = signUpDto;

    await this.validateEmailAvailability(email);
    await this.validateNicknameAvailability(nickname);

    const hashedPassword = await this.hashPassword(password);
    const user = await this.createUser({
      email,
      nickname,
      password: hashedPassword,
      authProvider: 'EMAIL',
    });

    return this.sanitizeUser(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginDto;

    const user = await this.validateUserCredentials(email, password);

    const tokens = await this.generateTokens(user.id, user.email);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async processGoogleAuth(googleProfile: {
    email: string;
    googleId: string;
    name: string;
    picture: string;
  }): Promise<GoogleAuthResponse> {
    const existingGoogleUser = await this.findUserByGoogleId(
      googleProfile.googleId,
    );

    if (existingGoogleUser) {
      const tokens = await this.generateTokens(
        existingGoogleUser.id,
        existingGoogleUser.email,
      );
      await this.saveRefreshToken(existingGoogleUser.id, tokens.refreshToken);

      return {
        type: 'SUCCESS',
        user: this.sanitizeUser(existingGoogleUser),
        tokens,
      };
    }

    await this.checkEmailConflictForGoogleAuth(googleProfile.email);

    const tempToken = await this.generateTempToken({
      googleData: googleProfile,
      type: 'google-signup',
    });

    return {
      type: 'PENDING',
      requiresNickname: true,
      tempToken,
      googleData: googleProfile,
    };
  }

  async completeGoogleSignUp(
    tempToken: string,
    nickname: string,
  ): Promise<AuthResponse> {
    const googleData = await this.validateTempToken(tempToken);

    await this.validateNicknameAvailability(nickname);

    const user = await this.createUser({
      email: googleData.email,
      nickname,
      googleId: googleData.googleId,
      googleEmail: googleData.email,
      profileImage: googleData.picture,
      authProvider: 'GOOGLE',
    });

    const tokens = await this.generateTokens(user.id, user.email);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async refreshTokens(
    userId: number,
    refreshToken: string,
  ): Promise<AuthTokens> {
    const user = await this.validateRefreshToken(userId, refreshToken);

    const tokens = await this.generateTokens(user.id, user.email);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: number): Promise<void> {
    await this.clearRefreshToken(userId);
  }

  async checkNicknameAvailability(
    nickname: string,
  ): Promise<{ available: boolean; message: string }> {
    const exists = await this.isNicknameExists(nickname);
    return {
      available: !exists,
      message: exists
        ? '이미 사용중인 닉네임입니다.'
        : '사용 가능한 닉네임입니다.',
    };
  }

  async checkEmailAvailability(
    email: string,
  ): Promise<{ available: boolean; message: string }> {
    const exists = await this.isEmailExists(email);
    return {
      available: !exists,
      message: exists
        ? '이미 사용중인 이메일입니다.'
        : '사용 가능한 이메일입니다.',
    };
  }

  private async validateEmailAvailability(email: string): Promise<void> {
    const exists = await this.isEmailExists(email);
    if (exists) {
      throw new ConflictException('이미 사용중인 이메일입니다.');
    }
  }

  private async validateNicknameAvailability(nickname: string): Promise<void> {
    const exists = await this.isNicknameExists(nickname);
    if (exists) {
      throw new ConflictException('이미 사용중인 닉네임입니다.');
    }
  }

  private async validateUserCredentials(
    email: string,
    password: string,
  ): Promise<User> {
    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    if (user.authProvider === 'GOOGLE' && !user.password) {
      throw new UnauthorizedException('구글 계정으로 로그인해주세요.');
    }

    if (!user.password) {
      throw new UnauthorizedException('잘못된 사용자입니다.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    return user;
  }

  private async validateRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<User> {
    const user = await this.findUserById(userId);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isValid) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    return user;
  }

  private async checkEmailConflictForGoogleAuth(email: string): Promise<void> {
    const existingUser = await this.findUserByEmail(email);

    if (existingUser && existingUser.authProvider === 'EMAIL') {
      throw new ConflictException(
        '이미 이메일로 가입된 계정입니다. 이메일 로그인을 이용해주세요.',
      );
    }
  }

  private async validateTempToken(token: string): Promise<any> {
    try {
      const decoded = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (decoded.type !== 'google-signup') {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }

      return decoded.googleData;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException(
          '토큰이 만료되었습니다. 다시 시도해주세요.',
        );
      }
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  private async findUserById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  private async findUserByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  private async isEmailExists(email: string): Promise<boolean> {
    const user = await this.findUserByEmail(email);
    return !!user;
  }

  private async isNicknameExists(nickname: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { nickname } });
    return !!user;
  }

  private async createUser(data: any): Promise<User> {
    return this.prisma.user.create({ data });
  }

  private async generateTokens(
    userId: number,
    email: string,
  ): Promise<AuthTokens> {
    const payload = { sub: userId, email };

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

    return { accessToken, refreshToken };
  }

  private async generateTempToken(payload: any): Promise<string> {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '10m',
    });
  }

  private async saveRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const hashedRefreshToken = await this.hashPassword(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }

  private async clearRefreshToken(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private sanitizeUser(user: User): Omit<User, 'password' | 'refreshToken'> {
    const { password, refreshToken, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}
