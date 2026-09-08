import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSecretReader } from '../src/passphrase.js';

const key = (code) => String.fromCharCode(code);
const ENTER = key(13);
const CTRL_C = key(3);
const CTRL_D = key(4);
const DELETE = key(127);
const BACKSPACE = key(8);
const ESC = key(27);

test('collects typed characters and finishes on Enter', () => {
  const read = createSecretReader();
  assert.equal(read('hunter').status, 'pending');
  const result = read(`2${ENTER}`);
  assert.equal(result.status, 'done');
  assert.equal(result.value, 'hunter2');
});

test('echoes one asterisk per character, never the character itself', () => {
  const read = createSecretReader();
  const { echo } = read('secret');
  assert.equal(echo, '******');
  assert.ok(!echo.includes('s'));
});

test('backspace removes a character and rubs out its asterisk', () => {
  const read = createSecretReader();
  read('abc');
  const { echo } = read(DELETE);
  assert.equal(echo, '\b \b');
  assert.equal(read(ENTER).value, 'ab');
});

test('backspace on an empty passphrase does nothing', () => {
  const read = createSecretReader();
  const { echo } = read(BACKSPACE);
  assert.equal(echo, '');
  assert.equal(read(ENTER).value, '');
});

test('Ctrl+C cancels and discards what was typed', () => {
  const read = createSecretReader();
  read('half-typed');
  const result = read(CTRL_C);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.value, '');
});

test('Ctrl+D submits a non-empty passphrase but cancels an empty one', () => {
  const typed = createSecretReader();
  typed('pw');
  assert.equal(typed(CTRL_D).status, 'done');

  const empty = createSecretReader();
  assert.equal(empty(CTRL_D).status, 'cancelled');
});

test('arrow keys do not leak their escape sequence into the passphrase', () => {
  const read = createSecretReader();
  read('ab');
  read(`${ESC}[A`); // up arrow
  assert.equal(read(ENTER).value, 'ab');
});

test('a passphrase pasted as one chunk is handled the same as typing', () => {
  const read = createSecretReader();
  const result = read(`correct horse battery staple${ENTER}`);
  assert.equal(result.status, 'done');
  assert.equal(result.value, 'correct horse battery staple');
});

test('keeps spaces and punctuation, drops stray control characters', () => {
  const read = createSecretReader();
  const result = read(`a b!${key(1)}c${ENTER}`);
  assert.equal(result.value, 'a b!c');
});
