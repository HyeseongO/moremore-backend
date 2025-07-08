import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { StudyroomRepository } from '../repositories/studyroom.repository';
import { StudyroomMemberRepository } from '../repositories/studyroom-member.repository';
import { StudyroomAuthService } from './studyroom-auth.service';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StudyroomMemberService {
  constructor(
    private studyroomRepository: StudyroomRepository,
    private memberRepository: StudyroomMemberRepository,
    private authService: StudyroomAuthService,
    private prisma: PrismaService,
  ) {}

  async join(userId: number, roomId: number) {
    const existingMember = await this.memberRepository.findByUserAndRoom(
      userId,
      roomId,
    );
    if (existingMember) {
      throw new BadRequestException('이미 참여중인 스터디룸입니다.');
    }

    const memberCount = await this.memberRepository.countByRoomId(roomId);
    const room = await this.studyroomRepository.findById(roomId);

    if (!room) {
      throw new NotFoundException('스터디룸을 찾을 수 없습니다.');
    }

    if (memberCount >= room.maxMembers) {
      throw new BadRequestException('스터디룸이 가득 찼습니다.');
    }

    return this.memberRepository.create({
      user: { connect: { id: userId } },
      room: { connect: { id: roomId } },
      role: MemberRole.MEMBER,
    });
  }

  async leave(userId: number, roomId: number) {
    const member = await this.memberRepository.findByUserAndRoom(
      userId,
      roomId,
    );

    if (!member) {
      throw new NotFoundException('스터디룸 멤버가 아닙니다.');
    }

    if (member.role === MemberRole.OWNER) {
      const memberCount = await this.memberRepository.countByRoomId(roomId);

      if (memberCount === 1) {
        await this.studyroomRepository.deactivate(roomId);
      } else {
        throw new BadRequestException(
          '방장은 스터디룸을 나갈 수 없습니다. 먼저 방장을 위임하세요.',
        );
      }
    }

    return this.memberRepository.delete(member.id);
  }

  async transferOwnership(
    currentOwnerId: number,
    roomId: number,
    newOwnerId: number,
  ) {
    await this.authService.verifyOwner(roomId, currentOwnerId);

    const newOwnerMember = await this.memberRepository.findByUserAndRoom(
      newOwnerId,
      roomId,
    );
    if (!newOwnerMember) {
      throw new NotFoundException('해당 사용자는 스터디룸 멤버가 아닙니다.');
    }

    const currentOwnerMember = await this.memberRepository.findByUserAndRoom(
      currentOwnerId,
      roomId,
    );

    await this.prisma.$transaction([
      this.prisma.studyRoomMember.update({
        where: { id: newOwnerMember.id },
        data: { role: MemberRole.OWNER },
      }),
      this.prisma.studyRoomMember.update({
        where: { id: currentOwnerMember!.id },
        data: { role: MemberRole.ADMIN },
      }),
      this.prisma.studyRoom.update({
        where: { id: roomId },
        data: { ownerId: newOwnerId },
      }),
    ]);
  }

  async getUserStudyrooms(userId: number) {
    const memberships =
      await this.memberRepository.findByUserIdWithRoom(userId);

    return memberships.map((membership) => ({
      ...membership.room,
      myRole: membership.role,
      joinedAt: membership.joinedAt,
    }));
  }

  async getMemberInfo(userId: number, roomId: number) {
    const member = await this.memberRepository.findByUserAndRoom(
      userId,
      roomId,
    );
    if (!member) {
      throw new NotFoundException('스터디룸 멤버가 아닙니다.');
    }
    return member;
  }
}
