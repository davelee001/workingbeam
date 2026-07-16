import nodemailer, { Transporter } from 'nodemailer';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] as string);
}

export interface EmailHealth {
  available: boolean;
  mode: 'smtp' | 'console' | 'memory';
  detail: string;
}

export interface EmailService {
  sendVerificationCode(recipient: { email: string; name: string }, code: string, expiresInMinutes: number): Promise<void>;
  health(): Promise<EmailHealth>;
}

export class MemoryEmailService implements EmailService {
  readonly deliveries: Array<{ email: string; code: string }> = [];

  async sendVerificationCode(recipient: { email: string }, code: string): Promise<void> {
    this.deliveries.push({ email: recipient.email, code });
  }

  latestCode(email: string): string | undefined {
    return [...this.deliveries].reverse().find((delivery) => delivery.email === email)?.code;
  }

  async health(): Promise<EmailHealth> {
    return { available: true, mode: 'memory', detail: 'In-memory email delivery is active' };
  }
}

export class ConsoleEmailService implements EmailService {
  async sendVerificationCode(recipient: { email: string }, code: string, expiresInMinutes: number): Promise<void> {
    console.log(`[development email] Verification code for ${recipient.email}: ${code} (expires in ${expiresInMinutes} minutes)`);
  }

  async health(): Promise<EmailHealth> {
    return { available: true, mode: 'console', detail: 'Development-only console email delivery is active' };
  }
}

export class SmtpEmailService implements EmailService {
  private readonly transporter: Transporter;

  constructor(private readonly smtpUrl: string, private readonly from: string) {
    this.transporter = nodemailer.createTransport(smtpUrl, {
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async sendVerificationCode(recipient: { email: string; name: string }, code: string, expiresInMinutes: number): Promise<void> {
    const safeName = escapeHtml(recipient.name);
    await this.transporter.sendMail({
      from: this.from,
      to: recipient.email,
      subject: 'Verify your WorkingBeam email',
      text: `Hello ${recipient.name},\n\nYour WorkingBeam verification code is ${code}. It expires in ${expiresInMinutes} minutes.\n\nIf you did not request this account, ignore this email.`,
      html: `<p>Hello ${safeName},</p><p>Your WorkingBeam verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in ${expiresInMinutes} minutes. If you did not request this account, ignore this email.</p>`,
    });
  }

  async health(): Promise<EmailHealth> {
    try {
      await this.transporter.verify();
      return { available: true, mode: 'smtp', detail: 'SMTP email delivery is reachable' };
    } catch (error) {
      return { available: false, mode: 'smtp', detail: error instanceof Error ? error.message : 'SMTP email delivery is unavailable' };
    }
  }
}

export function createEmailService(): EmailService {
  const smtpUrl = process.env.SMTP_URL?.trim();
  if (smtpUrl) {
    const from = process.env.EMAIL_FROM?.trim();
    if (!from) throw new Error('EMAIL_FROM is required when SMTP_URL is configured');
    return new SmtpEmailService(smtpUrl, from);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SMTP_URL and EMAIL_FROM are required in production');
  }
  return new ConsoleEmailService();
}
