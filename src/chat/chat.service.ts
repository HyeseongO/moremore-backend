import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async saveMessage(studyRoomId: number, senderId: number, content: string) {
    return await this.prisma.chatMessage.create({
      data: {
        content,
        senderId,
        studyRoomId,
      },
      include: {
        sender: {
          select: {
            id: true,
            nickname: true,
            email: true,
          },
        },
      },
    });
  }

  async getMessages(
    studyRoomId: number,
    limit: number = 50,
    offset: number = 0,
  ) {
    return await this.prisma.chatMessage.findMany({
      where: {
        studyRoomId,
        isDeleted: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            nickname: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });
  }

  async deleteMessage(messageId: number, userId: number) {
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        senderId: userId,
      },
    });

    if (!message) {
      throw new Error('메시지를 찾을 수 없거나 권한이 없습니다.');
    }

    return await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { isDeleted: true },
    });
  }

  async getUnreadCount(userId: number, studyRoomId: number, lastReadAt: Date) {
    return await this.prisma.chatMessage.count({
      where: {
        studyRoomId,
        isDeleted: false,
        createdAt: {
          gt: lastReadAt,
        },
        senderId: {
          not: userId,
        },
      },
    });
  }
}
