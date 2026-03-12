/**
 * Account Manager — Exchange account structure awareness
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the difference between exchanges where deposits land directly in
 * the spot/trading account vs. exchanges where deposits land in a separate
 * funding/main account first.
 *
 * Research-verified deposit account structure (2024):
 *
 *   Exchange   | Deposit lands in      | Transfer needed to trade?
 *   ───────────┼───────────────────────┼──────────────────────────
 *   Binance    | Spot Wallet           | No — ready immediately
 *   Bybit      | Funding Account       | Yes → Unified Trading Acct
 *   MEXC       | Spot Account          | No — ready immediately
 *   HTX        | Spot Account          | No — ready immediately
 *   KuCoin     | Main Account          | Yes → Trading Account
 *   BitMart    | Assets (Spot) Account | No — ready immediately
 *   Bitget     | Funding Account       | Yes → Spot Account
 *   Gate.io    | Spot Account          | No — ready immediately
 */

export const ACCOUNT_INFO = {
  'Binance': {
    depositAccount:            'spot',
    depositAccountLabel:       'Spot Wallet',
    depositAccountCCXT:        'spot',      // CCXT account type for fetching
    tradingAccount:            'spot',
    tradingAccountLabel:       'Spot Wallet',
    tradingAccountCCXT:        'spot',
    requiresInternalTransfer:  false,
    transferPath:              'Deposits directly to Spot Wallet',
    notes:                     'USDT deposits land in Spot Wallet. Ready to trade immediately.',
  },

  'Bybit': {
    depositAccount:            'funding',
    depositAccountLabel:       'Funding Account',
    depositAccountCCXT:        'funding',   // CCXT type: 'funding'
    tradingAccount:            'unified',
    tradingAccountLabel:       'Unified Trading Account',
    tradingAccountCCXT:        'unified',   // CCXT type: 'unified'
    requiresInternalTransfer:  true,
    transferPath:              'Funding Account → Unified Trading Account',
    notes:                     'USDT deposits land in Funding Account. Bot auto-transfers to Unified Trading Account.',
  },

  'MEXC': {
    depositAccount:            'spot',
    depositAccountLabel:       'Spot Account',
    depositAccountCCXT:        'spot',
    tradingAccount:            'spot',
    tradingAccountLabel:       'Spot Account',
    tradingAccountCCXT:        'spot',
    requiresInternalTransfer:  false,
    transferPath:              'Deposits directly to Spot Account',
    notes:                     'USDT deposits land in Spot Account. Ready to trade immediately.',
  },

  'HTX': {
    depositAccount:            'spot',
    depositAccountLabel:       'Spot Account',
    depositAccountCCXT:        'spot',
    tradingAccount:            'spot',
    tradingAccountLabel:       'Spot Account',
    tradingAccountCCXT:        'spot',
    requiresInternalTransfer:  false,
    transferPath:              'Deposits directly to Spot Account',
    notes:                     'USDT deposits land in Spot Account on HTX. Ready to trade immediately.',
  },

  'KuCoin': {
    depositAccount:            'main',
    depositAccountLabel:       'Main Account',
    depositAccountCCXT:        'main',      // CCXT type: 'main'
    tradingAccount:            'trading',
    tradingAccountLabel:       'Trading Account',
    tradingAccountCCXT:        'trade',     // CCXT type: 'trade'
    requiresInternalTransfer:  true,
    transferPath:              'Main Account → Trading Account',
    notes:                     'USDT deposits land in Main Account. Bot auto-transfers to Trading Account.',
  },

  'BitMart': {
    depositAccount:            'assets',
    depositAccountLabel:       'Assets (Spot) Account',
    depositAccountCCXT:        'spot',
    tradingAccount:            'spot',
    tradingAccountLabel:       'Assets (Spot) Account',
    tradingAccountCCXT:        'spot',
    requiresInternalTransfer:  false,
    transferPath:              'Deposits directly to Assets Account',
    notes:                     'USDT deposits land in Assets (Spot) account. Ready to trade immediately.',
  },

  'Bitget': {
    depositAccount:            'funding',
    depositAccountLabel:       'Funding Account',
    depositAccountCCXT:        'funding',   // CCXT type: 'funding'
    tradingAccount:            'spot',
    tradingAccountLabel:       'Spot Account',
    tradingAccountCCXT:        'spot',      // CCXT type: 'spot'
    requiresInternalTransfer:  true,
    transferPath:              'Funding Account → Spot Account',
    notes:                     'USDT deposits land in Funding Account. Bot auto-transfers to Spot Account.',
  },

  'Gate.io': {
    depositAccount:            'spot',
    depositAccountLabel:       'Spot Account',
    depositAccountCCXT:        'spot',
    tradingAccount:            'spot',
    tradingAccountLabel:       'Spot Account',
    tradingAccountCCXT:        'spot',
    requiresInternalTransfer:  false,
    transferPath:              'Deposits directly to Spot Account',
    notes:                     'USDT deposits land in Spot Account on Gate.io. Ready to trade immediately.',
  },
};

/**
 * Get account info for an exchange.
 */
export function getAccountInfo(exchange) {
  return ACCOUNT_INFO[exchange] ?? null;
}

/**
 * Check where USDT currently sits on an exchange.
 * Returns { spotBalance, fundingBalance, needsTransfer, amount, account }
 */
export async function checkUSDTLocation(exchange, exchangeInstance) {
  const info = ACCOUNT_INFO[exchange];
  if (!info) throw new Error(`Unknown exchange: ${exchange}`);

  if (!info.requiresInternalTransfer) {
    // Simple exchange — all funds in spot
    try {
      const balance = await exchangeInstance.fetchBalance({ type: info.tradingAccountCCXT });
      const usdt = balance?.USDT?.free ?? balance?.total?.USDT ?? 0;
      return {
        spotBalance: parseFloat(usdt.toFixed(2)),
        fundingBalance: 0,
        needsTransfer: false,
        readyToTrade: true,
        account: info.tradingAccountLabel,
      };
    } catch {
      const balance = await exchangeInstance.fetchBalance();
      const usdt = balance?.USDT?.free ?? 0;
      return {
        spotBalance: parseFloat(usdt.toFixed(2)),
        fundingBalance: 0,
        needsTransfer: false,
        readyToTrade: true,
        account: info.tradingAccountLabel,
      };
    }
  }

  // Exchange with separate accounts — check both
  let spotBalance = 0;
  let fundingBalance = 0;

  try {
    const spot = await exchangeInstance.fetchBalance({ type: info.tradingAccountCCXT });
    spotBalance = parseFloat((spot?.USDT?.free ?? spot?.total?.USDT ?? 0).toFixed(2));
  } catch { /* ignore */ }

  try {
    const funding = await exchangeInstance.fetchBalance({ type: info.depositAccountCCXT });
    fundingBalance = parseFloat((funding?.USDT?.free ?? funding?.total?.USDT ?? 0).toFixed(2));
  } catch { /* ignore */ }

  return {
    spotBalance,
    fundingBalance,
    needsTransfer: fundingBalance > 0,
    readyToTrade: spotBalance > 0,
    account: info.depositAccountLabel,
  };
}

/**
 * Execute internal transfer from deposit account to trading account.
 * Called automatically by the bot before buying or before withdrawal on sell side.
 */
export async function executeInternalTransfer(exchange, exchangeInstance, amount) {
  const info = ACCOUNT_INFO[exchange];
  if (!info) throw new Error(`Unknown exchange: ${exchange}`);
  if (!info.requiresInternalTransfer) {
    return { skipped: true, reason: 'No internal transfer needed for this exchange' };
  }

  console.log(`[AccountManager] ${exchange}: Transferring ${amount} USDT: ${info.transferPath}`);

  try {
    const result = await exchangeInstance.transfer(
      'USDT',
      amount,
      info.depositAccountCCXT,
      info.tradingAccountCCXT,
    );

    return {
      skipped: false,
      transferId: result.id,
      amount,
      from: info.depositAccountLabel,
      to: info.tradingAccountLabel,
      success: true,
    };
  } catch (err) {
    throw new Error(
      `Internal transfer failed on ${exchange} (${info.transferPath}): ${err.message}`
    );
  }
}
