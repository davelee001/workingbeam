import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDatabase } from '../dist/domain/types.js';
import { MemoryStore } from '../dist/persistence/jsonStore.js';
import { MockBeamWallet } from '../dist/services/beamWallet.js';
import { MemoryEmailService } from '../dist/services/emailService.js';
import { PlatformService } from '../dist/services/platformService.js';

async function registerVerified(platform, emailService, registration) {
  const pending = await platform.register(registration);
  assert.equal(pending.requiresVerification, true);
  const code = emailService.latestCode(registration.email.toLowerCase());
  assert.match(code, /^\d{6}$/);
  return platform.verifyEmail(registration.email, code);
}

async function fixture() {
  const store = new MemoryStore(emptyDatabase());
  const emailService = new MemoryEmailService();
  const platform = new PlatformService(store, new MockBeamWallet(), 'mock-escrow-wallet', emailService);
  const freelancerAuth = await registerVerified(platform, emailService, {
    name: 'Amina Freelancer', email: 'amina@example.com', password: 'secure-pass-1',
    role: 'freelancer', walletAddress: 'beam-freelancer-wallet-address',
  });
  const clientAuth = await registerVerified(platform, emailService, {
    name: 'Bol Client', email: 'bol@example.com', password: 'secure-pass-2',
    role: 'client', walletAddress: 'beam-client-wallet-address',
  });
  return { platform, store, emailService, freelancerAuth, clientAuth };
}

test('registration hashes passwords and creates a session only after email verification', async () => {
  const { platform, store, freelancerAuth } = await fixture();
  const stored = store.read().users.find((user) => user.id === freelancerAuth.user.id);
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, 'secure-pass-1');
  assert.match(stored.passwordHash, /^[a-f0-9]+:[a-f0-9]+$/);
  assert.equal(stored.emailVerifiedAt !== undefined, true);
  assert.deepEqual(platform.authenticate(freelancerAuth.token), freelancerAuth.user);
});

test('email verification codes are hashed, expiring, and reject incorrect attempts', async () => {
  const store = new MemoryStore(emptyDatabase());
  const emailService = new MemoryEmailService();
  const platform = new PlatformService(store, new MockBeamWallet(), 'mock-escrow-wallet', emailService);
  await platform.register({ name: 'Pending User', email: 'pending@example.com', password: 'secure-pass-3', role: 'client', walletAddress: 'beam-pending-wallet-address' });
  const deliveredCode = emailService.latestCode('pending@example.com');
  assert.ok(deliveredCode);
  assert.equal(store.read().emailVerifications[0].codeHash.includes(deliveredCode), false);
  await assert.rejects(platform.login('pending@example.com', 'secure-pass-3'), /Verify your email/);
  const incorrectCode = deliveredCode === '000000' ? '000001' : '000000';
  await assert.rejects(platform.verifyEmail('pending@example.com', incorrectCode), /invalid or expired/);
  const authenticated = await platform.verifyEmail('pending@example.com', deliveredCode);
  assert.equal(authenticated.user.emailVerified, true);
});

test('registration rejects forged Beam address strings', async () => {
  const store = new MemoryStore(emptyDatabase());
  const emailService = new MemoryEmailService();
  const platform = new PlatformService(store, new MockBeamWallet(), 'mock-escrow-wallet', emailService);
  await assert.rejects(platform.register({ name: 'Forged User', email: 'forged@example.com', password: 'secure-pass-4', role: 'client', walletAddress: 'not-a-wallet-token' }), /not valid/);
  assert.equal(store.read().users.length, 0);
});

test('paused email verification activates accounts without sending a code', async () => {
  const store = new MemoryStore(emptyDatabase());
  const emailService = new MemoryEmailService();
  const platform = new PlatformService(store, new MockBeamWallet(), 'mock-escrow-wallet', emailService, 'test-verification-pepper', false);
  const authenticated = await platform.register({ name: 'Temporary User', email: 'temporary@example.com', password: 'secure-pass-7', role: 'client', walletAddress: 'beam-temporary-wallet-address' });
  assert.ok(authenticated.token);
  assert.equal(authenticated.user.emailVerified, false);
  assert.equal(emailService.deliveries.length, 0);
  assert.deepEqual(platform.authenticate(authenticated.token), authenticated.user);
});

test('verification codes expire and lock after five incorrect attempts', async () => {
  const store = new MemoryStore(emptyDatabase());
  const emailService = new MemoryEmailService();
  const platform = new PlatformService(store, new MockBeamWallet(), 'mock-escrow-wallet', emailService);
  await platform.register({ name: 'Expired User', email: 'expired@example.com', password: 'secure-pass-5', role: 'client', walletAddress: 'beam-expired-wallet-address' });
  const expiredCode = emailService.latestCode('expired@example.com');
  store.mutate((database) => { database.emailVerifications[0].expiresAt = new Date(0).toISOString(); });
  await assert.rejects(platform.verifyEmail('expired@example.com', expiredCode), /invalid or expired/);

  await platform.register({ name: 'Locked User', email: 'locked@example.com', password: 'secure-pass-6', role: 'client', walletAddress: 'beam-locked-wallet-address' });
  const realCode = emailService.latestCode('locked@example.com');
  const wrongCode = realCode === '111111' ? '222222' : '111111';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(platform.verifyEmail('locked@example.com', wrongCode), /invalid or expired/);
  }
  await assert.rejects(platform.verifyEmail('locked@example.com', realCode), /Too many incorrect codes/);
});

test('duplicate accounts and invalid credentials are rejected', async () => {
  const { platform } = await fixture();
  await assert.rejects(
    platform.register({ name: 'Duplicate', email: 'AMINA@example.com', password: 'another-pass', role: 'freelancer', walletAddress: 'another-wallet-address' }),
    /already exists/,
  );
  await assert.rejects(platform.login('amina@example.com', 'wrong-password'), /Invalid email or password/);
});

test('freelancer creates a request and client receives a notification', async () => {
  const { platform, freelancerAuth, clientAuth } = await fixture();
  const payment = platform.createPaymentRequest(freelancerAuth.user, {
    clientEmail: clientAuth.user.email, title: 'Brand identity', description: 'Final identity package', amountBeam: 12.5,
  });
  assert.equal(payment.status, 'pending');
  assert.equal(payment.amountBeam, 12.5);
  assert.equal(platform.listPaymentRequests(clientAuth.user).length, 1);
  assert.match(platform.listNotifications(clientAuth.user)[0].message, /12.5 BEAM/);
});

test('payment follows approval, escrow, delivery, release, and confirmation lifecycle', async () => {
  const { platform, freelancerAuth, clientAuth } = await fixture();
  let payment = platform.createPaymentRequest(freelancerAuth.user, {
    clientEmail: clientAuth.user.email, title: 'Application build', amountBeam: 50,
  });
  payment = platform.approvePayment(clientAuth.user, payment.id);
  assert.equal(payment.status, 'approved');

  payment = await platform.fundEscrow(clientAuth.user, payment.id);
  assert.equal(payment.status, 'funding_pending');
  assert.equal(payment.transactions[0].kind, 'funding');
  payment = await platform.refreshTransaction(clientAuth.user, payment.transactions[0].id);
  assert.equal(payment.status, 'funded');
  assert.equal(payment.transactions[0].status, 'confirmed');

  payment = platform.submitWork(freelancerAuth.user, payment.id, 'Delivery: https://example.com/work');
  assert.equal(payment.status, 'work_submitted');
  payment = await platform.releaseEscrow(clientAuth.user, payment.id);
  assert.equal(payment.status, 'release_pending');
  const release = payment.transactions.find((transaction) => transaction.kind === 'release');
  assert.ok(release);
  payment = await platform.refreshTransaction(freelancerAuth.user, release.id);
  assert.equal(payment.status, 'released');
  assert.equal(payment.transactions.find((transaction) => transaction.kind === 'release').status, 'confirmed');
});

test('role and ownership rules prevent unauthorized state changes', async () => {
  const { platform, freelancerAuth, clientAuth } = await fixture();
  const payment = platform.createPaymentRequest(freelancerAuth.user, {
    clientEmail: clientAuth.user.email, title: 'Protected milestone', amountBeam: 5,
  });
  assert.throws(() => platform.approvePayment(freelancerAuth.user, payment.id), /assigned client/);
  await assert.rejects(platform.fundEscrow(freelancerAuth.user, payment.id), /assigned client/);
  assert.throws(() => platform.submitWork(freelancerAuth.user, payment.id, 'Too early'), /must be funded/);
});

test('either party can dispute funded escrow with a recorded reason', async () => {
  const { platform, freelancerAuth, clientAuth } = await fixture();
  let payment = platform.createPaymentRequest(freelancerAuth.user, {
    clientEmail: clientAuth.user.email, title: 'Disputable milestone', amountBeam: 8,
  });
  payment = platform.approvePayment(clientAuth.user, payment.id);
  payment = await platform.fundEscrow(clientAuth.user, payment.id);
  payment = await platform.refreshTransaction(clientAuth.user, payment.transactions[0].id);
  payment = platform.dispute(freelancerAuth.user, payment.id, 'Client requirements changed after approval.');
  assert.equal(payment.status, 'disputed');
  assert.match(payment.disputeReason, /requirements changed/);
  assert.equal(platform.listNotifications(clientAuth.user)[0].title, 'Payment disputed');
});

test('payment actions are idempotently blocked after state transition', async () => {
  const { platform, freelancerAuth, clientAuth } = await fixture();
  let payment = platform.createPaymentRequest(freelancerAuth.user, {
    clientEmail: clientAuth.user.email, title: 'Single approval', amountBeam: 2,
  });
  platform.approvePayment(clientAuth.user, payment.id);
  assert.throws(() => platform.approvePayment(clientAuth.user, payment.id), /Only pending requests/);
  payment = await platform.fundEscrow(clientAuth.user, payment.id);
  await assert.rejects(platform.fundEscrow(clientAuth.user, payment.id), /must be approved/);
});

test('audit log records security and payment lifecycle events', async () => {
  const { platform, store, freelancerAuth, clientAuth } = await fixture();
  const payment = platform.createPaymentRequest(freelancerAuth.user, {
    clientEmail: clientAuth.user.email, title: 'Audited payment', amountBeam: 3,
  });
  platform.approvePayment(clientAuth.user, payment.id);
  const actions = store.read().auditEvents.map((event) => event.action);
  assert.ok(actions.includes('auth.register_pending'));
  assert.ok(actions.includes('auth.email_verified'));
  assert.ok(actions.includes('payment.create'));
  assert.ok(actions.includes('payment.approve'));
});
