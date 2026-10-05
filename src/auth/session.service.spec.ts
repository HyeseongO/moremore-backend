import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshSession } from '@prisma/client';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma/prisma.service';

type Where = {
  id?: string | { in: string[] };
  userId?: number;
  tokenHash?: string;
  expiresAt?: { lt: Date };
};

const createFakePrisma = () => {
  let sessions: RefreshSession[] = [];
  const matches = (session: RefreshSession, where: Where) =>
    (where.id === undefined ||
      (typeof where.id === 'string'
        ? session.id === where.id
        : where.id.in.includes(session.id))) &&
    (where.userId === undefined || session.userId === where.userId) &&
    (where.tokenHash === undefined || session.tokenHash === where.tokenHash) &&
    (where.expiresAt === undefined || session.expiresAt < where.expiresAt.lt);

  return {
    get sessions() {
      return sessions;
    },
    user: {
      findUnique: ({ where }: { where: { id: number } }) =>
        Promise.resolve({ email: `user${where.id}@example.com` }),
    },
    refreshSession: {
      create: ({
        data,
      }: {
        data: Omit<RefreshSession, 'createdAt' | 'lastUsedAt'>;
      }) => {
        const now = new Date();
        const session = {
          ...data,
          userAgent: data.userAgent ?? null,
          createdAt: now,
          lastUsedAt: now,
        } as RefreshSession;
        sessions.push(session);
        return Promise.resolve(session);
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          sessions.filter((s) => s.id === where.id).map((s) => ({ ...s }))[0] ??
            null,
        ),
      findMany: ({ where, skip = 0 }: { where: Where; skip?: number }) =>
        Promise.resolve(
          sessions
            .filter((s) => matches(s, where))
            .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
            .slice(skip)
            .map((s) => ({ id: s.id })),
        ),
      updateMany: ({
        where,
        data,
      }: {
        where: Where;
        data: Partial<RefreshSession>;
      }) => {
        const targets = sessions.filter((s) => matches(s, where));
        targets.forEach((s) => Object.assign(s, data));
        return Promise.resolve({ count: targets.length });
      },
      deleteMany: ({ where }: { where: Where }) => {
        const before = sessions.length;
        sessions = sessions.filter((s) => !matches(s, where));
        return Promise.resolve({ count: before - sessions.length });
      },
    },
  };
};

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpException).getResponse() as { code: string }).code;
  }
  return 'OK';
};

describe('SessionService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let jwt: JwtService;
  let service: SessionService;

  beforeEach(() => {
    prisma = createFakePrisma();
    jwt = new JwtService({});
    const config = {
      get: (key: string, fallback?: string) =>
        ({ JWT_SECRET: 'access', JWT_REFRESH_SECRET: 'refresh' })[key] ??
        fallback,
    } as unknown as ConfigService;
    service = new SessionService(
      prisma as unknown as PrismaService,
      jwt,
      config,
    );
  });

  it('stores only a hash and keeps separate sessions per device', async () => {
    const laptop = await service.createSession(1, 'a@example.com', 'Laptop');
    const phone = await service.createSession(1, 'a@example.com', 'Phone');

    expect(prisma.sessions).toHaveLength(2);
    expect(prisma.sessions[0].tokenHash).not.toContain(laptop.refreshToken);
    expect(prisma.sessions[0].userAgent).toBe('Laptop');
    expect(await codeOf(service.rotateSession(1, laptop.refreshToken))).toBe(
      'OK',
    );
    expect(await codeOf(service.rotateSession(1, phone.refreshToken))).toBe(
      'OK',
    );
  });

  it('rotates within the same session and rejects the old token', async () => {
    const first = await service.createSession(1, 'a@example.com');
    const second = await service.rotateSession(1, first.refreshToken);

    expect(prisma.sessions).toHaveLength(1);
    expect(await codeOf(service.rotateSession(1, first.refreshToken))).toBe(
      'INVALID_TOKEN',
    );
    expect(await codeOf(service.rotateSession(1, second.refreshToken))).toBe(
      'OK',
    );
  });

  it('lets only one of two simultaneous refreshes win without revoking the session', async () => {
    const tokens = await service.createSession(1, 'a@example.com');
    const results = await Promise.all([
      codeOf(service.rotateSession(1, tokens.refreshToken)),
      codeOf(service.rotateSession(1, tokens.refreshToken)),
    ]);

    expect(results.sort()).toEqual(['INVALID_TOKEN', 'OK']);
    expect(prisma.sessions).toHaveLength(1);
  });

  it('logs out only the current device', async () => {
    const laptop = await service.createSession(1, 'a@example.com');
    const phone = await service.createSession(1, 'a@example.com');

    await service.revokeSession(1, laptop.refreshToken);

    expect(await codeOf(service.rotateSession(1, laptop.refreshToken))).toBe(
      'INVALID_TOKEN',
    );
    expect(await codeOf(service.rotateSession(1, phone.refreshToken))).toBe(
      'OK',
    );
  });

  it('revokes every session of a user', async () => {
    const laptop = await service.createSession(1, 'a@example.com');
    const phone = await service.createSession(1, 'a@example.com');
    const other = await service.createSession(2, 'b@example.com');

    await service.revokeAllSessions(1);

    expect(await codeOf(service.rotateSession(1, laptop.refreshToken))).toBe(
      'INVALID_TOKEN',
    );
    expect(await codeOf(service.rotateSession(1, phone.refreshToken))).toBe(
      'INVALID_TOKEN',
    );
    expect(await codeOf(service.rotateSession(2, other.refreshToken))).toBe(
      'OK',
    );
  });

  it('rejects expired sessions, other users, and tokens without a session', async () => {
    const tokens = await service.createSession(1, 'a@example.com');
    expect(await codeOf(service.rotateSession(2, tokens.refreshToken))).toBe(
      'INVALID_TOKEN',
    );

    prisma.sessions[0].expiresAt = new Date(Date.now() - 1000);
    expect(await codeOf(service.rotateSession(1, tokens.refreshToken))).toBe(
      'INVALID_TOKEN',
    );

    const legacy = jwt.sign(
      { sub: 1, email: 'a@example.com' },
      {
        secret: 'refresh',
      },
    );
    expect(await codeOf(service.rotateSession(1, legacy))).toBe(
      'INVALID_TOKEN',
    );
  });

  it('keeps at most 10 sessions per user', async () => {
    for (let i = 0; i < 12; i += 1) {
      await service.createSession(1, 'a@example.com');
      prisma.sessions.at(-1)!.lastUsedAt = new Date(Date.now() + i);
    }
    expect(prisma.sessions.filter((s) => s.userId === 1)).toHaveLength(10);
  });
});
