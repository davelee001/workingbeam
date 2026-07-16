import { randomUUID } from 'node:crypto';

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEVELOPMENT_SECRET = '1x0000000000000000000000000000000AA';

interface TurnstileResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

export interface HumanVerifier {
  verify(token: string | undefined, remoteIp: string | undefined, expectedAction: string): Promise<void>;
  readonly mode: 'turnstile' | 'test';
}

export class TurnstileVerifier implements HumanVerifier {
  readonly mode: 'turnstile' | 'test';

  constructor(private readonly secret: string, private readonly expectedHostname?: string) {
    this.mode = secret === DEVELOPMENT_SECRET ? 'test' : 'turnstile';
  }

  async verify(token: string | undefined, remoteIp: string | undefined, expectedAction: string): Promise<void> {
    if (!token || token.length > 2048) throw new Error('Complete the security challenge and try again');
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: this.secret,
        response: token,
        remoteip: remoteIp,
        idempotency_key: randomUUID(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Security challenge verification is unavailable');
    const result = await response.json() as TurnstileResponse;
    if (!result.success) throw new Error('Security challenge failed or expired. Please try again');
    if (this.expectedHostname && result.hostname !== this.expectedHostname) throw new Error('Security challenge hostname did not match');
    if (this.mode === 'turnstile' && result.action !== expectedAction) throw new Error('Security challenge action did not match');
  }
}

export function createHumanVerifier(): HumanVerifier {
  const production = process.env.NODE_ENV === 'production';
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() || (production ? '' : DEVELOPMENT_SECRET);
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY is required in production');
  if (production && secret === DEVELOPMENT_SECRET) throw new Error('The Turnstile development secret cannot be used in production');
  return new TurnstileVerifier(secret, process.env.TURNSTILE_EXPECTED_HOSTNAME?.trim() || undefined);
}
