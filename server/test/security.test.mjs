import assert from 'node:assert/strict';
import test from 'node:test';
import { BeamWalletRpc } from '../dist/services/beamWallet.js';
import { WebhookPushService } from '../dist/services/pushService.js';

test('Beam validation trusts the server-side wallet provider response', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (_url, init) => {
    const rpc = JSON.parse(init.body);
    assert.equal(rpc.method, 'validate_address');
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { is_valid: true, type: 'offline', payments: 2 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const wallet = new BeamWalletRpc('https://wallet.internal/api/wallet', 'read-key', 100_000_000, 100_000);
  assert.deepEqual(await wallet.validateAddress('provider-issued-beam-token'), { valid: true, type: 'offline', paymentsRemaining: 2 });
});

test('push webhook delivers notification payload with bearer token', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let delivered;
  globalThis.fetch = async (url, init) => {
    delivered = { url, init };
    return new Response('{}', { status: 202, headers: { 'content-type': 'application/json' } });
  };
  const push = new WebhookPushService('https://push.example.com/events', 'push-secret');
  await push.send({
    id: 'notice-1',
    userId: 'user-1',
    title: 'Payment received',
    message: 'Funds arrived.',
    channels: ['in_app', 'push'],
    read: false,
    createdAt: '2026-07-18T00:00:00.000Z',
  });
  assert.equal(delivered.url, 'https://push.example.com/events');
  assert.equal(delivered.init.headers.authorization, 'Bearer push-secret');
  assert.equal(JSON.parse(delivered.init.body).title, 'Payment received');
});
