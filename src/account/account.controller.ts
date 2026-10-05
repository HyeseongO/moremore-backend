import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import { Response as Res } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AuthResponseService } from '../auth/auth-response.service';
import { AccountService } from './account.service';
import { UpdateNicknameDto } from './dtos/update-nickname.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { DeleteAccountDto } from './dtos/delete-account.dto';

interface AuthenticatedRequest {
  user: { id: number };
}

@Controller('auth/me')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly authResponseService: AuthResponseService,
  ) {}

  @Patch('nickname')
  async updateNickname(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateNicknameDto,
  ) {
    const user = await this.accountService.updateNickname(
      req.user.id,
      dto.nickname,
    );

    return {
      success: true,
      message: '닉네임이 변경되었습니다.',
      data: { user },
    };
  }

  @Patch('password')
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Response({ passthrough: true }) res: Res,
  ) {
    const tokens = await this.accountService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
      userAgent,
    );
    this.authResponseService.setAuthCookies(res, tokens);

    return {
      success: true,
      message: '비밀번호가 변경되었습니다.',
    };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @Request() req: AuthenticatedRequest,
    @Body() dto: DeleteAccountDto,
    @Response({ passthrough: true }) res: Res,
  ) {
    await this.accountService.deleteAccount(req.user.id, dto.password);
    this.authResponseService.clearAuthCookies(res);

    return {
      success: true,
      message: '회원 탈퇴가 완료되었습니다.',
    };
  }
}
