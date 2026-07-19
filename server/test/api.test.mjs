import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../dist/app.js';
import { emptyDatabase } from '../dist/domain/types.js';
import { MemoryStore } from '../dist/persistence/jsonStore.js';
import { MockBeamWallet } from '../dist/services/beamWallet.js';
import { MemoryEmailService } from '../dist/services/emailService.js';
import { PlatformService } from '../dist/services/platformService.js';

function appFixture() {
  const platform = new PlatformService(new MemoryStore(emptyDatabase()), new MockBeamWallet(), 'mock-escrow-wallet', new MemoryEmailService());
  return createApp(platform, 'memory');
}

test('health reports HTTPS enforcement and push status', async () => {
  const app = appFixture();
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(payload.https.enforced, false);
    assert.equal(payload.push.mode, 'disabled');
    assert.equal(payload.sms.mode, 'disabled');
  } finally {
    server.close();
  }
});

test('HTTPS enforcement rejects forwarded HTTP requests', async (context) => {
  const original = process.env.FORCE_HTTPS;
  process.env.FORCE_HTTPS = 'true';
  context.after(() => {
    if (original === undefined) delete process.env.FORCE_HTTPS;
    else process.env.FORCE_HTTPS = original;
  });
  const app = appFixture();
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
      headers: { 'x-forwarded-proto': 'http' },
    });
    assert.equal(response.status, 426);
  } finally {
    server.close();
  }
});
