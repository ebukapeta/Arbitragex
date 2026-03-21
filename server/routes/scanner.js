/**
 * Scanner Routes — Real-time arbitrage opportunity scanning
 *
 * POST /api/scanner/scan   — Run a full scan across all tickers on selected exchanges
 * GET  /api/scanner/debug  — Show raw ticker data for diagnostics
 *
 * KEY DESIGN DECISION:
 *   - Binance, Bybit, MEXC  → require API key for withdrawal/deposit info (no public endpoint)
 *   - HTX, KuCoin, BitMart, Bitget, Gate.io → use PUBLIC endpoints for withdrawal/deposit info
 *   - API keys (when present) are used by the BOT for trade execution only
 *   - The SCANNER never requires API keys for exchanges that have public withdrawal endpoints
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import { getExchangeInstance, getPublicExchangeInstance } from '../exchanges/connector.js';
import {
  normaliseNetwork,
  normaliseNetworks,
  getCommonNetworks,
  selectBestNetwork,
} from '../exchanges/networkNormaliser.js';

export const scannerRouter = Router();

// ─── Which exchanges require API key for withdrawal info ──────────────────────
// All others use public REST endpoints
const REQUIRES_API_KEY_FOR_WITHDRAWAL = new Set(['Binance', 'Bybit', 'MEXC']);

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
const opportunityRegistry = new Map();
const REGISTRY_TTL        = 60 * 60 * 1000; // prune after 1 hour

// ─── Ticker cache — per exchange ──────────────────────────────────────────────
const tickerCache = new Map();
const TICKER_TTL  = 10 * 1000; // 10 seconds

// ─── Coin network cache — per exchange, per coin ──────────────────────────────
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

// ─── Public REST endpoints for network data (no API key needed) ───────────────
// Gate.io: fetch all chains for a coin
const PUBLIC_ENDPOINTS = {
  'Gate.io': async (coin) => {
    try {
      // Gate.io /spot/currencies/{currency} returns a single-chain object.
      // Use /wallet/currency_chains to get ALL chains for a coin.
      const r = await fetch(`https://api.gateio.ws/api/v4/wallet/currency_chains?currency=${coin}`);
      if (!r.ok) {
        // Fallback to single-currency endpoint
        const r2 = await fetch(`https://api.gateio.ws/api/v4/spot/currencies/${coin}`);
        if (!r2.ok) return null;
        const d2 = await r2.json();
        const chainKey = d2.chain || coin;
        return {
          [coin]: {
            networks: {
              [chainKey]: {
                withdraw: !d2.withdraw_disabled,
                deposit:  !d2.deposit_disabled,
                fee:      parseFloat(d2.withdraw_fix_on_chains?.[chainKey] ?? d2.withdraw_fix ?? 0),
              }
            }
          }
        };
      }
      const chains = await r.json();
      if (!Array.isArray(chains) || chains.length === 0) return null;
      const networks = {};
      for (const chain of chains) {
        const chainName = chain.chain || chain.name_cn || coin;
        networks[chainName] = {
          withdraw: chain.is_withdraw_disabled === false || chain.is_withdraw_disabled === 0,
          deposit:  chain.is_deposit_disabled  === false || chain.is_deposit_disabled  === 0,
          fee:      parseFloat(chain.withdraw_fix ?? chain.withdraw_percent_fee ?? 0),
        };
      }
      return { [coin]: { networks } };
    } catch { return null; }
  },

  'HTX': async (coin) => {
    try {
      // api.huobi.pro is the correct public endpoint — NOT api.hbdm.vn (that's derivatives)
      const r = await fetch(`https://api.huobi.pro/v2/reference/currencies?currency=${coin.toLowerCase()}`);
      if (!r.ok) return null;
      const d = await r.json();
      if (!d?.data?.[0]) return null;
      const item = d.data[0];
      const networks = {};
      for (const chain of (item.chains ?? [])) {
        networks[chain.chain] = {
          withdraw: chain.withdrawStatus === 'allowed',
          deposit:  chain.depositStatus  === 'allowed',
          fee:      parseFloat(chain.transactFeeWithdraw ?? chain.minWithdrawAmt ?? 0),
        };
      }
      return { [coin]: { networks } };
    } catch { return null; }
  },

  'KuCoin': async (coin) => {
    try {
      const r = await fetch(`https://api.kucoin.com/api/v2/currencies/${coin}`);
      if (!r.ok) return null;
      const d = await r.json();
      if (!d?.data) return null;
      const networks = {};
      for (const chain of (d.data.chains ?? [])) {
        // KuCoin uses chainName as the network identifier
        const key = chain.chainName || chain.chain || coin;
        networks[key] = {
          withdraw: chain.isWithdrawEnabled === true || chain.isWithdrawEnabled === 'true',
          deposit:  chain.isDepositEnabled  === true || chain.isDepositEnabled  === 'true',
          fee:      parseFloat(chain.withdrawalMinFee ?? chain.withdrawMinSize ?? 0),
        };
      }
      return { [coin]: { networks } };
    } catch { return null; }
  },

  'BitMart': async (coin) => {
    try {
      // BitMart has a per-coin detail endpoint that returns all chains
      const r = await fetch(`https://api-cloud.bitmart.com/account/v1/currencies`);
      if (!r.ok) return null;
      const d = await r.json();
      // Find all entries matching this coin (BitMart may have one entry per chain)
      const items = (d?.data?.currencies ?? []).filter(
        c => (c.currency ?? c.id ?? '').toUpperCase() === coin.toUpperCase()
      );
      if (items.length === 0) return null;
      const networks = {};
      for (const item of items) {
        // Each item may represent a different network/chain
        const network = item.network ?? item.chain ?? item.currency ?? coin;
        networks[network] = {
          withdraw: item.withdraw_enabled === true || item.withdraw_enabled === 1 || item.withdraw_enabled === 'true',
          deposit:  item.deposit_enabled  === true || item.deposit_enabled  === 1 || item.deposit_enabled  === 'true',
          fee:      parseFloat(item.withdraw_minfee ?? item.withdraw_fee ?? 0),
        };
      }
      return { [coin]: { networks } };
    } catch { return null; }
  },

  'Bitget': async (coin) => {
    try {
      const r = await fetch(`https://api.bitget.com/api/v2/spot/public/coins?coin=${coin}`);
      if (!r.ok) return null;
      const d = await r.json();
      const item = d?.data?.[0];
      if (!item) return null;
      const networks = {};
      for (const chain of (item.chains ?? [])) {
        const key = chain.chain || chain.chainName || coin;
        networks[key] = {
          withdraw: chain.withdrawable === 'true' || chain.withdrawable === true,
          deposit:  chain.rechargeable === 'true' || chain.rechargeable === true,
          fee:      parseFloat(chain.withdrawFee ?? chain.extraWithdrawFee ?? 0),
        };
      }
      return { [coin]: { networks } };
    } catch { return null; }
  },
};

// ─── Fetch and cache full currencies for exchanges requiring API key ──────────
// Only used for Binance, Bybit, MEXC where public endpoints don't give withdrawal info
async function getAuthenticatedCurrencies(exchange) {
  if (!REQUIRES_API_KEY_FOR_WITHDRAWAL.has(exchange)) return null;

  const cached = currenciesCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < CURRENCIES_TTL) {
    return cached.currencies;
  }

  try {
    const ex = getExchangeInstance(exchange);
    if (!ex) return null; // No API key configured

    let currencies = null;
    try {
      currencies = await ex.fetchCurrencies();
      console.log(`[Scanner] ${exchange}: fetchCurrencies OK (${Object.keys(currencies ?? {}).length} coins)`);
    } catch (err) {
      console.warn(`[Scanner] ${exchange}: fetchCurrencies failed — ${err.message}`);
      return null;
    }

    if (currencies) {
      currenciesCache.set(exchange, { currencies, fetchedAt: Date.now() });
    }
    return currencies;
  } catch (err) {
    console.warn(`[Scanner] getAuthenticatedCurrencies failed for ${exchange}: ${err.message}`);
    return null;
  }
}

// ─── Fetch network data for ONE coin via public endpoint ─────────────────────
async function fetchPublicCoinData(exchange, coin) {
  const fetcher = PUBLIC_ENDPOINTS[exchange];
  if (!fetcher) return null;

  const cacheKey = `pub|${exchange}|${coin}`;
  const cached   = coinNetworkCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < COIN_NETWORK_TTL) {
    return cached.networks;
  }

  try {
    const result   = await fetcher(coin);
    const coinData = result?.[coin];
    if (!coinData) return null;

    const rawNetworks = coinData.networks ?? {};
    const networks    = [];

    for (const [rawId, info] of Object.entries(rawNetworks)) {
      const canonical = normaliseNetwork(rawId);
      if (!canonical || canonical === 'UNKNOWN') continue;

      const withdrawEnabled = info.withdraw !== false && info.withdrawEnabled !== false;
      const depositEnabled  = info.deposit  !== false && info.depositEnabled  !== false;
      const fee = parseFloat(info.fee ?? 0) || 0;

      networks.push({ network: canonical, rawNetwork: rawId, withdrawEnabled, depositEnabled, fee });
    }

    // FIX: was missing this return — networks were computed but never returned!
    coinNetworkCache.set(cacheKey, { networks, fetchedAt: Date.now() });
    return networks;
  } catch (err) {
    console.warn(`[Scanner] fetchPublicCoinData error for ${exchange}|${coin}: ${err.message}`);
    return null;
  }
}

// ─── Get coin networks for a given exchange+coin pair ────────────────────────
// Strategy:
//   • Binance/Bybit/MEXC → use authenticated fetchCurrencies() (API key required)
//   • HTX/KuCoin/BitMart/Bitget/Gate.io → use public REST endpoint (no API key)
//   • If API key is present AND exchange supports fetchCurrencies → also accepted
async function getCoinNetworks(exchange, coin, authenticatedCurrencies) {
  const cacheKey = `${exchange}|${coin}`;
  const cached   = coinNetworkCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < COIN_NETWORK_TTL) {
    return cached.networks;
  }

  let networks = null;

  // ── Path 1: Exchanges that don't require API key for withdrawal data ────────
  if (!REQUIRES_API_KEY_FOR_WITHDRAWAL.has(exchange)) {
    // Always try public endpoint first for these exchanges
    networks = await fetchPublicCoinData(exchange, coin);
    if (networks && networks.length > 0) {
      console.log(`[Scanner] ${exchange}|${coin}: using public endpoint (${networks.length} networks)`);
      coinNetworkCache.set(cacheKey, { networks, fetchedAt: Date.now() });
      return networks;
    }
    // If public endpoint failed, fall through to check if we have an API key as backup
  }

  // ── Path 2: Exchanges requiring API key (Binance, Bybit, MEXC) ─────────────
  //    Also a fallback for public-endpoint exchanges if public endpoint failed
  if (authenticatedCurrencies) {
    const coinData = authenticatedCurrencies[coin];
    if (coinData?.networks) {
      networks = [];
      for (const [rawId, netInfo] of Object.entries(coinData.networks)) {
        const canonical = normaliseNetwork(rawId);
        if (!canonical || canonical === 'UNKNOWN') continue;

        // CCXT network info shape
        const withdrawEnabled = netInfo.withdraw !== false && netInfo.active !== false;
        const depositEnabled  = netInfo.deposit  !== false && netInfo.active !== false;
        const fee = parseFloat(
          netInfo.fee ?? netInfo.withdrawFee ?? netInfo.withdraw?.fee ?? 0
        ) || 0;

        networks.push({ network: canonical, rawNetwork: rawId, withdrawEnabled, depositEnabled, fee });
      }
      if (networks.length > 0) {
        console.log(`[Scanner] ${exchange}|${coin}: using authenticated currencies (${networks.length} networks)`);
        coinNetworkCache.set(cacheKey, { networks, fetchedAt: Date.now() });
        return networks;
      }
    }
  }

  // ── Path 3: If we have an API key for a public-endpoint exchange (bonus) ────
  if (!REQUIRES_API_KEY_FOR_WITHDRAWAL.has(exchange)) {
    const ex = getExchangeInstance(exchange);
    if (ex) {
      try {
        const currencies = await ex.fetchCurrencies();
        const coinData   = currencies?.[coin];
        if (coinData?.networks) {
          networks = [];
          for (const [rawId, netInfo] of Object.entries(coinData.networks)) {
            const canonical = normaliseNetwork(rawId);
            if (!canonical || canonical === 'UNKNOWN') continue;
            const withdrawEnabled = netInfo.withdraw !== false && netInfo.active !== false;
            const depositEnabled  = netInfo.deposit  !== false && netInfo.active !== false;
            const fee = parseFloat(netInfo.fee ?? netInfo.withdrawFee ?? 0) || 0;
            networks.push({ network: canonical, rawNetwork: rawId, withdrawEnabled, depositEnabled, fee });
          }
          if (networks.length > 0) {
            coinNetworkCache.set(cacheKey, { networks, fetchedAt: Date.now() });
            return networks;
          }
        }
      } catch {
        // Authenticated call failed — public endpoint already tried above
      }
    }
  }

  // ── Path 4: Last resort — no network data available, return empty ───────────
  console.warn(`[Scanner] ${exchange}|${coin}: no network data available`);
  const empty = [];
  coinNetworkCache.set(cacheKey, { networks: empty, fetchedAt: Date.now() });
  return empty;
}

// ─── Pre-fetch currencies for all exchanges before scan ───────────────────────
// For API-key exchanges: bulk fetch authenticated currencies
// For public exchanges: no pre-fetch needed (per-coin on demand)
async function prefetchAllCurrencies(exchanges) {
  console.log(`[Scanner] Pre-fetching currencies for: [${exchanges.join(', ')}]`);

  const results = {};
  await Promise.allSettled(
    exchanges.map(async (exchange) => {
      if (REQUIRES_API_KEY_FOR_WITHDRAWAL.has(exchange)) {
        const currencies = await getAuthenticatedCurrencies(exchange);
        results[exchange] = currencies;
        if (!currencies) {
          console.warn(`[Scanner] ${exchange}: no API key configured — withdrawal validation skipped for this exchange`);
        }
      } else {
        // Public-endpoint exchanges: no pre-fetch, fetched per-coin on demand
        results[exchange] = null;
      }
    })
  );

  return results;
}

// ─── Fetch all USDT tickers from one exchange ─────────────────────────────────
async function fetchAllTickers(exchange) {
  const cached = tickerCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < TICKER_TTL) {
    return cached.tickers;
  }

  try {
    // Always use public instance for ticker fetching (no API key needed)
    let ex = getPublicExchangeInstance(exchange);

    // Some exchanges need markets loaded before fetchTickers
    await ex.loadMarkets();

    // Get all USDT spot symbols
    const usdtSymbols = Object.keys(ex.markets ?? {}).filter(
      s => s.endsWith('/USDT') && ex.markets[s]?.spot === true && ex.markets[s]?.active !== false
    );
    console.log(`[Scanner] ${exchange}: ${usdtSymbols.length} USDT spot pairs found`);

    if (usdtSymbols.length === 0) return {};

    // Bulk fetch all tickers
    let tickers = {};
    try {
      tickers = await ex.fetchTickers(usdtSymbols);
      console.log(`[Scanner] ${exchange}: bulk fetch → ${Object.keys(tickers).length} tickers`);
    } catch (bulkErr) {
      // Some exchanges don't support bulk — fetch in batches
      console.warn(`[Scanner] ${exchange}: bulk fetchTickers failed (${bulkErr.message}), trying batched...`);
      const BATCH = 100;
      for (let i = 0; i < usdtSymbols.length; i += BATCH) {
        const batch = usdtSymbols.slice(i, i + BATCH);
        try {
          const batchTickers = await ex.fetchTickers(batch);
          Object.assign(tickers, batchTickers);
        } catch {
          // Skip failed batches
        }
      }
    }

    tickerCache.set(exchange, { tickers, fetchedAt: Date.now() });
    return tickers;
  } catch (err) {
    console.error(`[Scanner] ${exchange} fetch error: ${err.message}`);
    return {};
  }
}

// ─── POST /api/scanner/scan ───────────────────────────────────────────────────
scannerRouter.post('/scan', async (req, res) => {
  const {
    buyExchanges  = [],
    sellExchanges = [],
    minProfitPct  = 0,
    maxProfitPct  = 50,
    minVolume24h  = 100000,
    tradeAmountUSD = 1000,
  } = req.body;

  const allExchanges = [...new Set([...buyExchanges, ...sellExchanges])];

  console.log(`[Scanner] ─── New scan ──────────────────────────────────────`);
  console.log(`[Scanner] Buy: [${buyExchanges.join(', ')}]`);
  console.log(`[Scanner] Sell: [${sellExchanges.join(', ')}]`);
  console.log(`[Scanner] minProfit: ${minProfitPct}%  maxProfit: ${maxProfitPct}%  minVol: $${minVolume24h.toLocaleString()}`);

  try {
    pruneRegistry();

    // ── Step 1: Pre-fetch authenticated currencies for API-key exchanges ──────
    const authenticatedCurrenciesMap = await prefetchAllCurrencies(allExchanges);

    // ── Step 2: Fetch all tickers from all exchanges in parallel ──────────────
    console.log(`[Scanner] Fetching ALL USDT tickers from ${allExchanges.length} exchanges...`);
    const tickerMaps = {};
    await Promise.allSettled(
      allExchanges.map(async (exchange) => {
        tickerMaps[exchange] = await fetchAllTickers(exchange);
        console.log(`[Scanner] ${exchange}: ${Object.keys(tickerMaps[exchange]).length} tickers loaded`);
      })
    );

    // ── Step 3: Find cross-listed symbols ────────────────────────────────────
    const symbolSets = {};
    for (const exchange of allExchanges) {
      symbolSets[exchange] = new Set(Object.keys(tickerMaps[exchange]));
    }

    const candidateSymbols = new Set();
    for (const buyEx of buyExchanges) {
      for (const symbol of symbolSets[buyEx] ?? []) {
        for (const sellEx of sellExchanges) {
          if (buyEx !== sellEx && symbolSets[sellEx]?.has(symbol)) {
            candidateSymbols.add(symbol);
          }
        }
      }
    }

    console.log(`[Scanner] Cross-listed candidate symbols: ${candidateSymbols.size}`);

    // ── Step 4: Build spread candidates ──────────────────────────────────────
    const spreadCandidates = [];
    for (const symbol of candidateSymbols) {
      const coin = symbol.replace('/USDT', '');
      for (const buyEx of buyExchanges) {
        const buyTicker = tickerMaps[buyEx]?.[symbol];
        if (!buyTicker?.ask || buyTicker.ask <= 0) continue;

        for (const sellEx of sellExchanges) {
          if (buyEx === sellEx) continue;
          const sellTicker = tickerMaps[sellEx]?.[symbol];
          if (!sellTicker?.bid || sellTicker.bid <= 0) continue;

          const spreadPct = ((sellTicker.bid - buyTicker.ask) / buyTicker.ask) * 100;
          if (spreadPct <= 0) continue; // Raw spread must be positive

          // Volume filter (use lower of the two volumes)
          const vol24hBuy  = buyTicker.quoteVolume  ?? buyTicker.baseVolume  ?? 0;
          const vol24hSell = sellTicker.quoteVolume ?? sellTicker.baseVolume ?? 0;
          const minVol     = Math.min(vol24hBuy, vol24hSell);
          if (minVol < minVolume24h) continue;

          spreadCandidates.push({
            symbol, coin, buyEx, sellEx,
            buyAsk:  buyTicker.ask,
            sellBid: sellTicker.bid,
            spreadPct,
            vol24hBuy,
            vol24hSell,
          });
        }
      }
    }

    // Sort by spread descending to evaluate best opportunities first
    spreadCandidates.sort((a, b) => b.spreadPct - a.spreadPct);
    console.log(`[Scanner] Evaluating ${spreadCandidates.length} spread candidates with chain validation...`);

    // ── Step 5: Evaluate candidates with network/withdrawal validation ────────
    const opportunities = [];
    const CONCURRENCY   = 20; // parallel network lookups

    // Process in chunks to avoid overwhelming APIs
    for (let i = 0; i < spreadCandidates.length; i += CONCURRENCY) {
      const chunk = spreadCandidates.slice(i, i + CONCURRENCY);

      await Promise.allSettled(
        chunk.map(async (candidate) => {
          const { symbol, coin, buyEx, sellEx, buyAsk, sellBid, spreadPct, vol24hBuy, vol24hSell } = candidate;

          try {
            // Fetch networks for buy exchange (need deposit enabled)
            const buyNetworks  = await getCoinNetworks(buyEx,  coin, authenticatedCurrenciesMap[buyEx]);
            // Fetch networks for sell exchange (need withdraw enabled)
            const sellNetworks = await getCoinNetworks(sellEx, coin, authenticatedCurrenciesMap[sellEx]);

            // Find common networks where withdraw is enabled on buy-side (to move funds in)
            // and deposit is enabled on sell-side (to receive funds)
            const buyDepositNetworks  = buyNetworks.filter(n  => n.depositEnabled);
            const sellWithdrawNetworks = sellNetworks.filter(n => n.withdrawEnabled);

            // Find intersection of canonical network names
            const buyNetworkNames  = new Set(buyDepositNetworks.map(n => n.network));
            const commonNetworks   = sellWithdrawNetworks.filter(n => buyNetworkNames.has(n.network));

            if (commonNetworks.length === 0) {
              // No common network — cannot transfer between these exchanges for this coin
              return;
            }

            // Select cheapest network for transfer
            const bestNetwork = selectBestNetwork(commonNetworks);
            if (!bestNetwork) return;

            // Get withdrawal fee from sell exchange on best network
            let withdrawFeeUSD = WITHDRAWAL_FEES_USD[bestNetwork.network] ?? 2.00;
            if (bestNetwork.fee > 0) {
              // Convert coin fee to USD using sell price
              withdrawFeeUSD = bestNetwork.fee * sellBid;
            }

            // ── Calculate net profit ──────────────────────────────────────────
            const buyFeeRate  = (TAKER_FEES[buyEx]  ?? 0.20) / 100;
            const sellFeeRate = (TAKER_FEES[sellEx] ?? 0.20) / 100;

            const quantity       = tradeAmountUSD / buyAsk;
            const buyCost        = tradeAmountUSD + (tradeAmountUSD * buyFeeRate);
            const sellRevenue    = quantity * sellBid * (1 - sellFeeRate);
            const netProfitUSD   = sellRevenue - buyCost - withdrawFeeUSD;
            const netProfitPct   = (netProfitUSD / tradeAmountUSD) * 100;

            // Apply profit filters
            if (netProfitPct < minProfitPct) return;
            if (netProfitPct > maxProfitPct) return;

            // ── Track opportunity persistence ─────────────────────────────────
            const registryKey = `${symbol}|${buyEx}|${sellEx}`;
            const existing    = opportunityRegistry.get(registryKey);
            const now         = Date.now();

            if (existing) {
              existing.lastSeenAt = now;
            } else {
              opportunityRegistry.set(registryKey, { firstSeenAt: now, lastSeenAt: now });
            }

            const entry = opportunityRegistry.get(registryKey);

            opportunities.push({
              id:            `${registryKey}|${now}`,
              pair:          symbol,
              coin,
              buyExchange:   buyEx,
              sellExchange:  sellEx,
              buyPrice:      buyAsk,
              sellPrice:     sellBid,
              spreadPct:     parseFloat(spreadPct.toFixed(4)),
              netProfitPct:  parseFloat(netProfitPct.toFixed(4)),
              netProfitUSD:  parseFloat(netProfitUSD.toFixed(2)),
              withdrawFeeUSD: parseFloat(withdrawFeeUSD.toFixed(4)),
              network:       bestNetwork.network,
              rawNetwork:    bestNetwork.rawNetwork,
              allNetworks:   commonNetworks.map(n => n.network),
              volume24hBuy:  parseFloat(vol24hBuy.toFixed(2)),
              volume24hSell: parseFloat(vol24hSell.toFixed(2)),
              tradeAmountUSD,
              buyTakerFee:   buyFeeRate * 100,
              sellTakerFee:  sellFeeRate * 100,
              firstSeenAt:   entry.firstSeenAt,
              lastSeenAt:    entry.lastSeenAt,
              timestamp:     now,
            });
          } catch (err) {
            console.warn(`[Scanner] Error evaluating ${symbol} ${buyEx}→${sellEx}: ${err.message}`);
          }
        })
      );
    }

    // Sort final results by net profit descending
    opportunities.sort((a, b) => b.netProfitPct - a.netProfitPct);

    console.log(`[Scanner] ✓ Scan complete — ${opportunities.length} opportunities found`);

    return res.json({
      success: true,
      opportunities,
      meta: {
        scannedExchanges: allExchanges,
        candidateSymbols: candidateSymbols.size,
        spreadCandidates: spreadCandidates.length,
        opportunitiesFound: opportunities.length,
        timestamp: Date.now(),
      },
    });

  } catch (err) {
    console.error(`[Scanner] Fatal scan error: ${err.message}`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/scanner/debug ───────────────────────────────────────────────────
scannerRouter.get('/debug', async (req, res) => {
  const { exchange, coin } = req.query;

  if (!exchange) {
    return res.json({
      tickerCacheKeys:      [...tickerCache.keys()],
      coinNetworkCacheKeys: [...coinNetworkCache.keys()].slice(0, 50),
      currenciesCacheKeys:  [...currenciesCache.keys()],
      registrySize:         opportunityRegistry.size,
    });
  }

  const result = {};

  if (tickerCache.has(exchange)) {
    const cached = tickerCache.get(exchange);
    result.tickerCount  = Object.keys(cached.tickers).length;
    result.tickerCacheAge = Math.round((Date.now() - cached.fetchedAt) / 1000) + 's';
    if (coin) {
      result.ticker = cached.tickers[`${coin}/USDT`] ?? null;
    }
  }

  if (coin) {
    const cacheKey = `${exchange}|${coin}`;
    const pubKey   = `pub|${exchange}|${coin}`;
    result.networkCache    = coinNetworkCache.get(cacheKey) ?? null;
    result.pubNetworkCache = coinNetworkCache.get(pubKey)   ?? null;
    result.requiresApiKey  = REQUIRES_API_KEY_FOR_WITHDRAWAL.has(exchange);
    result.hasPublicEndpoint = !!PUBLIC_ENDPOINTS[exchange];

    // Live fetch
    try {
      if (REQUIRES_API_KEY_FOR_WITHDRAWAL.has(exchange)) {
        const authCurrencies = await getAuthenticatedCurrencies(exchange);
        result.liveNetworks  = authCurrencies?.[coin] ?? null;
      } else {
        result.liveNetworks = await fetchPublicCoinData(exchange, coin);
      }
    } catch (e) {
      result.liveNetworksError = e.message;
    }
  }

  return res.json(result);
});
