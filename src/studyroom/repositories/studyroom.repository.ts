import { Injectable } from '@nestjs/common';
import { Prisma, StudyRoom } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class StudyroomRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.StudyRoomCreateInput): Promise<StudyRoom> {
    return this.prisma.studyRoom.create({ data });
  }

  async findAll(params: {
    where?: Prisma.StudyRoomWhereInput;
    include?: Prisma.StudyRoomInclude;
    orderBy?: Prisma.StudyRoomOrderByWithRelationInput;
    take?: number;
    skip?: number;
  }) {
    const { where, include, orderBy, take, skip } = params;

    return this.prisma.studyRoom.findMany({
      where,
      include,
      orderBy,
      take,
      skip,
    });
  }

  async findById(id: number, include?: Prisma.StudyRoomInclude) {
    return this.prisma.studyRoom.findUnique({
      where: { id },
      include,
    });
  }

  async findByInviteCode(
    inviteCode: string,
    include?: Prisma.StudyRoomInclude,
  ) {
    return this.prisma.studyRoom.findUnique({
      where: { inviteCode, isActive: true },
      include,
    });
  }

  async update(id: number, data: Prisma.StudyRoomUpdateInput) {
    return this.prisma.studyRoom.update({
      where: { id },
      data,
    });
  }

  async updateInviteCode(id: number, inviteCode: string) {
    return this.prisma.studyRoom.update({
      where: { id },
      data: { inviteCode },
    });
  }

  async deactivate(id: number) {
    return this.prisma.studyRoom.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
