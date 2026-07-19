import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function keyFromSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export class FieldEncryption {
  constructor(private readonly secret = process.env.WALLET_ENCRYPTION_KEY?.trim() ?? '') {}

  get enabled(): boolean {
    return this.secret.length >= 32;
  }

  encrypt(value: string): string {
    if (!this.enabled || value.startsWith(PREFIX)) return value;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyFromSecret(this.secret), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString('base64url')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith(PREFIX)) return value;
    if (!this.enabled) throw new Error('WALLET_ENCRYPTION_KEY is required to decrypt wallet data');
    const payload = Buffer.from(value.slice(PREFIX.length), 'base64url');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(this.secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  masked(value: string): string {
    const decrypted = this.decrypt(value);
    if (decrypted.length <= 12) return decrypted;
    return `${decrypted.slice(0, 8)}…${decrypted.slice(-4)}`;
  }
}
