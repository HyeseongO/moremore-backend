import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebrtcModule } from '../webrtc/webrtc.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [AuthModule, WebrtcModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
