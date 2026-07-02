import { EmailProvider, SendMailOptions } from './email-provider.interface';
import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private resend: Resend | null = null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY is not defined. Resend provider will fail if invoked.');
    }
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    if (!this.resend) {
      throw new Error('Resend client is not initialized due to missing RESEND_API_KEY.');
    }
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    
    try {
      const response = await this.resend.emails.send({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      if (response.error) {
        throw response.error;
      }
      this.logger.log(`Email sent via Resend successfully to ${options.to}. ID: ${response.data?.id}`);
    } catch (error) {
      this.logger.error(`Failed to send email via Resend to ${options.to}:`, error);
      throw error;
    }
  }
}
