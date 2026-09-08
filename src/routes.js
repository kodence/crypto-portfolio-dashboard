import { Router } from 'express';
import { fetchPrices, searchCoins, PriceSourceError } from './coingecko.js';
import { buildRows } from './portfolio.js';
import { addHolding, getHoldings, isDemo, removeHolding, updateHolding } from './storage.js';

// Long enough for a real note, short enough to keep the column sane.
const REMARK_MAX_LENGTH = 200;

export function createApiRouter() {
  const router = Router();

  // Read-only demo: refuse anything that would change data before it reaches a handler.
  router.use((req, res, next) => {
    if (isDemo() && req.method !== 'GET') {
      return res.status(403).json({
        error: 'This is a read-only demo — adding, editing, and removing are disabled.',
      });
    }
    next();
  });

  // Holdings + live prices + computed totals. Used on page load and on Refresh.
  router.get('/portfolio', async (req, res, next) => {
    try {
      const holdings = await getHoldings();

      let prices = {};
      let priceError = null;
      try {
        prices = await fetchPrices(holdings.map((h) => h.coinId));
      } catch (err) {
        if (!(err instanceof PriceSourceError)) throw err;
        // A price outage must not blank the table — return holdings with null prices.
        priceError = err.message;
      }

      const { rows, totals } = buildRows(holdings, prices);
      res.json({
        rows,
        totals,
        priceError,
        demo: isDemo(),
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // Symbol/name -> canonical coin id, for the add form.
  router.get('/search', async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (q.length === 0) return res.json({ results: [] });
      res.json({ results: await searchCoins(q) });
    } catch (err) {
      if (err instanceof PriceSourceError) {
        return res.status(502).json({ error: err.message });
      }
      next(err);
    }
  });

  router.post('/holdings', async (req, res, next) => {
    try {
      const { name, symbol, coinId, amount } = req.body ?? {};

      const cleanName = String(name ?? '').trim();
      const cleanSymbol = String(symbol ?? '').trim();
      const cleanCoinId = String(coinId ?? '').trim();
      const numericAmount = Number(amount);

      if (!cleanName) return res.status(400).json({ error: 'Name is required.' });
      if (!cleanSymbol) return res.status(400).json({ error: 'Symbol is required.' });
      if (!cleanCoinId) {
        return res
          .status(400)
          .json({ error: 'Pick a coin from the search results so the price can be looked up.' });
      }
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: 'Asset size must be a number greater than 0.' });
      }

      const holding = await addHolding({
        name: cleanName,
        symbol: cleanSymbol,
        coinId: cleanCoinId,
        amount: numericAmount,
      });
      res.status(201).json({ holding });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/holdings/:id', async (req, res, next) => {
    try {
      const { amount, remark } = req.body ?? {};
      const patch = {};

      if (amount !== undefined) {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          return res.status(400).json({ error: 'Asset size must be a number greater than 0.' });
        }
        patch.amount = numericAmount;
      }

      if (remark !== undefined) {
        if (typeof remark !== 'string') {
          return res.status(400).json({ error: 'Remark must be text.' });
        }
        patch.remark = remark.trim().slice(0, REMARK_MAX_LENGTH);
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'Nothing to update.' });
      }

      const holding = await updateHolding(req.params.id, patch);
      if (!holding) return res.status(404).json({ error: 'No holding with that id.' });
      res.json({ holding });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/holdings/:id', async (req, res, next) => {
    try {
      const removed = await removeHolding(req.params.id);
      if (!removed) return res.status(404).json({ error: 'No holding with that id.' });
      res.json({ removed });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
