import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDatabase } from '../dist/domain/types.js';
import { MemoryStore } from '../dist/persistence/jsonStore.js';
import { MockBeamWallet } from '../dist/services/beamWallet.js';
import { PlatformService } from '../dist/services/platformService.js';

async function fixture() {
  const store = new MemoryStore(emptyDatabase());
  const platform = new PlatformService(store, new MockBeamWallet(), 'mock-escrow');
  const freelancerAuth = await platform.register({
    name: 'Amina Freelancer', email: 'amina@example.com', password: 'secure-pass-1',
    role: 'freelancer', walletAddress: 'beam-freelancer-wallet-address',
  });
  const clientAuth = await platform.register({
    name: 'Bol Client', email: 'bol@example.com', password: 'secure-pass-2',
    role: 'client', walletAddress: 'beam-client-wallet-address',
  });
  return { platform, store, freelancerAuth, clientAuth };
}

test('registration hashes passwords and returns an authenticated session', async () => {
  const { platform, store, freelancerAuth } = await fixture();
  const stored = store.read().users.find((user) => user.id === freelancerAuth.user.id);
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, 'secure-pass-1');
  assert.match(stored.passwordHash, /^[a-f0-9]+:[a-f0-9]+$/);
  assert.deepEqual(platform.authenticate(freelancerAuth.token), freelancerAuth.user);
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
  assert.ok(actions.includes('auth.register'));
  assert.ok(actions.includes('payment.create'));
  assert.ok(actions.includes('payment.approve'));
});
