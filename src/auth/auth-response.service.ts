import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const SAME_SITE_VALUES = ['lax', 'strict', 'none'] as const;
type SameSite = (typeof SAME_SITE_VALUES)[number];

@Injectable()
export class AuthResponseService {
  private readonly baseCookieOptions: CookieOptions;

  constructor(private readonly configService: ConfigService) {
    const sameSite = this.configService
      .get<string>('COOKIE_SAME_SITE', 'lax')
      .toLowerCase() as SameSite;
    if (!SAME_SITE_VALUES.includes(sameSite)) {
      throw new Error(`Invalid COOKIE_SAME_SITE: ${sameSite}`);
    }
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const domain = this.configService.get<string>('COOKIE_DOMAIN');

    this.baseCookieOptions = {
      httpOnly: true,
      secure: isProduction || sameSite === 'none',
      sameSite,
      path: '/',
      ...(domain && { domain }),
    };
  }

  setAuthCookies(res: Response, tokens: AuthTokens): void {
    res.cookie('accessToken', tokens.accessToken, {
      ...this.baseCookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      ...this.baseCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  setTempTokenCookie(res: Response, token: string): void {
    res.cookie('tempGoogleToken', token, {
      ...this.baseCookieOptions,
      maxAge: 10 * 60 * 1000,
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie('accessToken', this.baseCookieOptions);
    res.clearCookie('refreshToken', this.baseCookieOptions);
  }

  clearTempTokenCookie(res: Response): void {
    res.clearCookie('tempGoogleToken', this.baseCookieOptions);
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
    return `${frontendUrl}/?error=${encodeURIComponent(error)}`;
  }
}
