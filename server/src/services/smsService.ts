import { Notification } from '../domain/types.js';

export interface SmsHealth {
  available: boolean;
  mode: 'webhook' | 'disabled' | 'memory';
  detail: string;
}

export interface SmsService {
  send(notification: Notification, phone?: string): Promise<void>;
  health(): Promise<SmsHealth>;
}

export class DisabledSmsService implements SmsService {
  async send(): Promise<void> {}

  async health(): Promise<SmsHealth> {
    return { available: false, mode: 'disabled', detail: 'SMS provider is not configured' };
  }
}

export class MemorySmsService implements SmsService {
  readonly deliveries: Array<{ notification: Notification; phone?: string }> = [];

  async send(notification: Notification, phone?: string): Promise<void> {
    this.deliveries.push({ notification, phone });
  }

  async health(): Promise<SmsHealth> {
    return { available: true, mode: 'memory', detail: 'In-memory SMS delivery is active' };
  }
}

export class WebhookSmsService implements SmsService {
  constructor(private readonly endpoint: string, private readonly token?: string) {}

  async send(notification: Notification, phone?: string): Promise<void> {
    if (!phone) return;
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        phone,
        title: notification.title,
        message: notification.message,
        userId: notification.userId,
        createdAt: notification.createdAt,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`SMS webhook returned HTTP ${response.status}`);
  }

  async health(): Promise<SmsHealth> {
    return { available: true, mode: 'webhook', detail: 'SMS webhook delivery is configured' };
  }
}

export function createSmsService(): SmsService {
  const endpoint = process.env.SMS_WEBHOOK_URL?.trim();
  if (endpoint) {
    if (process.env.NODE_ENV === 'production' && !endpoint.startsWith('https://')) {
      throw new Error('SMS_WEBHOOK_URL must use HTTPS in production');
    }
    return new WebhookSmsService(endpoint, process.env.SMS_WEBHOOK_TOKEN?.trim() || undefined);
  }
  return new DisabledSmsService();
}
