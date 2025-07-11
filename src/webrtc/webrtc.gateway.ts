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
  ) {}

  @WebSocketServer()
  server: Server;

  private rooms: Map<string, Set<string>> = new Map();
  private userSocketMap: Map<string, { userId: number; nickname: string }> =
    new Map();

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() roomId: string,
  ) {
    try {
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

      let room = this.rooms.get(roomId);
      if (!room) {
        room = new Set<string>();
        this.rooms.set(roomId, room);
      }

      if (room.size >= studyRoom.maxMembers) {
        client.emit('room-full', {
          message: `최대 ${studyRoom.maxMembers}명까지 입장 가능합니다.`,
        });
        return;
      }

      client.join(roomId);
      room.add(client.id);

      client.to(roomId).emit('user-joined', {
        userId: client.id,
        nickname: await this.getUserNickname(client.id),
      });

      const existingUsers = await this.getExistingUsersInfo(roomId, client.id);
      client.emit('existing-users', existingUsers);

      this.sendRoomInfo(roomId);
    } catch (error) {
      console.error('Join room error:', error);
      client.emit('error', { message: '방 입장 중 오류가 발생했습니다.' });
    }
  }

  async handleConnection(client: SocketWithUser) {
    console.log('🔌 New connection attempt');

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
    this.removeFromAllRooms(client.id);
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

  private removeFromAllRooms(clientId: string) {
    this.rooms.forEach((users, roomId) => {
      if (users.has(clientId)) {
        users.delete(clientId);
        this.server.to(roomId).emit('user-left', clientId);

        this.sendRoomInfo(roomId);

        if (users.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    });
  }

  private async getUserNickname(socketId: string): Promise<string> {
    const userInfo = this.userSocketMap.get(socketId);
    return userInfo?.nickname || 'Unknown User';
  }

  private async getExistingUsersInfo(
    roomId: string,
    excludeSocketId: string,
  ): Promise<Array<{ userId: string; nickname: string }>> {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const users = [...room].filter((id) => id !== excludeSocketId);
    return users.map((socketId) => ({
      userId: socketId,
      nickname: this.userSocketMap.get(socketId)?.nickname || 'Unknown User',
    }));
  }

  private async sendRoomInfo(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    try {
      const studyRoom = await this.studyRoomService.findOne(parseInt(roomId));
      if (studyRoom) {
        this.server.to(roomId).emit('room-info', {
          roomId: roomId,
          title: studyRoom.title,
          currentMembers: room.size,
          maxMembers: studyRoom.maxMembers,
          participants: await this.getExistingUsersInfo(roomId, ''),
        });
      }
    } catch (error) {
      console.error('Send room info error:', error);
    }
  }
}
