import { createHash, createHmac, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  AuditEvent,
  BeamTransaction,
  ContactInquiry,
  KycSubmission,
  Notification,
  NotificationChannel,
  PaymentCurrency,
  PaymentRequest,
  PublicUser,
  Session,
  User,
  UserRole,
  toPublicUser,
} from '../domain/types.js';
import { DataStore } from '../persistence/jsonStore.js';
import { BeamWallet } from './beamWallet.js';
import { EmailService } from './emailService.js';
import { FieldEncryption } from './fieldEncryption.js';
import { DisabledPushService, PushService } from './pushService.js';
import { DisabledSmsService, SmsService } from './smsService.js';

const scrypt = promisify(scryptCallback);
const SESSION_HOURS = 24;
const VERIFICATION_MINUTES = 10;
const VERIFICATION_MAX_ATTEMPTS = 5;
const VERIFICATION_RESEND_SECONDS = 60;
const MAX_PAYMENT_AMOUNT = 1_000_000;
const HIGH_RISK_PAYMENT_AMOUNT = 100_000;
const DAILY_REQUEST_LIMIT = 25;

export class PlatformError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code?: string) {
    super(message);
  }
}

export interface PaymentView extends PaymentRequest {
  freelancer: PublicUser;
  client: PublicUser;
  transactions: BeamTransaction[];
}

export interface KycView extends KycSubmission {
  user: PublicUser;
}

export type RegistrationResult =
  | { user: PublicUser; token: string }
  | { requiresVerification: true; email: string; expiresAt: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function now(): string {
  return new Date().toISOString();
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function verificationCodeHash(code: string, pepper: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${createHmac('sha256', pepper).update(`${salt}:${code}`).digest('hex')}`;
}

function verificationCodeMatches(code: string, stored: string, pepper: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = Buffer.from(verificationCodeHash(code, pepper, salt).split(':')[1], 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validateRegistration(input: {
  name?: string; email?: string; password?: string; role?: string; walletAddress?: string;
}): asserts input is { name: string; email: string; password: string; role: UserRole; walletAddress: string; phone?: string } {
  if (!input.name?.trim() || input.name.trim().length < 2) throw new PlatformError('Name must contain at least 2 characters');
  if (!input.email || !/^\S+@\S+\.\S+$/.test(input.email)) throw new PlatformError('A valid email address is required');
  if (!input.password || input.password.length < 8) throw new PlatformError('Password must contain at least 8 characters');
  if (input.role !== 'freelancer' && input.role !== 'client') throw new PlatformError('Role must be freelancer or client');
  if (!input.walletAddress?.trim() || input.walletAddress.trim().length < 10) throw new PlatformError('A valid Beam wallet address or payment token is required');
}

const contactSubjects = new Set(['product', 'integration', 'security', 'partnership']);
const supportedPaymentCurrencies = new Set<PaymentCurrency>(['USD', 'EUR', 'GBP', 'SSP', 'UGX', 'KSH', 'TSH', 'SDG']);

function validateContactInquiry(input: {
  name?: string; email?: string; company?: string; subject?: string; message?: string;
}): asserts input is { name: string; email: string; company?: string; subject: ContactInquiry['subject']; message: string } {
  if (!input.name?.trim() || input.name.trim().length < 2 || input.name.trim().length > 80) throw new PlatformError('Name must be between 2 and 80 characters');
  if (!input.email || input.email.length > 160 || !/^\S+@\S+\.\S+$/.test(input.email)) throw new PlatformError('A valid email address is required');
  if (input.company && input.company.trim().length > 120) throw new PlatformError('Company must be 120 characters or fewer');
  if (!input.subject || !contactSubjects.has(input.subject)) throw new PlatformError('Choose a valid contact topic');
  if (!input.message?.trim() || input.message.trim().length < 20 || input.message.trim().length > 2000) throw new PlatformError('Message must be between 20 and 2,000 characters');
}

function validateKycSubmission(input: {
  legalName?: string; country?: string; documentType?: string; documentNumber?: string; address?: string;
}): asserts input is { legalName: string; country: string; documentType: KycSubmission['documentType']; documentNumber: string; address: string } {
  const documentTypes = new Set(['national_id', 'passport', 'drivers_license', 'business_registration']);
  if (!input.legalName?.trim() || input.legalName.trim().length < 2 || input.legalName.trim().length > 120) throw new PlatformError('Legal name must be between 2 and 120 characters');
  if (!input.country?.trim() || input.country.trim().length < 2 || input.country.trim().length > 80) throw new PlatformError('Country is required');
  if (!input.documentType || !documentTypes.has(input.documentType)) throw new PlatformError('Choose a valid document type');
  if (!input.documentNumber?.trim() || input.documentNumber.trim().length < 4 || input.documentNumber.trim().length > 80) throw new PlatformError('Document number must contain at least 4 characters');
  if (!input.address?.trim() || input.address.trim().length < 8 || input.address.trim().length > 240) throw new PlatformError('Residential or business address must be between 8 and 240 characters');
}

export class PlatformService {
  constructor(
    private readonly store: DataStore,
    private readonly wallet: BeamWallet,
    private readonly escrowAddress: string,
    private readonly emailService: EmailService,
    private readonly verificationCodePepper = 'workingbeam-development-verification-pepper',
    private readonly requireEmailVerification = true,
    private readonly pushService: PushService = new DisabledPushService(),
    private readonly fieldEncryption = new FieldEncryption(),
    private readonly smsService: SmsService = new DisabledSmsService(),
  ) {}

  private createSession(userId: string): { session: Session; token: string } {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      session: {
        tokenHash: tokenHash(token), userId,
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(),
      },
    };
  }

  private audit(actorId: string | undefined, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>): AuditEvent {
    return { id: randomUUID(), actorId, action, entityType, entityId, metadata, createdAt: now() };
  }

  private notification(
    userId: string,
    title: string,
    message: string,
    channels: NotificationChannel[] = ['in_app', 'email'],
  ): Notification {
    return { id: randomUUID(), userId, title, message, channels, read: false, createdAt: now() };
  }

  private queueNotification(database: ReturnType<DataStore['read']>, notification: Notification): void {
    database.notifications.push(notification);
    if (notification.channels.includes('push')) {
      void this.pushService.send(notification).catch((error) => {
        console.error('Push notification delivery failed', error);
      });
    }
    if (notification.channels.includes('sms')) {
      const user = database.users.find((item) => item.id === notification.userId);
      void this.smsService.send(notification, user?.phone).catch((error) => {
        console.error('SMS notification delivery failed', error);
      });
    }
  }

  private encryptWalletAddress(address: string): string {
    return this.fieldEncryption.encrypt(address);
  }

  private decryptWalletAddress(address: string): string {
    return this.fieldEncryption.decrypt(address);
  }

  private publicUser(user: User): PublicUser {
    return toPublicUser({ ...user, walletAddress: this.decryptWalletAddress(user.walletAddress) });
  }

  async register(input: {
    name?: string; email?: string; password?: string; role?: string; walletAddress?: string; phone?: string;
  }): Promise<RegistrationResult> {
    validateRegistration(input);
    const email = normalizeEmail(input.email);
    if (this.store.read().users.some((user) => user.email === email)) {
      throw new PlatformError('An account with this email already exists', 409);
    }
    let addressValidation;
    try {
      addressValidation = await this.wallet.validateAddress(input.walletAddress.trim());
    } catch {
      throw new PlatformError('Beam wallet validation is temporarily unavailable', 503, 'WALLET_VALIDATION_UNAVAILABLE');
    }
    if (!addressValidation.valid) throw new PlatformError('The Beam wallet address or payment token is not valid', 400, 'INVALID_BEAM_ADDRESS');
    const user: User = {
      id: randomUUID(),
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      walletAddress: this.encryptWalletAddress(input.walletAddress.trim()),
      phone: input.phone?.trim() || undefined,
      createdAt: now(),
    };
    if (!this.requireEmailVerification) {
      const { session, token } = this.createSession(user.id);
      this.store.mutate((database) => {
        if (database.users.some((item) => item.email === email)) throw new PlatformError('An account with this email already exists', 409);
        database.users.push(user);
        database.sessions.push(session);
        database.auditEvents.push(this.audit(user.id, 'auth.register', 'user', user.id, { role: user.role, emailVerification: 'paused', walletType: addressValidation.type }));
      });
      return { user: this.publicUser(user), token };
    }
    const code = createVerificationCode();
    const timestamp = now();
    const verification = {
      id: randomUUID(), userId: user.id, codeHash: verificationCodeHash(code, this.verificationCodePepper), attempts: 0,
      createdAt: timestamp, lastSentAt: timestamp,
      expiresAt: new Date(Date.now() + VERIFICATION_MINUTES * 60_000).toISOString(),
    };
    this.store.mutate((database) => {
      if (database.users.some((item) => item.email === email)) throw new PlatformError('An account with this email already exists', 409);
      database.users.push(user);
      database.emailVerifications.push(verification);
      database.auditEvents.push(this.audit(user.id, 'auth.register_pending', 'user', user.id, { role: user.role, walletType: addressValidation.type }));
    });
    try {
      await this.emailService.sendVerificationCode(user, code, VERIFICATION_MINUTES);
    } catch {
      this.store.mutate((database) => {
        database.users = database.users.filter((item) => item.id !== user.id);
        database.emailVerifications = database.emailVerifications.filter((item) => item.userId !== user.id);
      });
      throw new PlatformError('Verification email could not be delivered. Check the address and try again', 503, 'EMAIL_DELIVERY_FAILED');
    }
    return { requiresVerification: true, email, expiresAt: verification.expiresAt };
  }

  async verifyEmail(emailInput: string | undefined, codeInput: string | undefined): Promise<{ user: PublicUser; token: string }> {
    const email = normalizeEmail(emailInput ?? '');
    const user = this.store.read().users.find((candidate) => candidate.email === email);
    if (!user) throw new PlatformError('Verification code is invalid or expired', 400, 'INVALID_VERIFICATION_CODE');
    if (user.emailVerifiedAt) throw new PlatformError('This email is already verified', 409, 'EMAIL_ALREADY_VERIFIED');
    const verification = this.store.read().emailVerifications.find((item) => item.userId === user.id);
    const code = codeInput?.trim() ?? '';
    if (!verification || new Date(verification.expiresAt).getTime() <= Date.now()) {
      throw new PlatformError('Verification code is invalid or expired', 400, 'INVALID_VERIFICATION_CODE');
    }
    if (verification.attempts >= VERIFICATION_MAX_ATTEMPTS) {
      throw new PlatformError('Too many incorrect codes. Request a new verification code', 429, 'VERIFICATION_ATTEMPTS_EXCEEDED');
    }
    const matches = /^\d{6}$/.test(code) && verificationCodeMatches(code, verification.codeHash, this.verificationCodePepper);
    if (!matches) {
      this.store.mutate((database) => {
        const stored = database.emailVerifications.find((item) => item.id === verification.id);
        if (stored) stored.attempts += 1;
        database.auditEvents.push(this.audit(user.id, 'auth.email_verification_failed', 'user', user.id));
      });
      throw new PlatformError('Verification code is invalid or expired', 400, 'INVALID_VERIFICATION_CODE');
    }
    const { session, token } = this.createSession(user.id);
    this.store.mutate((database) => {
      const storedUser = database.users.find((item) => item.id === user.id) as User;
      storedUser.emailVerifiedAt = now();
      database.emailVerifications = database.emailVerifications.filter((item) => item.userId !== user.id);
      database.sessions.push(session);
      database.auditEvents.push(this.audit(user.id, 'auth.email_verified', 'user', user.id));
    });
    return { user: this.publicUser({ ...user, emailVerifiedAt: now() }), token };
  }

  async resendEmailVerification(emailInput: string | undefined): Promise<{ sent: true }> {
    const email = normalizeEmail(emailInput ?? '');
    const user = this.store.read().users.find((candidate) => candidate.email === email);
    if (!user || user.emailVerifiedAt) return { sent: true };
    const existing = this.store.read().emailVerifications.find((item) => item.userId === user.id);
    if (existing && Date.now() - new Date(existing.lastSentAt).getTime() < VERIFICATION_RESEND_SECONDS * 1_000) {
      throw new PlatformError('Wait one minute before requesting another code', 429, 'VERIFICATION_RESEND_THROTTLED');
    }
    const code = createVerificationCode();
    try {
      await this.emailService.sendVerificationCode(user, code, VERIFICATION_MINUTES);
    } catch {
      throw new PlatformError('Verification email could not be delivered. Try again later', 503, 'EMAIL_DELIVERY_FAILED');
    }
    const timestamp = now();
    this.store.mutate((database) => {
      database.emailVerifications = database.emailVerifications.filter((item) => item.userId !== user.id);
      database.emailVerifications.push({
        id: randomUUID(), userId: user.id, codeHash: verificationCodeHash(code, this.verificationCodePepper), attempts: 0,
        createdAt: timestamp, lastSentAt: timestamp,
        expiresAt: new Date(Date.now() + VERIFICATION_MINUTES * 60_000).toISOString(),
      });
      database.auditEvents.push(this.audit(user.id, 'auth.email_verification_resent', 'user', user.id));
    });
    return { sent: true };
  }

  async login(emailInput: string | undefined, password: string | undefined): Promise<{ user: PublicUser; token: string }> {
    const email = normalizeEmail(emailInput ?? '');
    const user = this.store.read().users.find((candidate) => candidate.email === email);
    if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
      throw new PlatformError('Invalid email or password', 401);
    }
    if (this.requireEmailVerification && !user.emailVerifiedAt) throw new PlatformError('Verify your email before signing in', 403, 'EMAIL_UNVERIFIED');
    const { session, token } = this.createSession(user.id);
    this.store.mutate((database) => {
      database.sessions = database.sessions.filter((item) => new Date(item.expiresAt).getTime() > Date.now());
      database.sessions.push(session);
      database.auditEvents.push(this.audit(user.id, 'auth.login', 'user', user.id));
    });
    return { user: this.publicUser(user), token };
  }

  authenticate(token: string | undefined): PublicUser {
    if (!token) throw new PlatformError('Authentication required', 401);
    const database = this.store.read();
    const session = database.sessions.find((item) => item.tokenHash === tokenHash(token));
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new PlatformError('Session is invalid or expired', 401);
    }
    const user = database.users.find((item) => item.id === session.userId);
    if (!user) throw new PlatformError('Account no longer exists', 401);
    if (this.requireEmailVerification && !user.emailVerifiedAt) throw new PlatformError('Email verification is required', 401, 'EMAIL_UNVERIFIED');
    return this.publicUser(user);
  }

  logout(token: string): void {
    this.store.mutate((database) => {
      database.sessions = database.sessions.filter((session) => session.tokenHash !== tokenHash(token));
    });
  }

  async updateProfile(actor: PublicUser, input: { name?: string; phone?: string; walletAddress?: string }): Promise<PublicUser> {
    const name = input.name?.trim() ?? '';
    const phone = input.phone?.trim() ?? '';
    const walletAddress = input.walletAddress?.trim() ?? '';
    if (name.length < 2 || name.length > 80) throw new PlatformError('Name must be between 2 and 80 characters');
    if (phone.length > 40) throw new PlatformError('Phone must be 40 characters or fewer');
    if (walletAddress.length < 10) throw new PlatformError('A valid Beam wallet address or payment token is required');
    let updated: User | undefined;
    const existing = this.store.read().users.find((item) => item.id === actor.id);
    if (!existing) throw new PlatformError('Account no longer exists', 404);
    let walletType = 'unchanged';
    const existingWalletAddress = this.decryptWalletAddress(existing.walletAddress);
    if (walletAddress !== existingWalletAddress) {
      let addressValidation;
      try {
        addressValidation = await this.wallet.validateAddress(walletAddress);
      } catch {
        throw new PlatformError('Beam wallet validation is temporarily unavailable', 503, 'WALLET_VALIDATION_UNAVAILABLE');
      }
      if (!addressValidation.valid) throw new PlatformError('The Beam wallet address or payment token is not valid', 400, 'INVALID_BEAM_ADDRESS');
      walletType = addressValidation.type ?? 'validated';
    }
    this.store.mutate((database) => {
      const user = database.users.find((item) => item.id === actor.id) as User;
      user.name = name;
      user.phone = phone || undefined;
      user.walletAddress = this.encryptWalletAddress(walletAddress);
      updated = user;
      database.auditEvents.push(this.audit(actor.id, 'profile.update', 'user', actor.id, { walletType }));
    });
    return this.publicUser(updated as User);
  }

  registerPushToken(actor: PublicUser, input: { token?: string }): PublicUser {
    const token = input.token?.trim() ?? '';
    if (token.length < 20 || token.length > 500) throw new PlatformError('A valid push token is required');
    let updated: User | undefined;
    this.store.mutate((database) => {
      const user = database.users.find((item) => item.id === actor.id) as User;
      const tokens = new Set(user.pushTokens ?? []);
      tokens.add(token);
      user.pushTokens = [...tokens].slice(-10);
      updated = user;
      database.auditEvents.push(this.audit(actor.id, 'notification.push_token_registered', 'user', actor.id));
    });
    return this.publicUser(updated as User);
  }

  requestComplianceReview(actor: PublicUser): PublicUser {
    let updated: User | undefined;
    this.store.mutate((database) => {
      const user = database.users.find((item) => item.id === actor.id) as User;
      user.complianceStatus = 'pending_review';
      updated = user;
      database.auditEvents.push(this.audit(actor.id, 'compliance.review_requested', 'user', actor.id));
    });
    return this.publicUser(updated as User);
  }

  submitKyc(actor: PublicUser, input: {
    legalName?: string; country?: string; documentType?: string; documentNumber?: string; address?: string;
  }): KycView {
    validateKycSubmission(input);
    const documentNumber = input.documentNumber.trim();
    const submission: KycSubmission = {
      id: randomUUID(),
      userId: actor.id,
      legalName: input.legalName.trim(),
      country: input.country.trim(),
      documentType: input.documentType,
      documentLast4: documentNumber.slice(-4),
      address: input.address.trim(),
      status: 'pending_review',
      submittedAt: now(),
    };
    let user: User | undefined;
    this.store.mutate((database) => {
      database.kycSubmissions = database.kycSubmissions.filter((item) => item.userId !== actor.id || item.status !== 'pending_review');
      database.kycSubmissions.push(submission);
      user = database.users.find((item) => item.id === actor.id) as User;
      user.complianceStatus = 'pending_review';
      database.auditEvents.push(this.audit(actor.id, 'kyc.submit', 'kyc_submission', submission.id, {
        country: submission.country,
        documentType: submission.documentType,
      }));
    });
    return { ...submission, user: this.publicUser(user as User) };
  }

  listKycSubmissions(actor: PublicUser): KycView[] {
    const database = this.store.read();
    return database.kycSubmissions
      .filter((item) => item.userId === actor.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((submission) => {
        const user = database.users.find((item) => item.id === submission.userId);
        if (!user) throw new PlatformError('KYC account is missing', 500);
        return { ...submission, user: this.publicUser(user) };
      });
  }

  async generateWallet(actor: PublicUser): Promise<{ user: PublicUser; address: string }> {
    const address = await this.wallet.generateAddress(`WorkingBeam ${actor.email}`);
    const validation = await this.wallet.validateAddress(address);
    if (!validation.valid) throw new PlatformError('Generated Beam address could not be validated', 503, 'INVALID_GENERATED_ADDRESS');
    let updated: User | undefined;
    this.store.mutate((database) => {
      const user = database.users.find((item) => item.id === actor.id) as User | undefined;
      if (!user) throw new PlatformError('Account no longer exists', 404);
      user.walletAddress = this.encryptWalletAddress(address);
      updated = user;
      database.auditEvents.push(this.audit(actor.id, 'wallet.generate', 'user', actor.id, { walletType: validation.type }));
    });
    return { user: this.publicUser(updated as User), address };
  }

  depositAddress(actor: PublicUser): { address: string; label: string; mode: BeamWallet['mode'] } {
    return {
      address: this.decryptWalletAddress(actor.walletAddress),
      label: `WorkingBeam deposit address for ${actor.email}`,
      mode: this.wallet.mode,
    };
  }

  async sendPayment(actor: PublicUser, input: { address?: string; amountBeam?: number; note?: string }): Promise<{ transaction: BeamTransaction }> {
    const address = input.address?.trim() ?? '';
    if (address.length < 10) throw new PlatformError('A valid recipient Beam address or token is required');
    if (!Number.isFinite(input.amountBeam) || (input.amountBeam ?? 0) <= 0 || (input.amountBeam ?? 0) > 1_000_000) {
      throw new PlatformError('Amount must be between 0 and 1,000,000 BEAM');
    }
    const validation = await this.wallet.validateAddress(address);
    if (!validation.valid) throw new PlatformError('The recipient Beam address or payment token is not valid', 400, 'INVALID_BEAM_ADDRESS');
    const amountBeam = Number((input.amountBeam as number).toFixed(8));
    const walletTransactionId = await this.wallet.send({
      address,
      amountBeam,
      comment: input.note?.trim() || `WorkingBeam direct send by ${actor.id}`,
    });
    let transaction: BeamTransaction | undefined;
    this.store.mutate((database) => {
      transaction = {
        id: randomUUID(),
        walletTransactionId,
        kind: 'send',
        amountBeam,
        fromUserId: actor.id,
        status: 'pending',
        createdAt: now(),
      };
      database.transactions.push(transaction);
      this.queueNotification(database, this.notification(actor.id, 'Payment sent', `${amountBeam} BEAM was submitted to the Beam wallet.`, ['in_app', 'email', 'push']));
      database.auditEvents.push(this.audit(actor.id, 'wallet.send', 'transaction', transaction.id, { walletTransactionId }));
    });
    return { transaction: transaction as BeamTransaction };
  }

  createPaymentRequest(actor: PublicUser, input: {
    clientEmail?: string; title?: string; description?: string; amountBeam?: number; currency?: PaymentCurrency; dueDate?: string;
  }): PaymentView {
    if (actor.role !== 'freelancer') throw new PlatformError('Only freelancers can create payment requests', 403);
    const clientEmail = normalizeEmail(input.clientEmail ?? '');
    const database = this.store.read();
    const client = database.users.find((user) => user.email === clientEmail && user.role === 'client');
    if (!client) throw new PlatformError('No client account exists with that email', 404);
    if (!input.title?.trim() || input.title.trim().length < 3) throw new PlatformError('Title must contain at least 3 characters');
    if (!Number.isFinite(input.amountBeam) || (input.amountBeam ?? 0) <= 0 || (input.amountBeam ?? 0) > MAX_PAYMENT_AMOUNT) {
      throw new PlatformError('Amount must be between 0 and 1,000,000');
    }
    this.assertPaymentRiskAccepted(actor, input.amountBeam as number);
    const currency = input.currency ?? 'USD';
    if (!supportedPaymentCurrencies.has(currency)) throw new PlatformError('Choose a supported payment currency');
    const timestamp = now();
    const request: PaymentRequest = {
      id: randomUUID(), freelancerId: actor.id, clientId: client.id,
      title: input.title.trim(), description: input.description?.trim() ?? '',
      amountBeam: Number((input.amountBeam as number).toFixed(8)), currency, status: 'pending',
      dueDate: input.dueDate || undefined, createdAt: timestamp, updatedAt: timestamp,
    };
    this.store.mutate((draft) => {
      draft.paymentRequests.push(request);
      this.queueNotification(draft, this.notification(
        client.id, 'New payment request', `${actor.name} requested ${request.amountBeam} ${request.currency} for ${request.title}.`,
      ));
      draft.auditEvents.push(this.audit(actor.id, 'payment.create', 'payment_request', request.id));
    });
    return this.paymentView(request.id, actor);
  }

  private assertPaymentRiskAccepted(actor: PublicUser, amount: number): void {
    const today = now().slice(0, 10);
    const database = this.store.read();
    const createdToday = database.paymentRequests.filter((request) => request.freelancerId === actor.id && request.createdAt.slice(0, 10) === today).length;
    const reasons: string[] = [];
    if (amount >= HIGH_RISK_PAYMENT_AMOUNT) reasons.push('high_amount');
    if (createdToday >= DAILY_REQUEST_LIMIT) reasons.push('daily_velocity');
    if (reasons.length === 0) return;
    this.store.mutate((draft) => {
      draft.auditEvents.push(this.audit(actor.id, 'fraud.payment_request_blocked', 'user', actor.id, { amount, reasons, createdToday }));
    });
    throw new PlatformError('Payment request needs manual review before it can be created', 429, 'FRAUD_REVIEW_REQUIRED');
  }

  listPaymentRequests(actor: PublicUser): PaymentView[] {
    this.expireOverdueRequests(actor.id);
    const database = this.store.read();
    return database.paymentRequests
      .filter((request) => request.freelancerId === actor.id || request.clientId === actor.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => this.viewFrom(database, request));
  }

  paymentView(id: string, actor: PublicUser): PaymentView {
    this.expireOverdueRequests(actor.id);
    const database = this.store.read();
    const request = database.paymentRequests.find((item) => item.id === id);
    if (!request) throw new PlatformError('Payment request not found', 404);
    if (request.freelancerId !== actor.id && request.clientId !== actor.id) throw new PlatformError('Access denied', 403);
    return this.viewFrom(database, request);
  }

  private viewFrom(database: ReturnType<DataStore['read']>, request: PaymentRequest): PaymentView {
    const freelancer = database.users.find((user) => user.id === request.freelancerId);
    const client = database.users.find((user) => user.id === request.clientId);
    if (!freelancer || !client) throw new PlatformError('Payment request account is missing', 500);
    return {
      ...request,
      freelancer: this.publicUser(freelancer),
      client: this.publicUser(client),
      transactions: database.transactions.filter((transaction) => transaction.paymentRequestId === request.id),
    };
  }

  private expireOverdueRequests(actorId?: string): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.store.mutate((database) => {
      for (const request of database.paymentRequests) {
        if (!request.dueDate || !['pending', 'approved'].includes(request.status)) continue;
        const due = new Date(`${request.dueDate}T00:00:00`);
        if (Number.isNaN(due.getTime()) || due >= today) continue;
        request.status = 'expired';
        request.updatedAt = now();
        this.queueNotification(database, this.notification(request.freelancerId, 'Payment request expired', `${request.title} expired because its due date passed.`, ['in_app', 'email', 'push']));
        this.queueNotification(database, this.notification(request.clientId, 'Payment request expired', `${request.title} expired because its due date passed.`, ['in_app', 'email', 'push']));
        database.auditEvents.push(this.audit(actorId, 'payment.expire', 'payment_request', request.id));
      }
    });
  }

  approvePayment(actor: PublicUser, id: string): PaymentView {
    const view = this.paymentView(id, actor);
    if (view.clientId !== actor.id) throw new PlatformError('Only the assigned client can approve this request', 403);
    if (view.status !== 'pending') throw new PlatformError('Only pending requests can be approved', 409);
    this.store.mutate((database) => {
      const request = database.paymentRequests.find((item) => item.id === id) as PaymentRequest;
      request.status = 'approved'; request.updatedAt = now();
      this.queueNotification(database, this.notification(view.freelancerId, 'Request approved', `${actor.name} approved ${view.title}.`));
      database.auditEvents.push(this.audit(actor.id, 'payment.approve', 'payment_request', id));
    });
    return this.paymentView(id, actor);
  }

  async fundEscrow(actor: PublicUser, id: string): Promise<PaymentView> {
    const view = this.paymentView(id, actor);
    if (view.clientId !== actor.id) throw new PlatformError('Only the assigned client can fund escrow', 403);
    if (view.status !== 'approved') throw new PlatformError('The request must be approved before funding', 409);
    if (this.wallet.mode === 'live' && !this.escrowAddress) throw new PlatformError('BEAM_ESCROW_ADDRESS is not configured', 503);
    const escrowAddress = this.escrowAddress || 'mock-escrow-wallet';
    const escrowValidation = await this.wallet.validateAddress(escrowAddress);
    if (!escrowValidation.valid) throw new PlatformError('The configured Beam escrow address or token is invalid', 503, 'INVALID_ESCROW_ADDRESS');
    const walletTransactionId = await this.wallet.send({
      address: escrowAddress, amountBeam: view.amountBeam,
      comment: `WorkingBeam escrow funding ${view.id}`,
    });
    this.store.mutate((database) => {
      const request = database.paymentRequests.find((item) => item.id === id) as PaymentRequest;
      request.status = 'funding_pending'; request.updatedAt = now();
      database.transactions.push({
        id: randomUUID(), paymentRequestId: id, walletTransactionId, kind: 'funding',
        amountBeam: view.amountBeam, fromUserId: actor.id, status: 'pending', createdAt: now(),
      });
      this.queueNotification(database, this.notification(view.freelancerId, 'Escrow funding submitted', `${view.amountBeam} BEAM is awaiting blockchain confirmation.`));
      database.auditEvents.push(this.audit(actor.id, 'escrow.fund', 'payment_request', id, { walletTransactionId }));
    });
    return this.paymentView(id, actor);
  }

  submitWork(actor: PublicUser, id: string, workNote: string | undefined): PaymentView {
    const view = this.paymentView(id, actor);
    if (view.freelancerId !== actor.id) throw new PlatformError('Only the assigned freelancer can submit work', 403);
    if (view.status !== 'funded') throw new PlatformError('Escrow must be funded before work is submitted', 409);
    if (!workNote?.trim()) throw new PlatformError('A delivery note or work link is required');
    this.store.mutate((database) => {
      const request = database.paymentRequests.find((item) => item.id === id) as PaymentRequest;
      request.status = 'work_submitted'; request.workNote = workNote.trim(); request.updatedAt = now();
      this.queueNotification(database, this.notification(view.clientId, 'Work submitted', `${actor.name} submitted work for ${view.title}.`));
      database.auditEvents.push(this.audit(actor.id, 'work.submit', 'payment_request', id));
    });
    return this.paymentView(id, actor);
  }

  async releaseEscrow(actor: PublicUser, id: string): Promise<PaymentView> {
    const view = this.paymentView(id, actor);
    if (view.clientId !== actor.id) throw new PlatformError('Only the assigned client can release escrow', 403);
    if (view.status !== 'work_submitted') throw new PlatformError('Work must be submitted before escrow is released', 409);
    const freelancerWalletAddress = this.decryptWalletAddress(view.freelancer.walletAddress);
    const recipientValidation = await this.wallet.validateAddress(freelancerWalletAddress);
    if (!recipientValidation.valid) throw new PlatformError('The freelancer Beam address or token is no longer valid', 409, 'INVALID_BEAM_ADDRESS');
    const walletTransactionId = await this.wallet.send({
      address: freelancerWalletAddress, amountBeam: view.amountBeam,
      comment: `WorkingBeam escrow release ${view.id}`,
    });
    this.store.mutate((database) => {
      const request = database.paymentRequests.find((item) => item.id === id) as PaymentRequest;
      request.status = 'release_pending'; request.updatedAt = now();
      database.transactions.push({
        id: randomUUID(), paymentRequestId: id, walletTransactionId, kind: 'release',
        amountBeam: view.amountBeam, toUserId: view.freelancerId, status: 'pending', createdAt: now(),
      });
      this.queueNotification(database, this.notification(view.freelancerId, 'Payment release submitted', `${view.amountBeam} BEAM is awaiting blockchain confirmation.`));
      database.auditEvents.push(this.audit(actor.id, 'escrow.release', 'payment_request', id, { walletTransactionId }));
    });
    return this.paymentView(id, actor);
  }

  dispute(actor: PublicUser, id: string, reason: string | undefined): PaymentView {
    const view = this.paymentView(id, actor);
    if (!['funded', 'work_submitted'].includes(view.status)) throw new PlatformError('This payment cannot be disputed in its current state', 409);
    if (!reason?.trim() || reason.trim().length < 10) throw new PlatformError('Dispute reason must contain at least 10 characters');
    const otherUserId = actor.id === view.clientId ? view.freelancerId : view.clientId;
    this.store.mutate((database) => {
      const request = database.paymentRequests.find((item) => item.id === id) as PaymentRequest;
      request.status = 'disputed'; request.disputeReason = reason.trim(); request.updatedAt = now();
      this.queueNotification(database, this.notification(otherUserId, 'Payment disputed', `${actor.name} opened a dispute for ${view.title}.`, ['in_app', 'email', 'sms']));
      database.auditEvents.push(this.audit(actor.id, 'escrow.dispute', 'payment_request', id));
    });
    return this.paymentView(id, actor);
  }

  async refreshTransaction(actor: PublicUser, transactionId: string): Promise<PaymentView | { transaction: BeamTransaction }> {
    const database = this.store.read();
    const transaction = database.transactions.find((item) => item.id === transactionId);
    if (!transaction) throw new PlatformError('Transaction not found', 404);
    if (!transaction.paymentRequestId) {
      if (transaction.fromUserId !== actor.id && transaction.toUserId !== actor.id) throw new PlatformError('Access denied', 403);
      const status = await this.wallet.transactionStatus(transaction.walletTransactionId);
      let result: BeamTransaction | undefined;
      this.store.mutate((draft) => {
        const storedTransaction = draft.transactions.find((item) => item.id === transactionId) as BeamTransaction;
        storedTransaction.status = status.status; storedTransaction.rawStatus = status.rawStatus;
        if (status.status === 'confirmed') storedTransaction.confirmedAt = now();
        result = storedTransaction;
        draft.auditEvents.push(this.audit(actor.id, 'transaction.refresh', 'transaction', transactionId, { status: status.status }));
      });
      return { transaction: result as BeamTransaction };
    }
    const view = this.paymentView(transaction.paymentRequestId, actor);
    if (transaction.status !== 'pending') return view;
    const status = await this.wallet.transactionStatus(transaction.walletTransactionId);
    this.store.mutate((draft) => {
      const storedTransaction = draft.transactions.find((item) => item.id === transactionId) as BeamTransaction;
      storedTransaction.status = status.status; storedTransaction.rawStatus = status.rawStatus;
      const request = draft.paymentRequests.find((item) => item.id === transaction.paymentRequestId) as PaymentRequest;
      if (status.status === 'confirmed') {
        storedTransaction.confirmedAt = now();
        request.status = transaction.kind === 'funding' ? 'funded' : transaction.kind === 'release' ? 'released' : request.status;
        request.updatedAt = now();
        const recipientId = transaction.kind === 'funding' ? request.freelancerId : request.freelancerId;
        this.queueNotification(draft, this.notification(recipientId, 'Transaction confirmed', `${transaction.amountBeam} BEAM ${transaction.kind} confirmed on Beam.`));
      } else if (status.status === 'failed') {
        request.status = 'failed';
        request.updatedAt = now();
        const recipientId = transaction.kind === 'funding' ? request.clientId : request.freelancerId;
        this.queueNotification(draft, this.notification(recipientId, 'Transaction failed', `${transaction.amountBeam} BEAM ${transaction.kind} failed on Beam. Review the request and try again.`, ['in_app', 'email', 'push']));
      }
      draft.auditEvents.push(this.audit(actor.id, 'transaction.refresh', 'transaction', transactionId, { status: status.status }));
    });
    return this.paymentView(transaction.paymentRequestId, actor);
  }

  listNotifications(actor: PublicUser): Notification[] {
    return this.store.read().notifications
      .filter((item) => item.userId === actor.id)
      .reverse();
  }

  listWalletTransactions(actor: PublicUser): BeamTransaction[] {
    const paymentIds = new Set(
      this.store.read().paymentRequests
        .filter((request) => request.freelancerId === actor.id || request.clientId === actor.id)
        .map((request) => request.id),
    );
    return this.store.read().transactions
      .filter((transaction) => !transaction.paymentRequestId
        ? transaction.fromUserId === actor.id || transaction.toUserId === actor.id
        : paymentIds.has(transaction.paymentRequestId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  markNotificationRead(actor: PublicUser, id: string): Notification {
    let result: Notification | undefined;
    this.store.mutate((database) => {
      const notification = database.notifications.find((item) => item.id === id && item.userId === actor.id);
      if (!notification) throw new PlatformError('Notification not found', 404);
      notification.read = true; result = notification;
    });
    return result as Notification;
  }

  createContactInquiry(input: {
    name?: string; email?: string; company?: string; subject?: string; message?: string; website?: string;
  }): { received: true; inquiry?: ContactInquiry } {
    if (input.website?.trim()) return { received: true };
    validateContactInquiry(input);
    const inquiry: ContactInquiry = {
      id: randomUUID(),
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      company: input.company?.trim() || undefined,
      subject: input.subject,
      message: input.message.trim(),
      status: 'new',
      createdAt: now(),
    };
    this.store.mutate((database) => {
      database.contactInquiries.push(inquiry);
      database.auditEvents.push(this.audit(undefined, 'contact.submit', 'contact_inquiry', inquiry.id, { subject: inquiry.subject }));
    });
    return { received: true, inquiry };
  }

  walletHealth() {
    return this.wallet.health();
  }

  emailHealth() {
    return this.emailService.health();
  }

  pushHealth() {
    return this.pushService.health();
  }

  smsHealth() {
    return this.smsService.health();
  }
}
