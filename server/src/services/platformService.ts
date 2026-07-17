import { createHash, createHmac, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  AuditEvent,
  BeamTransaction,
  ContactInquiry,
  Notification,
  NotificationChannel,
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

const scrypt = promisify(scryptCallback);
const SESSION_HOURS = 24;
const VERIFICATION_MINUTES = 10;
const VERIFICATION_MAX_ATTEMPTS = 5;
const VERIFICATION_RESEND_SECONDS = 60;

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

function validateContactInquiry(input: {
  name?: string; email?: string; company?: string; subject?: string; message?: string;
}): asserts input is { name: string; email: string; company?: string; subject: ContactInquiry['subject']; message: string } {
  if (!input.name?.trim() || input.name.trim().length < 2 || input.name.trim().length > 80) throw new PlatformError('Name must be between 2 and 80 characters');
  if (!input.email || input.email.length > 160 || !/^\S+@\S+\.\S+$/.test(input.email)) throw new PlatformError('A valid email address is required');
  if (input.company && input.company.trim().length > 120) throw new PlatformError('Company must be 120 characters or fewer');
  if (!input.subject || !contactSubjects.has(input.subject)) throw new PlatformError('Choose a valid contact topic');
  if (!input.message?.trim() || input.message.trim().length < 20 || input.message.trim().length > 2000) throw new PlatformError('Message must be between 20 and 2,000 characters');
}

export class PlatformService {
  constructor(
    private readonly store: DataStore,
    private readonly wallet: BeamWallet,
    private readonly escrowAddress: string,
    private readonly emailService: EmailService,
    private readonly verificationCodePepper = 'workingbeam-development-verification-pepper',
    private readonly requireEmailVerification = true,
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
      walletAddress: input.walletAddress.trim(),
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
      return { user: toPublicUser(user), token };
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
    return { user: toPublicUser({ ...user, emailVerifiedAt: now() }), token };
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
    return { user: toPublicUser(user), token };
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
    return toPublicUser(user);
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
    if (walletAddress !== existing.walletAddress) {
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
      user.walletAddress = walletAddress;
      updated = user;
      database.auditEvents.push(this.audit(actor.id, 'profile.update', 'user', actor.id, { walletType }));
    });
    return toPublicUser(updated as User);
  }

  createPaymentRequest(actor: PublicUser, input: {
    clientEmail?: string; title?: string; description?: string; amountBeam?: number; dueDate?: string;
  }): PaymentView {
    if (actor.role !== 'freelancer') throw new PlatformError('Only freelancers can create payment requests', 403);
    const clientEmail = normalizeEmail(input.clientEmail ?? '');
    const database = this.store.read();
    const client = database.users.find((user) => user.email === clientEmail && user.role === 'client');
    if (!client) throw new PlatformError('No client account exists with that email', 404);
    if (!input.title?.trim() || input.title.trim().length < 3) throw new PlatformError('Title must contain at least 3 characters');
    if (!Number.isFinite(input.amountBeam) || (input.amountBeam ?? 0) <= 0 || (input.amountBeam ?? 0) > 1_000_000) {
      throw new PlatformError('Amount must be between 0 and 1,000,000 BEAM');
    }
    const timestamp = now();
    const request: PaymentRequest = {
      id: randomUUID(), freelancerId: actor.id, clientId: client.id,
      title: input.title.trim(), description: input.description?.trim() ?? '',
      amountBeam: Number((input.amountBeam as number).toFixed(8)), status: 'pending',
      dueDate: input.dueDate || undefined, createdAt: timestamp, updatedAt: timestamp,
    };
    this.store.mutate((draft) => {
      draft.paymentRequests.push(request);
      draft.notifications.push(this.notification(
        client.id, 'New payment request', `${actor.name} requested ${request.amountBeam} BEAM for ${request.title}.`,
      ));
      draft.auditEvents.push(this.audit(actor.id, 'payment.create', 'payment_request', request.id));
    });
    return this.paymentView(request.id, actor);
  }

  listPaymentRequests(actor: PublicUser): PaymentView[] {
    const database = this.store.read();
    return database.paymentRequests
      .filter((request) => request.freelancerId === actor.id || request.clientId === actor.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => this.viewFrom(database, request));
  }

  paymentView(id: string, actor: PublicUser): PaymentView {
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
      freelancer: toPublicUser(freelancer),
      client: toPublicUser(client),
      transactions: database.transactions.filter((transaction) => transaction.paymentRequestId === request.id),
    };
  }

  approvePayment(actor: PublicUser, id: string): PaymentView {
    const view = this.paymentView(id, actor);
    if (view.clientId !== actor.id) throw new PlatformError('Only the assigned client can approve this request', 403);
    if (view.status !== 'pending') throw new PlatformError('Only pending requests can be approved', 409);
    this.store.mutate((database) => {
      const request = database.paymentRequests.find((item) => item.id === id) as PaymentRequest;
      request.status = 'approved'; request.updatedAt = now();
      database.notifications.push(this.notification(view.freelancerId, 'Request approved', `${actor.name} approved ${view.title}.`));
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
      database.notifications.push(this.notification(view.freelancerId, 'Escrow funding submitted', `${view.amountBeam} BEAM is awaiting blockchain confirmation.`));
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
      database.notifications.push(this.notification(view.clientId, 'Work submitted', `${actor.name} submitted work for ${view.title}.`));
      database.auditEvents.push(this.audit(actor.id, 'work.submit', 'payment_request', id));
    });
    return this.paymentView(id, actor);
  }

  async releaseEscrow(actor: PublicUser, id: string): Promise<PaymentView> {
    const view = this.paymentView(id, actor);
    if (view.clientId !== actor.id) throw new PlatformError('Only the assigned client can release escrow', 403);
    if (view.status !== 'work_submitted') throw new PlatformError('Work must be submitted before escrow is released', 409);
    const recipientValidation = await this.wallet.validateAddress(view.freelancer.walletAddress);
    if (!recipientValidation.valid) throw new PlatformError('The freelancer Beam address or token is no longer valid', 409, 'INVALID_BEAM_ADDRESS');
    const walletTransactionId = await this.wallet.send({
      address: view.freelancer.walletAddress, amountBeam: view.amountBeam,
      comment: `WorkingBeam escrow release ${view.id}`,
    });
    this.store.mutate((database) => {
      const request = database.paymentRequests.find((item) => item.id === id) as PaymentRequest;
      request.status = 'release_pending'; request.updatedAt = now();
      database.transactions.push({
        id: randomUUID(), paymentRequestId: id, walletTransactionId, kind: 'release',
        amountBeam: view.amountBeam, toUserId: view.freelancerId, status: 'pending', createdAt: now(),
      });
      database.notifications.push(this.notification(view.freelancerId, 'Payment release submitted', `${view.amountBeam} BEAM is awaiting blockchain confirmation.`));
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
      database.notifications.push(this.notification(otherUserId, 'Payment disputed', `${actor.name} opened a dispute for ${view.title}.`, ['in_app', 'email', 'sms']));
      database.auditEvents.push(this.audit(actor.id, 'escrow.dispute', 'payment_request', id));
    });
    return this.paymentView(id, actor);
  }

  async refreshTransaction(actor: PublicUser, transactionId: string): Promise<PaymentView> {
    const database = this.store.read();
    const transaction = database.transactions.find((item) => item.id === transactionId);
    if (!transaction) throw new PlatformError('Transaction not found', 404);
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
        draft.notifications.push(this.notification(recipientId, 'Transaction confirmed', `${transaction.amountBeam} BEAM ${transaction.kind} confirmed on Beam.`));
      } else if (status.status === 'failed') {
        request.status = transaction.kind === 'funding' ? 'approved' : 'work_submitted';
        request.updatedAt = now();
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
}
