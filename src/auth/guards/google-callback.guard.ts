import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  handleRequest<TUser>(err: unknown, user: TUser | false): TUser | undefined {
    if (err || !user) return undefined;
    return user;
  }
}
