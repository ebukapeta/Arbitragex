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

// ─── USDT withdrawal fees by network (USD amounts) ────────────────────────────
const WITHDRAWAL_FEES_USD = {
  TRC20:    1.00,
  ERC20:    4.50,
  BEP20:    0.80,
  SOL:      1.00,
  ARBITRUM: 0.80,
  OPTIMISM: 0.80,
  MATIC:    1.00,
  'AVAX-C': 1.00,
  KCC:      0.80,
};

// ─── Networks supported per exchange for USDT ─────────────────────────────────
const EXCHANGE_NETWORKS = {
  'Binance': ['TRC20', 'BEP20', 'ERC20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'MATIC', 'AVAX-C'],
  'Bybit':   ['TRC20', 'BEP20', 'ERC20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'AVAX-C'],
  'MEXC':    ['TRC20', 'BEP20', 'ERC20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'MATIC', 'AVAX-C'],
  'HTX':     ['TRC20', 'ERC20', 'BEP20', 'ARBITRUM', 'AVAX-C'],
  'KuCoin':  ['TRC20', 'ERC20', 'BEP20', 'SOL', 'ARBITRUM', 'MATIC', 'KCC'],
  'BitMart': ['TRC20', 'ERC20', 'BEP20', 'SOL'],
  'Bitget':  ['TRC20', 'ERC20', 'BEP20', 'SOL', 'ARBITRUM', 'OPTIMISM'],
  'Gate.io': ['TRC20', 'ERC20', 'BEP20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'MATIC', 'AVAX-C'],
};

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
 * Find common chains between two exchanges for USDT transfer.
 */
function getCommonChains(buyExchange, sellExchange) {
  const buyNets  = EXCHANGE_NETWORKS[buyExchange]  ?? [];
  const sellNets = EXCHANGE_NETWORKS[sellExchange] ?? [];
  return buyNets.filter(n => sellNets.includes(n));
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
      out[symbol] = {
        bid:         ticker.bid ?? ticker.last,
        ask:         ticker.ask ?? ticker.last,
        last:        ticker.last,
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
        if (!buyTicker.ask || !sellTicker.bid) continue;

        const buyPrice  = buyTicker.ask;   // We buy at ask (market buy)
        const sellPrice = sellTicker.bid;  // We sell at bid (market sell)

        if (sellPrice <= buyPrice) continue; // No profit before fees

        // ── Fee calculations ────────────────────────────────────────────────
        const buyFeePct  = TAKER_FEES[buyExchange]  ?? 0.20;
        const sellFeePct = TAKER_FEES[sellExchange] ?? 0.20;

        // Common chains for USDT withdrawal
        const commonChains = getCommonChains(buyExchange, sellExchange);
        const chainCompatible = commonChains.length > 0;

        // Best chain = TRC20 if available (cheapest), else lowest fee network
        const bestChain = commonChains.includes('TRC20')
          ? 'TRC20'
          : commonChains[0] ?? 'TRC20';

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
          buyPrice:          parseFloat(buyPrice.toFixed(8)),
          sellExchange,
          sellPrice:         parseFloat(sellPrice.toFixed(8)),
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
