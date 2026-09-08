import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_HOLDINGS } from '../src/demo.js';
import { addHolding, enableDemo, getHoldings, isDemo, removeHolding, updateHolding } from '../src/storage.js';

// Demo mode is process-wide, so enable it once for this file.
enableDemo(DEMO_HOLDINGS);

test('reports that it is in demo mode', () => {
  assert.equal(isDemo(), true);
});

test('serves the sample holdings without touching the disk', async () => {
  const holdings = await getHoldings();
  assert.equal(holdings.length, DEMO_HOLDINGS.length);
  assert.equal(holdings[0].symbol, 'BTC');
  assert.ok(holdings.every((h) => h.coinId && h.amount > 0));
});

test('hands out copies, so a caller cannot mutate the sample data', async () => {
  const first = await getHoldings();
  first[0].amount = 999;
  first.push({ id: 'injected' });

  const second = await getHoldings();
  assert.equal(second[0].amount, DEMO_HOLDINGS[0].amount);
  assert.equal(second.length, DEMO_HOLDINGS.length);
});

test('refuses to add', async () => {
  await assert.rejects(
    addHolding({ name: 'x', symbol: 'BTC', coinId: 'bitcoin', amount: 1 }),
    /read-only demo/i,
  );
});

test('refuses to update', async () => {
  await assert.rejects(updateHolding('demo-btc', { amount: 2 }), /read-only demo/i);
});

test('refuses to remove', async () => {
  await assert.rejects(removeHolding('demo-btc'), /read-only demo/i);
});

test('a refused write leaves the data unchanged', async () => {
  await updateHolding('demo-btc', { amount: 42 }).catch(() => {});
  const holdings = await getHoldings();
  assert.equal(holdings[0].amount, DEMO_HOLDINGS[0].amount);
});
