import { EmailProvider, SendMailOptions } from './email-provider.interface';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async sendMail(options: SendMailOptions): Promise<void> {
    this.logger.log(`
=========================================
[CONSOLE EMAIL OUTBOX]
To: ${options.to}
Subject: ${options.subject}
Body: 
${options.html}
=========================================
    `);
  }
}
