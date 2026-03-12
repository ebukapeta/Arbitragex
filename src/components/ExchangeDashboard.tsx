import React, { useState, useEffect } from 'react';
import {
  Exchange, ExchangeBalance, TransferHistory, ApiCredentials,
  EXCHANGES, EXCHANGE_API_FIELDS, EXCHANGE_API_DOCS, EXCHANGE_API_PERMISSIONS,
  USDTNetwork, EXCHANGE_ACCOUNT_INFO,
} from '../types';
import { USDT_NETWORKS } from '../data/mockData';

interface Props {
  balances: ExchangeBalance[];
  onTransfer: (from: Exchange, to: Exchange, amount: number, network: string, depositAddress?: string) => void;
  transferHistory: TransferHistory[];
  onConnectExchange: (exchange: Exchange, credentials: ApiCredentials) => void;
  activeTransferId: string | null;
  backendMode?: boolean;
}

const EXCHANGE_COLORS: Record<string, string> = {
  'Binance': 'from-yellow-500/20 to-amber-600/10 border-yellow-700/40',
  'Bybit':   'from-orange-500/20 to-red-500/10 border-orange-700/40',
  'MEXC':    'from-blue-500/20 to-blue-700/10 border-blue-700/40',
  'HTX':     'from-blue-400/20 to-cyan-600/10 border-cyan-700/40',
  'KuCoin':  'from-green-500/20 to-emerald-600/10 border-green-700/40',
  'BitMart': 'from-purple-500/20 to-violet-600/10 border-purple-700/40',
  'Bitget':  'from-cyan-500/20 to-teal-600/10 border-teal-700/40',
  'Gate.io': 'from-red-500/20 to-rose-600/10 border-rose-700/40',
};

const EXCHANGE_DOT: Record<string, string> = {
  'Binance': 'bg-yellow-400', 'Bybit':   'bg-orange-400',
  'MEXC':    'bg-blue-400',   'HTX':     'bg-cyan-400',
  'KuCoin':  'bg-green-400',  'BitMart': 'bg-purple-400',
  'Bitget':  'bg-teal-400',   'Gate.io': 'bg-red-400',
};

const EXCHANGE_ABBR: Record<string, string> = {
  'Binance': 'BN', 'Bybit': 'BY', 'MEXC': 'MX', 'HTX': 'HT',
  'KuCoin': 'KC', 'BitMart': 'BM', 'Bitget': 'BG', 'Gate.io': 'GT',
};

const NETWORK_BADGE_COLOR: Record<string, string> = {
  'TRC20':    'bg-red-900/60 text-red-300 border-red-700/50',
  'ERC20':    'bg-blue-900/60 text-blue-300 border-blue-700/50',
  'BEP20':    'bg-yellow-900/60 text-yellow-300 border-yellow-700/50',
  'SOL':      'bg-purple-900/60 text-purple-300 border-purple-700/50',
  'ARBITRUM': 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50',
  'OPTIMISM': 'bg-rose-900/60 text-rose-300 border-rose-700/50',
  'MATIC':    'bg-violet-900/60 text-violet-300 border-violet-700/50',
  'AVAX-C':   'bg-orange-900/60 text-orange-300 border-orange-700/50',
  'KCC':      'bg-green-900/60 text-green-300 border-green-700/50',
};

// ─── Network Selector Modal ───────────────────────────────────────────────────
interface NetworkModalProps {
  exchange: Exchange;
  mode: 'withdraw' | 'deposit';
  selectedNetwork: string;
  onSelect: (n: USDTNetwork) => void;
  onClose: () => void;
}

const NetworkModal: React.FC<NetworkModalProps> = ({ exchange, mode, selectedNetwork, onSelect, onClose }) => {
  const networks = USDT_NETWORKS[exchange] ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
          <div>
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${EXCHANGE_DOT[exchange]}`} />
              {exchange} — USDT Networks
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">
              {mode === 'withdraw' ? '🔴 Withdrawal networks available' : '🟢 Deposit networks available'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {networks.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-6">No networks found for {exchange}</p>
          )}
          {networks.map((net) => {
            const isEnabled = mode === 'withdraw' ? net.withdrawEnabled : net.depositEnabled;
            const isSelected = selectedNetwork === net.network;
            const badgeClass = NETWORK_BADGE_COLOR[net.network] ?? 'bg-gray-800 text-gray-300 border-gray-700';
            return (
              <button
                key={net.network}
                onClick={() => isEnabled && mode === 'withdraw' && onSelect(net)}
                disabled={!isEnabled}
                className={`w-full text-left rounded-xl p-3 border transition-all ${
                  !isEnabled
                    ? 'opacity-40 cursor-not-allowed bg-gray-800/40 border-gray-700/40'
                    : isSelected && mode === 'withdraw'
                    ? 'bg-blue-950/60 border-blue-600/60 cursor-pointer'
                    : 'bg-gray-800/60 border-gray-700/40 hover:border-gray-600 cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeClass} flex-shrink-0`}>
                      {net.network}
                    </span>
                    <span className="text-white text-xs font-medium truncate">{net.label}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      isEnabled ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'
                    }`}>{isEnabled ? 'Active' : 'Suspended'}</span>
                    {isSelected && mode === 'withdraw' && (
                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
                  {mode === 'withdraw' && (
                    <>
                      <span>Fee: <span className="text-orange-300 font-semibold">${net.withdrawFee} USDT</span></span>
                      <span>Min: <span className="text-gray-300">${net.minWithdraw}</span></span>
                    </>
                  )}
                  <span>Confirms: <span className="text-gray-300">{net.confirmations}</span></span>
                  <span className="text-green-400">{net.estimatedTime}</span>
                  <span className="ml-auto flex gap-1.5">
                    <span className={`text-[10px] ${net.depositEnabled ? 'text-green-400' : 'text-red-500'}`}>↓DEP</span>
                    <span className={`text-[10px] ${net.withdrawEnabled ? 'text-green-400' : 'text-red-500'}`}>↑WD</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-gray-700/60">
          <p className="text-gray-600 text-[10px]">
            ⚠ Network availability and fees are fetched from exchange API. Always verify before transferring.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Transfer Progress Modal ──────────────────────────────────────────────────
interface TransferProgressProps {
  transfer: TransferHistory;
  fromAccInfo: { requiresInternalTransfer: boolean; depositAccountLabel: string; transferPath: string };
  onClose: () => void;
}
const TransferProgressModal: React.FC<TransferProgressProps> = ({ transfer, fromAccInfo, onClose }) => {
  const steps = transfer.steps ?? [];
  const isTerminal = transfer.status === 'completed' || transfer.status === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`px-5 py-4 border-b border-gray-700/60 ${
          transfer.status === 'completed' ? 'bg-green-950/40' :
          transfer.status === 'failed'    ? 'bg-red-950/40'   : 'bg-blue-950/30'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {transfer.status === 'completed' ? (
                <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                  <span className="text-green-400 text-lg">✓</span>
                </div>
              ) : transfer.status === 'failed' ? (
                <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                  <span className="text-red-400 text-lg">✗</span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              )}
              <div>
                <h3 className="text-white font-bold text-sm">
                  {transfer.status === 'completed' ? 'Transfer Completed ✓' :
                   transfer.status === 'failed'    ? 'Transfer Failed'      : 'Transferring Funds'}
                </h3>
                <p className="text-gray-400 text-xs mt-0.5">
                  ${transfer.amount.toLocaleString()} USDT · {transfer.fromExchange} → {transfer.toExchange} · {transfer.network}
                </p>
              </div>
            </div>
            {isTerminal && (
              <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Account structure notice */}
        {fromAccInfo.requiresInternalTransfer && (
          <div className="mx-5 mt-4 bg-amber-950/40 border border-amber-700/40 rounded-xl px-3 py-2 text-xs">
            <p className="text-amber-300 font-semibold mb-0.5">⚡ Internal Transfer Required</p>
            <p className="text-amber-400/80">
              {transfer.fromExchange} deposits land in <strong>{fromAccInfo.depositAccountLabel}</strong>.
              Bot will auto-move funds to Spot/Trading account before sending.
            </p>
          </div>
        )}

        {/* Steps */}
        <div className="px-5 py-4 space-y-2.5">
          {steps.map((step) => (
            <div key={step.key} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
              step.status === 'active' ? 'bg-blue-950/40 border-blue-600/50' :
              step.status === 'done'   ? 'bg-green-950/25 border-green-800/30' :
              step.status === 'error'  ? 'bg-red-950/40 border-red-700/50' :
                                         'bg-gray-800/30 border-gray-700/30 opacity-50'
            }`}>
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {step.status === 'done' && (
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                )}
                {step.status === 'active' && (
                  <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {step.status === 'error' && (
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                )}
                {step.status === 'pending' && <div className="w-3 h-3 rounded-full border-2 border-gray-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-semibold ${
                  step.status === 'active' ? 'text-blue-300' :
                  step.status === 'done'   ? 'text-green-300' :
                  step.status === 'error'  ? 'text-red-300' : 'text-gray-500'
                }`}>{step.label}</p>
                {step.message && step.status !== 'pending' && (
                  <p className="text-gray-400 text-[10px] mt-0.5 truncate">{step.message}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Result */}
        {transfer.status === 'completed' && (
          <div className="mx-5 mb-5 bg-green-950/50 border border-green-700/50 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-green-300 text-sm font-semibold">Transfer Successful</span>
              <span className="text-green-300 text-lg font-bold">${transfer.amount.toLocaleString()} USDT</span>
            </div>
            <p className="text-green-600 text-xs mt-1">{transfer.fromExchange} → {transfer.toExchange} via {transfer.network}</p>
            <button onClick={onClose}
              className="mt-3 w-full py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-bold rounded-lg transition-colors">
              Close
            </button>
          </div>
        )}
        {transfer.status === 'failed' && (
          <div className="mx-5 mb-5 bg-red-950/50 border border-red-700/50 rounded-xl px-4 py-3">
            <p className="text-red-300 text-sm font-semibold">Transfer Failed</p>
            <p className="text-red-400 text-xs mt-1">Transaction was rejected on-chain. No funds were deducted.</p>
            <button onClick={onClose}
              className="mt-3 w-full py-2 bg-red-800 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const ExchangeDashboard: React.FC<Props> = ({
  balances, onTransfer, transferHistory, onConnectExchange, activeTransferId, backendMode: _backendMode,
}) => {
  const [panel, setPanel] = useState<'none' | 'connect' | 'transfer'>('none');
  const [selectedExchange, setSelectedExchange] = useState<Exchange>('Binance');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [showApiKey, setShowApiKey] = useState(false);

  // Transfer state
  const [transferFrom, setTransferFrom]     = useState<Exchange>('Binance');
  const [transferTo, setTransferTo]         = useState<Exchange>('Bybit');
  const [transferAmount, setTransferAmount] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<USDTNetwork | null>(null);

  // Network modal
  const [networkModal, setNetworkModal] = useState<{
    open: boolean; exchange: Exchange; mode: 'withdraw' | 'deposit';
  }>({ open: false, exchange: 'Binance', mode: 'withdraw' });

  // Transfer progress modal — show when there's an active transfer
  const [showTransferProgress, setShowTransferProgress] = useState(false);

  // Auto-open progress modal when a new transfer starts
  useEffect(() => {
    if (activeTransferId) setShowTransferProgress(true);
  }, [activeTransferId]);

  // Auto-select cheapest withdrawal network when "from" exchange changes
  useEffect(() => {
    const nets = USDT_NETWORKS[transferFrom] ?? [];
    const activeNets = nets.filter(n => n.withdrawEnabled);
    if (activeNets.length === 0) { setSelectedNetwork(null); return; }
    const trc = activeNets.find(n => n.network === 'TRC20');
    setSelectedNetwork(trc ?? activeNets.sort((a, b) => a.withdrawFee - b.withdrawFee)[0]);
  }, [transferFrom]);

  const togglePanel = (p: 'connect' | 'transfer') =>
    setPanel(prev => prev === p ? 'none' : p);

  const handleConnect = () => {
    const apiCredentials: ApiCredentials = {
      apiKey:        creds['apiKey'] ?? '',
      apiSecret:     creds['apiSecret'] ?? '',
      apiPassphrase: creds['apiPassphrase'],
      apiMemo:       creds['apiMemo'],
    };
    if (!apiCredentials.apiKey || !apiCredentials.apiSecret) return;
    onConnectExchange(selectedExchange, apiCredentials);
    setCreds({});
    setPanel('none');
  };

  const handleTransfer = () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) return;
    if (!selectedNetwork) return;
    onTransfer(transferFrom, transferTo, parseFloat(transferAmount), selectedNetwork.network);
    setTransferAmount('');
    setPanel('none');
  };

  const totalBalance   = balances.filter(b => b.connected).reduce((s, b) => s + b.balance, 0);
  const connectedCount = balances.filter(b => b.connected).length;
  const fields         = EXCHANGE_API_FIELDS[selectedExchange];
  const apiDocs        = EXCHANGE_API_DOCS[selectedExchange];
  const apiPerms       = EXCHANGE_API_PERMISSIONS[selectedExchange];

  const toNetworks      = USDT_NETWORKS[transferTo] ?? [];
  const commonNetworks  = selectedNetwork
    ? toNetworks.filter(n => n.network === selectedNetwork.network && n.depositEnabled)
    : [];
  const depositCompatible = commonNetworks.length > 0;

  // The active transfer record (to show in progress modal)
  const activeTransfer = activeTransferId
    ? transferHistory.find(t => t.id === activeTransferId) ?? null
    : null;
  const fromAccInfo = activeTransfer
    ? EXCHANGE_ACCOUNT_INFO[activeTransfer.fromExchange]
    : EXCHANGE_ACCOUNT_INFO['Binance'];

  return (
    <>
      {/* Network modal */}
      {networkModal.open && (
        <NetworkModal
          exchange={networkModal.exchange}
          mode={networkModal.mode}
          selectedNetwork={selectedNetwork?.network ?? ''}
          onSelect={(net) => { setSelectedNetwork(net); setNetworkModal(m => ({ ...m, open: false })); }}
          onClose={() => setNetworkModal(m => ({ ...m, open: false }))}
        />
      )}

      {/* Transfer progress modal */}
      {showTransferProgress && activeTransfer && (
        <TransferProgressModal
          transfer={activeTransfer}
          fromAccInfo={fromAccInfo}
          onClose={() => setShowTransferProgress(false)}
        />
      )}

      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 mb-4">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Exchange Portfolio</h2>
              <p className="text-gray-400 text-xs mt-0.5 truncate">
                {connectedCount}/8 connected ·{' '}
                <span className="text-green-400 font-semibold">
                  ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => togglePanel('connect')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                panel === 'connect'
                  ? 'bg-violet-600 text-white'
                  : 'bg-violet-900/50 text-violet-300 border border-violet-700 hover:bg-violet-800/50'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Connect API
            </button>
            <button
              onClick={() => togglePanel('transfer')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                panel === 'transfer'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-900/50 text-blue-300 border border-blue-700 hover:bg-blue-800/50'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Transfer
            </button>
          </div>
        </div>

        {/* ── Exchange Cards Grid ─────────────────────────── */}
        <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-600 flex-wrap">
          <span className="text-amber-400 font-semibold">⚡ Xfer</span>
          <span>= deposits need internal transfer to spot before trading</span>
          <span className="text-green-500 font-semibold ml-2">✓ Spot</span>
          <span>= deposits land in spot/trading directly</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-4">
          {balances.map((bal) => (
            <div
              key={bal.exchange}
              className={`relative rounded-xl p-2 bg-gradient-to-br border ${EXCHANGE_COLORS[bal.exchange]} ${
                !bal.connected ? 'opacity-50' : ''
              } cursor-pointer hover:opacity-90 transition-opacity`}
              onClick={() => { setSelectedExchange(bal.exchange); setPanel('connect'); }}
              title={bal.connected ? `${bal.exchange} — $${bal.balance.toFixed(2)}` : `Connect ${bal.exchange}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-white/80 bg-black/30 rounded px-1 leading-tight">
                  {EXCHANGE_ABBR[bal.exchange]}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  bal.connected ? EXCHANGE_DOT[bal.exchange] : 'bg-gray-600'
                }`} />
              </div>
              <p className="text-white text-[9px] sm:text-[10px] font-semibold truncate leading-tight">
                {bal.exchange}
              </p>
              <p className="text-green-300 text-[9px] sm:text-[10px] font-bold mt-0.5 truncate">
                {bal.connected
                  ? `$${bal.balance >= 1000 ? `${(bal.balance / 1000).toFixed(1)}k` : bal.balance.toFixed(0)}`
                  : '—'}
              </p>
              <p className={`text-[8px] leading-none mt-0.5 truncate font-medium ${
                EXCHANGE_ACCOUNT_INFO[bal.exchange].requiresInternalTransfer
                  ? 'text-amber-400' : 'text-gray-500'
              }`} title={EXCHANGE_ACCOUNT_INFO[bal.exchange].transferPath}>
                {EXCHANGE_ACCOUNT_INFO[bal.exchange].requiresInternalTransfer ? '⚡ Xfer' : '✓ Spot'}
              </p>
              <div className="flex gap-0.5 mt-0.5">
                <span className={`text-[9px] leading-none ${bal.depositEnabled ? 'text-green-400' : 'text-red-400'}`}>↓</span>
                <span className={`text-[9px] leading-none ${bal.withdrawEnabled ? 'text-green-400' : 'text-red-400'}`}>↑</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Connect API Panel ───────────────────────────── */}
        {panel === 'connect' && (
          <div className="bg-gray-800/80 border border-violet-700/50 rounded-xl p-4 mb-2">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${EXCHANGE_DOT[selectedExchange]}`} />
                  Connect Exchange API
                </h3>
                <p className="text-gray-400 text-xs mt-0.5">Credentials are stored locally in your browser only</p>
              </div>
              <a href={apiDocs} target="_blank" rel="noopener noreferrer"
                className="text-xs text-violet-400 hover:text-violet-300 underline whitespace-nowrap">
                Get API Keys ↗
              </a>
            </div>

            {/* Exchange selector */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {EXCHANGES.map(ex => (
                <button key={ex} onClick={() => { setSelectedExchange(ex); setCreds({}); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                    selectedExchange === ex
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}>
                  {ex}
                </button>
              ))}
            </div>

            {/* Required permissions */}
            <div className="bg-amber-950/40 border border-amber-700/40 rounded-lg px-3 py-2 mb-3 text-xs">
              <p className="text-amber-300 font-semibold mb-1">Required API Permissions for {selectedExchange}:</p>
              <div className="flex flex-wrap gap-1.5">
                {apiPerms.map(p => (
                  <span key={p} className="bg-amber-900/50 text-amber-200 px-2 py-0.5 rounded text-[10px]">{p}</span>
                ))}
              </div>
            </div>

            {/* Account/deposit structure info */}
            {(() => {
              const accInfo = EXCHANGE_ACCOUNT_INFO[selectedExchange];
              return (
                <div className={`rounded-lg px-3 py-2 mb-4 text-xs border ${
                  accInfo.requiresInternalTransfer
                    ? 'bg-amber-950/30 border-amber-700/40'
                    : 'bg-green-950/30 border-green-700/40'
                }`}>
                  <p className={`font-semibold mb-1 ${accInfo.requiresInternalTransfer ? 'text-amber-300' : 'text-green-300'}`}>
                    {accInfo.requiresInternalTransfer ? '⚡' : '✓'} {selectedExchange} Deposit Account Structure
                  </p>
                  <p className="text-gray-400 text-[11px]">
                    <span className="font-medium text-white">USDT deposits land in:</span>{' '}
                    <span className={accInfo.requiresInternalTransfer ? 'text-amber-300 font-semibold' : 'text-green-300 font-semibold'}>
                      {accInfo.depositAccountLabel}
                    </span>
                  </p>
                  {accInfo.requiresInternalTransfer && (
                    <p className="text-amber-400/80 text-[11px] mt-0.5">
                      ⚡ Bot will auto-transfer: <span className="font-medium">{accInfo.transferPath}</span>
                    </p>
                  )}
                  <p className="text-gray-500 text-[10px] mt-1">{accInfo.notes}</p>
                </div>
              );
            })()}

            {/* Credential fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="text-gray-400 text-xs mb-1 block font-medium">{field.label}</label>
                  <div className="relative">
                    <input
                      type={field.secret && !showApiKey ? 'password' : 'text'}
                      value={creds[field.key] ?? ''}
                      onChange={e => setCreds(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={`Enter ${field.label}`}
                      className="w-full bg-gray-700 text-white text-xs sm:text-sm rounded-lg px-3 py-2.5
                        border border-gray-600 focus:border-violet-500 outline-none pr-8 font-mono"
                    />
                    {field.secret && (
                      <button type="button" onClick={() => setShowApiKey(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showApiKey ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2 mb-4 text-xs text-red-300">
              <span className="font-semibold">⚠ Security:</span> Never enable IP-unrestricted withdrawal permissions.
              Restrict API keys to your server IP and enable read + trade only when possible.
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setCreds({}); setPanel('none'); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleConnect} disabled={!creds['apiKey'] || !creds['apiSecret']}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                  disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors">
                Connect {selectedExchange}
              </button>
            </div>
          </div>
        )}

        {/* ── Transfer Panel ─────────────────────────────── */}
        {panel === 'transfer' && (
          <div className="bg-gray-800/80 border border-blue-700/50 rounded-xl p-4 mb-2">
            <h3 className="text-white font-semibold text-sm mb-1 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Transfer USDT Between Exchanges
            </h3>
            <p className="text-gray-500 text-xs mb-4">
              Select source exchange and network, then destination exchange.
            </p>

            {/* ── From Exchange + Account check banner ─── */}
            {(() => {
              const fromAcc = EXCHANGE_ACCOUNT_INFO[transferFrom];
              return (
                <>
                  <div className="mb-3">
                    <label className="text-gray-400 text-xs mb-1.5 block font-medium">From Exchange</label>
                    <div className="flex gap-2">
                      <select
                        value={transferFrom}
                        onChange={e => setTransferFrom(e.target.value as Exchange)}
                        className="w-36 sm:w-44 bg-gray-700 text-white text-xs rounded-lg px-2 py-2.5
                          border border-gray-600 focus:border-blue-500 outline-none truncate"
                      >
                        {EXCHANGES.map(ex => (
                          <option key={ex} value={ex}>
                            {ex}{balances.find(b => b.exchange === ex)?.connected
                              ? ` ($${balances.find(b => b.exchange === ex)?.balance.toFixed(0)})`
                              : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setNetworkModal({ open: true, exchange: transferFrom, mode: 'withdraw' })}
                        className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs font-semibold
                          transition-all whitespace-nowrap flex-shrink-0 ${
                          selectedNetwork
                            ? `${NETWORK_BADGE_COLOR[selectedNetwork.network] ?? 'bg-gray-700 text-gray-300 border-gray-600'} hover:opacity-80`
                            : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                        }`}
                        title="Select withdrawal network for USDT"
                      >
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                        </svg>
                        {selectedNetwork ? selectedNetwork.network : 'Network'}
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* ── Account check banner ── */}
                    <div className={`mt-2 flex items-start gap-2 text-[11px] px-3 py-2 rounded-lg border ${
                      fromAcc.requiresInternalTransfer
                        ? 'bg-amber-950/40 border-amber-700/40 text-amber-300'
                        : 'bg-green-950/30 border-green-700/30 text-green-300'
                    }`}>
                      <span className="flex-shrink-0 mt-0.5">
                        {fromAcc.requiresInternalTransfer ? '⚡' : '✓'}
                      </span>
                      <div>
                        {fromAcc.requiresInternalTransfer ? (
                          <>
                            <span className="font-semibold">Funds detected in {fromAcc.depositAccountLabel}</span>
                            <span className="text-amber-400/80 block mt-0.5">
                              Bot will first move USDT: <strong>{fromAcc.transferPath}</strong> before sending
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold">
                            Funds ready in {fromAcc.depositAccountLabel} — no internal transfer needed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Selected network info bar */}
                    {selectedNetwork && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] bg-gray-900/60 rounded-lg px-3 py-2 border border-gray-700/60">
                        <span className="text-gray-400">Network: <span className="text-white font-semibold">{selectedNetwork.label}</span></span>
                        <span className="text-gray-400">WD Fee: <span className="text-orange-300 font-semibold">${selectedNetwork.withdrawFee} USDT</span></span>
                        <span className="text-gray-400">Min: <span className="text-gray-300">${selectedNetwork.minWithdraw} USDT</span></span>
                        <span className="text-gray-400">Confirms: <span className="text-gray-300">{selectedNetwork.confirmations}</span></span>
                        <span className="text-green-400 font-medium">{selectedNetwork.estimatedTime}</span>
                        <span className={`font-semibold ${selectedNetwork.withdrawEnabled ? 'text-green-400' : 'text-red-400'}`}>
                          {selectedNetwork.withdrawEnabled ? '✓ Withdrawal Active' : '✗ Withdrawal Suspended'}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* ── To Exchange + View Networks ── */}
            <div className="mb-3">
              <label className="text-gray-400 text-xs mb-1.5 block font-medium">To Exchange</label>
              <div className="flex gap-2">
                <select
                  value={transferTo}
                  onChange={e => setTransferTo(e.target.value as Exchange)}
                  className="w-36 sm:w-44 bg-gray-700 text-white text-xs rounded-lg px-2 py-2.5
                    border border-gray-600 focus:border-blue-500 outline-none truncate"
                >
                  {EXCHANGES.filter(ex => ex !== transferFrom).map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </select>
                <button
                  onClick={() => setNetworkModal({ open: true, exchange: transferTo, mode: 'deposit' })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold
                    transition-all whitespace-nowrap flex-shrink-0 bg-gray-700 border-gray-600
                    text-gray-300 hover:bg-gray-600 hover:border-gray-500"
                  title="View deposit networks on destination exchange"
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Networks
                </button>
              </div>

              {selectedNetwork && (
                <div className={`mt-2 flex items-center gap-2 text-[11px] px-3 py-2 rounded-lg border ${
                  depositCompatible
                    ? 'bg-green-950/30 border-green-700/40 text-green-300'
                    : 'bg-red-950/30 border-red-700/40 text-red-300'
                }`}>
                  <span>{depositCompatible ? '✓' : '✗'}</span>
                  <span>
                    {depositCompatible
                      ? `${transferTo} supports ${selectedNetwork.network} deposits — compatible ✓`
                      : `${transferTo} does not support ${selectedNetwork.network} deposits — choose a different network`}
                  </span>
                </div>
              )}
            </div>

            {/* ── Amount ── */}
            <div className="mb-4">
              <label className="text-gray-400 text-xs mb-1.5 block font-medium">Amount (USDT)</label>
              <div className="relative">
                <input
                  type="number"
                  value={transferAmount}
                  onChange={e => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  min={selectedNetwork?.minWithdraw ?? 10}
                  className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2.5
                    border border-gray-600 focus:border-blue-500 outline-none"
                />
                {selectedNetwork && parseFloat(transferAmount) > 0 && (
                  <div className="mt-1.5 text-[11px] text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                    <span>You send: <span className="text-white font-semibold">${parseFloat(transferAmount).toFixed(2)} USDT</span></span>
                    <span>Network fee: <span className="text-orange-300">-${selectedNetwork.withdrawFee} USDT</span></span>
                    <span>Recipient gets: <span className="text-green-300 font-semibold">
                      ${Math.max(0, parseFloat(transferAmount) - selectedNetwork.withdrawFee).toFixed(2)} USDT
                    </span></span>
                  </div>
                )}
              </div>
            </div>

            {/* Transfer history */}
            {transferHistory.length > 0 && (
              <div className="bg-gray-900/60 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto space-y-1.5">
                <p className="text-gray-500 text-xs font-semibold mb-2">Recent Transfers</p>
                {transferHistory.slice(0, 8).map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="text-gray-500 flex-shrink-0">{new Date(t.timestamp).toLocaleTimeString()}</span>
                    <span className="text-gray-300 truncate">{t.fromExchange} → {t.toExchange}</span>
                    {t.network && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
                        NETWORK_BADGE_COLOR[t.network] ?? 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}>{t.network}</span>
                    )}
                    <span className="text-blue-300 font-semibold flex-shrink-0">${t.amount.toLocaleString()}</span>
                    <span
                      onClick={() => t.steps && setShowTransferProgress(true)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 cursor-pointer ${
                        t.status === 'completed' ? 'bg-green-900/60 text-green-300' :
                        t.status === 'failed'    ? 'bg-red-900/60 text-red-300' :
                                                   'bg-yellow-900/60 text-yellow-300'
                      }`}
                    >{t.status}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setTransferAmount(''); setPanel('none'); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={
                  !transferAmount ||
                  parseFloat(transferAmount) <= 0 ||
                  !selectedNetwork ||
                  !selectedNetwork.withdrawEnabled ||
                  !depositCompatible ||
                  (selectedNetwork ? parseFloat(transferAmount) < selectedNetwork.minWithdraw : false)
                }
                className="flex-1 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                  disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors
                  flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer via {selectedNetwork?.network ?? '—'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
