/**
 * Bot Routes — Execute arbitrage trades
 *
 * POST /api/bot/execute        — Execute a full arbitrage trade
 * POST /api/bot/verify-price   — Re-fetch live prices & recalculate profit before execution
 * GET  /api/bot/status/:id     — Poll live status of an executing trade
 * GET  /api/bot/history        — Trade history
 *
 * Execution flow (bulletproof market order approach):
 *   Step 0: Re-fetch live ticker prices just before placing any order
 *           → Recalculate net profit with fresh prices
 *           → Abort if profit dropped below minimum threshold
 *   Step 1: Check account structure on buy exchange (funding vs spot)
 *   Step 2: Internal transfer to spot/trading if needed (Bybit/KuCoin/Bitget)
 *   Step 3: Place MARKET BUY order on buy exchange (fills at current ask)
 *   Step 4: Withdraw asset from buy exchange → sell exchange via best chain
 *   Step 5: Poll for deposit confirmation on sell exchange
 *   Step 6: Internal transfer to trading account on sell exchange if needed
 *   Step 7: Place MARKET SELL order on sell exchange (fills at current bid)
 *   Step 8: Calculate & record final net profit
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import {
  getExchangeInstance,
  placeMarketBuy,
  placeMarketSell,
  withdraw,
  checkNetworkStatus,
} from '../exchanges/connector.js';
import {
  checkUSDTLocation,
  executeInternalTransfer,
  ACCOUNT_INFO,
} from '../exchanges/accountManager.js';
import { historyStore } from '../store/tradeHistory.js';

export const botRouter = Router();

// In-memory map of executing trades for status polling
const executingTrades = new Map();

// ─── Taker fees per exchange (market orders always pay taker fee) ──────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bot/verify-price
//
// Re-fetches live bid/ask from both exchanges for the opportunity pair,
// recalculates net profit with fresh prices, and returns whether it is
// still worth executing. Called by the frontend the moment "Start Trade"
// is clicked — BEFORE any order is placed.
// ─────────────────────────────────────────────────────────────────────────────
botRouter.post('/verify-price', async (req, res) => {
  const { opportunity, amount, minProfitPct = 0 } = req.body;

  if (!opportunity || !amount) {
    return res.status(400).json({ error: 'opportunity and amount required' });
  }

  const { buyExchange, sellExchange, pair,
          buyFee, sellFee, chain } = opportunity;

  try {
    // Re-fetch live tickers from both exchanges simultaneously
    const [buyEx, sellEx] = [
      getExchangeInstance(buyExchange),
      getExchangeInstance(sellExchange),
    ];

    if (!buyEx || !sellEx) {
      return res.status(400).json({
        error: `Exchange not connected: ${!buyEx ? buyExchange : sellExchange}`,
      });
    }

    const [buyTicker, sellTicker] = await Promise.all([
      buyEx.fetchTicker(pair),
      sellEx.fetchTicker(pair),
    ]);

    // ── Fetch live prices ────────────────────────────────────────────────────
    // Scanner uses ticker.last (current market price — same as CoinMarketCap).
    // We use the SAME price (last) for profit calculation so the numbers are
    // consistent with what the scanner showed. The market order will fill very
    // close to last for normal trade sizes.
    const liveBuyLast  = buyTicker.last  ?? buyTicker.ask  ?? 0;
    const liveSellLast = sellTicker.last ?? sellTicker.bid ?? 0;

    // Keep ask/bid for reference but do NOT use them for profit maths —
    // using ask to buy and bid to sell double-penalises the spread and
    // makes profitable trades appear as losses.
    const liveBuyAsk  = buyTicker.ask  ?? liveBuyLast;
    const liveSellBid = sellTicker.bid ?? liveSellLast;

    if (!liveBuyLast || !liveSellLast) {
      return res.status(400).json({ error: 'Could not fetch live prices' });
    }

    // ── Profit calculation (uses last price — consistent with scanner) ────────
    const buyFeePct  = (buyFee  ?? TAKER_FEES[buyExchange]  ?? 0.20) / 100;
    const sellFeePct = (sellFee ?? TAKER_FEES[sellExchange] ?? 0.20) / 100;
    const wdFeeUSD   = WITHDRAWAL_FEES_USD[chain] ?? 1.00;

    // Step 1: deduct buy trading fee from USDT amount
    const buyFeeAmt     = amount * buyFeePct;
    const usdtAfterFee  = amount - buyFeeAmt;

    // Step 2: buy coins at current market price (last)
    const coinsReceived = usdtAfterFee / liveBuyLast;

    // Step 3: sell coins at current market price on sell exchange
    const saleProceeds  = coinsReceived * liveSellLast;

    // Step 4: deduct sell trading fee
    const sellFeeAmt    = saleProceeds * sellFeePct;
    const usdtAfterSell = saleProceeds - sellFeeAmt;

    // Step 5: deduct withdrawal fee
    const usdtAfterWD   = usdtAfterSell - wdFeeUSD;

    // Step 6: net profit vs amount invested
    const grossProfitUSD = saleProceeds - amount;           // before any fees
    const netProfitUSD   = usdtAfterWD  - amount;           // after all fees
    const netProfitPct   = (netProfitUSD / amount) * 100;

    // ── Price movement vs scanner ─────────────────────────────────────────────
    const priceMovedPct = opportunity.buyPrice
      ? ((liveBuyLast - opportunity.buyPrice) / opportunity.buyPrice) * 100
      : 0;

    const stillProfitable = netProfitPct >= minProfitPct;

    return res.json({
      verified:         true,
      stillProfitable,
      // Live market prices (last traded)
      liveBuyPrice:     parseFloat(liveBuyLast.toFixed(8)),
      liveSellPrice:    parseFloat(liveSellLast.toFixed(8)),
      // Ask/bid for reference
      liveBuyAsk:       parseFloat(liveBuyAsk.toFixed(8)),
      liveSellBid:      parseFloat(liveSellBid.toFixed(8)),
      // Scanner prices at scan time
      scannerBuyPrice:  opportunity.buyPrice,
      scannerSellPrice: opportunity.sellPrice,
      priceMovedPct:    parseFloat(priceMovedPct.toFixed(4)),
      // Fee breakdown
      buyFeeAmt:        parseFloat(buyFeeAmt.toFixed(4)),
      sellFeeAmt:       parseFloat(sellFeeAmt.toFixed(4)),
      wdFeeUSD:         parseFloat(wdFeeUSD.toFixed(3)),
      // Profit
      grossProfitUSD:   parseFloat(grossProfitUSD.toFixed(4)),
      coinsToReceive:   parseFloat(coinsReceived.toFixed(8)),
      netProfitUSD:     parseFloat(netProfitUSD.toFixed(4)),
      netProfitPct:     parseFloat(netProfitPct.toFixed(4)),
      verifiedAt:       Date.now(),
      warning: !stillProfitable
        ? `Profit dropped to ${netProfitPct.toFixed(3)}% — below your minimum of ${minProfitPct}%. ` +
          `Price moved ${priceMovedPct > 0 ? '+' : ''}${priceMovedPct.toFixed(3)}% since scan.`
        : Math.abs(priceMovedPct) > 0.05
          ? `Price moved ${priceMovedPct > 0 ? '+' : ''}${priceMovedPct.toFixed(3)}% since scan — ` +
            `profit updated to ${netProfitPct.toFixed(3)}%`
          : null,
    });

  } catch (err) {
    console.error('[Bot] verify-price error:', err.message);
    return res.status(500).json({ error: `Price verification failed: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bot/execute
// ─────────────────────────────────────────────────────────────────────────────
botRouter.post('/execute', async (req, res) => {
  const { opportunity, amount, depositAddress, minProfitPct = 0 } = req.body;

  if (!opportunity || !amount || amount <= 0) {
    return res.status(400).json({ error: 'opportunity and amount are required' });
  }

  const {
    buyExchange, sellExchange, pair, chain,
    chainCompatible, withdrawalEnabled, depositEnabled,
  } = opportunity;

  // ── Pre-flight validation ──────────────────────────────────────────────────
  if (!chainCompatible) {
    return res.status(400).json({
      error: 'No compatible chain between exchanges — cannot execute',
    });
  }
  if (!withdrawalEnabled) {
    return res.status(400).json({
      error: `Withdrawal disabled on ${buyExchange}`,
    });
  }
  if (!depositEnabled) {
    return res.status(400).json({
      error: `Deposit disabled on ${sellExchange}`,
    });
  }
  if (!keyStore.has(buyExchange)) {
    return res.status(400).json({ error: `${buyExchange} not connected` });
  }
  if (!keyStore.has(sellExchange)) {
    return res.status(400).json({ error: `${sellExchange} not connected` });
  }
  if (!depositAddress) {
    return res.status(400).json({
      error: 'depositAddress required — your USDT deposit address on the sell exchange',
    });
  }

  const tradeId = `trade-${Date.now()}`;

  // Create initial trade record
  const tradeRecord = {
    id:          tradeId,
    timestamp:   Date.now(),
    pair,
    buyExchange,
    sellExchange,
    amount,
    chain,
    status:      'executing',
    currentStep: 'verifying_price',
    steps:       [],
    netProfit:   null,
    error:       null,
  };

  historyStore.addTrade(tradeRecord);
  executingTrades.set(tradeId, tradeRecord);

  // Respond immediately — client polls /api/bot/status/:tradeId for updates
  res.json({ tradeId, message: 'Trade execution started', status: 'executing' });

  // Execute asynchronously
  executeTradeAsync(tradeId, opportunity, amount, depositAddress, minProfitPct)
    .catch(err => {
      console.error(`[Bot] Trade ${tradeId} fatal error:`, err.message);
      updateTradeStep(tradeId, 'failed', `Fatal error: ${err.message}`);
    });
});

// ─── GET /api/bot/status/:tradeId ─────────────────────────────────────────────
botRouter.get('/status/:tradeId', (req, res) => {
  const { tradeId } = req.params;
  const trade =
    executingTrades.get(tradeId) ??
    historyStore.getTrades().find(t => t.id === tradeId);

  if (!trade) {
    return res.status(404).json({ error: 'Trade not found' });
  }
  return res.json(trade);
});

// ─── GET /api/bot/history ─────────────────────────────────────────────────────
botRouter.get('/history', (_req, res) => {
  return res.json({ trades: historyStore.getTrades(100) });
});

// ─── Helper: update trade step ────────────────────────────────────────────────
function updateTradeStep(tradeId, step, message, extra = {}) {
  const trade = executingTrades.get(tradeId);
  if (!trade) return;

  trade.currentStep = step;
  trade.steps.push({ step, message, timestamp: Date.now(), ...extra });

  if (step === 'completed' || step === 'failed' || step === 'aborted') {
    trade.status = step;
    executingTrades.delete(tradeId);
    historyStore.updateTrade(tradeId, trade);
  }

  console.log(`[Bot] ${tradeId} → ${step}: ${message}`);
}

// ─── Main async execution function ───────────────────────────────────────────
async function executeTradeAsync(tradeId, opportunity, amount, depositAddress, minProfitPct) {
  const { buyExchange, sellExchange, pair, chain, buyFee, sellFee } = opportunity;
  const baseAsset = pair.split('/')[0];

  const buyEx  = getExchangeInstance(buyExchange);
  const sellEx = getExchangeInstance(sellExchange);

  if (!buyEx || !sellEx) {
    updateTradeStep(tradeId, 'failed', 'Exchange instances not available — check API keys');
    return;
  }

  try {

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 0 — Re-fetch live prices & verify profit still meets threshold
    //          This is the critical bulletproof check before any order fires
    // ═══════════════════════════════════════════════════════════════════════
    updateTradeStep(tradeId, 'verifying_price',
      `Re-fetching live ${pair} prices from ${buyExchange} & ${sellExchange}...`);

    const [buyTicker, sellTicker] = await Promise.all([
      buyEx.fetchTicker(pair),
      sellEx.fetchTicker(pair),
    ]);

    // Scanner used last traded price to find the opportunity.
    // Execution uses ask (buy) and bid (sell) — real market order fill prices.
    const liveBuyLast    = buyTicker.last  ?? buyTicker.ask;
    const liveSellLast   = sellTicker.last ?? sellTicker.bid;
    const liveBuyAsk     = buyTicker.ask   ?? liveBuyLast;  // market buy fills here
    const liveSellBid    = sellTicker.bid  ?? liveSellLast; // market sell fills here

    if (!liveBuyAsk || !liveSellBid) {
      updateTradeStep(tradeId, 'failed', 'Could not fetch live prices — aborting');
      return;
    }

    // Profit at execution prices (ask/bid) with real trade amount
    const buyFeePct      = buyFee  ?? TAKER_FEES[buyExchange]  ?? 0.20;
    const sellFeePct     = sellFee ?? TAKER_FEES[sellExchange] ?? 0.20;
    const wdFeeUSD       = WITHDRAWAL_FEES_USD[chain] ?? 1.00;
    const buyFeeAmt      = amount * (buyFeePct / 100);
    const coinsExpected  = (amount - buyFeeAmt) / liveBuyAsk;
    const grossSaleValue = coinsExpected * liveSellBid;
    const sellFeeAmt     = grossSaleValue * (sellFeePct / 100);
    const netAfterSell   = grossSaleValue - sellFeeAmt;
    const netAfterWD     = netAfterSell - wdFeeUSD;
    const liveNetProfitUSD = netAfterWD - amount;
    const liveNetProfitPct = (liveNetProfitUSD / amount) * 100;
    // Price movement compares current market price (last) vs scanner's last price
    const priceMovedPct  = liveBuyLast && opportunity.buyPrice
      ? ((liveBuyLast - opportunity.buyPrice) / opportunity.buyPrice) * 100
      : 0;

    updateTradeStep(tradeId, 'price_verified',
      `Market prices — Buy: $${liveBuyLast.toFixed(6)} (fills at ask $${liveBuyAsk.toFixed(6)}) | ` +
      `Sell: $${liveSellLast.toFixed(6)} (fills at bid $${liveSellBid.toFixed(6)}) | ` +
      `Net profit: $${liveNetProfitUSD.toFixed(4)} (${liveNetProfitPct.toFixed(3)}%)`,
      {
        liveBuyPrice:     liveBuyLast,
        liveSellPrice:    liveSellLast,
        liveBuyAsk,
        liveSellBid,
        liveNetProfitUSD: parseFloat(liveNetProfitUSD.toFixed(4)),
        liveNetProfitPct: parseFloat(liveNetProfitPct.toFixed(4)),
        priceMovedPct:    parseFloat(priceMovedPct.toFixed(4)),
      });

    // ── ABORT if profit dropped below minimum threshold ────────────────────
    if (liveNetProfitPct < minProfitPct) {
      updateTradeStep(tradeId, 'aborted',
        `⛔ Trade aborted — at current market prices the profit is ` +
        `${liveNetProfitPct.toFixed(3)}% which is below your minimum of ${minProfitPct}%. ` +
        `Market price moved ${priceMovedPct > 0 ? '+' : ''}${priceMovedPct.toFixed(3)}% ` +
        `since scanner found this opportunity. No orders were placed.`,
        {
          liveNetProfitPct: parseFloat(liveNetProfitPct.toFixed(4)),
          minProfitPct,
          priceMovedPct:    parseFloat(priceMovedPct.toFixed(4)),
          noOrdersPlaced:   true,
        });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1 — Check account structure on buy exchange
    // ═══════════════════════════════════════════════════════════════════════
    updateTradeStep(tradeId, 'checking_accounts',
      `Checking account structure on ${buyExchange} & ${sellExchange}...`);

    const buyAccInfo  = ACCOUNT_INFO[buyExchange];
    const sellAccInfo = ACCOUNT_INFO[sellExchange];
    const buyLocation = await checkUSDTLocation(buyExchange, buyEx);

    console.log(`[Bot] ${buyExchange} USDT location:`, buyLocation);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2 — Internal transfer on buy exchange if funds are in funding account
    // ═══════════════════════════════════════════════════════════════════════
    if (buyAccInfo?.requiresInternalTransfer) {
      if (buyLocation.fundingBalance >= amount) {
        // Funds are in funding account — move to spot/trading first
        updateTradeStep(tradeId, 'transferring_to_spot',
          `${buyExchange}: Moving $${amount} USDT from ` +
          `${buyAccInfo.depositAccount} → ${buyAccInfo.tradingAccountLabel}...`);

        await executeInternalTransfer(buyExchange, buyEx, amount);

        updateTradeStep(tradeId, 'transfer_to_spot_done',
          `${buyExchange}: $${amount} USDT ready in ${buyAccInfo.tradingAccountLabel} ✓`);

      } else if (buyLocation.spotBalance < amount) {
        // Not enough in either account
        updateTradeStep(tradeId, 'failed',
          `Insufficient funds on ${buyExchange}. ` +
          `Need: $${amount} USDT. ` +
          `${buyAccInfo.tradingAccountLabel}: $${buyLocation.spotBalance.toFixed(2)}, ` +
          `${buyAccInfo.depositAccount}: $${buyLocation.fundingBalance.toFixed(2)}`);
        return;
      }
      // else: funds already in spot account — no transfer needed
    } else if (buyLocation.spotBalance < amount) {
      updateTradeStep(tradeId, 'failed',
        `Insufficient funds on ${buyExchange}. ` +
        `Need: $${amount} USDT. Available: $${buyLocation.spotBalance.toFixed(2)} USDT`);
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3 — Place MARKET BUY order
    //          Market buy fills immediately at the current ask price
    //          This is the "current market price" for buyers
    // ═══════════════════════════════════════════════════════════════════════
    updateTradeStep(tradeId, 'buying',
      `Placing market buy order — ${pair} on ${buyExchange} — $${amount} USDT at market price...`);

    const buyOrder = await placeMarketBuy(buyExchange, pair, amount);

    const actualBuyPrice = buyOrder.price ?? liveBuyPrice;
    updateTradeStep(tradeId, 'buy_filled',
      `✓ Market buy filled — ${buyOrder.amount.toFixed(6)} ${baseAsset} ` +
      `@ $${actualBuyPrice.toFixed(6)} avg (cost: $${(buyOrder.cost ?? amount).toFixed(2)} USDT)`,
      {
        orderId:      buyOrder.orderId,
        filledAmount: buyOrder.amount,
        avgBuyPrice:  actualBuyPrice,
        cost:         buyOrder.cost,
      });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4 — Withdraw from buy exchange to sell exchange
    //
    // Network selection logic:
    //   1. Use opportunity.chain (selectedChain chosen by scanner at scan time)
    //   2. Check LIVE withdrawal status on buy exchange for that exact network
    //   3. Check LIVE deposit   status on sell exchange for that exact network
    //   4. If either is suspended → try next network from opportunity.commonChains
    //   5. If ALL common networks are suspended → abort trade with clear message
    //
    // The bot NEVER picks a network outside the scanner-validated commonChains list.
    // ═══════════════════════════════════════════════════════════════════════

    // Build the ordered list to try:
    // Start with scanner's selected chain, then the rest of commonChains in order
    const { commonChains = [] } = opportunity;
    const selectedChain = chain; // scanner's chosen network

    // Put selectedChain first, then remaining commonChains (preserving scanner order)
    const networksToTry = [
      selectedChain,
      ...commonChains.filter(n => n !== selectedChain),
    ].filter(Boolean);

    if (networksToTry.length === 0) {
      updateTradeStep(tradeId, 'failed',
        `No validated common networks found between ${buyExchange} and ${sellExchange}. ` +
        `This should not happen — the scanner should have caught this. Aborting.`);
      return;
    }

    updateTradeStep(tradeId, 'checking_network',
      `Checking live network status — verifying ${selectedChain} withdrawal on ${buyExchange} ` +
      `and deposit on ${sellExchange}...`);

    // Try each network in order until one is fully enabled on both sides
    let chosenNetwork    = null;
    let chosenRawNetwork = null;
    const suspendedNetworks = [];

    for (const network of networksToTry) {
      // Check withdrawal status on buy exchange for this network
      const withdrawStatus = await checkNetworkStatus(buyExchange, network);
      const depositStatus  = await checkNetworkStatus(sellExchange, network);

      const withdrawOk = withdrawStatus.withdrawEnabled;
      const depositOk  = depositStatus.depositEnabled;

      if (withdrawOk && depositOk) {
        // This network is fully enabled on both sides — use it
        chosenNetwork    = network;
        chosenRawNetwork = withdrawStatus.rawNetwork; // exchange's own ID for API call
        break;
      }

      // Record why this network was skipped
      const reasons = [];
      if (!withdrawOk) reasons.push(`withdrawal suspended on ${buyExchange}`);
      if (!depositOk)  reasons.push(`deposit suspended on ${sellExchange}`);
      suspendedNetworks.push(`${network} (${reasons.join(', ')})`);

      console.warn(
        `[Bot] ${tradeId}: ${network} skipped — ${reasons.join(', ')}. ` +
        `Trying next network from commonChains...`
      );

      // If this wasn't the scanner's original choice, log the fallback attempt
      if (network === selectedChain && networksToTry.length > 1) {
        updateTradeStep(tradeId, 'network_fallback',
          `⚠️ ${selectedChain} is currently suspended (${reasons.join(', ')}). ` +
          `Trying alternative validated networks: ${networksToTry.slice(1).join(', ')}...`);
      }
    }

    // If no network worked — abort the trade entirely
    if (!chosenNetwork) {
      const suspendedList = suspendedNetworks.join(' | ');
      updateTradeStep(tradeId, 'aborted',
        `⛔ Trade aborted — all validated networks are currently suspended. ` +
        `Checked: ${suspendedList}. ` +
        `Please try again later or monitor exchange announcements for network restoration.`,
        { noOrdersPlaced: false, networksSuspended: suspendedNetworks });
      return;
    }

    // Log if we had to fall back from the scanner's original choice
    if (chosenNetwork !== selectedChain) {
      updateTradeStep(tradeId, 'network_selected',
        `✓ Using ${chosenNetwork} as fallback — scanner's original ${selectedChain} was suspended. ` +
        `${chosenNetwork} withdrawal on ${buyExchange} and deposit on ${sellExchange} are both active.`);
    } else {
      updateTradeStep(tradeId, 'network_selected',
        `✓ ${chosenNetwork} confirmed active — withdrawal on ${buyExchange} ✓ | deposit on ${sellExchange} ✓`);
    }

    // Update wdFeeUSD based on the actual network being used (may differ if fallback)
    const actualWdFeeUSD = WITHDRAWAL_FEES_USD[chosenNetwork] ?? wdFeeUSD;

    updateTradeStep(tradeId, 'withdrawing',
      `Withdrawing ${buyOrder.amount.toFixed(6)} ${baseAsset} from ${buyExchange} ` +
      `→ ${sellExchange} via ${chosenNetwork} | fee: $${actualWdFeeUSD}...`);

    const withdrawalResult = await withdraw(
      buyExchange,
      buyOrder.amount,
      depositAddress,
      chosenNetwork,    // canonical — for our records
      chosenRawNetwork, // exchange's own ID — for the API call
    );

    updateTradeStep(tradeId, 'withdrawal_submitted',
      `✓ Withdrawal submitted via ${chosenNetwork} — TX: ${withdrawalResult.txId ?? withdrawalResult.withdrawalId}`,
      {
        txId:          withdrawalResult.txId,
        withdrawalId:  withdrawalResult.withdrawalId,
        networkUsed:   chosenNetwork,
        wdFeeUSD:      actualWdFeeUSD,
      });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5 — Wait for deposit confirmation on sell exchange
    // ═══════════════════════════════════════════════════════════════════════
    updateTradeStep(tradeId, 'waiting_deposit',
      `Waiting for ${chain} network confirmation — deposit to ${sellExchange}...`);

    await waitForDeposit(
      sellExchange,
      sellEx,
      baseAsset,
      buyOrder.amount,
      withdrawalResult.txId,
    );

    updateTradeStep(tradeId, 'deposit_confirmed',
      `✓ Deposit confirmed on ${sellExchange} — ` +
      `${buyOrder.amount.toFixed(6)} ${baseAsset} received`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6 — Internal transfer on sell exchange if needed
    // ═══════════════════════════════════════════════════════════════════════
    if (sellAccInfo?.requiresInternalTransfer) {
      updateTradeStep(tradeId, 'transferring_to_trading',
        `${sellExchange}: Moving ${baseAsset} to ${sellAccInfo.tradingAccountLabel}...`);

      await executeInternalTransfer(sellExchange, sellEx, buyOrder.amount);

      updateTradeStep(tradeId, 'transfer_to_trading_done',
        `✓ ${sellExchange}: ${baseAsset} ready in ${sellAccInfo.tradingAccountLabel}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7 — Place MARKET SELL order
    //          Market sell fills immediately at the current bid price
    //          This is the "current market price" for sellers
    // ═══════════════════════════════════════════════════════════════════════
    updateTradeStep(tradeId, 'selling',
      `Placing market sell order — ${buyOrder.amount.toFixed(6)} ${baseAsset} ` +
      `on ${sellExchange} at market price...`);

    const sellOrder = await placeMarketSell(sellExchange, pair, buyOrder.amount);

    const actualSellPrice = sellOrder.price ?? liveSellPrice;
    updateTradeStep(tradeId, 'sell_filled',
      `✓ Market sell filled — ${sellOrder.amount?.toFixed(6) ?? buyOrder.amount.toFixed(6)} ` +
      `${baseAsset} @ $${actualSellPrice.toFixed(6)} avg ` +
      `(received: $${(sellOrder.cost ?? grossSaleValue).toFixed(2)} USDT)`,
      {
        orderId:       sellOrder.orderId,
        avgSellPrice:  actualSellPrice,
        received:      sellOrder.cost,
      });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8 — Final profit calculation using ACTUAL fill prices
    // ═══════════════════════════════════════════════════════════════════════
    const actualGrossRevenue = sellOrder.cost ?? grossSaleValue;
    const actualBuyFeeAmt    = (buyOrder.cost ?? amount) * (buyFeePct / 100);
    const actualSellFeeAmt   = actualGrossRevenue * (sellFeePct / 100);
    const finalNetProfit     = actualGrossRevenue - amount - actualBuyFeeAmt - actualSellFeeAmt - actualWdFeeUSD;
    const finalTotalAfter    = amount + finalNetProfit;

    updateTradeStep(tradeId, 'completed',
      `🎉 Trade completed! Net profit: $${finalNetProfit.toFixed(4)} USDT`,
      {
        netProfit:      parseFloat(finalNetProfit.toFixed(4)),
        totalAfter:     parseFloat(finalTotalAfter.toFixed(4)),
        buyOrderId:     buyOrder.orderId,
        sellOrderId:    sellOrder.orderId,
        actualBuyPrice,
        actualSellPrice,
        buyFeeAmt:      parseFloat(actualBuyFeeAmt.toFixed(4)),
        sellFeeAmt:     parseFloat(actualSellFeeAmt.toFixed(4)),
        wdFeeUSD:       actualWdFeeUSD,
        networkUsed:    chosenNetwork,
      });

    // Persist final record to history
    historyStore.updateTrade(tradeId, {
      status:         'completed',
      netProfit:      parseFloat(finalNetProfit.toFixed(4)),
      totalAfter:     parseFloat(finalTotalAfter.toFixed(4)),
      buyPrice:       actualBuyPrice,
      sellPrice:      actualSellPrice,
      buyOrderId:     buyOrder.orderId,
      sellOrderId:    sellOrder.orderId,
      completedAt:    Date.now(),
    });

  } catch (err) {
    console.error(
      `[Bot] Trade ${tradeId} error at step ` +
      `${executingTrades.get(tradeId)?.currentStep}:`,
      err.message,
    );
    updateTradeStep(tradeId, 'failed', err.message);
    historyStore.updateTrade(tradeId, { status: 'failed', error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Poll sell exchange for deposit confirmation.
// Uses fetchDeposits() every 30 seconds. Times out after 30 minutes.
// ─────────────────────────────────────────────────────────────────────────────
async function waitForDeposit(exchange, exchangeInstance, asset, expectedAmount, txId) {
  const MAX_WAIT_MS   = 30 * 60 * 1000; // 30 minutes
  const POLL_INTERVAL = 30 * 1000;      // 30 seconds
  const startTime     = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    try {
      const deposits = await exchangeInstance.fetchDeposits(asset, undefined, 20);
      const found = deposits.find(d =>
        (d.txid === txId || !txId) &&
        d.status === 'ok' &&
        Math.abs(d.amount - expectedAmount) < expectedAmount * 0.02 // 2% fee tolerance
      );

      if (found) {
        console.log(`[Bot] Deposit confirmed on ${exchange}:`, found.id);
        return found;
      }
    } catch (err) {
      console.warn(`[Bot] Deposit polling error for ${exchange}:`, err.message);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error(
    `Deposit timeout: ${asset} not received on ${exchange} within 30 minutes. ` +
    `Check ${exchange} deposit history manually.`
  );
}
