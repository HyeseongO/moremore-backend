import { Module } from '@nestjs/common';
import { StudyroomController } from './controllers/studyroom.controller';
import { StudyroomService } from './services/studyroom.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { StudyroomMemberService } from './services/studyroom-member.service';
import { StudyroomInviteService } from './services/studyroom-invite.service';
import { StudyroomAuthService } from './services/studyroom-auth.service';
import { StudyroomMemberRepository } from './repositories/studyroom-member.repository';
import { StudyroomRepository } from './repositories/studyroom.repository';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [StudyroomController],
  providers: [
    StudyroomService,
    StudyroomMemberService,
    StudyroomInviteService,
    StudyroomAuthService,
    StudyroomRepository,
    StudyroomMemberRepository,
  ],
  exports: [StudyroomService, StudyroomMemberService, StudyroomAuthService],
})
export class StudyroomModule {}
