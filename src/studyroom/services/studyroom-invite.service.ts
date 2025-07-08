import { Injectable, NotFoundException } from '@nestjs/common';
import { StudyroomRepository } from '../repositories/studyroom.repository';
import { StudyroomMemberService } from './studyroom-member.service';
import { StudyroomAuthService } from './studyroom-auth.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StudyroomInviteService {
  private readonly frontendUrl: string;

  constructor(
    private studyroomRepository: StudyroomRepository,
    private memberService: StudyroomMemberService,
    private authService: StudyroomAuthService,
    private configService: ConfigService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5137';
  }

  async getByInviteCode(inviteCode: string) {
    const studyroom = await this.studyroomRepository.findByInviteCode(
      inviteCode,
      {
        owner: {
          select: {
            id: true,
            nickname: true,
            profileImage: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
    );

    if (!studyroom) {
      throw new NotFoundException('유효하지 않은 초대 링크입니다.');
    }

    return studyroom;
  }

  async joinByInviteCode(userId: number, inviteCode: string) {
    const studyroom = await this.getByInviteCode(inviteCode);

    await this.memberService.join(userId, studyroom.id);

    return this.studyroomRepository.findById(studyroom.id, {
      owner: {
        select: {
          id: true,
          nickname: true,
          profileImage: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              profileImage: true,
            },
          },
        },
      },
      _count: {
        select: { members: true },
      },
    });
  }

  async regenerateInviteCode(roomId: number, userId: number) {
    await this.authService.verifyOwner(roomId, userId);

    const newInviteCode = this.generateInviteCode();
    await this.studyroomRepository.updateInviteCode(roomId, newInviteCode);

    return {
      inviteCode: newInviteCode,
      inviteLink: this.generateInviteLink(newInviteCode),
    };
  }

  generateInviteLink(inviteCode: string): string {
    return `${this.frontendUrl}/studyroom/join/${inviteCode}`;
  }

  private generateInviteCode(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
