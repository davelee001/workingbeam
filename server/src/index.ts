import 'dotenv/config';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { JsonStore } from './persistence/jsonStore.js';
import { createBeamWallet } from './services/beamWallet.js';
import { PlatformService } from './services/platformService.js';

const PORT = Number(process.env.PORT ?? 5000);
const dataFile = resolve(process.env.DATA_FILE ?? './data/workingbeam.json');
const store = new JsonStore(dataFile);
const wallet = createBeamWallet();
const platform = new PlatformService(store, wallet, process.env.BEAM_ESCROW_ADDRESS ?? '');
const app = createApp(platform);

app.listen(PORT, () => {
  console.log(`WorkingBeam API listening on http://localhost:${PORT}`);
  console.log(`Beam wallet mode: ${wallet.mode}`);
});
