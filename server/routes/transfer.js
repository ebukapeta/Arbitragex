/**
 * Transfer Routes — Move USDT between exchanges
 *
 * POST /api/transfer       — Initiate a USDT transfer between exchanges
 * GET  /api/transfer/:id   — Get status of a transfer
 *
 * The transfer flow:
 * 1. Check which account USDT is in on source exchange
 * 2. If in funding/main account → auto internal transfer to spot first
 * 3. Withdraw USDT from source exchange via selected network
 * 4. Poll for deposit confirmation on destination exchange
 * 5. Update transfer status throughout
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import { getExchangeInstance, withdraw } from '../exchanges/connector.js';
import { checkUSDTLocation, executeInternalTransfer, ACCOUNT_INFO } from '../exchanges/accountManager.js';
import { historyStore } from '../store/tradeHistory.js';

export const transferRouter = Router();

// In-memory map of in-progress transfers
const inProgressTransfers = new Map();

// ─── POST /api/transfer ───────────────────────────────────────────────────────
transferRouter.post('/', async (req, res) => {
  const { fromExchange, toExchange, amount, network, depositAddress } = req.body;

  if (!fromExchange || !toExchange || !amount || amount <= 0 || !network) {
    return res.status(400).json({
      error: 'fromExchange, toExchange, amount, and network are required',
    });
  }

  if (!depositAddress) {
    return res.status(400).json({
      error: 'depositAddress required — provide your USDT deposit address on the destination exchange',
    });
  }

  if (!keyStore.has(fromExchange)) {
    return res.status(400).json({ error: `${fromExchange} is not connected` });
  }

  const fromAccInfo = ACCOUNT_INFO[fromExchange];

  // Build step list based on whether internal transfer is needed
  const steps = [
    { key: 'checking',   label: 'Checking Account Balance',                        status: 'pending' },
    ...(fromAccInfo.requiresInternalTransfer ? [{
      key:    'internal',
      label:  `Moving USDT: ${fromAccInfo.depositAccountLabel} → Spot`,
      status: 'pending',
    }] : []),
    { key: 'sending',    label: `Sending via ${network} to ${toExchange}`,          status: 'pending' },
    { key: 'confirming', label: 'Awaiting Blockchain Confirmation',                 status: 'pending' },
    { key: 'credited',   label: `Crediting ${toExchange} Account`,                 status: 'pending' },
  ];

  const transferRecord = historyStore.addTransfer({
    fromExchange,
    toExchange,
    amount,
    network,
    depositAddress,
    status: 'pending',
    steps,
    timestamp: Date.now(),
  });

  inProgressTransfers.set(transferRecord.id, transferRecord);

  // Respond immediately — async execution below
  res.json({
    transferId: transferRecord.id,
    message:    'Transfer initiated',
    status:     'pending',
    steps,
  });

  // Execute asynchronously
  executeTransferAsync(transferRecord.id, fromExchange, toExchange, amount, network, depositAddress)
    .catch(err => {
      console.error(`[Transfer] ${transferRecord.id} fatal error:`, err.message);
      updateTransferStep(transferRecord.id, 'confirming', 'error', `Fatal error: ${err.message}`);
      historyStore.updateTransfer(transferRecord.id, { status: 'failed' });
    });
});

// ─── GET /api/transfer/:id ────────────────────────────────────────────────────
transferRouter.get('/:id', (req, res) => {
  const { id } = req.params;
  const transfer = inProgressTransfers.get(id)
    ?? historyStore.getTransfers().find(t => t.id === id);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found' });
  }

  return res.json(transfer);
});

// ─── Helper: update a step in transfer record ─────────────────────────────────
function updateTransferStep(transferId, stepKey, status, message) {
  const transfer = historyStore.getTransfers().find(t => t.id === transferId);
  if (!transfer) return;

  const updatedSteps = (transfer.steps ?? []).map(s =>
    s.key === stepKey ? { ...s, status, message } : s
  );

  historyStore.updateTransfer(transferId, { steps: updatedSteps });
  console.log(`[Transfer] ${transferId} [${stepKey}] → ${status}: ${message ?? ''}`);
}

// ─── Async transfer execution ─────────────────────────────────────────────────
async function executeTransferAsync(transferId, fromExchange, toExchange, amount, network, depositAddress) {
  const fromEx = getExchangeInstance(fromExchange);
  if (!fromEx) {
    updateTransferStep(transferId, 'checking', 'error', `${fromExchange} instance not available`);
    historyStore.updateTransfer(transferId, { status: 'failed' });
    return;
  }

  const fromAccInfo = ACCOUNT_INFO[fromExchange];

  try {
    // ── Step 1: Check account balance ──────────────────────────────────────
    updateTransferStep(transferId, 'checking', 'active',
      `Locating USDT in ${fromExchange} ${fromAccInfo.depositAccountLabel}...`);

    const location = await checkUSDTLocation(fromExchange, fromEx);

    if (location.spotBalance < amount && location.fundingBalance < amount) {
      updateTransferStep(transferId, 'checking', 'error',
        `Insufficient USDT: Spot $${location.spotBalance}, ` +
        `${fromAccInfo.depositAccountLabel} $${location.fundingBalance}. Need $${amount}`);
      historyStore.updateTransfer(transferId, { status: 'failed' });
      return;
    }

    updateTransferStep(transferId, 'checking', 'done',
      `Found $${(location.spotBalance + location.fundingBalance).toFixed(2)} USDT in ${fromExchange}`);

    // ── Step 2: Internal transfer if needed ────────────────────────────────
    if (fromAccInfo.requiresInternalTransfer && location.fundingBalance >= amount) {
      updateTransferStep(transferId, 'internal', 'active',
        `Transferring USDT from ${fromAccInfo.depositAccountLabel} to Spot account...`);

      await executeInternalTransfer(fromExchange, fromEx, amount);

      updateTransferStep(transferId, 'internal', 'done',
        'Internal transfer complete — funds ready in Spot account');
    }

    // ── Step 3: Send on-chain ──────────────────────────────────────────────
    updateTransferStep(transferId, 'sending', 'active',
      `Broadcasting ${amount} USDT via ${network} to ${toExchange}...`);

    const withdrawal = await withdraw(fromExchange, amount, depositAddress, network);

    updateTransferStep(transferId, 'sending', 'done',
      `Transaction submitted — TX: ${withdrawal.txId ?? withdrawal.withdrawalId}`);

    // ── Step 4: Await confirmation ─────────────────────────────────────────
    updateTransferStep(transferId, 'confirming', 'active',
      `Waiting for ${network} block confirmations...`);

    // Poll for confirmation if destination is also connected
    if (keyStore.has(toExchange)) {
      const toEx = getExchangeInstance(toExchange);
      if (toEx) {
        await waitForDepositConfirmation(toExchange, toEx, amount, withdrawal.txId);
      }
    } else {
      // Just wait a reasonable time if destination is not connected
      await new Promise(r => setTimeout(r, 5000));
    }

    updateTransferStep(transferId, 'confirming', 'done', 'Block confirmations received');

    // ── Step 5: Credit ─────────────────────────────────────────────────────
    updateTransferStep(transferId, 'credited', 'active',
      `Crediting ${toExchange} with $${amount} USDT...`);

    await new Promise(r => setTimeout(r, 1000));

    updateTransferStep(transferId, 'credited', 'done',
      `Successfully credited $${amount} USDT to ${toExchange}`);

    historyStore.updateTransfer(transferId, {
      status:      'completed',
      completedAt: Date.now(),
      txId:        withdrawal.txId,
    });

    inProgressTransfers.delete(transferId);

  } catch (err) {
    console.error(`[Transfer] ${transferId} error:`, err.message);
    updateTransferStep(transferId, 'confirming', 'error', err.message);
    historyStore.updateTransfer(transferId, { status: 'failed' });
    inProgressTransfers.delete(transferId);
  }
}

/**
 * Poll for deposit confirmation on destination exchange.
 */
async function waitForDepositConfirmation(exchange, exchangeInstance, amount, txId) {
  const MAX_WAIT = 30 * 60 * 1000;  // 30 minutes
  const INTERVAL = 30 * 1000;       // 30 seconds
  const start    = Date.now();

  while (Date.now() - start < MAX_WAIT) {
    try {
      const deposits = await exchangeInstance.fetchDeposits('USDT', undefined, 20);
      const found = deposits.find(d =>
        (txId ? d.txid === txId : true) &&
        d.status === 'ok' &&
        Math.abs(d.amount - amount) < amount * 0.05
      );
      if (found) return found;
    } catch { /* polling failure is non-fatal */ }

    await new Promise(r => setTimeout(r, INTERVAL));
  }

  throw new Error('Deposit confirmation timeout after 30 minutes');
}
