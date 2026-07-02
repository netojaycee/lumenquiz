export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailProvider {
  sendMail(options: SendMailOptions): Promise<void>;
}
