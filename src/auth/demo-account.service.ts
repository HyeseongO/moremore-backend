import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DemoAccountService {
  private readonly demoEmails: Set<string>;

  constructor(configService: ConfigService) {
    this.demoEmails = new Set(
      (configService.get<string>('DEMO_ACCOUNT_EMAILS') ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  isDemoAccount(email: string): boolean {
    return this.demoEmails.has(email.toLowerCase());
  }
}
