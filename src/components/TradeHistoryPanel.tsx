import React, { useState } from 'react';
import { TradeHistory } from '../types';

interface Props {
  history: TradeHistory[];
}

const EXCHANGE_BADGE: Record<string, string> = {
  'Binance': 'bg-yellow-900/50 text-yellow-300',
  'Bybit':   'bg-orange-900/50 text-orange-300',
  'MEXC':    'bg-blue-900/50 text-blue-300',
  'HTX':     'bg-cyan-900/50 text-cyan-300',
  'KuCoin':  'bg-green-900/50 text-green-300',
  'BitMart': 'bg-purple-900/50 text-purple-300',
  'Bitget':  'bg-teal-900/50 text-teal-300',
  'Gate.io': 'bg-red-900/50 text-red-300',
};

const formatPrice = (p: number) => {
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1)    return p.toFixed(4);
  return p.toFixed(6);
};

export const TradeHistoryPanel: React.FC<Props> = ({ history }) => {
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'pending'>('all');

  const filtered    = history.filter(t => filter === 'all' || t.status === filter);
  const totalProfit = history.filter(t => t.status === 'completed').reduce((s, t) => s + t.netProfit, 0);
  const totalTrades = history.filter(t => t.status === 'completed').length;
  const failedTrades= history.filter(t => t.status === 'failed').length;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden mb-4">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="p-3 sm:p-4 border-b border-gray-700/60">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Trade Execution History
            </h2>
            <p className="text-gray-500 text-[10px] sm:text-xs mt-0.5">Full record of all executed arbitrage trades</p>
          </div>

          {/* Stats chips */}
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="bg-green-950/60 border border-green-800/40 rounded-lg px-2.5 py-1 text-green-300">
              <span className="text-gray-500 mr-1">Done:</span>
              <span className="font-bold">{totalTrades}</span>
            </div>
            <div className="bg-red-950/60 border border-red-800/40 rounded-lg px-2.5 py-1 text-red-300">
              <span className="text-gray-500 mr-1">Failed:</span>
              <span className="font-bold">{failedTrades}</span>
            </div>
            <div className="bg-emerald-950/60 border border-emerald-800/40 rounded-lg px-2.5 py-1 text-emerald-300">
              <span className="text-gray-500 mr-1">Net P&amp;L:</span>
              <span className="font-bold">+${totalProfit.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5">
          {(['all', 'completed', 'failed', 'pending'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-colors capitalize border ${
                filter === f
                  ? f === 'completed' ? 'bg-green-800/60 border-green-600/60 text-green-200'
                  : f === 'failed'    ? 'bg-red-800/60 border-red-600/60 text-red-200'
                  : f === 'pending'   ? 'bg-yellow-800/60 border-yellow-600/60 text-yellow-200'
                  :                    'bg-gray-700 border-gray-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {f} {f !== 'all' && `(${history.filter(t => t.status === f).length})`}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No trade history yet</p>
          <p className="text-gray-600 text-xs mt-1">Execute an opportunity to see records here</p>
        </div>
      ) : (
        /* ── Full scrollable table (all screen sizes) ── */
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: '780px' }}>
            <thead>
              <tr className="bg-gray-800/40 border-b border-gray-700/60 text-gray-400">
                <th className="text-left py-2.5 px-3 font-semibold whitespace-nowrap">Time</th>
                <th className="text-left py-2.5 px-3 font-semibold">Pair</th>
                <th className="text-left py-2.5 px-3 font-semibold">Buy Exchange</th>
                <th className="text-right py-2.5 px-3 font-semibold">Buy Price</th>
                <th className="text-left py-2.5 px-3 font-semibold">Sell Exchange</th>
                <th className="text-right py-2.5 px-3 font-semibold">Sell Price</th>
                <th className="text-right py-2.5 px-3 font-semibold">Amount</th>
                <th className="text-center py-2.5 px-3 font-semibold">Chain</th>
                <th className="text-right py-2.5 px-3 font-semibold">Buy Fee</th>
                <th className="text-right py-2.5 px-3 font-semibold">Sell Fee</th>
                <th className="text-right py-2.5 px-3 font-semibold">W/D Fee</th>
                <th className="text-right py-2.5 px-3 font-semibold">Total After</th>
                <th className="text-right py-2.5 px-3 font-semibold">Net Profit</th>
                <th className="text-center py-2.5 px-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                  <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">
                    <span className="text-gray-400">{new Date(t.timestamp).toLocaleDateString()}</span>{' '}
                    <span className="text-gray-600">{new Date(t.timestamp).toLocaleTimeString()}</span>
                  </td>
                  <td className="py-2.5 px-3 text-white font-semibold">{t.pair}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${EXCHANGE_BADGE[t.buyExchange]}`}>
                      {t.buyExchange}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-white font-mono">${formatPrice(t.buyPrice)}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${EXCHANGE_BADGE[t.sellExchange]}`}>
                      {t.sellExchange}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-white font-mono">${formatPrice(t.sellPrice)}</td>
                  <td className="py-2.5 px-3 text-right text-blue-300 font-semibold">${t.amount.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="bg-cyan-950/50 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                      {t.chain}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-orange-400">{t.buyFee.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right text-orange-400">{t.sellFee.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right text-orange-400">${t.withdrawalFee.toFixed(3)}</td>
                  <td className="py-2.5 px-3 text-right text-blue-300 font-semibold">${t.totalAfterTrade.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={`font-bold ${t.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {t.netProfit >= 0 ? '+' : ''}${t.netProfit.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      t.status === 'completed' ? 'bg-green-900/60 text-green-300 border border-green-700/40'
                      : t.status === 'failed'  ? 'bg-red-900/60 text-red-300 border border-red-700/40'
                      :                          'bg-yellow-900/60 text-yellow-300 border border-yellow-700/40'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
