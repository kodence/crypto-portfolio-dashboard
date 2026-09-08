import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMAT,
  decryptJson,
  deriveKey,
  encryptJson,
  randomSalt,
  saltFromEnvelope,
} from './crypto.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'portfolio.json');
const PLAINTEXT_BACKUP = `${DATA_FILE}.plain.bak`;

const emptyState = () => ({ holdings: [] });

// Set by unlock(); the key exists only in this process's memory, never on disk.
let key = null;
let salt = null;

// All mutations run through this chain so two concurrent requests can never
// read-modify-write on top of each other.
let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function readFileOrNull() {
  try {
    return await fs.readFile(DATA_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** What is on disk right now: 'encrypted', 'plaintext', or 'missing'. */
export async function inspect() {
  const raw = await readFileOrNull();
  if (raw === null) return 'missing';

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.format === FORMAT) return 'encrypted';
    if (Array.isArray(parsed?.holdings)) return 'plaintext';
  } catch {
    // fall through
  }
  throw new Error(`${DATA_FILE} is neither a portfolio nor an encrypted portfolio.`);
}

/**
 * Derives the key and proves it against the file before the server accepts traffic.
 * Migrates a plaintext portfolio on the way, keeping the original as a backup.
 *
 * @returns {Promise<{mode: 'unlocked'|'migrated'|'created', holdings: number, backup?: string}>}
 */
export async function unlock(passphrase) {
  const state = await inspect();

  if (state === 'encrypted') {
    const envelope = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    salt = saltFromEnvelope(envelope);
    key = await deriveKey(passphrase, salt);
    const decrypted = decryptJson(envelope, key); // throws DecryptError on a wrong passphrase
    return { mode: 'unlocked', holdings: decrypted.holdings.length };
  }

  salt = randomSalt();
  key = await deriveKey(passphrase, salt);

  if (state === 'plaintext') {
    const existing = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    // Back up before overwriting, so a failure mid-migration cannot lose holdings.
    await fs.copyFile(DATA_FILE, PLAINTEXT_BACKUP);
    await writeState(existing);
    return { mode: 'migrated', holdings: existing.holdings.length, backup: PLAINTEXT_BACKUP };
  }

  await writeState(emptyState());
  return { mode: 'created', holdings: 0 };
}

async function readState() {
  const raw = await readFileOrNull();
  if (raw === null) return emptyState();
  if (!key) throw new Error('Storage is locked — unlock() must run before reading.');

  // A failure here is corruption, not a wrong passphrase (unlock already proved the key),
  // so surface it rather than resetting and overwriting an intact file.
  return decryptJson(JSON.parse(raw), key);
}

async function writeState(state) {
  if (!key || !salt) throw new Error('Storage is locked — unlock() must run before writing.');

  await fs.mkdir(DATA_DIR, { recursive: true });
  const envelope = encryptJson(state, key, salt);
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(envelope, null, 2)}
`, 'utf8');
  await fs.rename(tmp, DATA_FILE); // atomic within the volume
}

export function getHoldings() {
  return enqueue(async () => (await readState()).holdings);
}

export function addHolding({ name, symbol, coinId, amount }) {
  return enqueue(async () => {
    const state = await readState();
    const holding = {
      id: randomUUID(),
      name: String(name).trim(),
      symbol: String(symbol).trim().toUpperCase(),
      coinId: String(coinId).trim().toLowerCase(),
      amount: Number(amount),
      createdAt: new Date().toISOString(),
    };
    state.holdings.push(holding);
    await writeState(state);
    return holding;
  });
}

export function updateHolding(id, patch) {
  return enqueue(async () => {
    const state = await readState();
    const holding = state.holdings.find((h) => h.id === id);
    if (!holding) return null;

    if (patch.amount !== undefined) holding.amount = Number(patch.amount);
    if (patch.remark !== undefined) holding.remark = String(patch.remark);
    holding.updatedAt = new Date().toISOString();
    await writeState(state);
    return holding;
  });
}

export function removeHolding(id) {
  return enqueue(async () => {
    const state = await readState();
    const index = state.holdings.findIndex((h) => h.id === id);
    if (index === -1) return null;
    const [removed] = state.holdings.splice(index, 1);
    await writeState(state);
    return removed;
  });
}

export const paths = { DATA_DIR, DATA_FILE, PLAINTEXT_BACKUP };
