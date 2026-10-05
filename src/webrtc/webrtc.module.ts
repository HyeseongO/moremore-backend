import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebRTCGateway } from './webrtc.gateway';
import { WebrtcController } from './webrtc.controller';
import { IceServersService } from './ice-servers.service';
import { StudyroomModule } from 'src/studyroom/studyroom.module';
import { AuthModule } from 'src/auth/auth.module';
import { ChatModule } from 'src/chat/chat.module';

@Module({
  imports: [
    forwardRef(() => StudyroomModule),
    AuthModule,
    ChatModule,
    ConfigModule,
  ],
  controllers: [WebrtcController],
  providers: [WebRTCGateway, IceServersService],
  exports: [WebRTCGateway],
})
export class WebrtcModule {}
