/**
 * Scanner Routes — Real-time arbitrage opportunity scanning
 *
 * POST /api/scanner/scan   — Run a full scan across all tickers on selected exchanges
 * GET  /api/scanner/debug  — Show raw ticker data for diagnostics
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import { getExchangeInstance, fetchWithdrawalFee } from '../exchanges/connector.js';
import {
  normaliseNetwork,
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

// ─── Withdrawal fees by canonical network (USD) ───────────────────────────────
// Used as fallback when exchange doesn't return live fee data
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
  FANTOM:   0.50,
  CELO:     0.10,
  NEAR:     0.10,
  SUI:      0.10,
  APT:      0.10,
};

// ─── Opportunity persistence — tracks firstSeenAt across scans ────────────────
// Key: `${pair}|${buyExchange}|${sellExchange}`
const opportunityRegistry = new Map();
const REGISTRY_TTL        = 60 * 60 * 1000; // prune after 1 hour

// ─── Ticker cache — per exchange ──────────────────────────────────────────────
const tickerCache = new Map();
const TICKER_TTL  = 10 * 1000; // 10 seconds

// ─── Coin network cache — per exchange, per coin ──────────────────────────────
// Key: `${exchange}|${coin}` (e.g. "Binance|VANRY")
// Value: { networks: [{network, rawNetwork, withdrawEnabled, depositEnabled, fee}], fetchedAt }
const coinNetworkCache = new Map();
const COIN_NETWORK_TTL = 20 * 60 * 1000; // 20 minutes

// ─── Currencies cache — full fetchCurrencies() per exchange ───────────────────
const currenciesCache = new Map();
const CURRENCIES_TTL  = 20 * 60 * 1000; // 20 minutes

// ─── Prune stale registry entries ─────────────────────────────────────────────
function pruneRegistry() {
  const cutoff = Date.now() - REGISTRY_TTL;
  for (const [key, entry] of opportunityRegistry.entries()) {
    if (entry.lastSeenAt < cutoff) opportunityRegistry.delete(key);
  }
}

// ─── Fetch and cache full currencies for one exchange ─────────────────────────
async function getExchangeCurrencies(exchange) {
  const cached = currenciesCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < CURRENCIES_TTL) {
    return cached.currencies;
  }
  try {
    const ex = getExchangeInstance(exchange);
    if (!ex) return null;
    const currencies = await ex.fetchCurrencies();
    currenciesCache.set(exchange, { currencies, fetchedAt: Date.now() });
    return currencies;
  } catch (err) {
    console.warn(`[Scanner] fetchCurrencies failed for ${exchange}: ${err.message}`);
    return null;
  }
}

// ─── Get networks for a specific coin on an exchange ──────────────────────────
// Returns array of { network (canonical), rawNetwork, withdrawEnabled, depositEnabled, fee }
// Returns null if coin not found or network info unavailable
async function getCoinNetworks(exchange, coin) {
  const cacheKey = `${exchange}|${coin}`;
  const cached   = coinNetworkCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < COIN_NETWORK_TTL) {
    return cached.networks;
  }

  try {
    const currencies = await getExchangeCurrencies(exchange);
    if (!currencies) return null;

    // Try exact match first, then case-insensitive
    const coinInfo = currencies[coin] ?? currencies[coin.toUpperCase()] ?? currencies[coin.toLowerCase()];
    if (!coinInfo) return null;

    const rawNetworks = coinInfo.networks ?? coinInfo.info?.networks ?? {};
    if (!rawNetworks || Object.keys(rawNetworks).length === 0) return null;

    const networks = [];
    for (const [rawId, info] of Object.entries(rawNetworks)) {
      const canonical = normaliseNetwork(rawId);
      if (!canonical) continue; // unknown network — skip

      // Determine enabled status — check multiple possible fields
      const withdrawEnabled =
        info.withdraw !== false &&
        info.withdrawEnabled !== false &&
        info.active   !== false &&
        info.withdrawStatus !== 0 &&
        info.status   !== 'suspend';

      const depositEnabled =
        info.deposit  !== false &&
        info.depositEnabled !== false &&
        info.active   !== false &&
        info.depositStatus  !== 0 &&
        info.status   !== 'suspend';

      // Fee — from exchange data or fallback
      const fee = info.fee ?? info.withdrawFee ?? info.withdraw_fee ?? WITHDRAWAL_FEES_USD[canonical] ?? 1.0;

      networks.push({
        network:         canonical,
        rawNetwork:      rawId,
        withdrawEnabled,
        depositEnabled,
        fee:             parseFloat(fee),
      });
    }

    // Cache result (even if empty array)
    coinNetworkCache.set(cacheKey, { networks, fetchedAt: Date.now() });
    return networks;

  } catch (err) {
    console.warn(`[Scanner] getCoinNetworks failed ${exchange}|${coin}: ${err.message}`);
    return null;
  }
}

// ─── Validate chain compatibility for a specific coin across two exchanges ─────
// Returns:
//   { compatible: false } if no common chain exists or withdrawal/deposit blocked
//   { compatible: true, commonChains, bestChain, withdrawalEnabled, depositEnabled,
//     withdrawalFeeUSD, bestChainWithdrawEnabled, bestChainDepositEnabled }
async function validateCoinChains(coin, buyExchange, sellExchange) {
  const [buyNetworks, sellNetworks] = await Promise.all([
    getCoinNetworks(buyExchange, coin),
    getCoinNetworks(sellExchange, coin),
  ]);

  // If either exchange has no network info for this coin, not compatible
  if (!buyNetworks || buyNetworks.length === 0) return { compatible: false, reason: `${buyExchange} has no network data for ${coin}` };
  if (!sellNetworks || sellNetworks.length === 0) return { compatible: false, reason: `${sellExchange} has no network data for ${coin}` };

  // Build canonical network sets
  const buyCanonical  = buyNetworks.map(n => n.network);
  const sellCanonical = sellNetworks.map(n => n.network);

  // Find common networks
  const commonChains = getCommonNetworks(buyCanonical, sellCanonical);
  if (commonChains.length === 0) {
    return {
      compatible: false,
      reason: `No common network: ${buyExchange} supports [${buyCanonical.join(',')}] — ${sellExchange} supports [${sellCanonical.join(',')}]`,
    };
  }

  // For each common chain, check withdrawal on buy AND deposit on sell
  // Build list of viable chains (both enabled)
  const viableChains = [];
  for (const chain of commonChains) {
    const buyNet  = buyNetworks.find(n => n.network === chain);
    const sellNet = sellNetworks.find(n => n.network === chain);
    if (!buyNet || !sellNet) continue;
    if (buyNet.withdrawEnabled && sellNet.depositEnabled) {
      viableChains.push({
        chain,
        fee:             buyNet.fee,
        withdrawEnabled: buyNet.withdrawEnabled,
        depositEnabled:  sellNet.depositEnabled,
      });
    }
  }

  // If no viable chain (all blocked), still show as compatible but
  // withdrawalEnabled/depositEnabled = false
  const bestViable = selectBestNetwork(viableChains.map(v => v.chain));

  if (viableChains.length === 0) {
    // Common chains exist but ALL are suspended for withdrawal or deposit
    // — not a viable opportunity, return incompatible
    return {
      compatible: false,
      reason:     `Common chains exist [${commonChains.join(', ')}] but all are suspended for withdrawal/deposit on ${buyExchange} or deposit on ${sellExchange}`,
    };
  }

  // Best viable chain info
  const bestViableInfo = viableChains.find(v => v.chain === bestViable) ?? viableChains[0];

  // ── Real withdrawal fee from exchange API ───────────────────────────────────
  // The fee stored in bestViableInfo.fee is from getCoinNetworks() which reads
  // info.fee from the exchange currencies endpoint. This fee is in COIN UNITS
  // (e.g. 0.35 MBOX, not $0.006). We store it as-is here and convert to USD
  // in the scan loop where we have the coin's current price available.
  const rawFeeInCoin  = bestViableInfo.fee;  // coin-denominated, from exchange API
  const rawFeeNetwork = bestViableInfo.chain;

  return {
    compatible:         true,
    commonChains,
    viableChains:       viableChains.map(v => v.chain),
    viableChainDetails: viableChains,         // full details including per-chain fees
    bestChain:          bestViableInfo.chain,
    withdrawalEnabled:  true,
    depositEnabled:     true,
    // Raw fee in coin units (needs × coinPrice to get USD)
    rawFeeInCoin,
    rawFeeNetwork,
    // fallback USD fee from static table (used if coin price unavailable)
    withdrawalFeeUSD_fallback: WITHDRAWAL_FEES_USD[bestViableInfo.chain] ?? 1.0,
  };
}

// ─── Fetch ALL USDT tickers from one exchange ─────────────────────────────────
async function fetchAllUSDTTickers(exchange) {
  const cached = tickerCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < TICKER_TTL) {
    return cached.tickers;
  }

  const ex = getExchangeInstance(exchange);
  if (!ex) return {};

  try {
    await ex.loadMarkets();

    // Collect ALL active USDT spot pairs
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

    // Try bulk fetch first
    try {
      rawTickers = await ex.fetchTickers(usdtPairs);
      console.log(`[Scanner] ${exchange}: bulk fetch → ${Object.keys(rawTickers).length} tickers`);
    } catch {
      try {
        // Full market fetch then filter
        rawTickers = await ex.fetchTickers();
        const filtered = {};
        for (const sym of usdtPairs) {
          if (rawTickers[sym]) filtered[sym] = rawTickers[sym];
        }
        rawTickers = filtered;
        console.log(`[Scanner] ${exchange}: full market fetch → ${Object.keys(rawTickers).length} USDT tickers`);
      } catch {
        // Last resort — batched individual fetches
        console.log(`[Scanner] ${exchange}: batched individual fetches`);
        const BATCH = 50;
        for (let i = 0; i < usdtPairs.length; i += BATCH) {
          const batch   = usdtPairs.slice(i, i + BATCH);
          const results = await Promise.allSettled(batch.map(p => ex.fetchTicker(p)));
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && r.value) rawTickers[batch[idx]] = r.value;
          });
        }
        console.log(`[Scanner] ${exchange}: batched → ${Object.keys(rawTickers).length} tickers`);
      }
    }

    // Normalise ticker fields
    const out = {};
    for (const [symbol, ticker] of Object.entries(rawTickers)) {
      if (!ticker) continue;

      // Current market price — last traded (same as CMC / CoinGecko)
      let last = ticker.last ?? ticker.close;
      if (!last && ticker.ask && ticker.bid) last = (ticker.ask + ticker.bid) / 2;
      else if (!last && ticker.ask)          last = ticker.ask;
      else if (!last && ticker.bid)          last = ticker.bid;
      if (!last || last <= 0) continue;

      // USD volume — prefer quoteVolume, estimate from baseVolume if missing
      let quoteVolume = ticker.quoteVolume;
      if (!quoteVolume || quoteVolume <= 0) quoteVolume = (ticker.baseVolume ?? 0) * last;

      out[symbol] = {
        last,
        bid:        ticker.bid  ?? last * 0.9995,
        ask:        ticker.ask  ?? last * 1.0005,
        quoteVolume,
        baseVolume: ticker.baseVolume ?? 0,
      };
    }

    tickerCache.set(exchange, { tickers: out, fetchedAt: Date.now() });
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
    minProfitPct    = 0,
    maxProfitPct    = 50,
    minVolume24hLow = 0,
  } = req.body;

  const now = Date.now();

  console.log(`\n[Scanner] ─── New scan ──────────────────────────────────────`);
  console.log(`[Scanner] Buy: [${buyExchanges.join(', ')}]`);
  console.log(`[Scanner] Sell: [${sellExchanges.join(', ')}]`);
  console.log(`[Scanner] minProfit: ${minProfitPct}%  maxProfit: ${maxProfitPct}%  minVol: $${minVolume24hLow}`);

  const connectedExchanges = keyStore.getConnectedExchanges();
  if (connectedExchanges.length === 0) {
    return res.json({
      opportunities: [], scannedAt: now,
      message: 'No exchanges connected. Add API keys via the Connect API panel.',
    });
  }

  const validBuy  = buyExchanges.filter(ex => connectedExchanges.includes(ex));
  const validSell = sellExchanges.filter(ex => connectedExchanges.includes(ex));

  if (validBuy.length === 0 || validSell.length === 0) {
    return res.json({
      opportunities: [], scannedAt: now,
      message: `Selected exchanges not connected. Connected: [${connectedExchanges.join(', ')}]`,
    });
  }

  const allExchanges = [...new Set([...validBuy, ...validSell])];

  // ── Step 1: Pre-fetch all currencies for all exchanges ONCE ──────────────
  // This loads the full coin → network data for all exchanges upfront.
  // getCoinNetworks() will use this cache — no redundant API calls in the loop.
  console.log(`[Scanner] Pre-fetching currencies for: [${allExchanges.join(', ')}]`);
  await Promise.allSettled(allExchanges.map(ex => getExchangeCurrencies(ex)));

  // ── Step 2: Fetch ALL USDT tickers from every exchange concurrently ───────
  console.log(`[Scanner] Fetching ALL USDT tickers from ${allExchanges.length} exchanges...`);
  const tickerResults = await Promise.allSettled(
    allExchanges.map(async ex => ({ exchange: ex, tickers: await fetchAllUSDTTickers(ex) }))
  );

  const tickersByExchange = {};
  tickerResults.forEach(r => {
    if (r.status === 'fulfilled') {
      tickersByExchange[r.value.exchange] = r.value.tickers;
      console.log(`[Scanner] ${r.value.exchange}: ${Object.keys(r.value.tickers).length} tickers loaded`);
    }
  });

  // ── Step 3: Find candidate symbols (on ≥1 buy AND ≥1 sell exchange) ───────
  const allSymbols = [
    ...new Set(allExchanges.flatMap(ex => Object.keys(tickersByExchange[ex] ?? {})))
  ];
  const candidateSymbols = allSymbols.filter(sym => {
    const onBuy  = validBuy.some(ex  => tickersByExchange[ex]?.[sym]);
    const onSell = validSell.some(ex => tickersByExchange[ex]?.[sym]);
    return onBuy && onSell;
  });
  console.log(`[Scanner] Cross-listed candidate symbols: ${candidateSymbols.length}`);

  pruneRegistry();

  // ── Step 4: Evaluate every buy/sell exchange pair for every symbol ─────────
  const opportunities = [];
  const rejectLog     = { noTicker: 0, noSpread: 0, failedFees: 0, failedVolume: 0, noChain: 0, passed: 0 };
  let   oppSeq        = 0;

  // Run all chain validations in parallel (per symbol × exchange pair)
  // Build a flat list of all tasks first
  const tasks = [];
  for (const symbol of candidateSymbols) {
    const coin = symbol.split('/')[0]; // e.g. "VANRY" from "VANRY/USDT"
    for (const buyExchange of validBuy) {
      for (const sellExchange of validSell) {
        if (buyExchange === sellExchange) continue;

        const buyTicker  = tickersByExchange[buyExchange]?.[symbol];
        const sellTicker = tickersByExchange[sellExchange]?.[symbol];
        if (!buyTicker || !sellTicker) { rejectLog.noTicker++; continue; }

        const buyPrice  = buyTicker.last;
        const sellPrice = sellTicker.last;
        if (!buyPrice || !sellPrice || buyPrice <= 0 || sellPrice <= 0) { rejectLog.noTicker++; continue; }
        if (sellPrice <= buyPrice) { rejectLog.noSpread++; continue; }

        tasks.push({ symbol, coin, buyExchange, sellExchange, buyTicker, sellTicker, buyPrice, sellPrice });
      }
    }
  }

  console.log(`[Scanner] Evaluating ${tasks.length} spread candidates with chain validation...`);

  // Run chain validation in parallel batches (avoid rate limiting)
  const CHAIN_BATCH = 20;
  for (let i = 0; i < tasks.length; i += CHAIN_BATCH) {
    const batch = tasks.slice(i, i + CHAIN_BATCH);

    const results = await Promise.allSettled(
      batch.map(async task => {
        const chainInfo = await validateCoinChains(task.coin, task.buyExchange, task.sellExchange);
        return { ...task, chainInfo };
      })
    );

    for (const result of results) {
      if (result.status === 'rejected') { rejectLog.noChain++; continue; }

      const { symbol, coin, buyExchange, sellExchange, buyTicker, sellTicker,
              buyPrice, sellPrice, chainInfo } = result.value;

      // ── Hard chain/W/D filters — ALL three must pass ───────────────────────
      // Filter 1: exchanges must share at least one common network for this coin
      if (!chainInfo.compatible) {
        rejectLog.noChain++;
        continue;
      }

      // Filter 2: withdrawal must be enabled on buy exchange for this coin
      if (!chainInfo.withdrawalEnabled) {
        rejectLog.noChain++;
        continue;
      }

      // Filter 3: deposit must be enabled on sell exchange for this coin
      if (!chainInfo.depositEnabled) {
        rejectLog.noChain++;
        continue;
      }

      // Filter 4: there must be at least one viable chain (W/D both enabled)
      if (!chainInfo.viableChains || chainInfo.viableChains.length === 0) {
        rejectLog.noChain++;
        continue;
      }

      // ── Fees ───────────────────────────────────────────────────────────────
      const buyFeePct  = TAKER_FEES[buyExchange]  ?? 0.20;
      const sellFeePct = TAKER_FEES[sellExchange] ?? 0.20;

      // ── Real withdrawal fee — coin-denominated → USD conversion ────────────
      // chainInfo.rawFeeInCoin is the fee in coin units from the exchange API
      // e.g. 0.35 MBOX. We convert to USD using the coin's current buy price.
      // If rawFeeInCoin is very large (> 100) it was likely already in USDT.
      let withdrawalFeeUSD;
      let withdrawalFeeInCoin = null;
      let withdrawalFeeSource = 'fallback';

      if (chainInfo.rawFeeInCoin !== null && chainInfo.rawFeeInCoin !== undefined) {
        const rawFee = parseFloat(chainInfo.rawFeeInCoin);
        if (!isNaN(rawFee) && rawFee > 0) {
          if (rawFee > 100) {
            // Likely already USD-denominated (e.g. a stablecoin pair)
            withdrawalFeeUSD    = rawFee;
            withdrawalFeeInCoin = rawFee;
            withdrawalFeeSource = 'live';
          } else {
            // Convert coin units → USD using current buy price
            const feeUSD = rawFee * buyPrice;
            withdrawalFeeUSD    = feeUSD;
            withdrawalFeeInCoin = rawFee;
            withdrawalFeeSource = 'live';
          }
        } else {
          // rawFeeInCoin is 0 or invalid — use static fallback
          withdrawalFeeUSD    = WITHDRAWAL_FEES_USD[chainInfo.bestChain] ?? 1.0;
          withdrawalFeeSource = 'fallback';
        }
      } else {
        // No fee data from exchange — use static fallback
        withdrawalFeeUSD    = WITHDRAWAL_FEES_USD[chainInfo.bestChain] ?? 1.0;
        withdrawalFeeSource = 'fallback';
      }

      // Safety cap: fee should not exceed 20% of a $1000 trade
      if (withdrawalFeeUSD > 200) withdrawalFeeUSD = WITHDRAWAL_FEES_USD[chainInfo.bestChain] ?? 1.0;

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

      // Volume filter
      const buyVol24hLow  = (buyTicker.quoteVolume  ?? 0) * 0.65;
      const sellVol24hLow = (sellTicker.quoteVolume ?? 0) * 0.65;
      const vol24hLow     = Math.min(buyVol24hLow, sellVol24hLow);
      if (minVolume24hLow > 0 && vol24hLow < minVolume24hLow) {
        rejectLog.failedVolume++; continue;
      }

      rejectLog.passed++;

      // ── Opportunity timing ─────────────────────────────────────────────────
      const registryKey = `${symbol}|${buyExchange}|${sellExchange}`;
      const existing    = opportunityRegistry.get(registryKey);
      const firstSeenAt = existing ? existing.firstSeenAt : now;
      opportunityRegistry.set(registryKey, { firstSeenAt, lastSeenAt: now });

      opportunities.push({
        id:               `opp-${now}-${oppSeq++}`,
        pair:             symbol,
        baseToken:        coin,
        buyExchange,
        sellExchange,
        // Current market prices (last traded — what CMC/CoinGecko shows)
        buyPrice:         parseFloat(buyPrice.toFixed(8)),
        sellPrice:        parseFloat(sellPrice.toFixed(8)),
        // Execution prices (what market orders actually fill at)
        buyAsk:           parseFloat((buyTicker.ask ?? buyPrice * 1.0005).toFixed(8)),
        sellBid:          parseFloat((sellTicker.bid ?? sellPrice * 0.9995).toFixed(8)),
        buyFee:              buyFeePct,
        sellFee:             sellFeePct,
        withdrawalFeeUSD:    parseFloat(withdrawalFeeUSD.toFixed(6)),
        withdrawalFeeInCoin: withdrawalFeeInCoin !== null
          ? parseFloat(withdrawalFeeInCoin.toFixed(8)) : null,
        withdrawalFeeSource, // 'live' | 'fallback'
        profitBeforeFees: parseFloat(profitPct.toFixed(4)),
        netProfit:        parseFloat(netProfitPct.toFixed(4)),
        netProfitPct:     parseFloat(netProfitPct.toFixed(4)),
        // REAL withdrawal/deposit status from coin's actual networks
        withdrawalEnabled: chainInfo.compatible ? (chainInfo.withdrawalEnabled ?? false) : false,
        depositEnabled:    chainInfo.compatible ? (chainInfo.depositEnabled    ?? false) : false,
        // REAL chain compatibility for this specific coin
        chain:             chainInfo.compatible ? (chainInfo.bestChain ?? '—') : '—',
        chainCompatible:   chainInfo.compatible ?? false,
        commonChains:      chainInfo.commonChains  ?? [],
        viableChains:      chainInfo.viableChains  ?? [],
        buyVolume24hLow:   Math.round(buyVol24hLow),
        sellVolume24hLow:  Math.round(sellVol24hLow),
        volume24hLow:      Math.round(vol24hLow),
        firstSeenAt,
        discoveredAt:      firstSeenAt,
        executing:         false,
      });
    }
  }

  // Sort by net profit descending
  opportunities.sort((a, b) => b.netProfitPct - a.netProfitPct);

  const returned = Math.min(opportunities.length, 200);
  console.log(`[Scanner] ── Results ──────────────────────────────────────────`);
  console.log(`[Scanner]   passed        : ${rejectLog.passed}`);
  console.log(`[Scanner]   no ticker     : ${rejectLog.noTicker}`);
  console.log(`[Scanner]   no spread     : ${rejectLog.noSpread}  (sellPrice <= buyPrice)`);
  console.log(`[Scanner]   failed fees   : ${rejectLog.failedFees}  (net profit outside min/max)`);
  console.log(`[Scanner]   failed volume : ${rejectLog.failedVolume}  (below minVolume24hLow)`);
  console.log(`[Scanner]   failed chain  : ${rejectLog.noChain}  (no common chain OR withdrawal/deposit suspended)`);
  console.log(`[Scanner] ─────────────────────────────────────────────────────`);
  console.log(`[Scanner] Returning ${returned} of ${opportunities.length} opportunities`);

  return res.json({
    opportunities:      opportunities.slice(0, returned),
    scannedAt:          now,
    pairsScanned:       candidateSymbols.length,
    exchangesScanned:   allExchanges.length,
    opportunitiesFound: opportunities.length,
    registrySize:       opportunityRegistry.size,
    debug: {
      tickerCounts: Object.fromEntries(
        Object.entries(tickersByExchange).map(([ex, t]) => [ex, Object.keys(t).length])
      ),
      rejectLog,
    },
  });
});

// ─── GET /api/scanner/debug ───────────────────────────────────────────────────
scannerRouter.get('/debug', async (req, res) => {
  const connectedExchanges = keyStore.getConnectedExchanges();
  if (connectedExchanges.length === 0) return res.json({ error: 'No exchanges connected' });

  const debugPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];
  const result     = {};

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
    raw: result,
    comparison,
    connectedExchanges,
    registrySize:     opportunityRegistry.size,
    tickerCacheSizes: Object.fromEntries(
      connectedExchanges.map(ex => [ex, Object.keys(tickerCache.get(ex)?.tickers ?? {}).length])
    ),
    timestamp: new Date().toISOString(),
  });
});

// ─── GET /api/scanner/coin-networks ───────────────────────────────────────────
// Debug endpoint: check what networks a specific coin has on each exchange
// Usage: GET /api/scanner/coin-networks?coin=VANRY
scannerRouter.get('/coin-networks', async (req, res) => {
  const { coin } = req.query;
  if (!coin) return res.status(400).json({ error: 'coin query param required' });

  const connectedExchanges = keyStore.getConnectedExchanges();
  if (connectedExchanges.length === 0) return res.json({ error: 'No exchanges connected' });

  const result = {};
  await Promise.allSettled(
    connectedExchanges.map(async exchange => {
      result[exchange] = await getCoinNetworks(exchange, coin.toUpperCase());
    })
  );

  return res.json({ coin: coin.toUpperCase(), networks: result, timestamp: new Date().toISOString() });
});
