import { Exchange, ExchangeBalance, ArbitrageOpportunity, TradeHistory, USDTNetwork } from '../types';

// ─── Real exchange taker fees (spot) ────────────────────────────────────────
export const EXCHANGE_FEES: Record<Exchange, { maker: number; taker: number }> = {
  'Binance': { maker: 0.001,  taker: 0.001  },
  'Bybit':   { maker: 0.001,  taker: 0.001  },
  'MEXC':    { maker: 0.002,  taker: 0.002  },
  'HTX':     { maker: 0.002,  taker: 0.002  },
  'KuCoin':  { maker: 0.001,  taker: 0.001  },
  'BitMart': { maker: 0.0025, taker: 0.0025 },
  'Bitget':  { maker: 0.001,  taker: 0.001  },
  'Gate.io': { maker: 0.002,  taker: 0.002  },
};

// ─── Withdrawal fees per coin (in coin units) ────────────────────────────────
// These are the actual on-chain withdrawal fees charged by each exchange
export const WITHDRAWAL_FEES: Record<Exchange, Record<string, number>> = {
  'Binance': {
    'BTC': 0.0002,  'ETH': 0.0003,  'BNB': 0.0005,  'SOL': 0.008,
    'XRP': 0.25,    'DOGE': 5,      'ADA': 1,       'AVAX': 0.01,
    'LINK': 0.27,   'DOT': 0.1,     'MATIC': 0.1,   'UNI': 0.15,
    'LTC': 0.001,   'ATOM': 0.005,  'FIL': 0.001,   'APT': 0.007,
    'ARB': 0.1,     'OP': 0.1,      'SUI': 0.02,    'PEPE': 2090000,
    'WIF': 0.01,    'BONK': 10000,  'TIA': 0.005,   'NEAR': 0.05,
    'INJ': 0.005,
  },
  'Bybit': {
    'BTC': 0.0002,  'ETH': 0.0004,  'BNB': 0.0006,  'SOL': 0.009,
    'XRP': 0.25,    'DOGE': 5,      'ADA': 1,       'AVAX': 0.01,
    'LINK': 0.3,    'DOT': 0.12,    'MATIC': 0.12,  'UNI': 0.18,
    'LTC': 0.001,   'ATOM': 0.006,  'FIL': 0.001,   'APT': 0.008,
    'ARB': 0.12,    'OP': 0.12,     'SUI': 0.025,   'PEPE': 2300000,
    'WIF': 0.012,   'BONK': 12000,  'TIA': 0.006,   'NEAR': 0.06,
    'INJ': 0.006,
  },
  'MEXC': {
    'BTC': 0.0002,  'ETH': 0.0004,  'BNB': 0.0007,  'SOL': 0.01,
    'XRP': 0.3,     'DOGE': 8,      'ADA': 1.5,     'AVAX': 0.02,
    'LINK': 0.35,   'DOT': 0.15,    'MATIC': 0.15,  'UNI': 0.2,
    'LTC': 0.001,   'ATOM': 0.008,  'FIL': 0.002,   'APT': 0.01,
    'ARB': 0.15,    'OP': 0.15,     'SUI': 0.03,    'PEPE': 3000000,
    'WIF': 0.015,   'BONK': 15000,  'TIA': 0.008,   'NEAR': 0.08,
    'INJ': 0.008,
  },
  'HTX': {
    'BTC': 0.0003,  'ETH': 0.0005,  'BNB': 0.001,   'SOL': 0.01,
    'XRP': 0.3,     'DOGE': 10,     'ADA': 2,       'AVAX': 0.02,
    'LINK': 0.4,    'DOT': 0.2,     'MATIC': 0.2,   'UNI': 0.25,
    'LTC': 0.002,   'ATOM': 0.01,   'FIL': 0.002,   'APT': 0.012,
    'ARB': 0.2,     'OP': 0.2,      'SUI': 0.04,    'PEPE': 3500000,
    'WIF': 0.02,    'BONK': 20000,  'TIA': 0.01,    'NEAR': 0.1,
    'INJ': 0.01,
  },
  'KuCoin': {
    'BTC': 0.0002,  'ETH': 0.0003,  'BNB': 0.0006,  'SOL': 0.008,
    'XRP': 0.25,    'DOGE': 5,      'ADA': 1,       'AVAX': 0.01,
    'LINK': 0.3,    'DOT': 0.1,     'MATIC': 0.1,   'UNI': 0.16,
    'LTC': 0.001,   'ATOM': 0.005,  'FIL': 0.001,   'APT': 0.008,
    'ARB': 0.12,    'OP': 0.12,     'SUI': 0.022,   'PEPE': 2200000,
    'WIF': 0.011,   'BONK': 11000,  'TIA': 0.005,   'NEAR': 0.055,
    'INJ': 0.005,
  },
  'BitMart': {
    'BTC': 0.0003,  'ETH': 0.0006,  'BNB': 0.001,   'SOL': 0.012,
    'XRP': 0.4,     'DOGE': 10,     'ADA': 2,       'AVAX': 0.025,
    'LINK': 0.45,   'DOT': 0.22,    'MATIC': 0.22,  'UNI': 0.28,
    'LTC': 0.002,   'ATOM': 0.012,  'FIL': 0.003,   'APT': 0.015,
    'ARB': 0.22,    'OP': 0.22,     'SUI': 0.045,   'PEPE': 4000000,
    'WIF': 0.022,   'BONK': 22000,  'TIA': 0.012,   'NEAR': 0.11,
    'INJ': 0.012,
  },
  'Bitget': {
    'BTC': 0.0002,  'ETH': 0.0003,  'BNB': 0.0006,  'SOL': 0.008,
    'XRP': 0.25,    'DOGE': 5,      'ADA': 1,       'AVAX': 0.012,
    'LINK': 0.28,   'DOT': 0.11,    'MATIC': 0.11,  'UNI': 0.16,
    'LTC': 0.001,   'ATOM': 0.006,  'FIL': 0.001,   'APT': 0.009,
    'ARB': 0.11,    'OP': 0.11,     'SUI': 0.022,   'PEPE': 2100000,
    'WIF': 0.011,   'BONK': 11000,  'TIA': 0.006,   'NEAR': 0.055,
    'INJ': 0.006,
  },
  'Gate.io': {
    'BTC': 0.0002,  'ETH': 0.0004,  'BNB': 0.0007,  'SOL': 0.009,
    'XRP': 0.28,    'DOGE': 6,      'ADA': 1.2,     'AVAX': 0.015,
    'LINK': 0.32,   'DOT': 0.13,    'MATIC': 0.13,  'UNI': 0.18,
    'LTC': 0.001,   'ATOM': 0.007,  'FIL': 0.001,   'APT': 0.009,
    'ARB': 0.13,    'OP': 0.13,     'SUI': 0.025,   'PEPE': 2400000,
    'WIF': 0.012,   'BONK': 12000,  'TIA': 0.007,   'NEAR': 0.065,
    'INJ': 0.007,
  },
};

// ─── Supported withdrawal chains per exchange ────────────────────────────────
// Real data based on each exchange's withdrawal network support
export const EXCHANGE_CHAINS: Record<Exchange, string[]> = {
  'Binance': ['BEP20', 'ERC20', 'TRC20', 'SOL', 'AVAX-C', 'ARBITRUM', 'OPTIMISM', 'MATIC'],
  'Bybit':   ['ERC20', 'BEP20', 'TRC20', 'SOL', 'ARBITRUM', 'OPTIMISM', 'MATIC'],
  'MEXC':    ['ERC20', 'BEP20', 'TRC20', 'SOL', 'AVAX-C', 'ARBITRUM', 'OPTIMISM', 'MATIC'],
  'HTX':     ['ERC20', 'TRC20', 'BEP20', 'ARBITRUM', 'OPTIMISM'],
  'KuCoin':  ['ERC20', 'BEP20', 'TRC20', 'SOL', 'MATIC', 'ARBITRUM', 'KCC'],
  'BitMart': ['ERC20', 'BEP20', 'TRC20', 'SOL'],
  'Bitget':  ['ERC20', 'BEP20', 'TRC20', 'SOL', 'ARBITRUM', 'OPTIMISM'],
  'Gate.io': ['ERC20', 'BEP20', 'TRC20', 'SOL', 'MATIC', 'AVAX-C', 'ARBITRUM', 'OPTIMISM'],
};

// ─── USDT withdrawal/deposit networks per exchange ───────────────────────────
// Real network data for USDT on each exchange (fees in USDT, as of 2024)
export const USDT_NETWORKS: Record<Exchange, USDTNetwork[]> = {
  'Binance': [
    { network: 'TRC20',    label: 'TRON (TRC20)',         withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain (BEP20)', withdrawFee: 0.8,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 15,  estimatedTime: '~1 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 4.5,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~5 min'  },
    { network: 'SOL',      label: 'Solana (SOL)',          withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 20,  estimatedTime: '~30 sec' },
    { network: 'ARBITRUM', label: 'Arbitrum One',          withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'OPTIMISM', label: 'Optimism (OP)',         withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'MATIC',    label: 'Polygon (MATIC)',       withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 128, estimatedTime: '~5 min'  },
    { network: 'AVAX-C',   label: 'Avalanche C-Chain',    withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
  ],
  'Bybit': [
    { network: 'TRC20',    label: 'TRON (TRC20)',         withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain (BEP20)', withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 15,  estimatedTime: '~1 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 5.0,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~5 min'  },
    { network: 'SOL',      label: 'Solana (SOL)',          withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 20,  estimatedTime: '~30 sec' },
    { network: 'ARBITRUM', label: 'Arbitrum One',          withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'OPTIMISM', label: 'Optimism (OP)',         withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'MATIC',    label: 'Polygon (MATIC)',       withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: false, confirmations: 128, estimatedTime: '~5 min'  },
  ],
  'MEXC': [
    { network: 'TRC20',    label: 'TRON (TRC20)',         withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain (BEP20)', withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 15,  estimatedTime: '~1 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 6.0,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~5 min'  },
    { network: 'SOL',      label: 'Solana (SOL)',          withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 20,  estimatedTime: '~30 sec' },
    { network: 'AVAX-C',   label: 'Avalanche C-Chain',    withdrawFee: 2.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'ARBITRUM', label: 'Arbitrum One',          withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'OPTIMISM', label: 'Optimism (OP)',         withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'MATIC',    label: 'Polygon (MATIC)',       withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: false, depositEnabled: true,  confirmations: 128, estimatedTime: '~5 min'  },
  ],
  'HTX': [
    { network: 'TRC20',    label: 'TRON (TRC20)',         withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 5.0,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~5 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain (BEP20)', withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 15,  estimatedTime: '~1 min'  },
    { network: 'ARBITRUM', label: 'Arbitrum One',          withdrawFee: 0.3,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'OPTIMISM', label: 'Optimism (OP)',         withdrawFee: 0.3,  minWithdraw: 10,   withdrawEnabled: false, depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
  ],
  'KuCoin': [
    { network: 'TRC20',    label: 'TRON (TRC20)',         withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain (BEP20)', withdrawFee: 0.8,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 15,  estimatedTime: '~1 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 4.0,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~5 min'  },
    { network: 'SOL',      label: 'Solana (SOL)',          withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 20,  estimatedTime: '~30 sec' },
    { network: 'MATIC',    label: 'Polygon (MATIC)',       withdrawFee: 0.9,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 128, estimatedTime: '~5 min'  },
    { network: 'ARBITRUM', label: 'Arbitrum One',          withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'KCC',      label: 'KuCoin Community Chain', withdrawFee: 0.1, minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~2 min'  },
  ],
  'BitMart': [
    { network: 'TRC20',    label: 'TRON (TRC20)',         withdrawFee: 1.0,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain (BEP20)', withdrawFee: 2.0,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 15,  estimatedTime: '~1 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 8.0,  minWithdraw: 30,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~5 min'  },
    { network: 'SOL',      label: 'Solana (SOL)',          withdrawFee: 2.0,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 20,  estimatedTime: '~30 sec' },
  ],
  'Bitget': [
    { network: 'TRC20',    label: 'TRON (TRC20)',         withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain (BEP20)', withdrawFee: 0.8,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 15,  estimatedTime: '~1 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 4.5,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~5 min'  },
    { network: 'SOL',      label: 'Solana (SOL)',          withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 20,  estimatedTime: '~30 sec' },
    { network: 'ARBITRUM', label: 'Arbitrum One',          withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'OPTIMISM', label: 'Optimism (OP)',         withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
  ],
  'Gate.io': [
    { network: 'TRC20',    label: 'TRON (TRC20)',         withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain (BEP20)', withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 15,  estimatedTime: '~1 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 5.0,  minWithdraw: 20,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 12,  estimatedTime: '~5 min'  },
    { network: 'SOL',      label: 'Solana (SOL)',          withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 20,  estimatedTime: '~30 sec' },
    { network: 'MATIC',    label: 'Polygon (MATIC)',       withdrawFee: 1.0,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 128, estimatedTime: '~5 min'  },
    { network: 'AVAX-C',   label: 'Avalanche C-Chain',    withdrawFee: 1.5,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,   estimatedTime: '~2 min'  },
    { network: 'ARBITRUM', label: 'Arbitrum One',          withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
    { network: 'OPTIMISM', label: 'Optimism (OP)',         withdrawFee: 0.1,  minWithdraw: 10,   withdrawEnabled: true,  depositEnabled: true,  confirmations: 2,   estimatedTime: '~1 min'  },
  ],
};

// ─── Token to preferred chain mapping ───────────────────────────────────────
export const TOKEN_PREFERRED_CHAIN: Record<string, string[]> = {
  'BTC':   ['BEP20', 'ERC20'],
  'ETH':   ['ERC20', 'ARBITRUM', 'OPTIMISM'],
  'BNB':   ['BEP20'],
  'SOL':   ['SOL'],
  'XRP':   ['ERC20', 'BEP20'],
  'DOGE':  ['BEP20', 'ERC20'],
  'ADA':   ['ERC20', 'BEP20'],
  'AVAX':  ['AVAX-C', 'BEP20'],
  'LINK':  ['ERC20', 'ARBITRUM', 'BEP20'],
  'DOT':   ['ERC20', 'BEP20'],
  'MATIC': ['MATIC', 'ERC20', 'BEP20'],
  'UNI':   ['ERC20', 'ARBITRUM'],
  'LTC':   ['BEP20', 'ERC20'],
  'ATOM':  ['ERC20', 'BEP20'],
  'FIL':   ['ERC20', 'BEP20'],
  'APT':   ['BEP20', 'ERC20'],
  'ARB':   ['ARBITRUM', 'ERC20'],
  'OP':    ['OPTIMISM', 'ERC20'],
  'SUI':   ['BEP20', 'ERC20'],
  'PEPE':  ['ERC20', 'BEP20'],
  'WIF':   ['SOL', 'BEP20'],
  'BONK':  ['SOL', 'BEP20'],
  'TIA':   ['ERC20', 'BEP20'],
  'NEAR':  ['ERC20', 'BEP20'],
  'INJ':   ['ERC20', 'BEP20'],
};

export const MOCK_PAIRS = [
  'BTC/USDT','ETH/USDT','BNB/USDT','SOL/USDT','XRP/USDT',
  'DOGE/USDT','ADA/USDT','AVAX/USDT','LINK/USDT','DOT/USDT',
  'MATIC/USDT','UNI/USDT','LTC/USDT','ATOM/USDT','FIL/USDT',
  'APT/USDT','ARB/USDT','OP/USDT','SUI/USDT','PEPE/USDT',
  'WIF/USDT','BONK/USDT','TIA/USDT','NEAR/USDT','INJ/USDT',
];

export const BASE_PRICES: Record<string, number> = {
  'BTC/USDT': 67420, 'ETH/USDT': 3510, 'BNB/USDT': 582, 'SOL/USDT': 168,
  'XRP/USDT': 0.523, 'DOGE/USDT': 0.148, 'ADA/USDT': 0.452, 'AVAX/USDT': 34.5,
  'LINK/USDT': 14.2, 'DOT/USDT': 7.35, 'MATIC/USDT': 0.72, 'UNI/USDT': 8.9,
  'LTC/USDT': 84.3, 'ATOM/USDT': 9.12, 'FIL/USDT': 5.61, 'APT/USDT': 9.87,
  'ARB/USDT': 1.02, 'OP/USDT': 2.41, 'SUI/USDT': 1.87, 'PEPE/USDT': 0.00001234,
  'WIF/USDT': 2.54, 'BONK/USDT': 0.0000234, 'TIA/USDT': 10.34, 'NEAR/USDT': 7.82,
  'INJ/USDT': 28.4,
};

// ─── Base 24h low volume per pair (USDT) — each exchange varies ±30% ─────────
// These represent the LOW end of the 24h trading volume range
export const VOLUME_LOW: Record<string, number> = {
  'BTC/USDT': 12000000, 'ETH/USDT': 8500000, 'BNB/USDT': 3200000, 'SOL/USDT': 4100000,
  'XRP/USDT': 2800000, 'DOGE/USDT': 1900000, 'ADA/USDT': 1200000, 'AVAX/USDT': 980000,
  'LINK/USDT': 720000, 'DOT/USDT': 560000, 'MATIC/USDT': 890000, 'UNI/USDT': 430000,
  'LTC/USDT': 650000, 'ATOM/USDT': 380000, 'FIL/USDT': 290000, 'APT/USDT': 310000,
  'ARB/USDT': 520000, 'OP/USDT': 480000, 'SUI/USDT': 270000, 'PEPE/USDT': 1500000,
  'WIF/USDT': 820000, 'BONK/USDT': 960000, 'TIA/USDT': 340000, 'NEAR/USDT': 410000,
  'INJ/USDT': 390000,
};

// Per-exchange volume multipliers — bigger exchanges trade more volume
export const EXCHANGE_VOLUME_MULTIPLIER: Record<Exchange, number> = {
  'Binance': 1.0,   // highest liquidity — baseline
  'Bybit':   0.72,
  'MEXC':    0.55,
  'HTX':     0.48,
  'KuCoin':  0.60,
  'BitMart': 0.30,
  'Bitget':  0.52,
  'Gate.io': 0.58,
};

/**
 * Returns the 24h LOW volume for a specific pair on a specific exchange.
 * Adds a small random variance (±15%) so values look realistic and different each scan.
 */
export const getExchangeVolumeLow = (pair: string, exchange: Exchange): number => {
  const base = VOLUME_LOW[pair] ?? 100000;
  const multiplier = EXCHANGE_VOLUME_MULTIPLIER[exchange];
  const variance = 0.85 + Math.random() * 0.30; // 0.85–1.15
  return Math.round(base * multiplier * variance);
};

export const generateMockBalances = (): ExchangeBalance[] => {
  const exchanges: Exchange[] = ['Binance', 'Bybit', 'MEXC', 'HTX', 'KuCoin', 'BitMart', 'Bitget', 'Gate.io'];
  return exchanges.map((ex) => ({
    exchange: ex,
    balance: parseFloat((Math.random() * 5000 + 500).toFixed(2)),
    connected: false,
    credentials: { apiKey: '', apiSecret: '' },
    depositEnabled: true,
    withdrawEnabled: true,
    lastUpdated: null,
  }));
};

// ─── Core opportunity generator with real fee math ───────────────────────────
export const generateOpportunity = (
  pair: string,
  buyEx: Exchange,
  sellEx: Exchange,
  id: string
): ArbitrageOpportunity | null => {
  if (buyEx === sellEx) return null;

  const basePrice = BASE_PRICES[pair];
  if (!basePrice) return null;

  // Simulate real market spread (0.3% to 3.5%)
  const spread = (Math.random() * 0.032 + 0.003);
  const buyPrice  = parseFloat((basePrice * (1 - spread / 2)).toFixed(8));
  const sellPrice = parseFloat((basePrice * (1 + spread / 2)).toFixed(8));

  if (sellPrice <= buyPrice) return null;

  const token = pair.split('/')[0];

  // Real fee calculation
  const buyFeeRate      = EXCHANGE_FEES[buyEx].taker;
  const sellFeeRate     = EXCHANGE_FEES[sellEx].taker;
  const withdrawFeeAmt  = WITHDRAWAL_FEES[buyEx][token] ?? 0;
  const withdrawFeeUSD  = withdrawFeeAmt * basePrice; // Convert to USD

  // Profit before fees (%)
  const profitBeforeFees = ((sellPrice - buyPrice) / buyPrice) * 100;

  // Net profit calculation:
  // net = grossSpread% - buyFee% - sellFee% - (withdrawalFeeUSD / tradeAmount * 100)
  // We assume a normalised trade amount of $1000 for % calculation
  const normalisedAmount = 1000;
  const buyFeeUSD        = normalisedAmount * buyFeeRate;
  const sellFeeUSD       = (normalisedAmount * (sellPrice / buyPrice)) * sellFeeRate;
  const totalFeesUSD     = buyFeeUSD + sellFeeUSD + withdrawFeeUSD;
  const grossProfitUSD   = normalisedAmount * (profitBeforeFees / 100);
  const netProfitUSD     = grossProfitUSD - totalFeesUSD;
  const netProfitPct     = (netProfitUSD / normalisedAmount) * 100;

  if (netProfitPct <= 0) return null;

  // ─── Chain compatibility check ───────────────────────────────────────────
  const buyChains    = EXCHANGE_CHAINS[buyEx];
  const sellChains   = EXCHANGE_CHAINS[sellEx];
  const commonChains = buyChains.filter(c => sellChains.includes(c));

  // Prefer chains that the token actually supports
  const tokenChains    = TOKEN_PREFERRED_CHAIN[token] ?? [];
  const preferredCommon = commonChains.filter(c => tokenChains.includes(c));
  const finalChain     = preferredCommon[0] ?? commonChains[0] ?? null;

  // CRITICAL: If no common chain exists, mark as incompatible
  const chainCompatible = commonChains.length > 0 && !!finalChain;

  // Only return opportunities with compatible chains (scanner pre-filter)
  if (!chainCompatible) return null;

  // Withdrawal/deposit status (simulated; in production this comes from exchange API)
  const withdrawalEnabled = Math.random() > 0.08;
  const depositEnabled    = Math.random() > 0.08;

  // Per-exchange 24h LOW volumes (each exchange has its own liquidity level)
  const buyVolume24hLow  = getExchangeVolumeLow(pair, buyEx);
  const sellVolume24hLow = getExchangeVolumeLow(pair, sellEx);

  return {
    id,
    pair,
    baseToken: 'USDT',
    buyExchange:  buyEx,
    buyPrice,
    sellExchange: sellEx,
    sellPrice,
    buyFee:       parseFloat((buyFeeRate * 100).toFixed(3)),
    sellFee:      parseFloat((sellFeeRate * 100).toFixed(3)),
    withdrawalFee: parseFloat(((withdrawFeeUSD / normalisedAmount) * 100).toFixed(4)),
    withdrawalFeeUSD: parseFloat(withdrawFeeUSD.toFixed(4)),
    profitBeforeFees: parseFloat(profitBeforeFees.toFixed(4)),
    netProfit:    parseFloat(netProfitPct.toFixed(4)),
    netProfitPct: parseFloat(netProfitPct.toFixed(4)),
    withdrawalEnabled,
    depositEnabled,
    chain:           finalChain,
    chainCompatible: true,
    commonChains,
    buyVolume24hLow,
    sellVolume24hLow,
    // Combined minimum used for scanner filter threshold
    volume24hLow: Math.min(buyVolume24hLow, sellVolume24hLow),
    discoveredAt: Date.now() - Math.floor(Math.random() * 180000),
    firstSeenAt:  Date.now() - Math.floor(Math.random() * 180000),
  };
};

export const MOCK_TRADE_HISTORY: TradeHistory[] = [
  {
    id: 'th1', timestamp: Date.now() - 3600000, pair: 'ETH/USDT',
    buyExchange: 'Binance', buyPrice: 3488.5, sellExchange: 'KuCoin', sellPrice: 3521.2,
    amount: 1000, buyFee: 0.1, sellFee: 0.1, withdrawalFee: 0.05, chain: 'ERC20',
    totalAfterTrade: 1009.2, netProfit: 9.2, status: 'completed',
  },
  {
    id: 'th2', timestamp: Date.now() - 7200000, pair: 'SOL/USDT',
    buyExchange: 'MEXC', buyPrice: 165.4, sellExchange: 'Bybit', sellPrice: 168.9,
    amount: 500, buyFee: 0.2, sellFee: 0.1, withdrawalFee: 0.08, chain: 'SOL',
    totalAfterTrade: 509.8, netProfit: 9.8, status: 'completed',
  },
  {
    id: 'th3', timestamp: Date.now() - 10800000, pair: 'BTC/USDT',
    buyExchange: 'Gate.io', buyPrice: 66900, sellExchange: 'Binance', sellPrice: 67500,
    amount: 2000, buyFee: 0.2, sellFee: 0.1, withdrawalFee: 0.05, chain: 'BEP20',
    totalAfterTrade: 2015.6, netProfit: 15.6, status: 'completed',
  },
  {
    id: 'th4', timestamp: Date.now() - 14400000, pair: 'XRP/USDT',
    buyExchange: 'HTX', buyPrice: 0.511, sellExchange: 'BitMart', sellPrice: 0.528,
    amount: 300, buyFee: 0.2, sellFee: 0.25, withdrawalFee: 0.1, chain: 'ERC20',
    totalAfterTrade: 306.2, netProfit: 6.2, status: 'failed',
  },
];
