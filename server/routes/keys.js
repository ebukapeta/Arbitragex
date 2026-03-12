/**
 * Keys Routes — Save / remove / status API credentials
 *
 * POST   /api/keys/save         — Save credentials for an exchange (server-side)
 * DELETE /api/keys/:exchange    — Remove credentials for an exchange
 * GET    /api/keys/status       — Get connection status for all exchanges (no secrets)
 * POST   /api/keys/validate     — Test credentials against live exchange API
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import { getExchangeInstance, invalidateInstance } from '../exchanges/connector.js';

export const keysRouter = Router();

const VALID_EXCHANGES = ['Binance', 'Bybit', 'MEXC', 'HTX', 'KuCoin', 'BitMart', 'Bitget', 'Gate.io'];

// ─── POST /api/keys/save ──────────────────────────────────────────────────────
// Save API credentials server-side. Never returns secrets back to client.
keysRouter.post('/save', (req, res) => {
  const { exchange, apiKey, apiSecret, apiPassphrase, apiMemo } = req.body;

  if (!VALID_EXCHANGES.includes(exchange)) {
    return res.status(400).json({ error: `Invalid exchange: ${exchange}` });
  }

  if (!apiKey?.trim() || !apiSecret?.trim()) {
    return res.status(400).json({ error: 'apiKey and apiSecret are required' });
  }

  // KuCoin and Bitget require passphrase
  if (['KuCoin', 'Bitget'].includes(exchange) && !apiPassphrase?.trim()) {
    return res.status(400).json({ error: `${exchange} requires an API Passphrase` });
  }

  try {
    // Invalidate any cached CCXT instance for this exchange
    invalidateInstance(exchange);

    keyStore.save(exchange, { apiKey, apiSecret, apiPassphrase, apiMemo });

    return res.json({
      success: true,
      message: `${exchange} credentials saved securely on server`,
      exchange,
      connected: true,
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to save credentials: ${err.message}` });
  }
});

// ─── DELETE /api/keys/:exchange ───────────────────────────────────────────────
keysRouter.delete('/:exchange', (req, res) => {
  const { exchange } = req.params;

  if (!VALID_EXCHANGES.includes(exchange)) {
    return res.status(400).json({ error: `Invalid exchange: ${exchange}` });
  }

  invalidateInstance(exchange);
  keyStore.remove(exchange);

  return res.json({
    success: true,
    message: `${exchange} disconnected and credentials removed`,
    exchange,
    connected: false,
  });
});

// ─── GET /api/keys/status ─────────────────────────────────────────────────────
// Returns which exchanges are connected — NO secrets included
keysRouter.get('/status', (_req, res) => {
  const status = keyStore.getConnectionStatus();
  return res.json({ exchanges: status });
});

// ─── POST /api/keys/validate ──────────────────────────────────────────────────
// Test saved credentials against the live exchange API
keysRouter.post('/validate', async (req, res) => {
  const { exchange } = req.body;

  if (!VALID_EXCHANGES.includes(exchange)) {
    return res.status(400).json({ error: `Invalid exchange: ${exchange}` });
  }

  if (!keyStore.has(exchange)) {
    return res.status(404).json({ error: `No credentials found for ${exchange}` });
  }

  try {
    const ex = getExchangeInstance(exchange);
    if (!ex) {
      return res.status(404).json({ error: `Could not create ${exchange} instance` });
    }

    // Try to fetch balance as a connectivity test
    const balance = await ex.fetchBalance();
    const usdtBalance = balance?.USDT?.total ?? balance?.total?.USDT ?? 0;

    return res.json({
      success: true,
      exchange,
      connected: true,
      usdtBalance: parseFloat(usdtBalance.toFixed(2)),
      message: `${exchange} API credentials are valid`,
    });
  } catch (err) {
    // Remove invalid credentials from store
    invalidateInstance(exchange);

    return res.status(400).json({
      success: false,
      exchange,
      connected: false,
      error: `${exchange} credential validation failed: ${err.message}`,
    });
  }
});
