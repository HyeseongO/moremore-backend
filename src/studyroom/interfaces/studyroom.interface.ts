import { StudyRoom, StudyRoomMember, User, MemberRole } from '@prisma/client';

export interface StudyroomWithRelations extends StudyRoom {
  owner: Pick<User, 'id' | 'nickname' | 'profileImage'>;
  members: (StudyRoomMember & {
    user: Pick<User, 'id' | 'nickname' | 'profileImage'>;
  })[];
  _count: {
    members: number;
  };
}

export interface StudyroomWithMyRole extends StudyroomWithRelations {
  myRole: MemberRole;
  inviteLink?: string;
}

export interface MyStudyroom {
  id: number;
  title: string;
  description: string | null;
  roomType: string;
  maxMembers: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  owner: Pick<User, 'id' | 'nickname' | 'profileImage'>;
  _count: {
    members: number;
  };
  myRole: MemberRole;
  joinedAt: Date;
}
