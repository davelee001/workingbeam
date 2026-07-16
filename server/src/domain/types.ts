export type UserRole = 'freelancer' | 'client';
export type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'funding_pending'
  | 'funded'
  | 'work_submitted'
  | 'release_pending'
  | 'released'
  | 'disputed'
  | 'cancelled';
export type TransactionKind = 'funding' | 'release' | 'refund';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  walletAddress: string;
  phone?: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  walletAddress: string;
  phone?: string;
  createdAt: string;
}

export interface Session {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}

export interface PaymentRequest {
  id: string;
  freelancerId: string;
  clientId: string;
  title: string;
  description: string;
  amountBeam: number;
  status: PaymentStatus;
  dueDate?: string;
  workNote?: string;
  disputeReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BeamTransaction {
  id: string;
  paymentRequestId: string;
  walletTransactionId: string;
  kind: TransactionKind;
  amountBeam: number;
  fromUserId?: string;
  toUserId?: string;
  status: TransactionStatus;
  rawStatus?: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  channels: NotificationChannel[];
  read: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Database {
  users: User[];
  sessions: Session[];
  paymentRequests: PaymentRequest[];
  transactions: BeamTransaction[];
  notifications: Notification[];
  auditEvents: AuditEvent[];
}

export const emptyDatabase = (): Database => ({
  users: [],
  sessions: [],
  paymentRequests: [],
  transactions: [],
  notifications: [],
  auditEvents: [],
});

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
