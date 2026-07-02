import { Module } from '@nestjs/common';
import { ConsoleEmailProvider } from './console-email.provider';
import { ResendEmailProvider } from './resend-email.provider';

@Module({
  providers: [
    ConsoleEmailProvider,
    ResendEmailProvider,
    {
      provide: 'EmailProvider',
      useFactory: (consoleEmail: ConsoleEmailProvider, resendEmail: ResendEmailProvider) => {
        const providerName = process.env.EMAIL_PROVIDER || 'console';
        if (providerName.toLowerCase() === 'resend') {
          return resendEmail;
        }
        return consoleEmail;
      },
      inject: [ConsoleEmailProvider, ResendEmailProvider],
    },
  ],
  exports: ['EmailProvider'],
})
export class EmailModule {}
