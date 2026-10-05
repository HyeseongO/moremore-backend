import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AccountService } from './account.service';
import { AuthService } from '../auth/auth.service';
import { DemoAccountService } from '../auth/demo-account.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebRTCGateway } from '../webrtc/webrtc.gateway';

const PASSWORD = 'Current1!';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  email: 'user@example.com',
  nickname: 'tester',
  password: passwordHash,
  authProvider: 'EMAIL',
  googleId: null,
  googleEmail: null,
  profileImage: null,
  refreshToken: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    const response = (error as HttpException).getResponse() as {
      code: string;
    };
    return response.code;
  }
  throw new Error('expected rejection');
};

describe('AccountService', () => {
  let user: User;
  let prisma: {
    user: {
      findUniqueOrThrow: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    studyRoom: { findMany: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: { issueTokens: jest.Mock };
  let gateway: { alertRoomDeleted: jest.Mock };
  let service: AccountService;

  beforeEach(() => {
    user = makeUser();
    prisma = {
      user: {
        findUniqueOrThrow: jest.fn(() => Promise.resolve(user)),
        findUnique: jest.fn(() => Promise.resolve(null)),
        update: jest.fn((args: { data: Partial<User> }) =>
          Promise.resolve({ ...user, ...args.data }),
        ),
        delete: jest.fn(() => Promise.resolve(user)),
      },
      studyRoom: {
        findMany: jest.fn(() =>
          Promise.resolve([
            { id: 10, isDeleted: false },
            { id: 11, isDeleted: true },
          ]),
        ),
        deleteMany: jest.fn(() => Promise.resolve({ count: 2 })),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    authService = {
      issueTokens: jest.fn(() =>
        Promise.resolve({ accessToken: 'a', refreshToken: 'r' }),
      ),
    };
    gateway = { alertRoomDeleted: jest.fn() };
    const config = {
      get: () => 'demo01@moremore.com, demo02@moremore.com',
    } as unknown as ConfigService;

    service = new AccountService(
      prisma as unknown as PrismaService,
      authService as unknown as AuthService,
      new DemoAccountService(config),
      gateway as unknown as WebRTCGateway,
    );
  });

  describe('demo accounts', () => {
    beforeEach(() => {
      user = makeUser({ email: 'Demo01@moremore.com' });
    });

    it('rejects every change with DEMO_ACCOUNT_READ_ONLY', async () => {
      expect(await codeOf(service.updateNickname(1, 'newname'))).toBe(
        'DEMO_ACCOUNT_READ_ONLY',
      );
      expect(
        await codeOf(service.changePassword(1, PASSWORD, 'Newpass1!')),
      ).toBe('DEMO_ACCOUNT_READ_ONLY');
      expect(await codeOf(service.deleteAccount(1, PASSWORD))).toBe(
        'DEMO_ACCOUNT_READ_ONLY',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateNickname', () => {
    it('rejects a nickname used by someone else', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 2 }));
      expect(await codeOf(service.updateNickname(1, 'taken'))).toBe(
        'NICKNAME_TAKEN',
      );
    });

    it('updates the nickname', async () => {
      const result = await service.updateNickname(1, 'newname');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { nickname: 'newname' } }),
      );
      expect(result.nickname).toBe('newname');
    });
  });

  describe('changePassword', () => {
    it('rejects Google accounts', async () => {
      user = makeUser({ authProvider: 'GOOGLE', password: null });
      expect(
        await codeOf(service.changePassword(1, PASSWORD, 'Newpass1!')),
      ).toBe('PASSWORD_CHANGE_NOT_ALLOWED');
    });

    it('rejects a wrong current password', async () => {
      expect(
        await codeOf(service.changePassword(1, 'Wrong123!', 'Newpass1!')),
      ).toBe('INVALID_CURRENT_PASSWORD');
    });

    it('rejects reusing the current password', async () => {
      expect(await codeOf(service.changePassword(1, PASSWORD, PASSWORD))).toBe(
        'SAME_PASSWORD',
      );
    });

    it('stores a new hash and issues new tokens', async () => {
      const tokens = await service.changePassword(1, PASSWORD, 'Newpass1!');
      const [[{ data }]] = prisma.user.update.mock.calls as [
        [{ data: { password: string } }],
      ];
      expect(await bcrypt.compare('Newpass1!', data.password)).toBe(true);
      expect(authService.issueTokens).toHaveBeenCalledWith(1, user.email);
      expect(tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
    });
  });

  describe('deleteAccount', () => {
    it('requires the correct password for email accounts', async () => {
      expect(await codeOf(service.deleteAccount(1, 'Wrong123!'))).toBe(
        'INVALID_CURRENT_PASSWORD',
      );
      expect(await codeOf(service.deleteAccount(1))).toBe(
        'INVALID_CURRENT_PASSWORD',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('deletes owned rooms, then the user, and alerts active rooms', async () => {
      await service.deleteAccount(1, PASSWORD);

      expect(prisma.studyRoom.deleteMany).toHaveBeenCalledWith({
        where: { ownerId: 1 },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(gateway.alertRoomDeleted).toHaveBeenCalledTimes(1);
      expect(gateway.alertRoomDeleted).toHaveBeenCalledWith(10);
    });

    it('lets Google accounts delete without a password', async () => {
      user = makeUser({ authProvider: 'GOOGLE', password: null });
      await service.deleteAccount(1);
      expect(prisma.user.delete).toHaveBeenCalled();
    });
  });
});
