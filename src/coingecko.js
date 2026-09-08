const BASE = process.env.COINGECKO_API_BASE ?? 'https://api.coingecko.com/api/v3';
const API_KEY = process.env.COINGECKO_API_KEY;
const TIMEOUT_MS = 10_000;

export class PriceSourceError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message, { cause });
    this.name = 'PriceSourceError';
    this.status = status;
  }
}

async function request(pathname, params) {
  const url = new URL(BASE + pathname);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const headers = { accept: 'application/json' };
  // Demo keys are optional; without one we ride the public free tier.
  if (API_KEY) headers['x-cg-demo-api-key'] = API_KEY;

  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw new PriceSourceError(
      timedOut ? 'CoinGecko did not respond in time.' : 'Could not reach CoinGecko.',
      { cause: err },
    );
  }

  if (response.status === 429) {
    throw new PriceSourceError(
      'CoinGecko rate limit hit. Wait a minute before refreshing again.',
      { status: 429 },
    );
  }
  if (!response.ok) {
    throw new PriceSourceError(`CoinGecko returned HTTP ${response.status}.`, {
      status: response.status,
    });
  }

  try {
    return await response.json();
  } catch (err) {
    throw new PriceSourceError('CoinGecko returned a malformed response.', { cause: err });
  }
}

/**
 * One batched call for every holding.
 * @param {string[]} coinIds CoinGecko coin ids, e.g. ['bitcoin', 'ethereum']
 * @returns {Promise<Record<string, {usd: number, sgd: number, lastUpdatedAt: number|null}>>}
 */
export async function fetchPrices(coinIds) {
  const ids = [...new Set(coinIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const data = await request('/simple/price', {
    ids: ids.join(','),
    vs_currencies: 'usd,sgd',
    include_last_updated_at: 'true',
  });

  const prices = {};
  for (const [id, quote] of Object.entries(data ?? {})) {
    prices[id] = {
      usd: Number.isFinite(quote?.usd) ? quote.usd : null,
      sgd: Number.isFinite(quote?.sgd) ? quote.sgd : null,
      lastUpdatedAt: Number.isFinite(quote?.last_updated_at) ? quote.last_updated_at : null,
    };
  }
  return prices;
}

/**
 * Resolve a symbol or name to canonical coin ids — symbols are not unique on CoinGecko,
 * so the user picks the right match before a holding is saved.
 */
export async function searchCoins(query) {
  const q = String(query ?? '').trim();
  if (q.length === 0) return [];

  const data = await request('/search', { query: q });
  return (data?.coins ?? []).slice(0, 15).map((coin) => ({
    coinId: coin.id,
    symbol: String(coin.symbol ?? '').toUpperCase(),
    name: coin.name,
    rank: coin.market_cap_rank ?? null,
    thumb: coin.thumb ?? null,
  }));
}
