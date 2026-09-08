import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPassphrase } from './src/passphrase.js';
import { createApiRouter } from './src/routes.js';
import { DEMO_HOLDINGS } from './src/demo.js';
import { enableDemo, inspect, unlock } from './src/storage.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

async function unlockStorage() {
  const state = await inspect();

  if (state === 'plaintext') {
    console.log('Encrypting data/portfolio.json — choose a passphrase.');
    console.log('There is no recovery if you forget it.\n');
  } else if (state === 'missing') {
    console.log('Creating a new encrypted portfolio — choose a passphrase.');
    console.log('There is no recovery if you forget it.\n');
  }

  // Ask twice only when the passphrase is being set: a typo there is unrecoverable.
  const passphrase = await getPassphrase({ confirm: state !== 'encrypted' });
  const result = await unlock(passphrase);

  if (result.mode === 'migrated') {
    console.log(`Encrypted ${result.holdings} holdings.`);
    console.log(`Plaintext copy kept at ${result.backup} — delete it once you trust the setup.`);
  } else if (result.mode === 'created') {
    console.log('Created an empty encrypted portfolio.');
  } else {
    console.log(`Unlocked ${result.holdings} holdings.`);
  }
}

// Flag for `npm run demo` (portable across shells); env var for hosting platforms.
const DEMO = process.env.DEMO === '1' || process.argv.includes('--demo');

try {
  if (DEMO) {
    // No passphrase, no file, no writes — safe to expose publicly.
    enableDemo(DEMO_HOLDINGS);
    console.log(`Read-only demo mode: ${DEMO_HOLDINGS.length} sample holdings, live prices,`);
    console.log('nothing read from or written to disk.');
  } else {
    await unlockStorage();
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}

const app = express();

app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/api', createApiRouter());

app.use((err, req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Crypto portfolio dashboard running at http://localhost:${PORT}`);
});
