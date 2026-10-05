import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService refresh tokens', () => {
  const user = {
    id: 1,
    email: 'user@example.com',
    refreshToken: null as string | null,
  };
  let service: AuthService;

  beforeEach(() => {
    user.refreshToken = null;
    const prisma = {
      user: {
        update: jest.fn((args: { data: { refreshToken: string | null } }) => {
          user.refreshToken = args.data.refreshToken;
          return Promise.resolve(user);
        }),
        findUnique: jest.fn(() => Promise.resolve(user)),
      },
    };
    const config = {
      get: (key: string, fallback?: string) =>
        ({ JWT_SECRET: 'access', JWT_REFRESH_SECRET: 'refresh' })[key] ??
        fallback,
    } as unknown as ConfigService;

    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService({}),
      config,
    );
  });

  const rejectionCode = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return ((error as HttpException).getResponse() as { code: string }).code;
    }
    return 'RESOLVED';
  };

  it('issues a unique refresh token every time', async () => {
    const first = await service.issueTokens(user.id, user.email);
    const second = await service.issueTokens(user.id, user.email);
    expect(first.refreshToken).not.toBe(second.refreshToken);
  });

  it('rejects a refresh token after a newer one is issued', async () => {
    const old = await service.issueTokens(user.id, user.email);
    const current = await service.issueTokens(user.id, user.email);

    expect(
      await rejectionCode(service.refreshTokens(1, old.refreshToken)),
    ).toBe('INVALID_TOKEN');
    expect(
      await rejectionCode(service.refreshTokens(1, current.refreshToken)),
    ).toBe('RESOLVED');
  });

  it('rejects refresh tokens stored with the legacy bcrypt hash', async () => {
    const { refreshToken } = await service.issueTokens(user.id, user.email);
    user.refreshToken = bcrypt.hashSync(refreshToken, 4);

    expect(await rejectionCode(service.refreshTokens(1, refreshToken))).toBe(
      'INVALID_TOKEN',
    );
  });
});
