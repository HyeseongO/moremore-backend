import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshSession } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorCode } from '../common/errors/error-code';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const MAX_SESSIONS_PER_USER = 10;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async createSession(
    userId: number,
    email: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const tokens = await this.signTokens(userId, email, sessionId);

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: this.expiryOf(tokens.refreshToken),
        userAgent: userAgent?.slice(0, 255),
      },
    });
    await this.pruneSessions(userId);

    return tokens;
  }

  async rotateSession(
    userId: number,
    refreshToken: string,
  ): Promise<AuthTokens> {
    const session = await this.findValidSession(userId, refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw this.invalidToken();

    const tokens = await this.signTokens(userId, user.email, session.id);
    const { count } = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash },
      data: {
        tokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: this.expiryOf(tokens.refreshToken),
        lastUsedAt: new Date(),
      },
    });
    if (count === 0) throw this.invalidToken();

    return tokens;
  }

  async revokeSession(userId: number, refreshToken?: string): Promise<void> {
    const sessionId = refreshToken ? this.readSessionId(refreshToken) : null;
    if (!refreshToken || !sessionId) return;

    await this.prisma.refreshSession.deleteMany({
      where: { id: sessionId, userId, tokenHash: this.hashToken(refreshToken) },
    });
  }

  async revokeAllSessions(userId: number): Promise<void> {
    await this.prisma.refreshSession.deleteMany({ where: { userId } });
  }

  private async findValidSession(
    userId: number,
    refreshToken: string,
  ): Promise<RefreshSession> {
    const sessionId = this.readSessionId(refreshToken);
    const session = sessionId
      ? await this.prisma.refreshSession.findUnique({
          where: { id: sessionId },
        })
      : null;

    const isValid =
      !!session &&
      session.userId === userId &&
      session.expiresAt > new Date() &&
      this.matchesHash(refreshToken, session.tokenHash);

    if (!isValid) throw this.invalidToken();
    return session;
  }

  private async pruneSessions(userId: number): Promise<void> {
    await this.prisma.refreshSession.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    const overflow = await this.prisma.refreshSession.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      skip: MAX_SESSIONS_PER_USER,
      select: { id: true },
    });
    if (overflow.length > 0) {
      await this.prisma.refreshSession.deleteMany({
        where: { id: { in: overflow.map((session) => session.id) } },
      });
    }
  }

  private async signTokens(
    userId: number,
    email: string,
    sessionId: string,
  ): Promise<AuthTokens> {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(
        { ...payload, sid: sessionId, jti: randomUUID() },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get<string>(
            'JWT_REFRESH_EXPIRES_IN',
            '7d',
          ),
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private readSessionId(refreshToken: string): string | null {
    const payload = this.jwtService.decode<{ sid?: unknown } | null>(
      refreshToken,
    );
    return typeof payload?.sid === 'string' ? payload.sid : null;
  }

  private expiryOf(refreshToken: string): Date {
    const payload = this.jwtService.decode<{ exp: number }>(refreshToken);
    return new Date(payload.exp * 1000);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private matchesHash(token: string, storedHash: string): boolean {
    const actual = Buffer.from(this.hashToken(token), 'hex');
    const expected = Buffer.from(storedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private invalidToken() {
    return new UnauthorizedException({
      code: ErrorCode.INVALID_TOKEN,
      message: '유효하지 않은 토큰입니다.',
    });
  }
}
