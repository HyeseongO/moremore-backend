import { forwardRef, HttpException, Inject } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { ChatService } from 'src/chat/chat.service';
import { StudyroomService } from 'src/studyroom/services/studyroom.service';

interface SocketWithUser extends Socket {
  user?: {
    id: number;
    nickname: string;
    email: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: (_origin, callback) => callback(null, process.env.FRONTEND_URL),
    credentials: true,
  },
})
export class WebRTCGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => StudyroomService))
    private readonly studyRoomService: StudyroomService,
    private readonly chatService: ChatService,
  ) {}

  @WebSocketServer()
  server: Server;

  private userSocketMap: Map<string, { userId: number; nickname: string }> =
    new Map();

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() roomId: string,
  ) {
    try {
      const room = this.server.sockets.adapter.rooms.get(roomId);
      const userCount = room ? room.size : 0;

      const studyRoom = await this.studyRoomService.findOne(parseInt(roomId));
      if (!studyRoom) {
        client.emit('error', { message: '존재하지 않는 스터디룸입니다.' });
        return;
      }

      if (!studyRoom.isActive) {
        client.emit('error', { message: '비활성화된 스터디룸입니다.' });
        return;
      }

      if (client.user) {
        const isMember = await this.studyRoomService.checkMembership(
          parseInt(roomId),
          client.user.id,
        );
        if (!isMember) {
          client.emit('error', { message: '스터디룸 멤버가 아닙니다.' });
          return;
        }
      }

      if (userCount >= studyRoom.maxMembers) {
        client.emit('room-full', {
          message: `최대 ${studyRoom.maxMembers}명까지 입장 가능 합니다.`,
        });
        return;
      }

      if (room?.has(client.id)) {
        console.log(`${client.id} 이미 존재합니다! (${roomId})`);
        return;
      }

      await client.join(roomId);
      await this.broadcastRoomCount(roomId);

      client.to(roomId).emit('user-joined', {
        userId: client.id,
        nickname: this.getUserNickname(client.id),
      });

      const existingUsers = this.getExistingUsersInfo(roomId, client.id);
      client.emit('existing-users', existingUsers);

      void this.sendRoomInfo(roomId);

      const recentMessages = await this.chatService.getMessages(
        parseInt(roomId),
        20,
      );

      client.emit('messages-history', recentMessages.reverse());
    } catch (error) {
      console.error('Join room error:', error);
      client.emit('error', {
        message:
          error instanceof HttpException
            ? error.message
            : '방 입장 중 오류가 발생했습니다.',
      });
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    await client.leave(roomId);
    this.notifyUserLeft(roomId, client.id);
  }

  afterInit(server: Server) {
    server.use((client: SocketWithUser, next) => {
      this.authenticate(client)
        .then(() => next())
        .catch((error: Error) => {
          console.log(error.message);
          next(new Error('Unauthorized'));
        });
    });
  }

  handleConnection(client: SocketWithUser) {
    console.log('User connected:', client.user?.nickname);

    client.on('disconnecting', () => {
      const roomIds = [...client.rooms].filter((id) => id !== client.id);
      client.once('disconnect', () => {
        roomIds.forEach((roomId) => this.notifyUserLeft(roomId, client.id));
      });
    });
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.userSocketMap.delete(client.id);
  }

  private async authenticate(client: SocketWithUser) {
    const token = this.extractToken(client);
    if (!token) throw new Error('No token found in auth or cookies');

    const user = await this.authService.validateAccessToken(token);
    if (!user) throw new Error('Invalid token');

    client.user = user;
    this.userSocketMap.set(client.id, {
      userId: user.id,
      nickname: user.nickname,
    });
  }

  private extractToken(client: Socket): string | undefined {
    const authToken: unknown = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken) return authToken;

    const cookies = client.handshake.headers.cookie;
    if (!cookies) return undefined;

    const cookieObj = cookies
      .split(';')
      .reduce<Record<string, string>>((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
    return cookieObj.accessToken;
  }

  private notifyUserLeft(roomId: string, socketId: string) {
    this.server.to(roomId).emit('user-left', socketId);
    void this.broadcastRoomCount(roomId);
  }

  @SubscribeMessage('offer')
  handleOffer(
    client: Socket,
    payload: { to: string; offer: RTCSessionDescriptionInit },
  ) {
    client.to(payload.to).emit('offer', {
      from: client.id,
      offer: payload.offer,
    });
  }

  @SubscribeMessage('answer')
  handleAnswer(
    client: Socket,
    payload: { to: string; answer: RTCSessionDescriptionInit },
  ) {
    client.to(payload.to).emit('answer', {
      from: client.id,
      answer: payload.answer,
    });
  }

  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    client: Socket,
    payload: { to: string; candidate: RTCIceCandidate },
  ) {
    client.to(payload.to).emit('ice-candidate', {
      from: client.id,
      candidate: payload.candidate,
    });
  }

  @SubscribeMessage('toggle-audio')
  handleToggleAudio(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; enabled: boolean },
  ) {
    client.to(payload.roomId).emit('user-toggled-audio', {
      userId: client.id,
      enabled: payload.enabled,
    });
  }

  @SubscribeMessage('toggle-video')
  handleToggleVideo(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; enabled: boolean },
  ) {
    client.to(payload.roomId).emit('user-toggled-video', {
      userId: client.id,
      enabled: payload.enabled,
    });
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: { roomId: string; content: string },
  ) {
    try {
      if (!client.user) {
        client.emit('error', { message: '인증이 필요합니다.' });
        return;
      }

      const isMember = await this.studyRoomService.checkMembership(
        parseInt(payload.roomId),
        client.user.id,
      );

      if (!isMember) {
        client.emit('error', { message: '스터디룸 멤버가 아닙니다.' });
        return;
      }

      const savedMessage = await this.chatService.saveMessage(
        parseInt(payload.roomId),
        client.user.id,
        payload.content,
      );

      this.server.to(payload.roomId).emit('new-message', {
        id: savedMessage.id,
        content: savedMessage.content,
        sender: {
          id: savedMessage.sender.id,
          nickname: savedMessage.sender.nickname,
        },
        createdAt: savedMessage.createdAt,
      });
    } catch (error) {
      console.error('Send message error:', error);
      client.emit('error', { message: '메시지 전송 중 오류가 발생했습니다.' });
    }
  }

  @SubscribeMessage('get-messages')
  async handleGetMessages(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: { roomId: string; limit?: number; offset?: number },
  ) {
    try {
      if (!client.user) {
        client.emit('error', { message: '인증이 필요합니다.' });
        return;
      }

      const isMember = await this.studyRoomService.checkMembership(
        parseInt(payload.roomId),
        client.user.id,
      );

      if (!isMember) {
        client.emit('error', { message: '스터디룸 멤버가 아닙니다.' });
        return;
      }

      const messages = await this.chatService.getMessages(
        parseInt(payload.roomId),
        payload.limit || 50,
        payload.offset || 0,
      );

      client.emit('messages-history', messages.reverse());
    } catch (error) {
      console.error('Get messages error:', error);
      client.emit('error', { message: '메시지 조회 중 오류가 발생했습니다.' });
    }
  }

  @SubscribeMessage('delete-message')
  async handleDeleteMessage(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: { messageId: number; roomId: string },
  ) {
    try {
      if (!client.user) {
        client.emit('error', { message: '인증이 필요합니다.' });
        return;
      }

      await this.chatService.deleteMessage(payload.messageId, client.user.id);

      this.server.to(payload.roomId).emit('message-deleted', {
        messageId: payload.messageId,
      });
    } catch (error) {
      console.error('Delete message error:', error);
      client.emit('error', {
        message:
          error instanceof Error
            ? error.message
            : '메시지 삭제 중 오류가 발생했습니다.',
      });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: { roomId: string; isTyping: boolean },
  ) {
    client.to(payload.roomId).emit('user-typing', {
      userId: client.user?.id,
      nickname: client.user?.nickname,
      isTyping: payload.isTyping,
    });
  }

  @SubscribeMessage('getActiveUsers')
  handleGetActiveUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    const count =
      this.server.sockets.adapter.rooms.get(payload.roomId)?.size ?? 0;
    client.emit('activeUserUpdate', { roomId: payload.roomId, count });
  }

  private getRoom(roomId: string) {
    return this.server.sockets.adapter.rooms.get(roomId);
  }

  private getRoomSize(roomId: string) {
    return this.getRoom(roomId)?.size ?? 0;
  }

  private getUserNickname(socketId: string): string {
    const userInfo = this.userSocketMap.get(socketId);
    return userInfo?.nickname || 'Unknown User';
  }

  private getExistingUsersInfo(roomId: string, excludeSocketId = '') {
    const room = this.server.sockets.adapter.rooms.get(roomId);
    if (!room) return [];

    return [...room]
      .filter((id) => id !== excludeSocketId)
      .map((id) => ({
        userId: id,
        nickname: this.userSocketMap.get(id)?.nickname || 'Unknown',
      }));
  }

  private async broadcastRoomCount(roomId: string) {
    const currentMembers = this.getRoomSize(roomId);
    const studyRoom = await this.studyRoomService
      .findOne(+roomId)
      .catch(() => null);

    if (!studyRoom) return;

    const payload = {
      roomId,
      title: studyRoom.title,
      currentMembers,
      maxMembers: studyRoom.maxMembers,
    };

    if (currentMembers > 0) {
      this.server.to(roomId).emit('room-info', payload);
    }

    this.server.emit('room-count-update', payload);
  }

  private async sendRoomInfo(roomId: string) {
    const roomSize = this.getRoomSize(roomId);
    if (roomSize === 0) return;

    try {
      const studyRoom = await this.studyRoomService.findOne(+roomId);
      if (studyRoom) {
        this.server.to(roomId).emit('room-info', {
          roomId,
          title: studyRoom.title,
          currentMembers: roomSize,
          maxMembers: studyRoom.maxMembers,
          participants: this.getExistingUsersInfo(roomId),
        });
      }
    } catch (err) {
      console.error('sendRoomInfo error:', err);
    }
  }

  public alertRoomDeleted(roomId: number) {
    this.server.to(roomId.toString()).emit('room-deleted', {
      message: '방이 삭제되었습니다.',
    });
  }
}
