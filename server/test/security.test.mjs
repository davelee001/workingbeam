import assert from 'node:assert/strict';
import test from 'node:test';
import { BeamWalletRpc } from '../dist/services/beamWallet.js';

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
