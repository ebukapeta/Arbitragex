export type Exchange = 'Binance' | 'Bybit' | 'MEXC' | 'HTX' | 'KuCoin' | 'BitMart' | 'Bitget' | 'Gate.io';

export const EXCHANGES: Exchange[] = ['Binance', 'Bybit', 'MEXC', 'HTX', 'KuCoin', 'BitMart', 'Bitget', 'Gate.io'];

// CCXT exchange IDs mapped to our exchange names
export const CCXT_IDS: Record<Exchange, string> = {
  'Binance': 'binance',
  'Bybit':   'bybit',
  'MEXC':    'mexc',
  'HTX':     'htx',
  'KuCoin':  'kucoin',
  'BitMart': 'bitmart',
  'Bitget':  'bitget',
  'Gate.io': 'gateio',
};

// Each exchange's required API credential fields
export const EXCHANGE_API_FIELDS: Record<Exchange, { label: string; key: string; secret: boolean }[]> = {
  'Binance': [
    { label: 'API Key',    key: 'apiKey',    secret: false },
    { label: 'API Secret', key: 'apiSecret', secret: true  },
  ],
  'Bybit': [
    { label: 'API Key',    key: 'apiKey',    secret: false },
    { label: 'API Secret', key: 'apiSecret', secret: true  },
  ],
  'MEXC': [
    { label: 'API Key',    key: 'apiKey',    secret: false },
    { label: 'API Secret', key: 'apiSecret', secret: true  },
  ],
  'HTX': [
    { label: 'Access Key', key: 'apiKey',    secret: false },
    { label: 'Secret Key', key: 'apiSecret', secret: true  },
  ],
  'KuCoin': [
    { label: 'API Key',        key: 'apiKey',        secret: false },
    { label: 'API Secret',     key: 'apiSecret',     secret: true  },
    { label: 'API Passphrase', key: 'apiPassphrase', secret: true  },
  ],
  'BitMart': [
    { label: 'API Key',    key: 'apiKey',    secret: false },
    { label: 'API Secret', key: 'apiSecret', secret: true  },
    { label: 'Memo',       key: 'apiMemo',   secret: false },
  ],
  'Bitget': [
    { label: 'API Key',        key: 'apiKey',        secret: false },
    { label: 'API Secret',     key: 'apiSecret',     secret: true  },
    { label: 'API Passphrase', key: 'apiPassphrase', secret: true  },
  ],
  'Gate.io': [
    { label: 'API Key',    key: 'apiKey',    secret: false },
    { label: 'API Secret', key: 'apiSecret', secret: true  },
  ],
};

// API documentation URLs for each exchange
export const EXCHANGE_API_DOCS: Record<Exchange, string> = {
  'Binance': 'https://www.binance.com/en/my/settings/api-management',
  'Bybit':   'https://www.bybit.com/app/user/api-management',
  'MEXC':    'https://www.mexc.com/user/openapi',
  'HTX':     'https://www.htx.com/en-us/apikey/',
  'KuCoin':  'https://www.kucoin.com/account/api',
  'BitMart': 'https://www.bitmart.com/api-config/en-US',
  'Bitget':  'https://www.bitget.com/en/account/newapi',
  'Gate.io': 'https://www.gate.io/myaccount/apikeys',
};

// API permissions required by exchange
export const EXCHANGE_API_PERMISSIONS: Record<Exchange, string[]> = {
  'Binance': ['Read Info', 'Spot Trading', 'Withdrawals (optional)'],
  'Bybit':   ['Read-Write', 'Trade', 'Wallet'],
  'MEXC':    ['Account Read', 'Spot Trade', 'Withdraw'],
  'HTX':     ['Read', 'Trade', 'Withdraw'],
  'KuCoin':  ['General', 'Trade', 'Transfer'],
  'BitMart': ['Read', 'Trade', 'Withdraw'],
  'Bitget':  ['Read', 'Spot Trade', 'Withdraw'],
  'Gate.io': ['Read Account', 'Spot Trade', 'Withdrawal'],
};

export interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiMemo?: string;
}

export interface ExchangeBalance {
  exchange: Exchange;
  balance: number;
  connected: boolean;
  credentials: ApiCredentials;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  lastUpdated: number | null;
  connectionError?: string;
}

export interface ArbitrageOpportunity {
  id: string;
  pair: string;
  baseToken: string;
  buyExchange: Exchange;
  buyPrice: number;
  sellExchange: Exchange;
  sellPrice: number;
  buyFee: number;
  sellFee: number;
  withdrawalFee: number;
  withdrawalFeeUSD: number;
  profitBeforeFees: number;
  netProfit: number;
  netProfitPct: number;
  withdrawalEnabled: boolean;
  depositEnabled: boolean;
  chain: string;
  chainCompatible: boolean;
  commonChains: string[];
  viableChains: string[];   // common chains where BOTH withdrawal AND deposit are enabled
  buyAsk?: number;          // execution price for market buy
  sellBid?: number;         // execution price for market sell
  /** Low end of 24h volume on the BUY exchange (USDT) */
  buyVolume24hLow: number;
  /** Low end of 24h volume on the SELL exchange (USDT) */
  sellVolume24hLow: number;
  /** Combined minimum (used for scanner filter) */
  volume24hLow: number;
  discoveredAt: number;
  firstSeenAt:  number;
  executing?: boolean;
}

export interface TradeHistory {
  id: string;
  timestamp: number;
  pair: string;
  buyExchange: Exchange;
  buyPrice: number;
  sellExchange: Exchange;
  sellPrice: number;
  amount: number;
  buyFee: number;
  sellFee: number;
  withdrawalFee: number;
  totalAfterTrade: number;
  netProfit: number;
  chain: string;
  status: 'completed' | 'failed' | 'pending';
}

export interface USDTNetwork {
  network: string;       // e.g. "TRC20", "ERC20", "BEP20"
  label: string;         // friendly display name
  withdrawFee: number;   // flat fee in USDT
  minWithdraw: number;   // minimum withdrawal in USDT
  withdrawEnabled: boolean;
  depositEnabled: boolean;
  confirmations: number; // blocks required
  estimatedTime: string; // e.g. "~3 min"
}

export interface TransferHistory {
  id: string;
  timestamp: number;
  fromExchange: Exchange;
  toExchange: Exchange;
  amount: number;
  network: string;
  status: 'completed' | 'failed' | 'pending';
  steps?: TransferStep[];
}

export interface TransferStep {
  key: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  message?: string;
}

export interface ScannerParams {
  buyExchanges: Exchange[];
  sellExchanges: Exchange[];
  minProfitPct: number;
  maxProfitPct: number;
  minVolume24hLow: number;
}

// ─── Exchange account types ───────────────────────────────────────────────────
// Research-verified: where USDT deposits land on each exchange
// and whether an internal transfer to spot/trading is required before trading.
export interface ExchangeAccountInfo {
  depositAccount: 'spot' | 'funding' | 'main' | 'assets';
  depositAccountLabel: string;   // human-readable label for deposit/funding account
  tradingAccountLabel: string;   // human-readable label for the spot/trading account
  requiresInternalTransfer: boolean;
  transferPath: string;          // e.g. "Funding → Spot"
  notes: string;
}

export const EXCHANGE_ACCOUNT_INFO: Record<Exchange, ExchangeAccountInfo> = {
  // Binance: deposits go to Spot Wallet directly — no transfer needed
  'Binance': {
    depositAccount: 'spot',
    depositAccountLabel: 'Spot Wallet',
    tradingAccountLabel: 'Spot Wallet',
    requiresInternalTransfer: false,
    transferPath: 'Deposits directly to Spot Wallet',
    notes: 'USDT deposits land in Spot Wallet. Ready to trade immediately.',
  },
  // Bybit: deposits go to Funding Account — must transfer to Unified Trading Account
  'Bybit': {
    depositAccount: 'funding',
    depositAccountLabel: 'Funding Account',
    tradingAccountLabel: 'Unified Trading Account',
    requiresInternalTransfer: true,
    transferPath: 'Funding Account → Unified Trading Account',
    notes: 'USDT deposits land in Funding Account. Bot will auto-transfer to Unified Trading Account before trading.',
  },
  // MEXC: deposits go to Spot Account directly
  'MEXC': {
    depositAccount: 'spot',
    depositAccountLabel: 'Spot Account',
    tradingAccountLabel: 'Spot Account',
    requiresInternalTransfer: false,
    transferPath: 'Deposits directly to Spot Account',
    notes: 'USDT deposits land in Spot Account. Ready to trade immediately.',
  },
  // HTX (Huobi): deposits go to Spot Account directly
  'HTX': {
    depositAccount: 'spot',
    depositAccountLabel: 'Spot Account',
    tradingAccountLabel: 'Spot Account',
    requiresInternalTransfer: false,
    transferPath: 'Deposits directly to Spot Account',
    notes: 'USDT deposits land in Spot Account on HTX. Ready to trade immediately.',
  },
  // KuCoin: deposits go to Main Account — must transfer to Trading Account
  'KuCoin': {
    depositAccount: 'main',
    depositAccountLabel: 'Main Account',
    tradingAccountLabel: 'Trading Account',
    requiresInternalTransfer: true,
    transferPath: 'Main Account → Trading Account',
    notes: 'USDT deposits land in Main Account. Bot will auto-transfer to Trading Account before trading.',
  },
  // BitMart: deposits go to Assets (Spot) Account directly
  'BitMart': {
    depositAccount: 'assets',
    depositAccountLabel: 'Assets (Spot) Account',
    tradingAccountLabel: 'Assets (Spot) Account',
    requiresInternalTransfer: false,
    transferPath: 'Deposits directly to Assets Account',
    notes: 'USDT deposits land in the Assets (Spot) account. Ready to trade immediately.',
  },
  // Bitget: deposits go to Funding Account — must transfer to Spot Account
  'Bitget': {
    depositAccount: 'funding',
    depositAccountLabel: 'Funding Account',
    tradingAccountLabel: 'Spot Account',
    requiresInternalTransfer: true,
    transferPath: 'Funding Account → Spot Account',
    notes: 'USDT deposits land in Funding Account. Bot will auto-transfer to Spot Account before trading.',
  },
  // Gate.io: deposits go to Spot Account directly
  'Gate.io': {
    depositAccount: 'spot',
    depositAccountLabel: 'Spot Account',
    tradingAccountLabel: 'Spot Account',
    requiresInternalTransfer: false,
    transferPath: 'Deposits directly to Spot Account',
    notes: 'USDT deposits land in Spot Account on Gate.io. Ready to trade immediately.',
  },
};

// ─── Trade execution step tracking ───────────────────────────────────────────
export type TradeStep =
  | 'idle'
  | 'checking_accounts'
  | 'transferring_to_spot'   // internal exchange transfer (funding → spot)
  | 'buying'
  | 'withdrawing'
  | 'waiting_deposit'
  | 'transferring_to_trading' // internal transfer on sell exchange (if needed)
  | 'selling'
  | 'completed'
  | 'failed';

export interface TradeExecutionState {
  step: TradeStep;
  message: string;
  netProfit?: number;
  error?: string;
}

export interface BotState {
  running: boolean;
  scanning: boolean;
  lastScan: number | null;
}
