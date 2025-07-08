import { StudyroomWithRelations } from './studyroom.interface';
import { MemberRole } from '@prisma/client';

export interface CreateStudyroomResponse extends StudyroomWithRelations {
  inviteLink: string;
}

export interface JoinStudyroomResponse extends StudyroomWithRelations {
  myRole: MemberRole;
}

export interface RegenerateInviteResponse {
  inviteCode: string;
  inviteLink: string;
}

export interface MessageResponse {
  message: string;
}
