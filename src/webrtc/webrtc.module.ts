import { forwardRef, Module } from '@nestjs/common';
import { WebRTCGateway } from './webrtc.gateway';
import { StudyroomModule } from 'src/studyroom/studyroom.module';
import { AuthModule } from 'src/auth/auth.module';
import { ChatModule } from 'src/chat/chat.module';

@Module({
  imports: [forwardRef(() => StudyroomModule), AuthModule, ChatModule],
  providers: [WebRTCGateway],
  exports: [WebRTCGateway],
})
export class WebrtcModule {}
