/**
 * Bot Routes — Execute arbitrage trades
 *
 * POST /api/bot/execute   — Execute a full arbitrage trade
 *   Steps:
 *   1. Check account structure on buy exchange (funding vs spot)
 *   2. Internal transfer to spot/trading if needed
 *   3. Place market buy order
 *   4. Withdraw asset from buy exchange to sell exchange via best chain
 *   5. Wait for deposit confirmation (polling)
 *   6. Internal transfer to trading on sell exchange if needed
 *   7. Place market sell order
 *   8. Record to trade history
 *
 * GET /api/bot/status/:tradeId — Get live status of an executing trade
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import { getExchangeInstance, placeMarketBuy, placeMarketSell, withdraw } from '../exchanges/connector.js';
import { checkUSDTLocation, executeInternalTransfer, ACCOUNT_INFO } from '../exchanges/accountManager.js';
import { historyStore } from '../store/tradeHistory.js';

export const botRouter = Router();

// In-memory map of executing trades for status polling
const executingTrades = new Map();

// ─── POST /api/bot/execute ────────────────────────────────────────────────────
botRouter.post('/execute', async (req, res) => {
  const { opportunity, amount, depositAddress } = req.body;

  if (!opportunity || !amount || amount <= 0) {
    return res.status(400).json({ error: 'opportunity and amount are required' });
  }

  const { buyExchange, sellExchange, pair, chain, chainCompatible,
          withdrawalEnabled, depositEnabled } = opportunity;

  // ── Pre-flight validation ────────────────────────────────────────────────
  if (!chainCompatible) {
    return res.status(400).json({ error: 'No compatible chain between exchanges — cannot execute' });
  }
  if (!withdrawalEnabled) {
    return res.status(400).json({ error: `Withdrawal disabled on ${buyExchange}` });
  }
  if (!depositEnabled) {
    return res.status(400).json({ error: `Deposit disabled on ${sellExchange}` });
  }
  if (!keyStore.has(buyExchange)) {
    return res.status(400).json({ error: `${buyExchange} not connected` });
  }
  if (!keyStore.has(sellExchange)) {
    return res.status(400).json({ error: `${sellExchange} not connected` });
  }
  if (!depositAddress) {
    return res.status(400).json({
      error: 'depositAddress required — provide your USDT deposit address on the sell exchange',
    });
  }

  const tradeId = `trade-${Date.now()}`;

  // Create initial trade record
  const tradeRecord = {
    id:           tradeId,
    timestamp:    Date.now(),
    pair,
    buyExchange,
    sellExchange,
    amount,
    chain,
    status:       'executing',
    currentStep:  'checking_accounts',
    steps:        [],
    netProfit:    null,
    error:        null,
  };

  historyStore.addTrade(tradeRecord);
  executingTrades.set(tradeId, tradeRecord);

  // Respond immediately with tradeId — client polls /api/bot/status/:tradeId
  res.json({ tradeId, message: 'Trade execution started', status: 'executing' });

  // ── Execute asynchronously ───────────────────────────────────────────────
  executeTradeAsync(tradeId, opportunity, amount, depositAddress).catch(err => {
    console.error(`[Bot] Trade ${tradeId} fatal error:`, err.message);
    updateTradeStep(tradeId, 'failed', `Fatal error: ${err.message}`);
  });
});

// ─── GET /api/bot/status/:tradeId ─────────────────────────────────────────────
botRouter.get('/status/:tradeId', (req, res) => {
  const { tradeId } = req.params;
  const trade = executingTrades.get(tradeId)
    ?? historyStore.getTrades().find(t => t.id === tradeId);

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

  if (step === 'completed' || step === 'failed') {
    trade.status = step;
    executingTrades.delete(tradeId);
    historyStore.updateTrade(tradeId, trade);
  }

  console.log(`[Bot] ${tradeId} → ${step}: ${message}`);
}

// ─── Async trade execution ────────────────────────────────────────────────────
async function executeTradeAsync(tradeId, opportunity, amount, depositAddress) {
  const { buyExchange, sellExchange, pair, chain } = opportunity;
  const baseAsset = pair.split('/')[0];

  const buyEx  = getExchangeInstance(buyExchange);
  const sellEx = getExchangeInstance(sellExchange);

  if (!buyEx || !sellEx) {
    updateTradeStep(tradeId, 'failed', 'Exchange instances not available');
    return;
  }

  try {
    // ── Step 1: Check accounts ─────────────────────────────────────────────
    updateTradeStep(tradeId, 'checking_accounts',
      `Checking account structure on ${buyExchange} & ${sellExchange}...`);

    const buyAccInfo  = ACCOUNT_INFO[buyExchange];
    const sellAccInfo = ACCOUNT_INFO[sellExchange];

    const buyLocation = await checkUSDTLocation(buyExchange, buyEx);
    console.log(`[Bot] ${buyExchange} USDT location:`, buyLocation);

    // ── Step 2: Internal transfer on buy exchange if needed ────────────────
    if (buyAccInfo.requiresInternalTransfer && buyLocation.fundingBalance >= amount) {
      updateTradeStep(tradeId, 'transferring_to_spot',
        `${buyExchange}: Moving $${amount} USDT: ${buyAccInfo.transferPath}...`);

      await executeInternalTransfer(buyExchange, buyEx, amount);

      updateTradeStep(tradeId, 'transfer_to_spot_done',
        `${buyExchange}: Internal transfer complete — funds ready in ${buyAccInfo.tradingAccountLabel}`);
    } else if (buyAccInfo.requiresInternalTransfer && buyLocation.spotBalance < amount) {
      updateTradeStep(tradeId, 'failed',
        `Insufficient funds: Need $${amount} USDT in ${buyExchange}. ` +
        `Spot: $${buyLocation.spotBalance}, Funding: $${buyLocation.fundingBalance}`);
      return;
    }

    // ── Step 3: Buy asset ──────────────────────────────────────────────────
    updateTradeStep(tradeId, 'buying',
      `Placing market buy for ${pair} on ${buyExchange} — $${amount} USDT...`);

    const buyOrder = await placeMarketBuy(buyExchange, pair, amount);

    updateTradeStep(tradeId, 'buy_filled',
      `Buy filled: ${buyOrder.amount.toFixed(6)} ${baseAsset} @ $${buyOrder.price?.toFixed(4)} avg`,
      { orderId: buyOrder.orderId, filledAmount: buyOrder.amount });

    // ── Step 4: Withdraw from buy exchange ────────────────────────────────
    updateTradeStep(tradeId, 'withdrawing',
      `Withdrawing ${buyOrder.amount.toFixed(6)} ${baseAsset} from ${buyExchange} ` +
      `via ${chain} to ${sellExchange}...`);

    const withdrawalResult = await withdraw(
      buyExchange,
      buyOrder.amount,
      depositAddress,
      chain,
    );

    updateTradeStep(tradeId, 'withdrawal_submitted',
      `Withdrawal submitted — TX ID: ${withdrawalResult.txId ?? withdrawalResult.withdrawalId}`,
      { txId: withdrawalResult.txId, withdrawalId: withdrawalResult.withdrawalId });

    // ── Step 5: Wait for deposit confirmation ─────────────────────────────
    updateTradeStep(tradeId, 'waiting_deposit',
      `Waiting for ${chain} deposit confirmation on ${sellExchange}...`);

    // In production: poll deposit status every 30 seconds
    // For now, we mark as waiting and the client shows the progress
    // Real implementation would poll ex.fetchDeposits() until confirmed
    await waitForDeposit(sellExchange, sellEx, baseAsset, buyOrder.amount, withdrawalResult.txId);

    updateTradeStep(tradeId, 'deposit_confirmed',
      `Deposit confirmed on ${sellExchange} — ${buyOrder.amount.toFixed(6)} ${baseAsset} received`);

    // ── Step 6: Internal transfer on sell exchange if needed ──────────────
    if (sellAccInfo.requiresInternalTransfer) {
      updateTradeStep(tradeId, 'transferring_to_trading',
        `${sellExchange}: Moving ${baseAsset} to ${sellAccInfo.tradingAccountLabel}...`);

      await executeInternalTransfer(sellExchange, sellEx, buyOrder.amount);

      updateTradeStep(tradeId, 'transfer_to_trading_done',
        `${sellExchange}: ${baseAsset} ready in ${sellAccInfo.tradingAccountLabel}`);
    }

    // ── Step 7: Sell asset ────────────────────────────────────────────────
    updateTradeStep(tradeId, 'selling',
      `Placing market sell for ${buyOrder.amount.toFixed(6)} ${baseAsset} on ${sellExchange}...`);

    const sellOrder = await placeMarketSell(sellExchange, pair, buyOrder.amount);

    const grossRevenue  = sellOrder.cost;
    const buyFeeAmt     = amount * (opportunity.buyFee / 100);
    const sellFeeAmt    = grossRevenue * (opportunity.sellFee / 100);
    const wdFeeAmt      = opportunity.withdrawalFeeUSD ?? 1;
    const netProfit     = grossRevenue - amount - buyFeeAmt - sellFeeAmt - wdFeeAmt;
    const totalAfter    = amount + netProfit;

    // ── Step 8: Complete ──────────────────────────────────────────────────
    updateTradeStep(tradeId, 'completed',
      `Trade completed successfully! Net profit: $${netProfit.toFixed(2)} USDT`,
      {
        netProfit:      parseFloat(netProfit.toFixed(2)),
        totalAfter:     parseFloat(totalAfter.toFixed(2)),
        buyOrderId:     buyOrder.orderId,
        sellOrderId:    sellOrder.orderId,
        sellPrice:      sellOrder.price,
      });

    // Update history record
    historyStore.updateTrade(tradeId, {
      status:         'completed',
      netProfit:      parseFloat(netProfit.toFixed(2)),
      totalAfter:     parseFloat(totalAfter.toFixed(2)),
      buyPrice:       buyOrder.price,
      sellPrice:      sellOrder.price,
      buyOrderId:     buyOrder.orderId,
      sellOrderId:    sellOrder.orderId,
      completedAt:    Date.now(),
    });

  } catch (err) {
    console.error(`[Bot] Trade ${tradeId} error at step ${executingTrades.get(tradeId)?.currentStep}:`, err.message);
    updateTradeStep(tradeId, 'failed', err.message);

    historyStore.updateTrade(tradeId, {
      status: 'failed',
      error:  err.message,
    });
  }
}

/**
 * Poll for deposit confirmation on sell exchange.
 * In production this would poll ex.fetchDeposits() every 30 seconds.
 * Times out after 30 minutes.
 */
async function waitForDeposit(exchange, exchangeInstance, asset, expectedAmount, txId) {
  const MAX_WAIT_MS    = 30 * 60 * 1000; // 30 minutes
  const POLL_INTERVAL  = 30 * 1000;      // 30 seconds
  const startTime      = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    try {
      const deposits = await exchangeInstance.fetchDeposits(asset, undefined, 20);
      const found = deposits.find(d =>
        (d.txid === txId || !txId) &&
        d.status === 'ok' &&
        Math.abs(d.amount - expectedAmount) < expectedAmount * 0.02 // 2% tolerance for fees
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

  throw new Error(`Deposit timeout: ${asset} not received on ${exchange} within 30 minutes`);
}
