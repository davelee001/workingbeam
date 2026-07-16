import assert from 'node:assert/strict';
import test from 'node:test';
import { BeamWalletRpc } from '../dist/services/beamWallet.js';
import { TurnstileVerifier } from '../dist/services/humanVerifier.js';

test('Turnstile and Beam validations trust server-side provider responses', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  let requestedBody;
  globalThis.fetch = async (_url, init) => {
    requestedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ success: true, hostname: 'app.example', action: 'login' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const verifier = new TurnstileVerifier('production-secret', 'app.example');
  await verifier.verify('provider-issued-token', '203.0.113.10', 'login');
  assert.equal(requestedBody.response, 'provider-issued-token');
  assert.equal(requestedBody.remoteip, '203.0.113.10');

  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(verifier.verify('forged-token', undefined, 'login'), /failed or expired/);

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
