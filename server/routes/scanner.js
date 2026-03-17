/**
 * Scanner Routes — Real-time arbitrage opportunity scanning
 *
 * POST /api/scanner/scan   — Run a full scan across all tickers on selected exchanges
 * GET  /api/scanner/debug  — Show raw ticker data for diagnostics
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

// ─── Exchange taker fees (market orders) ──────────────────────────────────────
const TAKER_FEES = {
  'Binance': 0.10,
  'Bybit':   0.10,
  'MEXC':    0.20,
  'HTX':     0.20,
  'KuCoin':  0.10,
  'BitMart': 0.25,
  'Bitget':  0.10,
  'Gate.io': 0.20,
};

// ─── USDT withdrawal fees by canonical network (USD) ─────────────────────────
const WITHDRAWAL_FEES_USD = {
  TRC20:    1.00,
  BEP20:    0.80,
  SOL:      1.00,
  POLYGON:  1.00,
  ARBITRUM: 0.80,
  OPTIMISM: 0.80,
  BASE:     0.50,
  AVAXC:    1.00,
  KCC:      0.80,
  TON:      0.50,
  ZKSYNC:   0.80,
  LINEA:    0.80,
  ERC20:    4.50,
};

// ─── Static USDT networks per exchange (canonical fallback) ───────────────────
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

// ─── Network cache — refreshed every 15 minutes ───────────────────────────────
const networkCache   = new Map();
const NETWORK_TTL    = 15 * 60 * 1000;

// ─── Opportunity persistence — tracks firstSeenAt across scans ────────────────
// Key: `${pair}|${buyExchange}|${sellExchange}`
// Value: { firstSeenAt: timestamp, lastSeenAt: timestamp }
const opportunityRegistry = new Map();
const REGISTRY_TTL = 60 * 60 * 1000; // prune entries not seen for 1 hour

// ─── Ticker cache — per exchange, refreshed every scan cycle ─────────────────
const tickerCache    = new Map();
const TICKER_TTL     = 8 * 1000; // 8 seconds — matches scan interval

// ─── Pre-fetch networks for one exchange ─────────────────────────────────────
async function getExchangeNetworks(exchange) {
  const cached = networkCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < NETWORK_TTL) return cached.networks;

  try {
    const ex = getExchangeInstance(exchange);
    if (ex) {
      const currencies = await ex.fetchCurrencies();
      const usdt = currencies?.USDT ?? currencies?.usdt;
      if (usdt?.networks) {
        const canonical = normaliseNetworks(Object.keys(usdt.networks));
        if (canonical.length > 0) {
          networkCache.set(exchange, { networks: canonical, fetchedAt: Date.now() });
          return canonical;
        }
      }
    }
  } catch (_) {
    // fall through to static
  }

  const fallback = normaliseNetworks(EXCHANGE_NETWORKS_STATIC[exchange] ?? []);
  networkCache.set(exchange, { networks: fallback, fetchedAt: Date.now() });
  return fallback;
}

// ─── Fetch ALL USDT tickers from one exchange ─────────────────────────────────
async function fetchAllUSDTTickers(exchange) {
  // Return cached tickers if fresh enough
  const cached = tickerCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < TICKER_TTL) {
    return cached.tickers;
  }

  const ex = getExchangeInstance(exchange);
  if (!ex) return {};

  try {
    await ex.loadMarkets();

    // Collect ALL /USDT pairs this exchange lists
    const usdtPairs = Object.keys(ex.markets ?? {}).filter(symbol => {
      const market = ex.markets[symbol];
      return (
        market?.active !== false &&
        (symbol.endsWith('/USDT') || market?.quote === 'USDT') &&
        market?.spot === true
      );
    });

    if (usdtPairs.length === 0) return {};

    console.log(`[Scanner] ${exchange}: ${usdtPairs.length} USDT spot pairs found`);

    let rawTickers = {};

    // Try fetching all tickers at once (most efficient)
    try {
      rawTickers = await ex.fetchTickers(usdtPairs);
      console.log(`[Scanner] ${exchange}: bulk fetch → ${Object.keys(rawTickers).length} tickers`);
    } catch (bulkErr) {
      // Some exchanges don't support bulk — try fetching all tickers without specifying symbols
      try {
        rawTickers = await ex.fetchTickers();
        // Filter to USDT pairs only
        const filtered = {};
        for (const sym of usdtPairs) {
          if (rawTickers[sym]) filtered[sym] = rawTickers[sym];
        }
        rawTickers = filtered;
        console.log(`[Scanner] ${exchange}: full market fetch → ${Object.keys(rawTickers).length} USDT tickers`);
      } catch (fullErr) {
        // Last resort — batch individual fetches in groups of 50
        console.log(`[Scanner] ${exchange}: falling back to batched individual fetches`);
        const BATCH = 50;
        for (let i = 0; i < usdtPairs.length; i += BATCH) {
          const batch = usdtPairs.slice(i, i + BATCH);
          const results = await Promise.allSettled(batch.map(p => ex.fetchTicker(p)));
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && r.value) rawTickers[batch[idx]] = r.value;
          });
        }
        console.log(`[Scanner] ${exchange}: batched individual → ${Object.keys(rawTickers).length} tickers`);
      }
    }

    // Normalise ticker fields
    const out = {};
    for (const [symbol, ticker] of Object.entries(rawTickers)) {
      if (!ticker) continue;

      // Current market price — last traded (same as CMC/CoinGecko shows)
      let last = ticker.last ?? ticker.close;
      if (!last && ticker.ask && ticker.bid) last = (ticker.ask + ticker.bid) / 2;
      else if (!last && ticker.ask) last = ticker.ask;
      else if (!last && ticker.bid) last = ticker.bid;

      if (!last || last <= 0) continue;

      // USD volume — prefer quoteVolume, estimate from baseVolume if missing
      let quoteVolume = ticker.quoteVolume;
      if (!quoteVolume || quoteVolume <= 0) {
        quoteVolume = (ticker.baseVolume ?? 0) * last;
      }

      out[symbol] = {
        last,
        bid:         ticker.bid  ?? last * 0.9995,
        ask:         ticker.ask  ?? last * 1.0005,
        quoteVolume,
        baseVolume:  ticker.baseVolume ?? 0,
      };
    }

    // Cache result
    tickerCache.set(exchange, { tickers: out, fetchedAt: Date.now() });
    return out;

  } catch (err) {
    console.error(`[Scanner] ${exchange} fetch error: ${err.message}`);
    return {};
  }
}

// ─── Prune stale registry entries (not seen for > 1 hour) ────────────────────
function pruneRegistry() {
  const cutoff = Date.now() - REGISTRY_TTL;
  for (const [key, entry] of opportunityRegistry.entries()) {
    if (entry.lastSeenAt < cutoff) opportunityRegistry.delete(key);
  }
}

// ─── POST /api/scanner/scan ───────────────────────────────────────────────────
scannerRouter.post('/scan', async (req, res) => {
  const {
    buyExchanges    = [],
    sellExchanges   = [],
    minProfitPct    = 0,
    maxProfitPct    = 50,
    minVolume24hLow = 0,
  } = req.body;

  const now = Date.now();

  console.log(`\n[Scanner] ─── New scan ───────────────────────────────────────`);
  console.log(`[Scanner] Buy: [${buyExchanges.join(', ')}]`);
  console.log(`[Scanner] Sell: [${sellExchanges.join(', ')}]`);
  console.log(`[Scanner] minProfit: ${minProfitPct}%  maxProfit: ${maxProfitPct}%  minVol: $${minVolume24hLow}`);

  const connectedExchanges = keyStore.getConnectedExchanges();
  console.log(`[Scanner] Connected: [${connectedExchanges.join(', ')}]`);

  if (connectedExchanges.length === 0) {
    return res.json({
      opportunities: [], scannedAt: now,
      message: 'No exchanges connected. Add API keys via the Connect API panel.',
      connectedExchanges: [],
    });
  }

  const validBuy  = buyExchanges.filter(ex => connectedExchanges.includes(ex));
  const validSell = sellExchanges.filter(ex => connectedExchanges.includes(ex));

  if (validBuy.length === 0 || validSell.length === 0) {
    return res.json({
      opportunities: [], scannedAt: now,
      message: `Selected exchanges not connected. Connected: [${connectedExchanges.join(', ')}]`,
      connectedExchanges,
    });
  }

  const allExchanges = [...new Set([...validBuy, ...validSell])];

  // ── Step 1: Pre-fetch networks (once per exchange, cached 15 min) ─────────
  const networksMap = {};
  await Promise.allSettled(
    allExchanges.map(async ex => { networksMap[ex] = await getExchangeNetworks(ex); })
  );

  // ── Step 2: Fetch ALL USDT tickers from every exchange concurrently ────────
  console.log(`[Scanner] Fetching ALL USDT tickers from ${allExchanges.length} exchanges...`);
  const tickerResults = await Promise.allSettled(
    allExchanges.map(async ex => ({ exchange: ex, tickers: await fetchAllUSDTTickers(ex) }))
  );

  const tickersByExchange = {};
  tickerResults.forEach(r => {
    if (r.status === 'fulfilled') {
      tickersByExchange[r.value.exchange] = r.value.tickers;
    }
  });

  // All symbols that appear on at least 2 exchanges
  const symbolSets = allExchanges.map(ex => new Set(Object.keys(tickersByExchange[ex] ?? {})));
  const allSymbols  = [...new Set(symbolSets.flatMap(s => [...s]))];

  // Only symbols that appear on at least one buy AND one sell exchange
  const candidateSymbols = allSymbols.filter(sym => {
    const onBuy  = validBuy.some(ex  => tickersByExchange[ex]?.[sym]);
    const onSell = validSell.some(ex => tickersByExchange[ex]?.[sym]);
    return onBuy && onSell;
  });

  console.log(`[Scanner] Cross-exchange candidate symbols: ${candidateSymbols.length}`);

  // ── Step 3: Find opportunities across ALL candidate symbols ───────────────
  const opportunities = [];
  const rejectLog = { noTicker: 0, noSpread: 0, failedFees: 0, failedVolume: 0, passed: 0 };
  let oppSeq = 0;

  // Pre-compute common chains for each exchange pair (not per symbol)
  const chainCache = {};
  for (const buyEx of validBuy) {
    for (const sellEx of validSell) {
      if (buyEx === sellEx) continue;
      const key = `${buyEx}|${sellEx}`;
      const buyNets  = networksMap[buyEx]  ?? EXCHANGE_NETWORKS_STATIC[buyEx]  ?? [];
      const sellNets = networksMap[sellEx] ?? EXCHANGE_NETWORKS_STATIC[sellEx] ?? [];
      const common   = getCommonNetworks(buyNets, sellNets);
      const best     = selectBestNetwork(common) ?? 'TRC20';
      chainCache[key] = { commonChains: common, bestChain: best, chainCompatible: common.length > 0 };
    }
  }

  pruneRegistry();

  for (const symbol of candidateSymbols) {
    for (const buyExchange of validBuy) {
      for (const sellExchange of validSell) {
        if (buyExchange === sellExchange) continue;

        const buyTicker  = tickersByExchange[buyExchange]?.[symbol];
        const sellTicker = tickersByExchange[sellExchange]?.[symbol];

        if (!buyTicker || !sellTicker) { rejectLog.noTicker++; continue; }

        const buyPrice  = buyTicker.last;
        const sellPrice = sellTicker.last;

        if (!buyPrice || !sellPrice || buyPrice <= 0 || sellPrice <= 0) {
          rejectLog.noTicker++; continue;
        }

        // Only where sell price > buy price (there is a gross spread)
        if (sellPrice <= buyPrice) { rejectLog.noSpread++; continue; }

        // ── Fees ─────────────────────────────────────────────────────────────
        const buyFeePct  = TAKER_FEES[buyExchange]  ?? 0.20;
        const sellFeePct = TAKER_FEES[sellExchange] ?? 0.20;

        const chainInfo       = chainCache[`${buyExchange}|${sellExchange}`];
        const { commonChains, bestChain, chainCompatible } = chainInfo;
        const withdrawalFeeUSD = WITHDRAWAL_FEES_USD[bestChain] ?? 1.00;

        // Profit on $1000 notional
        const notional      = 1000;
        const buyFeeAmt     = notional * (buyFeePct / 100);
        const coinsReceived = (notional - buyFeeAmt) / buyPrice;
        const grossSale     = coinsReceived * sellPrice;
        const sellFeeAmt    = grossSale * (sellFeePct / 100);
        const netAfterSell  = grossSale - sellFeeAmt;
        const netAfterWD    = netAfterSell - withdrawalFeeUSD;
        const netProfitPct  = ((netAfterWD - notional) / notional) * 100;
        const profitPct     = ((sellPrice - buyPrice) / buyPrice) * 100;

        // Profit filter
        if (netProfitPct < minProfitPct || netProfitPct > maxProfitPct) {
          rejectLog.failedFees++; continue;
        }

        // ── Volume filter ─────────────────────────────────────────────────────
        const buyVol24hLow  = (buyTicker.quoteVolume  ?? 0) * 0.65;
        const sellVol24hLow = (sellTicker.quoteVolume ?? 0) * 0.65;
        const vol24hLow     = Math.min(buyVol24hLow, sellVol24hLow);

        if (minVolume24hLow > 0 && vol24hLow < minVolume24hLow) {
          rejectLog.failedVolume++; continue;
        }

        rejectLog.passed++;

        // ── Opportunity timing — persistent across scans ──────────────────────
        const registryKey = `${symbol}|${buyExchange}|${sellExchange}`;
        const existing    = opportunityRegistry.get(registryKey);
        const firstSeenAt = existing ? existing.firstSeenAt : now;

        // Update registry — keep firstSeenAt, update lastSeenAt
        opportunityRegistry.set(registryKey, { firstSeenAt, lastSeenAt: now });

        opportunities.push({
          id:               `opp-${now}-${oppSeq++}`,
          pair:             symbol,
          baseToken:        symbol.split('/')[0],
          buyExchange,
          sellExchange,
          buyPrice:         parseFloat(buyPrice.toFixed(8)),
          sellPrice:        parseFloat(sellPrice.toFixed(8)),
          buyAsk:           parseFloat((buyTicker.ask ?? buyPrice * 1.0005).toFixed(8)),
          sellBid:          parseFloat((sellTicker.bid ?? sellPrice * 0.9995).toFixed(8)),
          buyFee:           buyFeePct,
          sellFee:          sellFeePct,
          withdrawalFeeUSD: parseFloat(withdrawalFeeUSD.toFixed(2)),
          profitBeforeFees: parseFloat(profitPct.toFixed(4)),
          netProfit:        parseFloat(netProfitPct.toFixed(4)),
          netProfitPct:     parseFloat(netProfitPct.toFixed(4)),
          withdrawalEnabled: true,
          depositEnabled:    true,
          chain:             chainCompatible ? bestChain : '—',
          chainCompatible,
          commonChains,
          buyVolume24hLow:  Math.round(buyVol24hLow),
          sellVolume24hLow: Math.round(sellVol24hLow),
          volume24hLow:     Math.round(vol24hLow),
          firstSeenAt,       // persistent — never changes once set
          discoveredAt:     firstSeenAt,
          executing:        false,
        });
      }
    }
  }

  // Sort by net profit descending
  opportunities.sort((a, b) => b.netProfitPct - a.netProfitPct);

  const total    = opportunities.length;
  const returned = Math.min(total, 200); // return up to 200 opportunities

  console.log(`[Scanner] Symbols scanned: ${candidateSymbols.length} | Opportunities: ${total} | Returned: ${returned}`);
  console.log(`[Scanner] passed: ${rejectLog.passed} | noTicker: ${rejectLog.noTicker} | noSpread: ${rejectLog.noSpread} | failedFees: ${rejectLog.failedFees} | failedVol: ${rejectLog.failedVolume}`);

  return res.json({
    opportunities:      opportunities.slice(0, returned),
    scannedAt:          now,
    pairsScanned:       candidateSymbols.length,
    exchangesScanned:   allExchanges.length,
    opportunitiesFound: total,
    registrySize:       opportunityRegistry.size,
    debug: {
      connectedExchanges,
      validBuy,
      validSell,
      rejectLog,
      tickerCounts: Object.fromEntries(
        Object.entries(tickersByExchange).map(([ex, t]) => [ex, Object.keys(t).length])
      ),
    },
  });
});

// ─── GET /api/scanner/debug ───────────────────────────────────────────────────
scannerRouter.get('/debug', async (req, res) => {
  const connectedExchanges = keyStore.getConnectedExchanges();
  if (connectedExchanges.length === 0) return res.json({ error: 'No exchanges connected' });

  const debugPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];
  const result = {};

  await Promise.allSettled(
    connectedExchanges.map(async exchange => {
      const ex = getExchangeInstance(exchange);
      if (!ex) return;
      await ex.loadMarkets();
      result[exchange] = {};
      await Promise.allSettled(
        debugPairs.map(async pair => {
          try {
            const t = await ex.fetchTicker(pair);
            if (t) result[exchange][pair] = { last: t.last, bid: t.bid, ask: t.ask, vol: t.quoteVolume };
          } catch (_) {}
        })
      );
    })
  );

  const comparison = {};
  for (const pair of debugPairs) {
    comparison[pair] = {};
    for (const ex of connectedExchanges) {
      if (result[ex]?.[pair]) comparison[pair][ex] = result[ex][pair].last;
    }
  }

  return res.json({
    raw: result, comparison, connectedExchanges,
    registrySize: opportunityRegistry.size,
    tickerCacheSizes: Object.fromEntries(
      connectedExchanges.map(ex => [ex, Object.keys(tickerCache.get(ex)?.tickers ?? {}).length])
    ),
    timestamp: new Date().toISOString(),
  });
});
