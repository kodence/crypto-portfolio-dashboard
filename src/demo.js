/**
 * Sample holdings for read-only demo mode. Invented positions, real coin ids —
 * prices are still fetched live from CoinGecko so the demo shows real behaviour.
 */
export const DEMO_HOLDINGS = [
  {
    id: 'demo-btc',
    name: 'Long-term hold',
    symbol: 'BTC',
    coinId: 'bitcoin',
    amount: 0.75,
    remark: 'Hardware wallet',
  },
  {
    id: 'demo-eth',
    name: 'Staking',
    symbol: 'ETH',
    coinId: 'ethereum',
    amount: 6.5,
    remark: 'Validator rewards',
  },
  {
    id: 'demo-sol',
    name: 'Trading float',
    symbol: 'SOL',
    coinId: 'solana',
    amount: 40,
    remark: 'Exchange',
  },
  {
    id: 'demo-xrp',
    name: 'Payments',
    symbol: 'XRP',
    coinId: 'ripple',
    amount: 1200,
    remark: '',
  },
  {
    id: 'demo-ada',
    name: 'Cold storage',
    symbol: 'ADA',
    coinId: 'cardano',
    amount: 2500,
    remark: 'Hardware wallet',
  },
  {
    id: 'demo-usdc',
    name: 'Stable reserve',
    symbol: 'USDC',
    coinId: 'usd-coin',
    amount: 1500,
    remark: 'Dry powder',
  },
];
