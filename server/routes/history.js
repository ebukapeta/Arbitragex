/**
 * History Routes — Trade and transfer history
 *
 * GET /api/history/trades    — All trade history
 * GET /api/history/transfers — All transfer history
 */

import { Router } from 'express';
import { historyStore } from '../store/tradeHistory.js';

export const historyRouter = Router();

// ─── GET /api/history/trades ──────────────────────────────────────────────────
historyRouter.get('/trades', (_req, res) => {
  return res.json({
    trades:     historyStore.getTrades(100),
    totalCount: historyStore.trades.length,
  });
});

// ─── GET /api/history/transfers ───────────────────────────────────────────────
historyRouter.get('/transfers', (_req, res) => {
  return res.json({
    transfers:  historyStore.getTransfers(50),
    totalCount: historyStore.transfers.length,
  });
});
