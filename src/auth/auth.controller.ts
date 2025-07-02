import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dtos/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Get('check-nickname')
  async checkRepeatedNickname(@Query('nickname') nickname: string) {
    if (!nickname) {
      return {
        available: false,
        message: '닉네임을 입력해주세요.',
      };
    }
  }

  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    if (!email) {
      return {
        available: false,
        message: '이메일을 입력해주세요.',
      };
    }
    return this.authService.checkRepeatedEmail(email);
  }
}
