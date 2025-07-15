import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
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
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
export class WebRTCGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private authService: AuthService,
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

      const size = this.getRoomSize(roomId);
      this.server.to(roomId).emit('user-joined', {
        userId: client.id,
        nickname: await this.getUserNickname(client.id),
      });
      this.sendRoomInfo(roomId);

      this.server.to(roomId).emit('user-joined', {
        userId: client.id,
        nickname: await this.getUserNickname(client.id),
      });

      const existingUsers = await this.getExistingUsersInfo(roomId, client.id);
      client.emit('existing-users', existingUsers);

      this.sendRoomInfo(roomId);

      const recentMessages = await this.chatService.getMessages(
        parseInt(roomId),
        20,
      );

      client.emit('messages-history', recentMessages.reverse());
    } catch (error) {
      console.error('Join room error:', error);
      client.emit('error', { message: '방 입장 중 오류가 발생했습니다.' });
    }
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    client.leave(roomId);
    this.server.to(roomId).emit('user-left', client.id);
    this.broadcastRoomCount(roomId);
  }

  async handleConnection(client: SocketWithUser) {
    console.log('New connection attempt');

    let token: string | undefined;

    if (client.handshake.auth?.token) {
      console.log('Token from auth object');
      token = client.handshake.auth.token;
    }

    if (!token) {
      const cookies = client.handshake.headers.cookie;
      if (cookies) {
        console.log('Checking cookies:', cookies);
        const cookieObj = cookies
          .split(';')
          .reduce<Record<string, string>>((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
          }, {});
        token = cookieObj.accessToken;
      }
    }

    if (!token) {
      console.log('No token found in auth or cookies');
      return client.disconnect();
    }

    try {
      const user = await this.authService.validateAccessToken(token);

      if (!user) {
        console.log('Invalid token, disconnecting');
        return client.disconnect();
      }

      client.user = user;

      this.userSocketMap.set(client.id, {
        userId: user.id,
        nickname: user.nickname,
      });

      console.log('✅ User connected:', user.nickname);
    } catch (error) {
      console.error('❌ Connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    const rooms = this.server.sockets.adapter.rooms;
    rooms.forEach((members, roomId) => {
      if (members.has(client.id)) {
        this.server.to(roomId).emit('user-left', client.id);
        this.broadcastRoomCount(roomId);
      }
    });

    this.userSocketMap.delete(client.id);
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

  @SubscribeMessage('test-room')
  async handleTestRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ) {
    try {
      const parsed = parseInt(roomId);

      const room = await this.studyRoomService.findOne(parsed);
      client.emit('test-result', { room, found: !!room });
    } catch (error) {
      client.emit('test-result', { error: error.message });
    }
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
      client.emit('error', { message: error.message });
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

  private async getUserNickname(socketId: string): Promise<string> {
    const userInfo = this.userSocketMap.get(socketId);
    return userInfo?.nickname || 'Unknown User';
  }

  private async getExistingUsersInfo(roomId: string, excludeSocketId = '') {
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
    const studyRoom = await this.studyRoomService.findOne(+roomId);

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
          participants: await this.getExistingUsersInfo(roomId),
        });
      }
    } catch (err) {
      console.error('sendRoomInfo error:', err);
    }
  }
}
