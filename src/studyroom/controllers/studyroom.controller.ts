import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { StudyroomService } from '../services/studyroom.service';
import { StudyroomMemberService } from '../services/studyroom-member.service';
import { StudyroomInviteService } from '../services/studyroom-invite.service';
import { StudyroomAuthService } from '../services/studyroom-auth.service';
import { CreateStudyroomDto } from '../dtos/create-studyroom-dto';
import { UpdateStudyroomDto } from '../dtos/update-studyroom.dto';
import { TransferOwnershipDto } from '../dtos/transfer-ownership.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { RoomType } from '@prisma/client';

@Controller('studyrooms')
export class StudyroomController {
  constructor(
    private readonly studyroomService: StudyroomService,
    private readonly memberService: StudyroomMemberService,
    private readonly inviteService: StudyroomInviteService,
    private readonly authService: StudyroomAuthService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Request() req,
    @Query('roomType') roomType?: RoomType,
    @Query('search') searchTitle?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const options = {
      ...(roomType && { roomType }),
      ...(searchTitle && { searchTitle }),
      ...(limit && { limit: parseInt(limit) }),
      ...(offset && { offset: parseInt(offset) }),
    };

    return this.studyroomService.findAll(options);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req, @Body() createStudyroomDto: CreateStudyroomDto) {
    const studyroom = await this.studyroomService.create(
      req.user.id,
      createStudyroomDto,
    );
    return {
      ...studyroom,
      inviteLink: this.inviteService.generateInviteLink(studyroom.inviteCode),
    };
  }

  @Get('my-rooms')
  @UseGuards(JwtAuthGuard)
  findMyRooms(@Request() req) {
    return this.memberService.getUserStudyrooms(req.user.id);
  }

  @Get('invite/:inviteCode')
  findByInviteCode(@Param('inviteCode') inviteCode: string) {
    return this.inviteService.getByInviteCode(inviteCode);
  }

  @Post('join/:inviteCode')
  @UseGuards(JwtAuthGuard)
  joinByInviteCode(@Request() req, @Param('inviteCode') inviteCode: string) {
    return this.inviteService.joinByInviteCode(req.user.id, inviteCode);
  }

  @Post(':id/regenerate-invite')
  @UseGuards(JwtAuthGuard)
  regenerateInviteCode(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.inviteService.regenerateInviteCode(id, req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const member = await this.authService.verifyMember(id, req.user.id);
    const studyroom = await this.studyroomService.findById(id);

    return {
      ...studyroom,
      myRole: member.role,
      inviteLink: (await this.authService.isOwner(id, req.user.id))
        ? this.inviteService.generateInviteLink(studyroom.inviteCode)
        : undefined,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStudyroomDto: UpdateStudyroomDto,
  ) {
    await this.authService.verifyOwner(id, req.user.id);
    return this.studyroomService.update(id, updateStudyroomDto);
  }

  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leave(@Request() req, @Param('id', ParseIntPipe) id: number) {
    await this.memberService.leave(req.user.id, id);
    return { message: '스터디룸에서 나갔습니다.' };
  }

  @Post(':id/transfer-ownership')
  @UseGuards(JwtAuthGuard)
  async transferOwnership(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() transferOwnershipDto: TransferOwnershipDto,
  ) {
    await this.memberService.transferOwnership(
      req.user.id,
      id,
      transferOwnershipDto.newOwnerId,
    );
    return { message: '방장 권한이 이전되었습니다.' };
  }
}
