import { Module } from '@nestjs/common';
import { WebRTCGateway } from './webrtc.gateway';
import { StudyroomModule } from 'src/studyroom/studyroom.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [StudyroomModule, AuthModule],
  providers: [WebRTCGateway],
  exports: [WebRTCGateway],
})
export class WebrtcModule {
  constructor() {
    console.log('🔥 WebRTCModule loaded!');
  }
}
