/**
 * Networks Routes — USDT withdrawal/deposit network info per exchange
 *
 * GET /api/networks/:exchange — Get USDT networks for an exchange
 *   Tries live API first (if connected), falls back to static data.
 */

import { Router } from 'express';
import { keyStore } from '../store/keyStore.js';
import { fetchUSDTNetworks } from '../exchanges/connector.js';

export const networkRouter = Router();

// ─── Static USDT network data (fallback when exchange not connected) ───────────
const STATIC_USDT_NETWORKS = {
  'Binance': [
    { network: 'TRC20',    label: 'Tron (TRC20)',        withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1-2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain',     withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 15, estimatedTime: '~30 sec'   },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 4.50,  minWithdraw: 30,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 12, estimatedTime: '~3-5 min'  },
    { network: 'SOL',      label: 'Solana',              withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~30 sec'   },
    { network: 'ARBITRUM', label: 'Arbitrum One',        withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'OPTIMISM', label: 'Optimism',            withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'MATIC',    label: 'Polygon (MATIC)',     withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 150,estimatedTime: '~2 min'    },
    { network: 'AVAX-C',   label: 'Avalanche C-Chain',  withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~2 min'    },
  ],
  'Bybit': [
    { network: 'TRC20',    label: 'Tron (TRC20)',        withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1-2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain',     withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 15, estimatedTime: '~30 sec'   },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 5.00,  minWithdraw: 30,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 12, estimatedTime: '~3-5 min'  },
    { network: 'SOL',      label: 'Solana',              withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~30 sec'   },
    { network: 'ARBITRUM', label: 'Arbitrum One',        withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'OPTIMISM', label: 'Optimism',            withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'AVAX-C',   label: 'Avalanche C-Chain',  withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: false, depositEnabled: false, confirmations: 1,  estimatedTime: '~2 min'    },
  ],
  'MEXC': [
    { network: 'TRC20',    label: 'Tron (TRC20)',        withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1-2 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain',     withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 15, estimatedTime: '~30 sec'   },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 6.00,  minWithdraw: 30,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 12, estimatedTime: '~3-5 min'  },
    { network: 'SOL',      label: 'Solana',              withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~30 sec'   },
    { network: 'ARBITRUM', label: 'Arbitrum One',        withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'OPTIMISM', label: 'Optimism',            withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'MATIC',    label: 'Polygon (MATIC)',     withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: false, depositEnabled: true,  confirmations: 150,estimatedTime: '~2 min'    },
    { network: 'AVAX-C',   label: 'Avalanche C-Chain',  withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~2 min'    },
  ],
  'HTX': [
    { network: 'TRC20',    label: 'Tron (TRC20)',        withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1-2 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 7.50,  minWithdraw: 30,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 12, estimatedTime: '~3-5 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain',     withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 15, estimatedTime: '~30 sec'   },
    { network: 'ARBITRUM', label: 'Arbitrum One',        withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'OPTIMISM', label: 'Optimism',            withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: false, depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
  ],
  'KuCoin': [
    { network: 'TRC20',    label: 'Tron (TRC20)',        withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1-2 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 5.00,  minWithdraw: 30,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 12, estimatedTime: '~3-5 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain',     withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 15, estimatedTime: '~30 sec'   },
    { network: 'SOL',      label: 'Solana',              withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~30 sec'   },
    { network: 'ARBITRUM', label: 'Arbitrum One',        withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'MATIC',    label: 'Polygon (MATIC)',     withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 150,estimatedTime: '~2 min'    },
    { network: 'KCC',      label: 'KuCoin Community Chain', withdrawFee: 0.80, minWithdraw: 10, withdrawEnabled: true, depositEnabled: true,  confirmations: 12, estimatedTime: '~30 sec'   },
  ],
  'BitMart': [
    { network: 'TRC20',    label: 'Tron (TRC20)',        withdrawFee: 2.00,  minWithdraw: 20,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~2-5 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 8.00,  minWithdraw: 50,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 12, estimatedTime: '~5-10 min' },
    { network: 'BEP20',    label: 'BNB Smart Chain',     withdrawFee: 1.00,  minWithdraw: 20,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 15, estimatedTime: '~1 min'    },
    { network: 'SOL',      label: 'Solana',              withdrawFee: 2.00,  minWithdraw: 20,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
  ],
  'Bitget': [
    { network: 'TRC20',    label: 'Tron (TRC20)',        withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1-2 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 5.50,  minWithdraw: 30,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 12, estimatedTime: '~3-5 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain',     withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 15, estimatedTime: '~30 sec'   },
    { network: 'SOL',      label: 'Solana',              withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~30 sec'   },
    { network: 'ARBITRUM', label: 'Arbitrum One',        withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'OPTIMISM', label: 'Optimism',            withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
  ],
  'Gate.io': [
    { network: 'TRC20',    label: 'Tron (TRC20)',        withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1-2 min'  },
    { network: 'ERC20',    label: 'Ethereum (ERC20)',     withdrawFee: 6.00,  minWithdraw: 30,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 12, estimatedTime: '~3-5 min'  },
    { network: 'BEP20',    label: 'BNB Smart Chain',     withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 15, estimatedTime: '~30 sec'   },
    { network: 'SOL',      label: 'Solana',              withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~30 sec'   },
    { network: 'ARBITRUM', label: 'Arbitrum One',        withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'OPTIMISM', label: 'Optimism',            withdrawFee: 0.80,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~1 min'    },
    { network: 'MATIC',    label: 'Polygon (MATIC)',     withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 150,estimatedTime: '~2 min'    },
    { network: 'AVAX-C',   label: 'Avalanche C-Chain',  withdrawFee: 1.00,  minWithdraw: 10,  withdrawEnabled: true,  depositEnabled: true,  confirmations: 1,  estimatedTime: '~2 min'    },
  ],
};

// ─── GET /api/networks/:exchange ──────────────────────────────────────────────
networkRouter.get('/:exchange', async (req, res) => {
  const { exchange } = req.params;

  // Try to fetch live data if exchange is connected
  if (keyStore.has(exchange)) {
    try {
      const liveNetworks = await fetchUSDTNetworks(exchange);
      if (liveNetworks.length > 0) {
        return res.json({ exchange, networks: liveNetworks, source: 'live' });
      }
    } catch {
      // Fall through to static data
    }
  }

  // Return static data
  const networks = STATIC_USDT_NETWORKS[exchange] ?? [];
  return res.json({ exchange, networks, source: 'static' });
});
