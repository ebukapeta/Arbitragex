/**
 * Balances Routes — Fetch live balances from connected exchanges
 *
 * GET /api/balances           — All connected exchanges
 * GET /api/balances/:exchange — Single exchange balance
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import { fetchBalance } from '../exchanges/connector.js';
import { ACCOUNT_INFO } from '../exchanges/accountManager.js';

export const balanceRouter = Router();

const VALID_EXCHANGES = ['Binance', 'Bybit', 'MEXC', 'HTX', 'KuCoin', 'BitMart', 'Bitget', 'Gate.io'];

// ─── GET /api/balances ────────────────────────────────────────────────────────
// Fetch balances from all connected exchanges concurrently
balanceRouter.get('/', async (_req, res) => {
  const connected = keyStore.getConnectedExchanges();

  if (connected.length === 0) {
    return res.json({
      balances: VALID_EXCHANGES.map(ex => ({
        exchange:   ex,
        connected:  false,
        spotBalance:    0,
        fundingBalance: 0,
        totalUSDT:  0,
        lastUpdated: null,
        accountInfo: ACCOUNT_INFO[ex],
      })),
    });
  }

  // Fetch all connected exchanges concurrently
  const results = await Promise.allSettled(
    VALID_EXCHANGES.map(async (exchange) => {
      if (!keyStore.has(exchange)) {
        return {
          exchange,
          connected: false,
          spotBalance: 0,
          fundingBalance: 0,
          totalUSDT: 0,
          lastUpdated: null,
          accountInfo: ACCOUNT_INFO[exchange],
        };
      }

      try {
        const data = await fetchBalance(exchange);
        return {
          ...data,
          accountInfo: ACCOUNT_INFO[exchange],
        };
      } catch (err) {
        return {
          exchange,
          connected: true,
          spotBalance: 0,
          fundingBalance: 0,
          totalUSDT: 0,
          lastUpdated: Date.now(),
          error: err.message,
          accountInfo: ACCOUNT_INFO[exchange],
        };
      }
    }),
  );

  const balances = results.map(r =>
    r.status === 'fulfilled' ? r.value : { exchange: 'unknown', connected: false, totalUSDT: 0 }
  );

  return res.json({ balances, fetchedAt: Date.now() });
});

// ─── GET /api/balances/:exchange ──────────────────────────────────────────────
balanceRouter.get('/:exchange', async (req, res) => {
  const { exchange } = req.params;

  if (!VALID_EXCHANGES.includes(exchange)) {
    return res.status(400).json({ error: `Invalid exchange: ${exchange}` });
  }

  if (!keyStore.has(exchange)) {
    return res.json({
      exchange,
      connected: false,
      spotBalance: 0,
      fundingBalance: 0,
      totalUSDT: 0,
      lastUpdated: null,
      accountInfo: ACCOUNT_INFO[exchange],
    });
  }

  try {
    const data = await fetchBalance(exchange);
    return res.json({ ...data, accountInfo: ACCOUNT_INFO[exchange] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
