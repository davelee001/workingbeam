import { Notification } from '../domain/types.js';

export interface PushHealth {
  available: boolean;
  mode: 'webhook' | 'disabled' | 'memory';
  detail: string;
}

export interface PushService {
  send(notification: Notification): Promise<void>;
  health(): Promise<PushHealth>;
}

export class DisabledPushService implements PushService {
  async send(): Promise<void> {}

  async health(): Promise<PushHealth> {
    return { available: false, mode: 'disabled', detail: 'Push delivery provider is not configured' };
  }
}

export class MemoryPushService implements PushService {
  readonly deliveries: Notification[] = [];

  async send(notification: Notification): Promise<void> {
    this.deliveries.push(notification);
  }

  async health(): Promise<PushHealth> {
    return { available: true, mode: 'memory', detail: 'In-memory push delivery is active' };
  }
}

export class WebhookPushService implements PushService {
  constructor(private readonly endpoint: string, private readonly token?: string) {}

  async send(notification: Notification): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Push webhook returned HTTP ${response.status}`);
  }

  async health(): Promise<PushHealth> {
    return { available: true, mode: 'webhook', detail: 'Push webhook delivery is configured' };
  }
}

export function createPushService(): PushService {
  const endpoint = process.env.PUSH_WEBHOOK_URL?.trim();
  if (endpoint) {
    if (process.env.NODE_ENV === 'production' && !endpoint.startsWith('https://')) {
      throw new Error('PUSH_WEBHOOK_URL must use HTTPS in production');
    }
    return new WebhookPushService(endpoint, process.env.PUSH_WEBHOOK_TOKEN?.trim() || undefined);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PUSH_WEBHOOK_URL is required in production');
  }
  return new DisabledPushService();
}
