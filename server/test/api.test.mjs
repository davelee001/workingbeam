import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../dist/app.js';
import { emptyDatabase } from '../dist/domain/types.js';
import { MemoryStore } from '../dist/persistence/jsonStore.js';
import { MockBeamWallet } from '../dist/services/beamWallet.js';
import { MemoryEmailService } from '../dist/services/emailService.js';
import { PlatformService } from '../dist/services/platformService.js';

function appFixture() {
  const emailService = new MemoryEmailService();
  const platform = new PlatformService(new MemoryStore(emptyDatabase()), new MockBeamWallet(), 'mock-escrow-wallet', emailService);
  return { app: createApp(platform, 'memory'), platform, emailService };
}

test('health reports HTTPS enforcement and push status', async () => {
  const { app } = appFixture();
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
  const { app } = appFixture();
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

test('authenticated users can submit and list KYC over the API', async () => {
  const { app, platform, emailService } = appFixture();
  const pending = await platform.register({
    name: 'Kyc User',
    email: 'kyc-api@example.com',
    password: 'secure-pass-kyc',
    role: 'freelancer',
    walletAddress: 'beam-kyc-api-wallet',
  });
  const code = emailService.latestCode('kyc-api@example.com');
  const auth = await platform.verifyEmail('kyc-api@example.com', code);
  const server = app.listen(0);
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${base}/api/kyc`, {
      method: 'POST',
      headers: { authorization: `Bearer ${auth.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Kyc User',
        country: 'South Sudan',
        documentType: 'national_id',
        documentNumber: 'SS123456',
        address: 'Juba, South Sudan',
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.submission.documentLast4, '3456');

    const listResponse = await fetch(`${base}/api/kyc`, {
      headers: { authorization: `Bearer ${auth.token}` },
    });
    const listed = await listResponse.json();
    assert.equal(listed.submissions.length, 1);
  } finally {
    server.close();
  }
});
