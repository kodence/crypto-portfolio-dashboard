/**
 * Pure valuation logic — no I/O, so it is directly unit-testable.
 *
 * SGD subtotals come from CoinGecko's own SGD quote rather than from
 * `usdSubtotal * fxRate`, which avoids a second rounding hop.
 *
 * @param {Array} holdings stored holdings
 * @param {Record<string, {usd: number|null, sgd: number|null, lastUpdatedAt: number|null}>} prices
 */
export function buildRows(holdings = [], prices = {}) {
  let totalUsd = 0;
  let totalSgd = 0;

  const rows = holdings.map((holding, i) => {
    const quote = prices[holding.coinId];
    const priceUsd = Number.isFinite(quote?.usd) ? quote.usd : null;
    const priceSgd = Number.isFinite(quote?.sgd) ? quote.sgd : null;
    const amount = Number.isFinite(Number(holding.amount)) ? Number(holding.amount) : 0;

    const subtotalUsd = priceUsd === null ? null : amount * priceUsd;
    const subtotalSgd = priceSgd === null ? null : amount * priceSgd;

    if (subtotalUsd !== null) totalUsd += subtotalUsd;
    if (subtotalSgd !== null) totalSgd += subtotalSgd;

    return {
      index: i + 1,
      id: holding.id,
      name: holding.name,
      symbol: holding.symbol,
      coinId: holding.coinId,
      remark: holding.remark ?? '',
      amount,
      priceUsd,
      priceSgd,
      subtotalUsd,
      subtotalSgd,
      stale: priceUsd === null,
      lastUpdatedAt: quote?.lastUpdatedAt ?? null,
    };
  });

  return {
    rows,
    totals: { usd: totalUsd, sgd: totalSgd },
  };
}
