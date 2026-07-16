import 'dotenv/config';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { JsonStore } from './persistence/jsonStore.js';
import { createBeamWallet } from './services/beamWallet.js';
import { createEmailService } from './services/emailService.js';
import { createHumanVerifier } from './services/humanVerifier.js';
import { PlatformService } from './services/platformService.js';

const PORT = Number(process.env.PORT ?? 5000);
const dataFile = resolve(process.env.DATA_FILE ?? './data/workingbeam.json');
const store = new JsonStore(dataFile);
const wallet = createBeamWallet();
const email = createEmailService();
const humanVerifier = createHumanVerifier();
const platform = new PlatformService(store, wallet, process.env.BEAM_ESCROW_ADDRESS ?? '', email);
const app = createApp(platform, humanVerifier);

app.listen(PORT, () => {
  console.log(`WorkingBeam API listening on http://localhost:${PORT}`);
  console.log(`Beam wallet mode: ${wallet.mode}`);
  console.log(`CAPTCHA mode: ${humanVerifier.mode}`);
});
