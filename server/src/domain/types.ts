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
  | 'failed'
  | 'expired'
  | 'cancelled';
export type TransactionKind = 'funding' | 'release' | 'refund' | 'send';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';
export type PaymentCurrency = 'USD' | 'EUR' | 'GBP' | 'SSP' | 'UGX' | 'KSH' | 'TSH' | 'SDG';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  walletAddress: string;
  phone?: string;
  pushTokens?: string[];
  complianceStatus?: 'not_started' | 'pending_review' | 'approved' | 'rejected';
  emailVerifiedAt?: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  walletAddress: string;
  phone?: string;
  pushTokens?: string[];
  complianceStatus?: 'not_started' | 'pending_review' | 'approved' | 'rejected';
  emailVerified: boolean;
  createdAt: string;
}

export interface EmailVerification {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
  lastSentAt: string;
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
  currency: PaymentCurrency;
  status: PaymentStatus;
  dueDate?: string;
  workNote?: string;
  disputeReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BeamTransaction {
  id: string;
  paymentRequestId?: string;
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

export interface ContactInquiry {
  id: string;
  name: string;
  email: string;
  company?: string;
  subject: 'product' | 'integration' | 'security' | 'partnership';
  message: string;
  status: 'new';
  createdAt: string;
}

export interface Database {
  users: User[];
  emailVerifications: EmailVerification[];
  sessions: Session[];
  paymentRequests: PaymentRequest[];
  transactions: BeamTransaction[];
  notifications: Notification[];
  auditEvents: AuditEvent[];
  contactInquiries: ContactInquiry[];
}

export const emptyDatabase = (): Database => ({
  users: [],
  emailVerifications: [],
  sessions: [],
  paymentRequests: [],
  transactions: [],
  notifications: [],
  auditEvents: [],
  contactInquiries: [],
});

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    walletAddress: user.walletAddress,
    phone: user.phone,
    pushTokens: user.pushTokens ?? [],
    complianceStatus: user.complianceStatus ?? 'not_started',
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
  };
}
