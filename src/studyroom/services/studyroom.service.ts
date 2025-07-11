import { Injectable, NotFoundException } from '@nestjs/common';
import { StudyroomRepository } from '../repositories/studyroom.repository';
import { StudyroomMemberRepository } from '../repositories/studyroom-member.repository';
import { CreateStudyroomDto } from '../dtos/create-studyroom-dto';
import { UpdateStudyroomDto } from '../dtos/update-studyroom.dto';
import { RoomType, MemberRole } from '@prisma/client';

@Injectable()
export class StudyroomService {
  constructor(
    private studyroomRepository: StudyroomRepository,
    private memberRepository: StudyroomMemberRepository,
  ) {}

  async create(userId: number, dto: CreateStudyroomDto) {
    const maxMembers = dto.roomType === RoomType.SMALL ? 4 : 12;

    const studyroom = await this.studyroomRepository.create({
      title: dto.title,
      description: dto.description,
      roomType: dto.roomType,
      maxMembers,
      owner: { connect: { id: userId } },
    });

    await this.memberRepository.create({
      user: { connect: { id: userId } },
      room: { connect: { id: studyroom.id } },
      role: MemberRole.OWNER,
    });

    return this.findById(studyroom.id);
  }

  async findAll(options?: {
    roomType?: RoomType;
    searchTitle?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.studyroomRepository.findAll({
      where: {
        isActive: true,
        ...(options?.roomType && { roomType: options.roomType }),
        ...(options?.searchTitle && {
          title: {
            contains: options.searchTitle,
            mode: 'insensitive',
          },
        }),
      },
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
      orderBy: {
        createdAt: 'desc',
      },
      ...(options?.limit && { take: options.limit }),
      ...(options?.offset && { skip: options.offset }),
    });
  }

  async findById(id: number) {
    const studyroom = await this.studyroomRepository.findById(id, {
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
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      },
      _count: {
        select: { members: true },
      },
    });

    if (!studyroom || !studyroom.isActive) {
      throw new NotFoundException('스터디룸을 찾을 수 없습니다.');
    }

    return studyroom;
  }

  async update(id: number, dto: UpdateStudyroomDto) {
    return this.studyroomRepository.update(id, dto);
  }

  async deactivate(id: number) {
    return this.studyroomRepository.deactivate(id);
  }

  async findOne(id: number) {
    console.log('findOne called with id:', id);
    return this.findById(id);
  }

  async checkMembership(roomId: number, userId: number): Promise<boolean> {
    const member = await this.memberRepository.findByUserAndRoom(
      userId,
      roomId,
    );
    return !!member;
  }
}
