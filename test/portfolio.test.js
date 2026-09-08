import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRows } from '../src/portfolio.js';

const holdings = [
  { id: 'a', name: 'Cold wallet', symbol: 'BTC', coinId: 'bitcoin', amount: 0.5 },
  { id: 'b', name: 'Staking', symbol: 'ETH', coinId: 'ethereum', amount: 3 },
];

const prices = {
  bitcoin: { usd: 80000, sgd: 101600, lastUpdatedAt: 1787637310 },
  ethereum: { usd: 2500, sgd: 3175, lastUpdatedAt: 1787637310 },
};

test('numbers each row and computes both subtotals from the native quotes', () => {
  const { rows } = buildRows(holdings, prices);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.index),
    [1, 2],
  );
  assert.equal(rows[0].subtotalUsd, 40000);
  assert.equal(rows[0].subtotalSgd, 50800);
  assert.equal(rows[1].subtotalUsd, 7500);
  assert.equal(rows[1].subtotalSgd, 9525);
  assert.equal(rows[0].stale, false);
});

test('totals sum every priced row', () => {
  const { totals } = buildRows(holdings, prices);
  assert.equal(totals.usd, 47500);
  assert.equal(totals.sgd, 60325);
});

test('a holding with no quote is marked stale and contributes nothing', () => {
  const withUnknown = [...holdings, { id: 'c', name: 'Mystery', symbol: 'XYZ', coinId: 'nope', amount: 10 }];
  const { rows, totals } = buildRows(withUnknown, prices);

  const unknown = rows.at(-1);
  assert.equal(unknown.stale, true);
  assert.equal(unknown.priceUsd, null);
  assert.equal(unknown.subtotalUsd, null);
  assert.equal(unknown.subtotalSgd, null);
  assert.equal(totals.usd, 47500, 'stale row must not change the total');
  assert.equal(totals.sgd, 60325);
});

test('remarks pass through, defaulting to an empty string', () => {
  const withRemark = [
    { ...holdings[0], remark: 'DCA since 2021' },
    holdings[1], // no remark key at all
  ];
  const { rows } = buildRows(withRemark, prices);
  assert.equal(rows[0].remark, 'DCA since 2021');
  assert.equal(rows[1].remark, '');
});

test('an empty portfolio totals zero', () => {
  const { rows, totals } = buildRows([], {});
  assert.deepEqual(rows, []);
  assert.deepEqual(totals, { usd: 0, sgd: 0 });
});

test('a total price outage leaves every row stale but still rendered', () => {
  const { rows, totals } = buildRows(holdings, {});
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.stale));
  assert.deepEqual(totals, { usd: 0, sgd: 0 });
});

test('a non-numeric amount degrades to 0 instead of NaN-poisoning the total', () => {
  const { rows, totals } = buildRows(
    [{ id: 'x', name: 'Bad', symbol: 'BTC', coinId: 'bitcoin', amount: 'oops' }],
    prices,
  );
  assert.equal(rows[0].amount, 0);
  assert.equal(totals.usd, 0);
});
