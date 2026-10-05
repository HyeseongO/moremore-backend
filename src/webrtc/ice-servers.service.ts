import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 5000;
const FALLBACK_ICE_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

@Injectable()
export class IceServersService {
  private readonly logger = new Logger(IceServersService.name);

  constructor(private readonly configService: ConfigService) {}

  async getIceServers(): Promise<IceServer[]> {
    const keyId = this.configService.get<string>('TURN_KEY_ID');
    const apiToken = this.configService.get<string>('TURN_KEY_API_TOKEN');
    if (!keyId || !apiToken) return FALLBACK_ICE_SERVERS;

    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      const { iceServers } = (await response.json()) as {
        iceServers: IceServer[];
      };
      return iceServers.map((server) => ({
        ...server,
        urls: [server.urls].flat().filter((url) => !/:53(\?|$)/.test(url)),
      }));
    } catch (error) {
      this.logger.error(
        `TURN credentials request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return FALLBACK_ICE_SERVERS;
    }
  }
}
