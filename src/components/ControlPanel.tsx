import React, { useState, useEffect } from 'react';
import { Exchange, ScannerParams, BotState, EXCHANGES } from '../types/index';

interface Props {
  params: ScannerParams;
  onParamsChange: (p: ScannerParams) => void;
  botState: BotState;
  onStartScan: () => void;
  onStopScan: () => void;
  opportunityCount: number;
}

export const ControlPanel: React.FC<Props> = ({
  params, onParamsChange, botState, onStartScan, onStopScan, opportunityCount,
}) => {
  /* ── Local string state so fields can be fully cleared ─────────────── */
  const [minProfit, setMinProfit]   = useState<string>(String(params.minProfitPct));
  const [maxProfit, setMaxProfit]   = useState<string>(String(params.maxProfitPct));
  const [minVol,    setMinVol]      = useState<string>(String(params.minVolume24hLow));

  /* Keep local state in sync if parent resets params externally */
  useEffect(() => { setMinProfit(String(params.minProfitPct));   }, [params.minProfitPct]);
  useEffect(() => { setMaxProfit(String(params.maxProfitPct));   }, [params.maxProfitPct]);
  useEffect(() => { setMinVol(String(params.minVolume24hLow));   }, [params.minVolume24hLow]);

  /* Commit parsed value to parent only when field loses focus */
  const commitMin   = () => onParamsChange({ ...params, minProfitPct:   parseFloat(minProfit)  || 0   });
  const commitMax   = () => onParamsChange({ ...params, maxProfitPct:   parseFloat(maxProfit)  || 50  });
  const commitVol   = () => onParamsChange({ ...params, minVolume24hLow: parseFloat(minVol)    || 0   });

  const toggleExchange = (list: Exchange[], ex: Exchange): Exchange[] =>
    list.includes(ex) ? list.filter(e => e !== ex) : [...list, ex];

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 mb-4">

      {/* ── Header (title + status only — no scan button here) ─────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Scanner Control
          </h2>
          <p className="text-gray-500 text-xs mt-0.5">Configure parameters and start the arbitrage finder</p>
        </div>

        {/* Opportunity count + last scan time — no scan button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {opportunityCount > 0 && (
            <span className="bg-green-900/70 text-green-300 text-xs font-bold px-2 py-0.5 rounded-full border border-green-700/50">
              {opportunityCount} found
            </span>
          )}
          {botState.lastScan && (
            <span className="text-gray-600 text-[10px] hidden sm:block">
              Last: {new Date(botState.lastScan).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Exchange Selectors ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Buy Exchanges */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-gray-300 text-xs font-semibold">Buy Exchanges</label>
            <button
              onClick={() => onParamsChange({
                ...params,
                buyExchanges: params.buyExchanges.length === EXCHANGES.length ? [] : [...EXCHANGES],
              })}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              {params.buyExchanges.length === EXCHANGES.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXCHANGES.map(ex => (
              <button
                key={ex}
                onClick={() => onParamsChange({ ...params, buyExchanges: toggleExchange(params.buyExchanges, ex) })}
                className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all border ${
                  params.buyExchanges.includes(ex)
                    ? 'bg-blue-700/70 border-blue-500/70 text-blue-100'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Sell Exchanges */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-gray-300 text-xs font-semibold">Sell Exchanges</label>
            <button
              onClick={() => onParamsChange({
                ...params,
                sellExchanges: params.sellExchanges.length === EXCHANGES.length ? [] : [...EXCHANGES],
              })}
              className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
            >
              {params.sellExchanges.length === EXCHANGES.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXCHANGES.map(ex => (
              <button
                key={ex}
                onClick={() => onParamsChange({ ...params, sellExchanges: toggleExchange(params.sellExchanges, ex) })}
                className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all border ${
                  params.sellExchanges.includes(ex)
                    ? 'bg-purple-700/70 border-purple-500/70 text-purple-100'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Numeric Parameters ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">

        {/* Min Profit */}
        <div>
          <label className="text-gray-300 text-xs font-semibold mb-1 block">
            Min Profit Margin
          </label>
          <div className="relative">
            <input
              type="number"
              min="0" max="100" step="0.1"
              value={minProfit}
              onChange={e => setMinProfit(e.target.value)}
              onBlur={commitMin}
              className="w-full bg-gray-800 text-white text-sm rounded-xl px-3 py-2.5 pr-8
                border border-gray-600 focus:border-green-500 outline-none transition-colors"
              placeholder="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
          </div>
          <p className="text-gray-600 text-[10px] mt-0.5">After all fees</p>
        </div>

        {/* Max Profit */}
        <div>
          <label className="text-gray-300 text-xs font-semibold mb-1 block">
            Max Profit Margin
          </label>
          <div className="relative">
            <input
              type="number"
              min="0" max="100" step="0.1"
              value={maxProfit}
              onChange={e => setMaxProfit(e.target.value)}
              onBlur={commitMax}
              className="w-full bg-gray-800 text-white text-sm rounded-xl px-3 py-2.5 pr-8
                border border-gray-600 focus:border-yellow-500 outline-none transition-colors"
              placeholder="50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
          </div>
          <p className="text-gray-600 text-[10px] mt-0.5">Filter false signals</p>
        </div>

        {/* Min 24h Volume */}
        <div>
          <label className="text-gray-300 text-xs font-semibold mb-1 block">
            Min 24h Volume (Low)
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              value={minVol}
              onChange={e => setMinVol(e.target.value)}
              onBlur={commitVol}
              className="w-full bg-gray-800 text-white text-sm rounded-xl px-3 py-2.5 pr-12
                border border-gray-600 focus:border-blue-500 outline-none transition-colors"
              placeholder="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]">USDT</span>
          </div>
          <p className="text-gray-600 text-[10px] mt-0.5">Minimum low-end 24h volume</p>
        </div>
      </div>

      {/* ── Scanning Status Bar ──────────────────────────────────────── */}
      {botState.scanning && (
        <div className="mb-4 bg-green-950/40 border border-green-800/40 rounded-xl p-2.5 flex items-center gap-3">
          <div className="flex gap-0.5 items-center flex-shrink-0">
            {[14, 20, 12, 22, 10, 18, 14].map((h, i) => (
              <div
                key={i}
                className="w-0.5 bg-green-400 rounded-full animate-pulse"
                style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
          <span className="text-green-400 text-xs font-medium min-w-0 truncate">
            Scanning {params.buyExchanges.length} × {params.sellExchanges.length} exchange pairs — live markets monitored
          </span>
        </div>
      )}

      {/* ── Scan Button at the bottom ────────────────────────────────── */}
      <button
        onClick={botState.scanning ? onStopScan : onStartScan}
        className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all duration-200
          flex items-center justify-center gap-2 ${
          botState.scanning
            ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40'
            : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/40'
        }`}
      >
        {botState.scanning ? (
          <>
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            Stop Scan
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Start Scan
          </>
        )}
      </button>

    </div>
  );
};
