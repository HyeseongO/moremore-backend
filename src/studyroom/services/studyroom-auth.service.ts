import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StudyroomRepository } from '../repositories/studyroom.repository';
import { StudyroomMemberRepository } from '../repositories/studyroom-member.repository';
import { MemberRole } from '@prisma/client';

@Injectable()
export class StudyroomAuthService {
  constructor(
    private studyroomRepository: StudyroomRepository,
    private memberRepository: StudyroomMemberRepository,
  ) {}

  async verifyMember(roomId: number, userId: number) {
    const member = await this.memberRepository.findByUserAndRoom(
      userId,
      roomId,
    );
    if (!member) {
      throw new ForbiddenException(
        '스터디룸 멤버로 등록되지 않았습니다. 다시 확인해주세요!',
      );
    }
    return member;
  }

  async verifyOwner(roomId: number, userId: number) {
    const studyroom = await this.studyroomRepository.findById(roomId);
    if (!studyroom) {
      throw new NotFoundException(
        '스터디룸을 찾을 수 없습니다. 다시 확인해주세요!',
      );
    }
    if (studyroom.ownerId !== userId) {
      throw new ForbiddenException('방장 권한이 없습니다.');
    }

    return studyroom;
  }

  async verifyAdminOrOwner(roomId: number, userId: number) {
    const member = await this.verifyMember(roomId, userId);

    if (member.role !== MemberRole.OWNER && member.role !== MemberRole.ADMIN) {
      throw new ForbiddenException('관리자 권한이 필요합니다.');
    }

    return member;
  }

  async getMemberRole(
    roomId: number,
    userId: number,
  ): Promise<MemberRole | null> {
    const member = await this.memberRepository.findByUserAndRoom(
      userId,
      roomId,
    );
    return member?.role || null;
  }

  async isOwner(roomId: number, userId: number): Promise<boolean> {
    const studyroom = await this.studyroomRepository.findById(roomId);
    return studyroom?.ownerId === userId;
  }

  async isMember(roomId: number, userId: number): Promise<boolean> {
    const member = await this.memberRepository.findByUserAndRoom(
      userId,
      roomId,
    );
    return !!member;
  }
}
