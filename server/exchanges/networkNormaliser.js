/**
 * Network / Chain Name Normaliser
 * ─────────────────────────────────────────────────────────────────────────────
 * Every exchange uses different strings to identify the same blockchain network.
 * This module maps every known raw exchange network ID to a single canonical
 * form used throughout ArbitrageX for chain compatibility matching.
 *
 * Canonical forms used:
 *   ERC20     — Ethereum mainnet (ERC-20 tokens)
 *   BEP20     — BNB Smart Chain (BEP-20 tokens)
 *   TRC20     — Tron network (TRC-20 tokens)
 *   SOL       — Solana
 *   POLYGON   — Polygon PoS (MATIC)
 *   ARBITRUM  — Arbitrum One (L2)
 *   OPTIMISM  — Optimism (L2)
 *   AVAXC     — Avalanche C-Chain
 *   BASE      — Base (Coinbase L2)
 *   KCC       — KuCoin Community Chain
 *   TON       — The Open Network
 *   BTC       — Bitcoin
 *   ALGO      — Algorand
 *   COSMOS    — Cosmos Hub
 *   FANTOM    — Fantom Opera
 *   SUI       — Sui
 *   APT       — Aptos
 *   NEAR      — NEAR Protocol
 *   CELO      — Celo
 *   ZKSYNC    — zkSync Era
 *   LINEA     — Linea
 *   SCROLL    — Scroll
 *   MANTLE    — Mantle
 *   STARKNET  — StarkNet
 */

const NETWORK_MAP = {
  // ── Ethereum ────────────────────────────────────────────────────────────────
  'ETH':                    'ERC20',
  'ERC20':                  'ERC20',
  'ETHEREUM':               'ERC20',
  'ETH-ERC20':              'ERC20',
  'ETH(ERC20)':             'ERC20',
  'ERC-20':                 'ERC20',
  'ETHEREUMMAINNET':        'ERC20',
  'ETH_MAINNET':            'ERC20',

  // ── BNB Smart Chain ─────────────────────────────────────────────────────────
  'BSC':                    'BEP20',
  'BEP20':                  'BEP20',
  'BNB':                    'BEP20',
  'BNB SMART CHAIN':        'BEP20',
  'BNB SMART CHAIN (BEP20)':'BEP20',
  'BSCMAINNET':             'BEP20',
  'BEP20_BSC':              'BEP20',
  'BSC(BEP20)':             'BEP20',
  'BSC-BEP20':              'BEP20',
  'BNBSMARTCHAIN':          'BEP20',
  'BEP-20':                 'BEP20',
  'BINANCE SMART CHAIN':    'BEP20',
  'BNB CHAIN':              'BEP20',

  // ── Tron ────────────────────────────────────────────────────────────────────
  'TRX':                    'TRC20',
  'TRC20':                  'TRC20',
  'TRON':                   'TRC20',
  'TRX-TRC20':              'TRC20',
  'TRC-20':                 'TRC20',
  'TRONMAINNET':            'TRC20',
  'TRON(TRC20)':            'TRC20',
  'TRX(TRC20)':             'TRC20',

  // ── Solana ──────────────────────────────────────────────────────────────────
  'SOL':                    'SOL',
  'SOLANA':                 'SOL',
  'SPL':                    'SOL',
  'SOL-SPL':                'SOL',
  'SOLAMAINNET':            'SOL',

  // ── Polygon ─────────────────────────────────────────────────────────────────
  'MATIC':                  'POLYGON',
  'POLYGON':                'POLYGON',
  'POLYGONEVM':             'POLYGON',
  'POLY':                   'POLYGON',
  'POLYGON POS':            'POLYGON',
  'POLYGON(MATIC)':         'POLYGON',
  'MATIC(POLYGON)':         'POLYGON',
  'POL':                    'POLYGON',

  // ── Arbitrum ─────────────────────────────────────────────────────────────────
  'ARBITRUM':               'ARBITRUM',
  'ARBITRUMONE':            'ARBITRUM',
  'ARB':                    'ARBITRUM',
  'ARBITRUM ONE':           'ARBITRUM',
  'ARBONE':                 'ARBITRUM',
  'ARBITRUM-ONE':           'ARBITRUM',
  'ARB1':                   'ARBITRUM',
  'ARBITRUM(ARB)':          'ARBITRUM',

  // ── Optimism ─────────────────────────────────────────────────────────────────
  'OPTIMISM':               'OPTIMISM',
  'OP':                     'OPTIMISM',
  'OPTIMISMMAINNET':        'OPTIMISM',
  'OPTIMISM MAINNET':       'OPTIMISM',
  'OP MAINNET':             'OPTIMISM',

  // ── Avalanche ────────────────────────────────────────────────────────────────
  'AVAX':                   'AVAXC',
  'AVAXC':                  'AVAXC',
  'AVAX-C':                 'AVAXC',
  'AVAX C-CHAIN':           'AVAXC',
  'AVALANCHE':              'AVAXC',
  'C-CHAIN':                'AVAXC',
  'AVALANCHE C-CHAIN':      'AVAXC',
  'AVAXCCHAIN':             'AVAXC',
  'AVAX(C-CHAIN)':          'AVAXC',

  // ── Base ─────────────────────────────────────────────────────────────────────
  'BASE':                   'BASE',
  'BASE MAINNET':           'BASE',
  'BASE-MAINNET':           'BASE',

  // ── KuCoin Community Chain ───────────────────────────────────────────────────
  'KCC':                    'KCC',
  'KUCOINCOMMUNITYCHAIN':   'KCC',
  'KCS':                    'KCC',

  // ── TON ──────────────────────────────────────────────────────────────────────
  'TON':                    'TON',
  'TONCOIN':                'TON',
  'THE OPEN NETWORK':       'TON',

  // ── Bitcoin ──────────────────────────────────────────────────────────────────
  'BTC':                    'BTC',
  'BITCOIN':                'BTC',
  'BTC-MAINNET':            'BTC',

  // ── Algorand ─────────────────────────────────────────────────────────────────
  'ALGO':                   'ALGO',
  'ALGORAND':               'ALGO',

  // ── Cosmos ───────────────────────────────────────────────────────────────────
  'ATOM':                   'COSMOS',
  'COSMOS':                 'COSMOS',
  'COSMOSMAINNET':          'COSMOS',

  // ── Fantom ───────────────────────────────────────────────────────────────────
  'FTM':                    'FANTOM',
  'FANTOM':                 'FANTOM',
  'FANTOM OPERA':           'FANTOM',
  'FANTOMOOPERA':           'FANTOM',

  // ── Sui ──────────────────────────────────────────────────────────────────────
  'SUI':                    'SUI',

  // ── Aptos ────────────────────────────────────────────────────────────────────
  'APT':                    'APT',
  'APTOS':                  'APT',

  // ── NEAR ─────────────────────────────────────────────────────────────────────
  'NEAR':                   'NEAR',
  'NEAR PROTOCOL':          'NEAR',

  // ── Celo ─────────────────────────────────────────────────────────────────────
  'CELO':                   'CELO',

  // ── zkSync ───────────────────────────────────────────────────────────────────
  'ZKSYNC':                 'ZKSYNC',
  'ZKSYNC ERA':             'ZKSYNC',
  'ZKSYNCERA':              'ZKSYNC',
  'ZK':                     'ZKSYNC',

  // ── Linea ────────────────────────────────────────────────────────────────────
  'LINEA':                  'LINEA',

  // ── Scroll ───────────────────────────────────────────────────────────────────
  'SCROLL':                 'SCROLL',

  // ── Mantle ───────────────────────────────────────────────────────────────────
  'MANTLE':                 'MANTLE',
  'MNT':                    'MANTLE',

  // ── StarkNet ─────────────────────────────────────────────────────────────────
  'STARKNET':               'STARKNET',
  'STARK':                  'STARKNET',
};

/**
 * Normalise a raw network ID from any exchange to the canonical form.
 *
 * Steps:
 *  1. Trim whitespace
 *  2. Uppercase for lookup
 *  3. Look up in NETWORK_MAP
 *  4. If not found, return the uppercased value as-is (unknown network)
 *
 * @param {string} rawNetwork — raw network string from exchange API
 * @returns {string} — canonical network name
 */
export function normaliseNetwork(rawNetwork) {
  if (!rawNetwork || typeof rawNetwork !== 'string') return 'UNKNOWN';
  const key = rawNetwork.trim().toUpperCase();
  return NETWORK_MAP[key] ?? key; // fallback: return uppercased raw value
}

/**
 * Normalise an array of raw network IDs.
 * Deduplicates after normalisation (e.g. ETH + ERC20 both map to ERC20 → one entry).
 *
 * @param {string[]} rawNetworks
 * @returns {string[]} — unique canonical network names
 */
export function normaliseNetworks(rawNetworks) {
  if (!Array.isArray(rawNetworks)) return [];
  const normalised = rawNetworks.map(normaliseNetwork);
  return [...new Set(normalised)].filter(n => n !== 'UNKNOWN');
}

/**
 * Find common canonical networks between two lists of raw network IDs.
 * This is the core of chain compatibility checking in the scanner.
 *
 * @param {string[]} rawNetworksA — raw network list from exchange A
 * @param {string[]} rawNetworksB — raw network list from exchange B
 * @returns {string[]} — canonical networks supported by BOTH exchanges
 */
export function getCommonNetworks(rawNetworksA, rawNetworksB) {
  const normA = new Set(normaliseNetworks(rawNetworksA));
  const normB = new Set(normaliseNetworks(rawNetworksB));
  return [...normA].filter(n => normB.has(n));
}

/**
 * Select the best (cheapest/fastest) network from a list of canonical networks.
 * Priority order: TRC20 → BEP20 → SOL → POLYGON → ARBITRUM → OPTIMISM → BASE → AVAXC → rest
 *
 * @param {string[]} canonicalNetworks
 * @returns {string|null}
 */
export function selectBestNetwork(canonicalNetworks) {
  if (!canonicalNetworks || canonicalNetworks.length === 0) return null;

  const PRIORITY = [
    'TRC20',    // $1 fee, ~1-2 min — best default for USDT
    'BEP20',    // $0.80 fee, ~30 sec
    'SOL',      // $1 fee, ~30 sec
    'POLYGON',  // $1 fee, ~2 min
    'ARBITRUM', // $0.80 fee, ~1 min
    'OPTIMISM', // $0.80 fee, ~1 min
    'BASE',     // ~$0.50 fee, ~1 min
    'AVAXC',    // $1 fee, ~2 min
    'KCC',      // $0.80 fee, ~30 sec
    'ERC20',    // $4-8 fee, ~3-5 min — avoid unless only option
  ];

  for (const preferred of PRIORITY) {
    if (canonicalNetworks.includes(preferred)) return preferred;
  }

  // Return first available if none of the priority networks matched
  return canonicalNetworks[0];
}

/**
 * Human-readable label for a canonical network.
 *
 * @param {string} canonical
 * @returns {string}
 */
export function networkLabel(canonical) {
  const LABELS = {
    ERC20:    'Ethereum (ERC20)',
    BEP20:    'BNB Smart Chain (BEP20)',
    TRC20:    'Tron (TRC20)',
    SOL:      'Solana',
    POLYGON:  'Polygon PoS',
    ARBITRUM: 'Arbitrum One',
    OPTIMISM: 'Optimism',
    AVAXC:    'Avalanche C-Chain',
    BASE:     'Base',
    KCC:      'KuCoin Chain (KCC)',
    TON:      'TON',
    BTC:      'Bitcoin',
    ALGO:     'Algorand',
    COSMOS:   'Cosmos',
    FANTOM:   'Fantom Opera',
    SUI:      'Sui',
    APT:      'Aptos',
    NEAR:     'NEAR Protocol',
    CELO:     'Celo',
    ZKSYNC:   'zkSync Era',
    LINEA:    'Linea',
    SCROLL:   'Scroll',
    MANTLE:   'Mantle',
    STARKNET: 'StarkNet',
  };
  return LABELS[canonical] ?? canonical;
}

export { NETWORK_MAP };
