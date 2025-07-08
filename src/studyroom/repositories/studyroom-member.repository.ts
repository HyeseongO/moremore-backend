import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, StudyRoomMember, MemberRole } from '@prisma/client';

@Injectable()
export class StudyroomMemberRepository {
  constructor(private prisma: PrismaService) {}

  async create(
    data: Prisma.StudyRoomMemberCreateInput,
  ): Promise<StudyRoomMember> {
    return this.prisma.studyRoomMember.create({ data });
  }

  async findByUserAndRoom(userId: number, roomId: number) {
    return this.prisma.studyRoomMember.findFirst({
      where: { userId, roomId },
    });
  }

  async findByUserId(userId: number, include?: Prisma.StudyRoomMemberInclude) {
    return this.prisma.studyRoomMember.findMany({
      where: {
        userId,
        room: { isActive: true },
      },
      include,
      orderBy: { joinedAt: 'desc' },
    });
  }

  async findByUserIdWithRoom(userId: number) {
    return this.prisma.studyRoomMember.findMany({
      where: {
        userId,
        room: { isActive: true },
      },
      include: {
        room: {
          include: {
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
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
  }

  async findByRoomId(roomId: number, include?: Prisma.StudyRoomMemberInclude) {
    return this.prisma.studyRoomMember.findMany({
      where: { roomId },
      include,
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  async updateRole(id: number, role: MemberRole) {
    return this.prisma.studyRoomMember.update({
      where: { id },
      data: { role },
    });
  }

  async delete(id: number) {
    return this.prisma.studyRoomMember.delete({
      where: { id },
    });
  }

  async countByRoomId(roomId: number): Promise<number> {
    return this.prisma.studyRoomMember.count({
      where: { roomId },
    });
  }
}
