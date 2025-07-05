import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Request,
  Response,
  Get,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response as Res } from 'express';
import { AuthService } from './auth.service';
import { AuthResponseService } from './auth-response.service';
import { SignUpDto } from './dtos/signup.dto';
import { LoginDto } from './dtos/login.dto';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authResponseService: AuthResponseService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(
    @Body() signUpDto: SignUpDto,
    @Response({ passthrough: true }) res: Res,
  ) {
    const user = await this.authService.signUp(signUpDto);

    const authResponse = await this.authService.login({
      email: signUpDto.email,
      password: signUpDto.password,
    });

    this.authResponseService.setAuthCookies(res, authResponse.tokens);

    return {
      success: true,
      message: '회원가입이 완료되었습니다.',
      data: { user: authResponse.user },
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Response({ passthrough: true }) res: Res,
  ) {
    const authResponse = await this.authService.login(loginDto);

    this.authResponseService.setAuthCookies(res, authResponse.tokens);

    return {
      success: true,
      message: '로그인에 성공했습니다.',
      data: { user: authResponse.user },
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req, @Response({ passthrough: true }) res: Res) {
    await this.authService.logout(req.user.id);

    this.authResponseService.clearAuthCookies(res);

    return {
      success: true,
      message: '로그아웃되었습니다.',
    };
  }

  @Post('refresh')
  @UseGuards(JwtRefreshAuthGuard)
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Request() req,
    @Response({ passthrough: true }) res: Res,
  ) {
    const tokens = await this.authService.refreshTokens(
      req.user.sub,
      req.user.refreshToken,
    );

    this.authResponseService.setAuthCookies(res, tokens);

    return {
      success: true,
      message: '토큰이 갱신되었습니다.',
    };
  }

  @Get('check-nickname')
  async checkNickname(@Query('nickname') nickname: string) {
    if (!nickname) {
      throw new BadRequestException('닉네임을 입력해주세요.');
    }

    const result = await this.authService.checkNicknameAvailability(nickname);

    return {
      success: true,
      data: result,
    };
  }

  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('이메일을 입력해주세요.');
    }

    const result = await this.authService.checkEmailAvailability(email);

    return {
      success: true,
      data: result,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req) {
    return {
      success: true,
      data: { user: req.user },
    };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Request() req, @Response() res: Res) {
    try {
      const result = await this.authService.processGoogleAuth(req.user);

      if (result.type === 'PENDING') {
        this.authResponseService.setTempTokenCookie(res, result.tempToken);
        const redirectUrl =
          this.authResponseService.getGoogleRedirectUrl('SIGNUP_FAIL');
        return res.redirect(redirectUrl);
      }

      this.authResponseService.setAuthCookies(res, result.tokens);
      const redirectUrl =
        this.authResponseService.getGoogleRedirectUrl('LOGIN_SUCCESS');
      return res.redirect(redirectUrl);
    } catch (error) {
      const errorUrl = this.authResponseService.getErrorRedirectUrl(
        'google_login_failed',
      );
      return res.redirect(errorUrl);
    }
  }

  @Post('google/complete')
  @HttpCode(HttpStatus.OK)
  async completeGoogleSignUp(
    @Body('nickname') nickname: string,
    @Request() req,
    @Response({ passthrough: true }) res: Res,
  ) {
    const tempToken = req.cookies?.tempGoogleToken;

    if (!tempToken) {
      throw new BadRequestException('유효하지 않은 요청입니다.');
    }

    const authResponse = await this.authService.completeGoogleSignUp(
      tempToken,
      nickname,
    );

    this.authResponseService.clearTempTokenCookie(res);
    this.authResponseService.setAuthCookies(res, authResponse.tokens);

    return {
      success: true,
      message: '회원가입이 완료되었습니다.',
      data: { user: authResponse.user },
    };
  }
}
