import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { IceServersService } from './ice-servers.service';

@Controller('webrtc')
export class WebrtcController {
  constructor(private readonly iceServersService: IceServersService) {}

  @Get('ice-servers')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  async getIceServers() {
    const iceServers = await this.iceServersService.getIceServers();
    return {
      success: true,
      data: { iceServers },
    };
  }
}
