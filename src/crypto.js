import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const FORMAT = 'portfolio-enc-v1';
const CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96 bits, the size GCM is defined for
const SALT_BYTES = 16;

// ~100ms per derivation on a typical laptop — slow enough to blunt offline guessing,
// fast enough that startup does not feel stuck. Recorded in the file so the parameters
// can be raised later without stranding existing data.
export const KDF = { name: 'scrypt', N: 32768, r: 8, p: 1 };
const SCRYPT_MAXMEM = 128 * KDF.N * KDF.r * 2; // scrypt's 32MB default is too low for N=32768

export const randomSalt = () => randomBytes(SALT_BYTES);

export async function deriveKey(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('Passphrase must be a non-empty string.');
  }
  return scryptAsync(passphrase.normalize('NFKC'), salt, KEY_BYTES, {
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

/**
 * @returns a self-describing envelope, safe to write as JSON.
 * A fresh IV is generated per call — reusing one under the same key would break GCM.
 */
export function encryptJson(value, key, salt) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);

  return {
    format: FORMAT,
    cipher: CIPHER,
    kdf: { ...KDF, salt: salt.toString('base64') },
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export class DecryptError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecryptError';
  }
}

export function decryptJson(envelope, key) {
  if (envelope?.format !== FORMAT) {
    throw new DecryptError(`Not a ${FORMAT} file.`);
  }

  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch (err) {
    // GCM's auth tag fails the same way for a wrong key and for edited bytes,
    // so the two cases genuinely cannot be told apart here.
    throw new DecryptError('Wrong passphrase, or the file has been altered.', { cause: err });
  }
}

export function saltFromEnvelope(envelope) {
  if (!envelope?.kdf?.salt) throw new DecryptError('File is missing its key-derivation salt.');
  return Buffer.from(envelope.kdf.salt, 'base64');
}
