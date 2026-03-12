/**
 * Exchange Connector — CCXT-based real API connectivity
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates and caches authenticated CCXT exchange instances.
 * Each exchange uses the exact credential format it requires.
 *
 * Exchange-specific notes:
 *   Binance  — standard key/secret, sandbox available
 *   Bybit    — standard key/secret, unified account
 *   MEXC     — standard key/secret
 *   HTX      — accessKey maps to apiKey, secretKey maps to secret
 *   KuCoin   — key/secret/passphrase (all 3 required)
 *   BitMart  — key/secret/memo (memo = uid, required for withdrawal)
 *   Bitget   — key/secret/passphrase (all 3 required)
 *   Gate.io  — key/secret
 */

import ccxt from 'ccxt';
import { keyStore } from '../store/keyStore.js';

// Cache of authenticated exchange instances
const instanceCache = new Map();

// CCXT exchange class names per exchange display name
const CCXT_CLASS_MAP = {
  'Binance': 'binance',
  'Bybit':   'bybit',
  'MEXC':    'mexc',
  'HTX':     'htx',
  'KuCoin':  'kucoin',
  'BitMart': 'bitmart',
  'Bitget':  'bitget',
  'Gate.io': 'gateio',
};

/**
 * Build CCXT options object from stored credentials.
 * Each exchange has its own credential field mapping.
 */
function buildCCXTOptions(exchange, credentials) {
  const base = {
    enableRateLimit: true,
    timeout: 30000,
  };

  switch (exchange) {
    case 'Binance':
      return {
        ...base,
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
        options: { defaultType: 'spot' },
      };

    case 'Bybit':
      return {
        ...base,
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
        options: { defaultType: 'spot' },
      };

    case 'MEXC':
      return {
        ...base,
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
      };

    case 'HTX':
      // HTX calls them "Access Key" and "Secret Key" in their UI
      return {
        ...base,
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
      };

    case 'KuCoin':
      // KuCoin requires all 3: key + secret + passphrase
      return {
        ...base,
        apiKey:     credentials.apiKey,
        secret:     credentials.apiSecret,
        password:   credentials.apiPassphrase, // CCXT uses 'password' for KuCoin passphrase
      };

    case 'BitMart':
      // BitMart requires memo (their term for UID/memo field)
      return {
        ...base,
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
        uid:    credentials.apiMemo, // CCXT uses 'uid' for BitMart memo
      };

    case 'Bitget':
      // Bitget requires all 3: key + secret + passphrase
      return {
        ...base,
        apiKey:   credentials.apiKey,
        secret:   credentials.apiSecret,
        password: credentials.apiPassphrase, // CCXT uses 'password' for Bitget passphrase
      };

    case 'Gate.io':
      return {
        ...base,
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
      };

    default:
      throw new Error(`Unknown exchange: ${exchange}`);
  }
}

/**
 * Get (or create) an authenticated CCXT instance for an exchange.
 * Returns null if no credentials are stored for the exchange.
 */
export function getExchangeInstance(exchange) {
  const credentials = keyStore.get(exchange);
  if (!credentials) return null;

  // Use cached instance if available
  // (Invalidate cache when new credentials are saved — handled by keys route)
  if (instanceCache.has(exchange)) {
    return instanceCache.get(exchange);
  }

  const ccxtId = CCXT_CLASS_MAP[exchange];
  if (!ccxtId) throw new Error(`No CCXT mapping for exchange: ${exchange}`);

  const ExchangeClass = ccxt[ccxtId];
  if (!ExchangeClass) throw new Error(`CCXT does not support exchange: ${ccxtId}`);

  const options = buildCCXTOptions(exchange, credentials);
  const instance = new ExchangeClass(options);

  instanceCache.set(exchange, instance);
  return instance;
}

/**
 * Invalidate cached instance for an exchange.
 * Call this when credentials are updated or removed.
 */
export function invalidateInstance(exchange) {
  instanceCache.delete(exchange);
}

/**
 * Fetch spot balance for an exchange.
 * Returns the USDT balance (and top assets) from the spot/trading account.
 *
 * Account-aware: fetches from the correct account type per exchange.
 * For exchanges where deposits land in funding accounts, this fetches
 * from BOTH accounts so the UI can show the full picture.
 */
export async function fetchBalance(exchange) {
  const ex = getExchangeInstance(exchange);
  if (!ex) throw new Error(`${exchange} not connected`);

  try {
    let spotBalance = null;
    let fundingBalance = null;

    // Exchanges with separate funding/spot accounts
    const hasSeparateAccounts = ['Bybit', 'KuCoin', 'Bitget'];

    if (hasSeparateAccounts.includes(exchange)) {
      try {
        // Fetch spot/trading account
        spotBalance = await ex.fetchBalance({ type: 'spot' });
      } catch {
        spotBalance = await ex.fetchBalance();
      }

      try {
        // Fetch funding account
        if (exchange === 'Bybit') {
          fundingBalance = await ex.fetchBalance({ type: 'funding' });
        } else if (exchange === 'KuCoin') {
          fundingBalance = await ex.fetchBalance({ type: 'main' });
        } else if (exchange === 'Bitget') {
          fundingBalance = await ex.fetchBalance({ type: 'funding' });
        }
      } catch {
        // Funding account fetch is best-effort
      }
    } else {
      spotBalance = await ex.fetchBalance();
    }

    const spotUSDT    = spotBalance?.USDT?.total ?? spotBalance?.total?.USDT ?? 0;
    const fundingUSDT = fundingBalance?.USDT?.total ?? fundingBalance?.total?.USDT ?? 0;

    return {
      exchange,
      spotBalance:    parseFloat(spotUSDT.toFixed(2)),
      fundingBalance: parseFloat(fundingUSDT.toFixed(2)),
      totalUSDT:      parseFloat((spotUSDT + fundingUSDT).toFixed(2)),
      connected:      true,
      lastUpdated:    Date.now(),
    };
  } catch (err) {
    console.error(`[Connector] fetchBalance error for ${exchange}:`, err.message);
    throw new Error(`Failed to fetch balance from ${exchange}: ${err.message}`);
  }
}

/**
 * Fetch ticker (current price) for a trading pair on an exchange.
 */
export async function fetchTicker(exchange, symbol) {
  const ex = getExchangeInstance(exchange);
  if (!ex) throw new Error(`${exchange} not connected`);

  try {
    const ticker = await ex.fetchTicker(symbol);
    return {
      symbol,
      bid:    ticker.bid,
      ask:    ticker.ask,
      last:   ticker.last,
      volume: ticker.baseVolume,
      quoteVolume: ticker.quoteVolume,
    };
  } catch (err) {
    throw new Error(`Failed to fetch ticker ${symbol} from ${exchange}: ${err.message}`);
  }
}

/**
 * Fetch USDT withdrawal networks for an exchange via CCXT.
 * Returns the currency info including deposit/withdrawal network details.
 */
export async function fetchUSDTNetworks(exchange) {
  const ex = getExchangeInstance(exchange);
  if (!ex) throw new Error(`${exchange} not connected`);

  try {
    await ex.loadMarkets();
    const currencies = await ex.fetchCurrencies();
    const usdt = currencies?.USDT;

    if (!usdt) return [];

    const networks = usdt.networks ?? {};
    return Object.entries(networks).map(([networkId, info]) => ({
      network:         networkId,
      label:           info.name || networkId,
      withdrawFee:     info.fee ?? 1,
      minWithdraw:     info.limits?.withdraw?.min ?? 10,
      withdrawEnabled: info.active && info.withdraw,
      depositEnabled:  info.active && info.deposit,
      confirmations:   info.confirmations ?? 0,
      estimatedTime:   getEstimatedTime(networkId),
    }));
  } catch (err) {
    console.error(`[Connector] fetchUSDTNetworks error for ${exchange}:`, err.message);
    // Return empty — route will fall back to static data
    return [];
  }
}

function getEstimatedTime(network) {
  const times = {
    TRC20: '~1-2 min', ERC20: '~3-5 min', BEP20: '~30 sec',
    SOL: '~30 sec', ARBITRUM: '~1 min', OPTIMISM: '~1 min',
    MATIC: '~2 min', 'AVAX-C': '~2 min', KCC: '~30 sec',
  };
  return times[network] ?? '~3-5 min';
}

/**
 * Place a spot market buy order.
 */
export async function placeMarketBuy(exchange, symbol, amountUSDT) {
  const ex = getExchangeInstance(exchange);
  if (!ex) throw new Error(`${exchange} not connected`);

  // Market buy using quoteOrderQty (USDT amount)
  const order = await ex.createMarketBuyOrderWithCost(symbol, amountUSDT);
  return {
    orderId:  order.id,
    symbol:   order.symbol,
    side:     'buy',
    amount:   order.amount,
    cost:     order.cost,
    price:    order.average ?? order.price,
    status:   order.status,
    timestamp: order.timestamp,
  };
}

/**
 * Place a spot market sell order.
 */
export async function placeMarketSell(exchange, symbol, amount) {
  const ex = getExchangeInstance(exchange);
  if (!ex) throw new Error(`${exchange} not connected`);

  const order = await ex.createMarketSellOrder(symbol, amount);
  return {
    orderId:  order.id,
    symbol:   order.symbol,
    side:     'sell',
    amount:   order.amount,
    cost:     order.cost,
    price:    order.average ?? order.price,
    status:   order.status,
    timestamp: order.timestamp,
  };
}

/**
 * Withdraw USDT from an exchange to a given address on a given network.
 */
export async function withdraw(exchange, amount, address, network, tag) {
  const ex = getExchangeInstance(exchange);
  if (!ex) throw new Error(`${exchange} not connected`);

  const params = {};

  // Exchange-specific withdrawal parameters
  switch (exchange) {
    case 'Binance':
      params.network = network;
      break;
    case 'Bybit':
      params.chain = network;
      break;
    case 'MEXC':
      params.network = network;
      break;
    case 'HTX':
      params.chain = network.toLowerCase();
      break;
    case 'KuCoin':
      params.chain = network.toLowerCase();
      if (tag) params.memo = tag;
      break;
    case 'BitMart':
      params.destination_tag = tag;
      break;
    case 'Bitget':
      params.chain = network;
      break;
    case 'Gate.io':
      params.chain = network;
      break;
  }

  const result = await ex.withdraw('USDT', amount, address, tag, params);
  return {
    withdrawalId: result.id,
    txId:         result.txid,
    amount:       result.amount,
    fee:          result.fee?.cost,
    network,
    status:       result.status,
    timestamp:    result.timestamp ?? Date.now(),
  };
}

/**
 * Internal account transfer — move USDT between sub-accounts on same exchange.
 * Required for Bybit (Funding→Unified), KuCoin (Main→Trading), Bitget (Funding→Spot).
 */
export async function internalTransfer(exchange, amount, fromAccount, toAccount) {
  const ex = getExchangeInstance(exchange);
  if (!ex) throw new Error(`${exchange} not connected`);

  try {
    switch (exchange) {
      case 'Bybit': {
        // Bybit: transfer between Funding and Unified Trading
        const result = await ex.transfer('USDT', amount, fromAccount, toAccount);
        return { success: true, transferId: result.id };
      }
      case 'KuCoin': {
        // KuCoin: transfer between Main and Trading accounts
        const result = await ex.transfer('USDT', amount, fromAccount, toAccount);
        return { success: true, transferId: result.id };
      }
      case 'Bitget': {
        // Bitget: transfer between Funding and Spot
        const result = await ex.transfer('USDT', amount, fromAccount, toAccount);
        return { success: true, transferId: result.id };
      }
      default:
        // Exchange doesn't need internal transfer
        return { success: true, transferId: null };
    }
  } catch (err) {
    throw new Error(`Internal transfer failed on ${exchange}: ${err.message}`);
  }
}

export { CCXT_CLASS_MAP };
