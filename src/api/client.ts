/**
 * ArbitrageX API Client
 * ─────────────────────────────────────────────────────────────────────────────
 * All frontend → backend communication goes through this module.
 * The backend server is the only entity that holds API keys and talks to exchanges.
 *
 * In development: Vite proxies /api/* to http://localhost:3001
 * In production:  /api/* is served by the same Express server (same origin)
 */

import type { Exchange, ArbitrageOpportunity, TradeHistory, TransferHistory, USDTNetwork } from '../types';

// Base URL — empty string means same origin (works both in dev with proxy and in prod)
const BASE = '';

// ─── Generic fetch helper ─────────────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? err.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Connection Status ────────────────────────────────────────────────────────

export interface ConnectionStatus {
  exchange:    Exchange;
  connected:   boolean;
  connectedAt: number | null;
}

export async function fetchConnectionStatus(): Promise<ConnectionStatus[]> {
  const data = await apiFetch<{ exchanges: ConnectionStatus[] }>('/api/keys/status');
  return data.exchanges;
}

// ─── API Key Management ───────────────────────────────────────────────────────

export interface SaveKeyPayload {
  exchange:       Exchange;
  apiKey:         string;
  apiSecret:      string;
  apiPassphrase?: string;
  apiMemo?:       string;
}

export async function saveApiKey(payload: SaveKeyPayload): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/keys/save', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
}

export async function removeApiKey(exchange: Exchange): Promise<{ success: boolean }> {
  return apiFetch(`/api/keys/${encodeURIComponent(exchange)}`, {
    method: 'DELETE',
  });
}

export async function validateApiKey(exchange: Exchange): Promise<{
  success: boolean;
  usdtBalance?: number;
  error?: string;
}> {
  return apiFetch('/api/keys/validate', {
    method: 'POST',
    body:   JSON.stringify({ exchange }),
  });
}

// ─── Balances ─────────────────────────────────────────────────────────────────

export interface LiveBalance {
  exchange:       Exchange;
  connected:      boolean;
  spotBalance:    number;
  fundingBalance: number;
  totalUSDT:      number;
  lastUpdated:    number | null;
  error?:         string;
  accountInfo: {
    depositAccountLabel:      string;
    requiresInternalTransfer: boolean;
    transferPath:             string;
  };
}

export async function fetchAllBalances(): Promise<LiveBalance[]> {
  const data = await apiFetch<{ balances: LiveBalance[] }>('/api/balances');
  return data.balances;
}

export async function fetchExchangeBalance(exchange: Exchange): Promise<LiveBalance> {
  return apiFetch<LiveBalance>(`/api/balances/${encodeURIComponent(exchange)}`);
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

export interface ScanRequest {
  buyExchanges:    Exchange[];
  sellExchanges:   Exchange[];
  minProfitPct:    number;
  maxProfitPct:    number;
  minVolume24hLow: number;
}

export interface ScanResult {
  opportunities:     ArbitrageOpportunity[];
  scannedAt:         number;
  pairsScanned:      number;
  exchangesScanned:  number;
  opportunitiesFound: number;
  message?:          string;
  connectedExchanges?: string[];
}

export async function runScan(params: ScanRequest): Promise<ScanResult> {
  return apiFetch('/api/scanner/scan', {
    method: 'POST',
    body:   JSON.stringify(params),
  });
}

// ─── Bot Execution ────────────────────────────────────────────────────────────

export interface ExecuteRequest {
  opportunity:    ArbitrageOpportunity;
  amount:         number;
  depositAddress: string;
  minProfitPct?:  number;
}

export interface ExecuteResponse {
  tradeId: string;
  message: string;
  status:  string;
}

// ─── Price Verification (called before execute) ───────────────────────────────

export interface VerifyPriceRequest {
  opportunity:  ArbitrageOpportunity;
  amount:       number;
  minProfitPct: number;
}

export interface VerifyPriceResult {
  verified:         boolean;
  stillProfitable:  boolean;
  liveBuyPrice:     number;
  liveSellPrice:    number;
  scannerBuyPrice:  number;
  scannerSellPrice: number;
  priceMovedPct:    number;
  buyFeeAmt:        number;
  sellFeeAmt:       number;
  wdFeeUSD:         number;
  netProfitUSD:     number;
  netProfitPct:     number;
  coinsToReceive:   number;
  verifiedAt:       number;
  warning:          string | null;
}

export async function verifyPrice(payload: VerifyPriceRequest): Promise<VerifyPriceResult> {
  return apiFetch('/api/bot/verify-price', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
}

export async function executeTrade(payload: ExecuteRequest): Promise<ExecuteResponse> {
  return apiFetch('/api/bot/execute', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
}

export interface TradeStatus {
  id:          string;
  currentStep: string;
  status:      string;
  steps:       Array<{
    step:             string;
    message:          string;
    timestamp:        number;
    netProfit?:       number;
    liveNetProfitUSD?: number;
    liveNetProfitPct?: number;
    priceMovedPct?:   number;
    noOrdersPlaced?:  boolean;
  }>;
  netProfit?:  number;
  error?:      string;
}

export async function fetchTradeStatus(tradeId: string): Promise<TradeStatus> {
  return apiFetch<TradeStatus>(`/api/bot/status/${tradeId}`);
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

export interface TransferRequest {
  fromExchange:   Exchange;
  toExchange:     Exchange;
  amount:         number;
  network:        string;
  depositAddress: string;  // USDT deposit address on destination exchange
}

export interface TransferResponse {
  transferId: string;
  message:    string;
  status:     string;
  steps:      TransferHistory['steps'];
}

export async function initiateTransfer(payload: TransferRequest): Promise<TransferResponse> {
  return apiFetch('/api/transfer', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
}

export async function fetchTransferStatus(transferId: string): Promise<TransferHistory> {
  return apiFetch<TransferHistory>(`/api/transfer/${transferId}`);
}

// ─── Networks ─────────────────────────────────────────────────────────────────

export async function fetchNetworks(exchange: Exchange): Promise<{
  networks: USDTNetwork[];
  source:   'live' | 'static';
}> {
  return apiFetch(`/api/networks/${encodeURIComponent(exchange)}`);
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function fetchTradeHistory(): Promise<TradeHistory[]> {
  const data = await apiFetch<{ trades: TradeHistory[] }>('/api/history/trades');
  return data.trades;
}

export async function fetchTransferHistory(): Promise<TransferHistory[]> {
  const data = await apiFetch<{ transfers: TransferHistory[] }>('/api/history/transfers');
  return data.transfers;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<{
  status:             string;
  connectedExchanges: number;
  exchanges:          string[];
  uptime:             number;
}> {
  return apiFetch('/api/health');
}

// ─── Polling helpers ──────────────────────────────────────────────────────────

/**
 * Poll trade status until completed or failed.
 * Calls onUpdate on every poll.
 */
export function pollTradeStatus(
  tradeId:  string,
  onUpdate: (status: TradeStatus) => void,
  onDone:   (status: TradeStatus) => void,
  onError:  (err: Error) => void,
  intervalMs = 1500,
): () => void {
  let active = true;

  const poll = async () => {
    if (!active) return;
    try {
      const status = await fetchTradeStatus(tradeId);
      onUpdate(status);
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'aborted') {
        onDone(status);
        return;
      }
      setTimeout(poll, intervalMs);
    } catch (err) {
      onError(err as Error);
    }
  };

  poll();
  return () => { active = false; };
}

/**
 * Poll transfer status until completed or failed.
 */
export function pollTransferStatus(
  transferId: string,
  onUpdate:   (t: TransferHistory) => void,
  onDone:     (t: TransferHistory) => void,
  onError:    (err: Error) => void,
  intervalMs  = 2000,
): () => void {
  let active = true;

  const poll = async () => {
    if (!active) return;
    try {
      const transfer = await fetchTransferStatus(transferId);
      onUpdate(transfer);
      if (transfer.status === 'completed' || transfer.status === 'failed') {
        onDone(transfer);
        return;
      }
      setTimeout(poll, intervalMs);
    } catch (err) {
      onError(err as Error);
    }
  };

  poll();
  return () => { active = false; };
}
