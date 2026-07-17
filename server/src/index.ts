import 'dotenv/config';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { JsonStore } from './persistence/jsonStore.js';
import { SupabaseStore } from './persistence/supabaseStore.js';
import { createBeamWallet } from './services/beamWallet.js';
import { createEmailService } from './services/emailService.js';
import { PlatformService } from './services/platformService.js';

const PORT = Number(process.env.PORT ?? 5000);
const dataFile = resolve(process.env.DATA_FILE ?? './data/workingbeam.json');

async function main() {
  const store = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? await SupabaseStore.create({
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      rowId: process.env.SUPABASE_STATE_ROW_ID,
    })
    : new JsonStore(dataFile);
  const wallet = createBeamWallet();
  const email = createEmailService();
  const verificationCodePepper = process.env.VERIFICATION_CODE_PEPPER?.trim();
  if (process.env.NODE_ENV === 'production' && (!verificationCodePepper || verificationCodePepper.length < 32)) {
    throw new Error('VERIFICATION_CODE_PEPPER must contain at least 32 characters in production');
  }
  const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION
    ? process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
    : process.env.NODE_ENV === 'production';
  const platform = new PlatformService(store, wallet, process.env.BEAM_ESCROW_ADDRESS ?? '', email, verificationCodePepper, requireEmailVerification);
  const app = createApp(platform);

  app.listen(PORT, () => {
    console.log(`WorkingBeam API listening on http://localhost:${PORT}`);
    console.log(`Beam wallet mode: ${wallet.mode}`);
    console.log(`Email verification: ${requireEmailVerification ? 'required' : 'paused'}`);
    console.log(`Persistence: ${store instanceof SupabaseStore ? 'supabase' : 'json'}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
