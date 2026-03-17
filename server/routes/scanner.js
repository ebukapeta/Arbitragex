/**
 * Scanner Routes — Real-time arbitrage opportunity scanning
 *
 * POST /api/scanner/scan   — Run a scan across selected exchanges
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

// ─── Static USDT networks per exchange (canonical) ────────────────────────────
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

// Network cache — refreshed every 10 minutes
const networkCache = new Map();
const NETWORK_CACHE_TTL = 10 * 60 * 1000;

// ─── Common pairs to scan ─────────────────────────────────────────────────────
const SCAN_PAIRS = [
  'BTC/USDT',  'ETH/USDT',  'BNB/USDT',  'SOL/USDT',  'XRP/USDT',
  'ADA/USDT',  'AVAX/USDT', 'DOGE/USDT', 'MATIC/USDT','DOT/USDT',
  'LINK/USDT', 'LTC/USDT',  'UNI/USDT',  'ATOM/USDT', 'TRX/USDT',
  'NEAR/USDT', 'APT/USDT',  'OP/USDT',   'ARB/USDT',  'FTM/USDT',
  'SHIB/USDT', 'PEPE/USDT', 'INJ/USDT',  'SUI/USDT',  'TIA/USDT',
  'WIF/USDT',  'BONK/USDT', 'JUP/USDT',  'SEI/USDT',  'STX/USDT',
  'RENDER/USDT','FET/USDT', 'IMX/USDT',  'GALA/USDT', 'SAND/USDT',
  'MANA/USDT', 'AXS/USDT',  'CHZ/USDT',  'ENS/USDT',  'LDO/USDT',
];

// ─── Pre-fetch networks for all exchanges (once per scan, not per opportunity) ─
async function getExchangeNetworks(exchange) {
  const cached = networkCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < NETWORK_CACHE_TTL) {
    return cached.networks;
  }

  try {
    const ex = getExchangeInstance(exchange);
    if (ex) {
      const currencies = await ex.fetchCurrencies();
      const usdt = currencies?.USDT ?? currencies?.usdt;
      if (usdt?.networks) {
        const rawIds = Object.keys(usdt.networks);
        const canonical = normaliseNetworks(rawIds);
        if (canonical.length > 0) {
          networkCache.set(exchange, { networks: canonical, fetchedAt: Date.now() });
          console.log(`[Scanner] ${exchange} USDT networks (live): ${canonical.join(', ')}`);
          return canonical;
        }
      }
    }
  } catch (err) {
    console.log(`[Scanner] ${exchange} fetchCurrencies failed (${err.message}) — using static fallback`);
  }

  const fallback = normaliseNetworks(EXCHANGE_NETWORKS_STATIC[exchange] ?? []);
  networkCache.set(exchange, { networks: fallback, fetchedAt: Date.now() });
  return fallback;
}

// ─── Fetch tickers from one exchange ─────────────────────────────────────────
async function fetchTickersForExchange(exchange, pairs) {
  const ex = getExchangeInstance(exchange);
  if (!ex) {
    console.log(`[Scanner] No instance for ${exchange} — not connected?`);
    return {};
  }

  try {
    await ex.loadMarkets();

    // Filter to pairs this exchange actually lists
    const availablePairs = pairs.filter(p => ex.markets?.[p]);
    console.log(`[Scanner] ${exchange}: ${availablePairs.length}/${pairs.length} pairs available`);

    if (availablePairs.length === 0) return {};

    let tickers = {};

    // Try bulk fetch first
    try {
      tickers = await ex.fetchTickers(availablePairs);
      console.log(`[Scanner] ${exchange}: bulk fetchTickers OK — got ${Object.keys(tickers).length} tickers`);
    } catch (bulkErr) {
      console.log(`[Scanner] ${exchange}: bulk fetchTickers failed (${bulkErr.message}) — falling back to individual`);
      // Individual fetches with concurrency limit
      const results = await Promise.allSettled(
        availablePairs.map(pair => ex.fetchTicker(pair))
      );
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          tickers[availablePairs[i]] = r.value;
        }
      });
      console.log(`[Scanner] ${exchange}: individual fetches got ${Object.keys(tickers).length} tickers`);
    }

    const out = {};
    let missingLast = 0;

    for (const [symbol, ticker] of Object.entries(tickers)) {
      if (!ticker) continue;

      // Current market price — use last traded price (same as CoinMarketCap/CoinGecko)
      // Fallback chain: last → close → midpoint of ask+bid → ask → bid
      let last = ticker.last ?? ticker.close;

      // If last is missing, derive from bid/ask midpoint
      if (!last && ticker.ask && ticker.bid) {
        last = (ticker.ask + ticker.bid) / 2;
        missingLast++;
      } else if (!last && ticker.ask) {
        last = ticker.ask;
        missingLast++;
      } else if (!last && ticker.bid) {
        last = ticker.bid;
        missingLast++;
      }

      if (!last || last <= 0) continue;

      // Volume — quoteVolume is USD value traded, baseVolume is coin amount
      // quoteVolume is preferred (USD). Some exchanges only report baseVolume.
      // If quoteVolume is 0 or missing, estimate from baseVolume × last price.
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

    if (missingLast > 0) {
      console.log(`[Scanner] ${exchange}: ${missingLast} pairs had no 'last' price — derived from bid/ask`);
    }

    return out;
  } catch (err) {
    console.error(`[Scanner] ${exchange} fetch error: ${err.message}`);
    return {};
  }
}

// ─── POST /api/scanner/scan ───────────────────────────────────────────────────
scannerRouter.post('/scan', async (req, res) => {
  const {
    buyExchanges    = [],
    sellExchanges   = [],
    minProfitPct    = 0,        // Default 0% — show everything including negative
    maxProfitPct    = 50,       // Default 50% — allow wide range
    minVolume24hLow = 0,        // Default 0 — no volume filter initially
  } = req.body;

  console.log(`\n[Scanner] ─── New scan ───────────────────────────────────────`);
  console.log(`[Scanner] Buy: [${buyExchanges.join(', ')}]`);
  console.log(`[Scanner] Sell: [${sellExchanges.join(', ')}]`);
  console.log(`[Scanner] minProfit: ${minProfitPct}%  maxProfit: ${maxProfitPct}%  minVol: $${minVolume24hLow}`);

  const connectedExchanges = keyStore.getConnectedExchanges();
  console.log(`[Scanner] Connected exchanges: [${connectedExchanges.join(', ')}]`);

  if (connectedExchanges.length === 0) {
    return res.json({
      opportunities: [],
      scannedAt:     Date.now(),
      message:       'No exchanges connected. Add API keys via the Connect API panel.',
      connectedExchanges: [],
    });
  }

  // Only scan exchanges that are both selected AND connected
  const validBuyExchanges  = buyExchanges.filter(ex => connectedExchanges.includes(ex));
  const validSellExchanges = sellExchanges.filter(ex => connectedExchanges.includes(ex));

  console.log(`[Scanner] Valid buy exchanges:  [${validBuyExchanges.join(', ')}]`);
  console.log(`[Scanner] Valid sell exchanges: [${validSellExchanges.join(', ')}]`);

  if (validBuyExchanges.length === 0 || validSellExchanges.length === 0) {
    return res.json({
      opportunities: [],
      scannedAt:     Date.now(),
      message:       `Selected exchanges not connected. Connected: [${connectedExchanges.join(', ')}]`,
      connectedExchanges,
    });
  }

  // All unique exchanges needed
  const allExchanges = [...new Set([...validBuyExchanges, ...validSellExchanges])];

  // ── Step 1: Pre-fetch all networks (once per exchange, not per opportunity) ──
  console.log(`[Scanner] Pre-fetching networks for: [${allExchanges.join(', ')}]`);
  const networksMap = {};
  await Promise.allSettled(
    allExchanges.map(async (ex) => {
      networksMap[ex] = await getExchangeNetworks(ex);
    })
  );

  // ── Step 2: Fetch tickers from all exchanges concurrently ──────────────────
  console.log(`[Scanner] Fetching tickers from ${allExchanges.length} exchanges...`);
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
      console.log(`[Scanner] ${r.value.exchange}: ${Object.keys(r.value.tickers).length} tickers loaded`);
    } else {
      console.error(`[Scanner] Ticker fetch failed:`, r.reason?.message);
    }
  });

  // ── Step 3: Find opportunities ─────────────────────────────────────────────
  const opportunities = [];
  const rejectLog = { noTicker: 0, noSpread: 0, failedFees: 0, failedVolume: 0, failedChain: 0, passed: 0 };
  let oppId = Date.now();

  for (const pair of SCAN_PAIRS) {
    for (const buyExchange of validBuyExchanges) {
      for (const sellExchange of validSellExchanges) {
        if (buyExchange === sellExchange) continue;

        const buyTicker  = tickersByExchange[buyExchange]?.[pair];
        const sellTicker = tickersByExchange[sellExchange]?.[pair];

        // Skip if either exchange doesn't have this pair
        if (!buyTicker || !sellTicker) {
          rejectLog.noTicker++;
          continue;
        }

        const buyPrice  = buyTicker.last;
        const sellPrice = sellTicker.last;

        if (!buyPrice || !sellPrice || buyPrice <= 0 || sellPrice <= 0) {
          rejectLog.noTicker++;
          continue;
        }

        // ── Gross spread — current market price difference ─────────────────
        const profitBeforeFeesPct = ((sellPrice - buyPrice) / buyPrice) * 100;

        // Keep ALL pairs where sell > buy (including tiny spreads)
        // Only filter if sell price is genuinely higher
        if (sellPrice <= buyPrice) {
          rejectLog.noSpread++;
          continue;
        }

        // ── Fee calculations ───────────────────────────────────────────────
        const buyFeePct  = TAKER_FEES[buyExchange]  ?? 0.20;
        const sellFeePct = TAKER_FEES[sellExchange] ?? 0.20;

        // Use pre-fetched networks (no await needed — already loaded)
        const buyNets  = networksMap[buyExchange]  ?? EXCHANGE_NETWORKS_STATIC[buyExchange] ?? [];
        const sellNets = networksMap[sellExchange] ?? EXCHANGE_NETWORKS_STATIC[sellExchange] ?? [];
        const commonChains   = getCommonNetworks(buyNets, sellNets);
        const chainCompatible = commonChains.length > 0;
        const bestChain = selectBestNetwork(commonChains) ?? 'TRC20';
        const withdrawalFeeUSD = WITHDRAWAL_FEES_USD[bestChain] ?? 1.00;

        // Profit on notional $1000 trade
        const notionalAmount = 1000;
        const buyFeeAmt      = notionalAmount * (buyFeePct / 100);
        const coinsReceived  = (notionalAmount - buyFeeAmt) / buyPrice;
        const grossSaleValue = coinsReceived * sellPrice;
        const sellFeeAmt     = grossSaleValue * (sellFeePct / 100);
        const netAfterSell   = grossSaleValue - sellFeeAmt;
        const netAfterWD     = netAfterSell - withdrawalFeeUSD;
        const netProfitPct   = ((netAfterWD - notionalAmount) / notionalAmount) * 100;

        // Apply profit filter
        if (netProfitPct < minProfitPct) {
          rejectLog.failedFees++;
          continue;
        }
        if (netProfitPct > maxProfitPct) {
          rejectLog.failedFees++;
          continue;
        }

        // ── Volume filter ──────────────────────────────────────────────────
        // quoteVolume = USD value traded in 24h
        // Low 24h vol = ~65% of reported (conservative estimate)
        const buyVolume24hLow  = (buyTicker.quoteVolume  ?? 0) * 0.65;
        const sellVolume24hLow = (sellTicker.quoteVolume ?? 0) * 0.65;
        const volume24hLow     = Math.min(buyVolume24hLow, sellVolume24hLow);

        if (minVolume24hLow > 0 && volume24hLow < minVolume24hLow) {
          rejectLog.failedVolume++;
          continue;
        }

        // ── Withdrawal/deposit status ──────────────────────────────────────
        // Default true — live status checked at execution time
        const withdrawalEnabled = true;
        const depositEnabled    = true;

        rejectLog.passed++;

        opportunities.push({
          id:               `opp-${oppId++}`,
          pair,
          baseToken:        pair.split('/')[0],
          buyExchange,
          sellExchange,
          buyPrice:         parseFloat(buyPrice.toFixed(8)),
          sellPrice:        parseFloat(sellPrice.toFixed(8)),
          buyAsk:           parseFloat((buyTicker.ask ?? buyPrice).toFixed(8)),
          sellBid:          parseFloat((sellTicker.bid ?? sellPrice).toFixed(8)),
          buyFee:           buyFeePct,
          sellFee:          sellFeePct,
          withdrawalFeeUSD: parseFloat(withdrawalFeeUSD.toFixed(2)),
          profitBeforeFees: parseFloat(profitBeforeFeesPct.toFixed(4)),
          netProfit:        parseFloat(netProfitPct.toFixed(4)),
          netProfitPct:     parseFloat(netProfitPct.toFixed(4)),
          withdrawalEnabled,
          depositEnabled,
          chain:            chainCompatible ? bestChain : '—',
          chainCompatible,
          commonChains,
          buyVolume24hLow:  parseFloat(buyVolume24hLow.toFixed(0)),
          sellVolume24hLow: parseFloat(sellVolume24hLow.toFixed(0)),
          volume24hLow:     parseFloat(volume24hLow.toFixed(0)),
          discoveredAt:     Date.now(),
          executing:        false,
        });
      }
    }
  }

  // Sort by net profit descending
  opportunities.sort((a, b) => b.netProfitPct - a.netProfitPct);

  console.log(`[Scanner] Results — passed: ${rejectLog.passed} | no ticker: ${rejectLog.noTicker} | no spread: ${rejectLog.noSpread} | failed fees: ${rejectLog.failedFees} | failed volume: ${rejectLog.failedVolume}`);
  console.log(`[Scanner] Returning ${Math.min(opportunities.length, 50)} of ${opportunities.length} opportunities`);

  return res.json({
    opportunities:      opportunities.slice(0, 50),
    scannedAt:          Date.now(),
    pairsScanned:       SCAN_PAIRS.length,
    exchangesScanned:   allExchanges.length,
    opportunitiesFound: opportunities.length,
    debug: {
      connectedExchanges,
      validBuyExchanges,
      validSellExchanges,
      rejectLog,
      tickerCounts: Object.fromEntries(
        Object.entries(tickersByExchange).map(([ex, t]) => [ex, Object.keys(t).length])
      ),
    },
  });
});

// ─── GET /api/scanner/debug ───────────────────────────────────────────────────
// Shows raw ticker data so you can verify prices are being received correctly
scannerRouter.get('/debug', async (req, res) => {
  const connectedExchanges = keyStore.getConnectedExchanges();

  if (connectedExchanges.length === 0) {
    return res.json({ error: 'No exchanges connected' });
  }

  // Fetch a small set of tickers for quick diagnostics
  const debugPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];
  const result = {};

  await Promise.allSettled(
    connectedExchanges.map(async (exchange) => {
      const tickers = await fetchTickersForExchange(exchange, debugPairs);
      result[exchange] = {};
      for (const pair of debugPairs) {
        const t = tickers[pair];
        if (t) {
          result[exchange][pair] = {
            last:        t.last,
            bid:         t.bid,
            ask:         t.ask,
            quoteVolume: t.quoteVolume,
          };
        }
      }
    })
  );

  // Show cross-exchange comparison
  const comparison = {};
  for (const pair of debugPairs) {
    comparison[pair] = {};
    for (const ex of connectedExchanges) {
      if (result[ex]?.[pair]) {
        comparison[pair][ex] = result[ex][pair].last;
      }
    }
  }

  return res.json({
    raw:        result,
    comparison, // easy to see price differences at a glance
    connectedExchanges,
    timestamp:  new Date().toISOString(),
  });
});
