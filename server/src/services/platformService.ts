import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  AuditEvent,
  BeamTransaction,
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

const scrypt = promisify(scryptCallback);
const SESSION_HOURS = 24;

export class PlatformError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
  }
}

export interface PaymentView extends PaymentRequest {
  freelancer: PublicUser;
  client: PublicUser;
  transactions: BeamTransaction[];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function now(): string {
  return new Date().toISOString();
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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

export class PlatformService {
  constructor(
    private readonly store: DataStore,
    private readonly wallet: BeamWallet,
    private readonly escrowAddress: string,
  ) {}

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
  }): Promise<{ user: PublicUser; token: string }> {
    validateRegistration(input);
    const email = normalizeEmail(input.email);
    if (this.store.read().users.some((user) => user.email === email)) {
      throw new PlatformError('An account with this email already exists', 409);
    }
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
    const token = randomBytes(32).toString('base64url');
    const session: Session = {
      tokenHash: tokenHash(token), userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(),
    };
    this.store.mutate((database) => {
      database.users.push(user);
      database.sessions.push(session);
      database.auditEvents.push(this.audit(user.id, 'auth.register', 'user', user.id, { role: user.role }));
    });
    return { user: toPublicUser(user), token };
  }

  async login(emailInput: string | undefined, password: string | undefined): Promise<{ user: PublicUser; token: string }> {
    const email = normalizeEmail(emailInput ?? '');
    const user = this.store.read().users.find((candidate) => candidate.email === email);
    if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
      throw new PlatformError('Invalid email or password', 401);
    }
    const token = randomBytes(32).toString('base64url');
    const session: Session = {
      tokenHash: tokenHash(token), userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(),
    };
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
    return toPublicUser(user);
  }

  logout(token: string): void {
    this.store.mutate((database) => {
      database.sessions = database.sessions.filter((session) => session.tokenHash !== tokenHash(token));
    });
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
    const walletTransactionId = await this.wallet.send({
      address: this.escrowAddress || 'mock-escrow-wallet', amountBeam: view.amountBeam,
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

  walletHealth() {
    return this.wallet.health();
  }
}
