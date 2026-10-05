import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const KEEPALIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class HealthService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private keepaliveTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    void this.pingDatabase();
    this.keepaliveTimer = setInterval(() => {
      void this.pingDatabase();
    }, KEEPALIVE_INTERVAL_MS);
    this.keepaliveTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.keepaliveTimer);
  }

  async isDatabaseUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async pingDatabase() {
    if (await this.isDatabaseUp()) {
      this.logger.log('Database keepalive ping succeeded');
    } else {
      this.logger.error('Database keepalive ping failed');
    }
  }
}
