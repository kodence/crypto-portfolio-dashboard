import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DecryptError, decryptJson, deriveKey, encryptJson, randomSalt } from '../src/crypto.js';

const STATE = { holdings: [{ id: 'a', name: 'Cold wallet', symbol: 'BTC', amount: 0.5 }] };

test('round-trips a portfolio through encrypt and decrypt', async () => {
  const salt = randomSalt();
  const key = await deriveKey('correct horse battery staple', salt);

  const envelope = encryptJson(STATE, key, salt);
  assert.deepEqual(decryptJson(envelope, key), STATE);
});

test('the envelope leaks no holdings in the clear', async () => {
  const salt = randomSalt();
  const key = await deriveKey('pw', salt);

  const serialized = JSON.stringify(encryptJson(STATE, key, salt));
  assert.ok(!serialized.includes('Cold wallet'));
  assert.ok(!serialized.includes('BTC'));
});

test('a wrong passphrase fails instead of returning garbage', async () => {
  const salt = randomSalt();
  const envelope = encryptJson(STATE, await deriveKey('right', salt), salt);
  const wrongKey = await deriveKey('wrong', salt);

  assert.throws(() => decryptJson(envelope, wrongKey), DecryptError);
});

test('tampered ciphertext is rejected by the auth tag', async () => {
  const salt = randomSalt();
  const key = await deriveKey('pw', salt);
  const envelope = encryptJson(STATE, key, salt);

  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] ^= 0xff;
  const tampered = { ...envelope, ciphertext: bytes.toString('base64') };

  assert.throws(() => decryptJson(tampered, key), DecryptError);
});

test('every write gets a fresh IV, so identical data never encrypts the same way', async () => {
  const salt = randomSalt();
  const key = await deriveKey('pw', salt);

  const first = encryptJson(STATE, key, salt);
  const second = encryptJson(STATE, key, salt);

  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test('the same passphrase under a different salt yields a different key', async () => {
  const a = await deriveKey('pw', randomSalt());
  const b = await deriveKey('pw', randomSalt());
  assert.notDeepEqual(a, b);
});

test('a non-envelope file is refused', async () => {
  const key = await deriveKey('pw', randomSalt());
  assert.throws(() => decryptJson({ holdings: [] }, key), DecryptError);
});
