import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthResponseService {
  constructor(private readonly configService: ConfigService) {}

  setAuthCookies(res: Response, tokens: AuthTokens): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const domain = this.configService.get<string>('COOKIE_DOMAIN');

    /**
     * localhost 쓰는 동안은 secure: false로 처리. (secure: isProduction,)
     */
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      ...(domain && { domain }),
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      ...(domain && { domain }),
    });
  }

  setTempTokenCookie(res: Response, token: string): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const domain = this.configService.get<string>('COOKIE_DOMAIN');

    res.cookie('tempGoogleToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      ...(domain && { domain }),
    });
  }

  clearAuthCookies(res: Response): void {
    const domain = this.configService.get<string>('COOKIE_DOMAIN');

    const cookieOptions = {
      httpOnly: true,
      ...(domain && { domain }),
    };

    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
  }

  clearTempTokenCookie(res: Response): void {
    const domain = this.configService.get<string>('COOKIE_DOMAIN');

    res.clearCookie('tempGoogleToken', {
      httpOnly: true,
      ...(domain && { domain }),
    });
  }

  getGoogleRedirectUrl(type: 'LOGIN_SUCCESS' | 'SIGNUP_FAIL'): string {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    const routes = {
      LOGIN_SUCCESS: '/main',
      SIGNUP_FAIL: '/googleSignup',
    };

    return `${frontendUrl}${routes[type]}`;
  }

  getErrorRedirectUrl(error: string): string {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    return `${frontendUrl}/login?error=${encodeURIComponent(error)}`;
  }
}
