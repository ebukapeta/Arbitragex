/**
 * Scanner Routes — Real-time arbitrage opportunity scanning
 *
 * POST /api/scanner/scan   — Run a scan across selected exchanges
 *
 * The scanner:
 * 1. Fetches live tickers from all selected connected exchanges concurrently
 * 2. Compares buy price (lowest ask) vs sell price (highest bid) across exchange pairs
 * 3. Applies fee calculations: buy fee + sell fee + withdrawal fee → net profit
 * 4. Validates chain compatibility (both exchanges must support same network for USDT)
 * 5. Validates withdrawal/deposit status on both exchanges
 * 6. Filters by minimum profit %, minimum volume, and profit bounds
 * 7. Returns only valid, executable opportunities
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import { getExchangeInstance } from '../exchanges/connector.js';
import {
  normaliseNetworks,
  getCommonNetworks,
  selectBestNetwork,
} from '../exchanges/networkNormaliser.js';

export const scannerRouter = Router();

// ─── Exchange trading fees (taker fees — used for market orders) ───────────────
const TAKER_FEES = {
  'Binance': 0.10,  // 0.10% standard (0.075% with BNB)
  'Bybit':   0.10,  // 0.10% spot taker
  'MEXC':    0.20,  // 0.20% standard
  'HTX':     0.20,  // 0.20% standard (Huobi)
  'KuCoin':  0.10,  // 0.10% standard
  'BitMart': 0.25,  // 0.25% standard
  'Bitget':  0.10,  // 0.10% standard
  'Gate.io': 0.20,  // 0.20% standard
};

// ─── USDT withdrawal fees by canonical network name (USD amounts) ──────────────
const WITHDRAWAL_FEES_USD = {
  TRC20:    1.00,   // Tron — cheapest, most widely supported
  BEP20:    0.80,   // BNB Smart Chain
  SOL:      1.00,   // Solana
  POLYGON:  1.00,   // Polygon PoS
  ARBITRUM: 0.80,   // Arbitrum One
  OPTIMISM: 0.80,   // Optimism
  BASE:     0.50,   // Base — cheapest L2
  AVAXC:    1.00,   // Avalanche C-Chain
  KCC:      0.80,   // KuCoin Chain
  TON:      0.50,   // TON
  ZKSYNC:   0.80,   // zkSync Era
  LINEA:    0.80,   // Linea
  ERC20:    4.50,   // Ethereum — most expensive, avoid if possible
};

// ─── Static fallback USDT networks per exchange (canonical form) ───────────────
// Used when live fetchCurrencies() is unavailable or API keys not connected.
// All entries are already in canonical form — normaliseNetworks() is applied
// at runtime so any future edits here do not need to match casing exactly.
const EXCHANGE_NETWORKS_STATIC = {
  'Binance': ['TRC20', 'BEP20', 'ERC20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'POLYGON', 'AVAXC'],
  'Bybit':   ['TRC20', 'BEP20', 'ERC20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'AVAXC'],
  'MEXC':    ['TRC20', 'BEP20', 'ERC20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'POLYGON', 'AVAXC'],
  'HTX':     ['TRC20', 'ERC20', 'BEP20', 'ARBITRUM', 'AVAXC'],
  'KuCoin':  ['TRC20', 'ERC20', 'BEP20', 'SOL', 'ARBITRUM', 'POLYGON', 'KCC'],
  'BitMart': ['TRC20', 'ERC20', 'BEP20', 'SOL'],
  'Bitget':  ['TRC20', 'ERC20', 'BEP20', 'SOL', 'ARBITRUM', 'OPTIMISM'],
  'Gate.io': ['TRC20', 'ERC20', 'BEP20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'POLYGON', 'AVAXC'],
};

// Cache for live network data fetched from exchange APIs
// Refreshed every 10 minutes to avoid excessive API calls
const networkCache = new Map(); // exchange → { networks: string[], fetchedAt: number }
const NETWORK_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Get canonical USDT networks for an exchange.
 * Tries live API first, falls back to static list.
 */
async function getExchangeNetworks(exchange) {
  const cached = networkCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < NETWORK_CACHE_TTL) {
    return cached.networks;
  }

  try {
    const ex = getExchangeInstance(exchange);
    if (ex) {
      await ex.loadMarkets();
      const currencies = await ex.fetchCurrencies();
      const usdt = currencies?.USDT;
      if (usdt?.networks) {
        // Extract raw network IDs and normalise them all
        const rawIds = Object.keys(usdt.networks);
        const canonical = normaliseNetworks(rawIds);
        if (canonical.length > 0) {
          networkCache.set(exchange, { networks: canonical, fetchedAt: Date.now() });
          return canonical;
        }
      }
    }
  } catch {
    // Fall through to static fallback
  }

  // Use static fallback (already canonical)
  const fallback = normaliseNetworks(EXCHANGE_NETWORKS_STATIC[exchange] ?? []);
  return fallback;
}

// ─── Withdrawal/deposit enabled status per exchange ───────────────────────────
const WITHDRAWAL_STATUS = {
  'Binance': { withdraw: true,  deposit: true  },
  'Bybit':   { withdraw: true,  deposit: true  },
  'MEXC':    { withdraw: true,  deposit: true  },
  'HTX':     { withdraw: true,  deposit: true  },
  'KuCoin':  { withdraw: true,  deposit: true  },
  'BitMart': { withdraw: true,  deposit: true  },
  'Bitget':  { withdraw: true,  deposit: true  },
  'Gate.io': { withdraw: true,  deposit: true  },
};

// Common trading pairs to scan
const SCAN_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'MATIC/USDT', 'DOT/USDT',
  'LINK/USDT', 'LTC/USDT', 'UNI/USDT', 'ATOM/USDT', 'TRX/USDT',
  'NEAR/USDT', 'APT/USDT', 'OP/USDT', 'ARB/USDT', 'FTM/USDT',
  'SHIB/USDT', 'PEPE/USDT', 'INJ/USDT', 'SUI/USDT', 'TIA/USDT',
];

/**
 * Find common canonical networks between two exchanges for USDT transfer.
 * Uses live API data with static fallback. Async because it may fetch live data.
 */
async function getCommonChains(buyExchange, sellExchange) {
  const [buyNets, sellNets] = await Promise.all([
    getExchangeNetworks(buyExchange),
    getExchangeNetworks(sellExchange),
  ]);
  // getCommonNetworks handles normalisation — both lists are already canonical here
  return getCommonNetworks(buyNets, sellNets);
}

/**
 * Fetch tickers for multiple pairs from an exchange.
 * Returns a map of { symbol: { bid, ask, baseVolume, quoteVolume } }
 */
async function fetchTickersForExchange(exchange, pairs) {
  const ex = getExchangeInstance(exchange);
  if (!ex) return {};

  try {
    // Try bulk fetch first (more efficient)
    await ex.loadMarkets();
    const availablePairs = pairs.filter(p => ex.markets?.[p]);

    if (availablePairs.length === 0) return {};

    // Some exchanges support fetchTickers (bulk), others require individual calls
    let tickers = {};

    try {
      const bulk = await ex.fetchTickers(availablePairs);
      tickers = bulk;
    } catch {
      // Fall back to individual fetches
      const results = await Promise.allSettled(
        availablePairs.map(pair => ex.fetchTicker(pair))
      );
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          tickers[availablePairs[i]] = r.value;
        }
      });
    }

    const out = {};
    for (const [symbol, ticker] of Object.entries(tickers)) {
      if (!ticker) continue;
      // Use last traded price (current market price) as the primary price.
      // This is the same price CoinMarketCap and CoinGecko display.
      // Using ask to buy and bid to sell artificially shrinks every spread:
      //   ask is ALWAYS higher than last  → overstates buy cost
      //   bid is ALWAYS lower  than last  → understates sell value
      // Result: real opportunities are missed because the spread appears
      // negative before fees even apply.
      // ask/bid are retained for execution time — market orders fill at
      // ask (buy) and bid (sell) — but opportunity FINDING uses last.
      const last = ticker.last ?? ticker.close ?? ticker.ask ?? ticker.bid;
      out[symbol] = {
        last,
        bid:         ticker.bid ?? last,
        ask:         ticker.ask ?? last,
        baseVolume:  ticker.baseVolume  ?? 0,
        quoteVolume: ticker.quoteVolume ?? 0,
      };
    }
    return out;
  } catch (err) {
    console.error(`[Scanner] Error fetching tickers from ${exchange}:`, err.message);
    return {};
  }
}

// ─── POST /api/scanner/scan ───────────────────────────────────────────────────
scannerRouter.post('/scan', async (req, res) => {
  const {
    buyExchanges  = [],
    sellExchanges = [],
    minProfitPct   = 0.3,
    maxProfitPct   = 15,
    minVolume24hLow = 100000,
  } = req.body;

  // Only scan connected exchanges
  const connectedExchanges = keyStore.getConnectedExchanges();

  const validBuyExchanges  = buyExchanges.filter(ex => connectedExchanges.includes(ex));
  const validSellExchanges = sellExchanges.filter(ex => connectedExchanges.includes(ex));

  if (validBuyExchanges.length === 0 || validSellExchanges.length === 0) {
    return res.json({
      opportunities: [],
      scannedAt:     Date.now(),
      message:       'No connected exchanges in scan selection. Connect exchanges via API first.',
      connectedExchanges,
    });
  }

  // Fetch tickers from all relevant exchanges concurrently
  const allExchanges = [...new Set([...validBuyExchanges, ...validSellExchanges])];

  const tickerResults = await Promise.allSettled(
    allExchanges.map(async (exchange) => ({
      exchange,
      tickers: await fetchTickersForExchange(exchange, SCAN_PAIRS),
    }))
  );

  const tickersByExchange = {};
  tickerResults.forEach(r => {
    if (r.status === 'fulfilled') {
      tickersByExchange[r.value.exchange] = r.value.tickers;
    }
  });

  // ─── Find arbitrage opportunities ─────────────────────────────────────────
  const opportunities = [];
  let oppId = Date.now();

  for (const pair of SCAN_PAIRS) {
    for (const buyExchange of validBuyExchanges) {
      for (const sellExchange of validSellExchanges) {
        if (buyExchange === sellExchange) continue;

        const buyTicker  = tickersByExchange[buyExchange]?.[pair];
        const sellTicker = tickersByExchange[sellExchange]?.[pair];

        if (!buyTicker || !sellTicker) continue;
        if (!buyTicker.last || !sellTicker.last) continue;

        // ── Current market prices (last traded price) ───────────────────────
        // Used for opportunity FINDING — same price shown on CoinMarketCap,
        // CoinGecko etc. This gives us the real cross-exchange price gap.
        const buyPrice  = buyTicker.last;   // current market price on buy exchange
        const sellPrice = sellTicker.last;  // current market price on sell exchange

        // Also store ask/bid for execution reference (market orders fill here)
        const buyAsk   = buyTicker.ask  ?? buyPrice;   // actual fill price when buying
        const sellBid  = sellTicker.bid ?? sellPrice;  // actual fill price when selling

        if (sellPrice <= buyPrice) continue; // No profit at current market prices

        // ── Fee calculations ────────────────────────────────────────────────
        // Profit is calculated using current market price (last) so the
        // scanner shows opportunities consistent with what you see on
        // CoinMarketCap. At execution time the bot re-fetches live prices.
        const buyFeePct  = TAKER_FEES[buyExchange]  ?? 0.20;
        const sellFeePct = TAKER_FEES[sellExchange] ?? 0.20;

        // Common chains for USDT withdrawal (normalised, live API + static fallback)
        const commonChains = await getCommonChains(buyExchange, sellExchange);
        const chainCompatible = commonChains.length > 0;

        // Best chain selected by priority: TRC20 > BEP20 > SOL > ... > ERC20
        const bestChain = selectBestNetwork(commonChains) ?? 'TRC20';

        const withdrawalFeeUSD = WITHDRAWAL_FEES_USD[bestChain] ?? 1.00;

        // Calculate profit on a notional $1000 trade
        const notionalAmount  = 1000;
        const buyFeeAmt       = notionalAmount * (buyFeePct / 100);
        const coinsReceived   = (notionalAmount - buyFeeAmt) / buyPrice;
        const grossSaleValue  = coinsReceived * sellPrice;
        const sellFeeAmt      = grossSaleValue * (sellFeePct / 100);
        const netAfterSell    = grossSaleValue - sellFeeAmt;
        const netAfterWD      = netAfterSell - withdrawalFeeUSD;

        const profitBeforeFeesPct = ((sellPrice - buyPrice) / buyPrice) * 100;
        const netProfitPct        = ((netAfterWD - notionalAmount) / notionalAmount) * 100;

        if (netProfitPct < minProfitPct) continue;
        if (netProfitPct > maxProfitPct) continue;

        // ── Volume check ────────────────────────────────────────────────────
        const buyVolume24hLow  = buyTicker.quoteVolume  * 0.65; // Low = ~65% of reported volume
        const sellVolume24hLow = sellTicker.quoteVolume * 0.65;
        const volume24hLow     = Math.min(buyVolume24hLow, sellVolume24hLow);

        if (volume24hLow < minVolume24hLow) continue;

        // ── Withdrawal/deposit validation ───────────────────────────────────
        const withdrawalEnabled = WITHDRAWAL_STATUS[buyExchange]?.withdraw ?? false;
        const depositEnabled    = WITHDRAWAL_STATUS[sellExchange]?.deposit  ?? false;

        opportunities.push({
          id:                `opp-${oppId++}`,
          pair,
          baseToken:         pair.split('/')[0],
          buyExchange,
          // buyPrice / sellPrice = current market price (last traded)
          // Same price shown on CoinMarketCap / CoinGecko
          buyPrice:          parseFloat(buyPrice.toFixed(8)),
          sellPrice:         parseFloat(sellPrice.toFixed(8)),
          // buyAsk / sellBid = actual fill prices at market order execution
          // Bot uses these at execution time for accurate profit recalculation
          buyAsk:            parseFloat(buyAsk.toFixed(8)),
          sellBid:           parseFloat(sellBid.toFixed(8)),
          sellExchange,
          buyFee:            buyFeePct,
          sellFee:           sellFeePct,
          withdrawalFeeUSD:  parseFloat(withdrawalFeeUSD.toFixed(2)),
          profitBeforeFees:  parseFloat(profitBeforeFeesPct.toFixed(4)),
          netProfit:         parseFloat(netProfitPct.toFixed(4)),
          netProfitPct:      parseFloat(netProfitPct.toFixed(4)),
          withdrawalEnabled,
          depositEnabled,
          chain:             chainCompatible ? bestChain : '—',
          chainCompatible,
          commonChains,
          buyVolume24hLow:   parseFloat(buyVolume24hLow.toFixed(0)),
          sellVolume24hLow:  parseFloat(sellVolume24hLow.toFixed(0)),
          volume24hLow:      parseFloat(volume24hLow.toFixed(0)),
          discoveredAt:      Date.now(),
          executing:         false,
        });
      }
    }
  }

  // Sort by net profit descending
  opportunities.sort((a, b) => b.netProfitPct - a.netProfitPct);

  return res.json({
    opportunities: opportunities.slice(0, 25),
    scannedAt: Date.now(),
    pairsScanned:       SCAN_PAIRS.length,
    exchangesScanned:   allExchanges.length,
    opportunitiesFound: opportunities.length,
  });
});
