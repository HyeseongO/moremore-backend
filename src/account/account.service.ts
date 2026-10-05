import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import { DemoAccountService } from '../auth/demo-account.service';
import { WebRTCGateway } from '../webrtc/webrtc.gateway';
import { ErrorCode } from '../common/errors/error-code';

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  nickname: true,
  authProvider: true,
  profileImage: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly demoAccountService: DemoAccountService,
    private readonly gateway: WebRTCGateway,
  ) {}

  async updateNickname(userId: number, nickname: string) {
    const user = await this.findWritableUser(userId);
    if (user.nickname === nickname) {
      return this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: PUBLIC_USER_SELECT,
      });
    }

    const owner = await this.prisma.user.findUnique({ where: { nickname } });
    if (owner) throw this.nicknameTaken();

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { nickname },
        select: PUBLIC_USER_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.nicknameTaken();
      }
      throw error;
    }
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    userAgent?: string,
  ) {
    const user = await this.findWritableUser(userId);

    if (user.authProvider !== 'EMAIL' || !user.password) {
      throw new BadRequestException({
        code: ErrorCode.PASSWORD_CHANGE_NOT_ALLOWED,
        message: '구글 계정은 비밀번호를 변경할 수 없습니다.',
      });
    }

    await this.verifyPassword(user, currentPassword);

    if (currentPassword === newPassword) {
      throw new BadRequestException({
        code: ErrorCode.SAME_PASSWORD,
        message: '새 비밀번호가 현재 비밀번호와 같습니다.',
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });

    await this.sessionService.revokeAllSessions(user.id);
    return this.sessionService.createSession(user.id, user.email, userAgent);
  }

  async deleteAccount(userId: number, password?: string) {
    const user = await this.findWritableUser(userId);

    if (user.password) {
      await this.verifyPassword(user, password);
    }

    const ownedRooms = await this.prisma.$transaction(async (tx) => {
      const rooms = await tx.studyRoom.findMany({
        where: { ownerId: userId },
        select: { id: true, isDeleted: true },
      });
      await tx.studyRoom.deleteMany({ where: { ownerId: userId } });
      await tx.user.delete({ where: { id: userId } });
      return rooms;
    });

    ownedRooms
      .filter((room) => !room.isDeleted)
      .forEach((room) => this.gateway.alertRoomDeleted(room.id));
  }

  private async findWritableUser(userId: number): Promise<User> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (this.demoAccountService.isDemoAccount(user.email)) {
      throw new ForbiddenException({
        code: ErrorCode.DEMO_ACCOUNT_READ_ONLY,
        message: '데모 계정은 변경하거나 탈퇴할 수 없습니다.',
      });
    }

    return user;
  }

  private async verifyPassword(user: User, password?: string): Promise<void> {
    const isValid =
      !!password &&
      !!user.password &&
      (await bcrypt.compare(password, user.password));

    if (!isValid) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_CURRENT_PASSWORD,
        message: '현재 비밀번호가 올바르지 않습니다.',
      });
    }
  }

  private nicknameTaken() {
    return new ConflictException({
      code: ErrorCode.NICKNAME_TAKEN,
      message: '이미 사용중인 닉네임입니다.',
    });
  }
}
