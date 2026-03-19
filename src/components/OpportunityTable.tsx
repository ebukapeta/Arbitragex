import React, { useState, useEffect } from 'react';
import { ArbitrageOpportunity, EXCHANGE_ACCOUNT_INFO } from '../types';
import { TradeExecutionState } from '../App';
import { verifyPrice, VerifyPriceResult } from '../api/client';

interface Props {
  opportunities:  ArbitrageOpportunity[];
  onExecute:      (opportunity: ArbitrageOpportunity, amount: number, depositAddress?: string) => void;
  execState:      TradeExecutionState | null;
  onCloseExecModal: () => void;
  backendMode?:   boolean;
  minProfitPct?:  number;
}

const formatPrice = (price: number): string => {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)    return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
};

const formatVolume = (vol: number): string => {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000)     return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
};

// ─── Live elapsed timer ──────────────────────────────────────────────────────
const ElapsedTime: React.FC<{ timestamp: number }> = ({ timestamp }) => {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const update = () => {
      const secs = Math.floor((Date.now() - timestamp) / 1000);
      if (secs < 60)        setElapsed(`${secs}s`);
      else if (secs < 3600) setElapsed(`${Math.floor(secs / 60)}m ${secs % 60}s`);
      else                  setElapsed(`${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [timestamp]);

  const color = elapsed.includes('h') ? 'text-red-400'
    : elapsed.includes('m') ? 'text-yellow-400'
    : 'text-green-400';

  return <span className={`font-mono text-xs ${color}`}>{elapsed}</span>;
};

// ─── Step-by-step Trade Execution Progress Modal ─────────────────────────────
const ExecutionProgressModal: React.FC<{
  execState: TradeExecutionState;
  opp: ArbitrageOpportunity | null;
  onClose: () => void;
}> = ({ execState, opp, onClose }) => {
  const isTerminal = execState.step === 'completed' || execState.step === 'failed' || execState.step === 'aborted';

  const steps: { key: TradeExecutionState['step']; label: string }[] = [
    { key: 'verifying_price',       label: 'Verifying Live Price'   },
    { key: 'checking_accounts',     label: 'Checking Accounts'      },
    { key: 'transferring_to_spot',  label: 'Internal Transfer (Buy Exchange)' },
    { key: 'buying',                label: 'Buying Asset'           },
    { key: 'withdrawing',           label: 'Withdrawing Asset'      },
    { key: 'waiting_deposit',       label: 'Awaiting Deposit'       },
    { key: 'transferring_to_trading', label: 'Internal Transfer (Sell Exchange)' },
    { key: 'selling',               label: 'Selling Asset'          },
    { key: 'completed',             label: 'Trade Completed'        },
  ];

  // Determine which steps to show: skip internal transfers if not needed
  const buyAccInfo  = opp ? EXCHANGE_ACCOUNT_INFO[opp.buyExchange]  : null;
  const sellAccInfo = opp ? EXCHANGE_ACCOUNT_INFO[opp.sellExchange] : null;

  const visibleSteps = steps.filter(s => {
    if (s.key === 'transferring_to_spot'    && !buyAccInfo?.requiresInternalTransfer)  return false;
    if (s.key === 'transferring_to_trading' && !sellAccInfo?.requiresInternalTransfer) return false;
    return true;
  });

  const stepOrder = visibleSteps.map(s => s.key);
  const currentIdx = stepOrder.indexOf(execState.step);

  const getStepStatus = (key: typeof stepOrder[number]) => {
    const idx = stepOrder.indexOf(key);
    if (execState.step === 'completed') return idx <= stepOrder.indexOf('completed') ? 'done' : 'pending';
    if (execState.step === 'failed')    return idx < currentIdx ? 'done' : idx === currentIdx ? 'error' : 'pending';
    if (idx < currentIdx)  return 'done';
    if (idx === currentIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
          <div className={`px-5 py-4 border-b border-gray-700/60 ${
          execState.step === 'completed' ? 'bg-green-950/40' :
          execState.step === 'failed'    ? 'bg-red-950/40'   :
          execState.step === 'aborted'   ? 'bg-amber-950/40' : 'bg-blue-950/30'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {execState.step === 'completed' ? (
                <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                  <span className="text-green-400 text-lg">✓</span>
                </div>
              ) : execState.step === 'failed' ? (
                <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                  <span className="text-red-400 text-lg">✗</span>
                </div>
              ) : execState.step === 'aborted' ? (
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <span className="text-amber-400 text-lg">⛔</span>
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
                  {execState.step === 'completed' ? 'Trade Completed ✓' :
                   execState.step === 'failed'    ? 'Trade Failed'      :
                   execState.step === 'aborted'   ? 'Trade Aborted — No Orders Placed' : 'Executing Trade'}
                </h3>
                {opp && (
                  <p className="text-gray-400 text-xs mt-0.5">
                    {opp.pair} · {opp.buyExchange} → {opp.sellExchange}
                  </p>
                )}
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

        {/* Steps list */}
        <div className="px-5 py-4 space-y-2.5">
          {visibleSteps.map((s) => {
            const status = getStepStatus(s.key);
            return (
              <div key={s.key} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
                status === 'active' ? 'bg-blue-950/40 border-blue-600/50' :
                status === 'done'   ? 'bg-green-950/25 border-green-800/30' :
                status === 'error'  ? 'bg-red-950/40 border-red-700/50' :
                                     'bg-gray-800/30 border-gray-700/30 opacity-50'
              }`}>
                {/* Status icon */}
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {status === 'done' && (
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                  {status === 'active' && (
                    <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {status === 'error' && (
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  )}
                  {status === 'pending' && (
                    <div className="w-3 h-3 rounded-full border-2 border-gray-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold ${
                    status === 'active' ? 'text-blue-300' :
                    status === 'done'   ? 'text-green-300' :
                    status === 'error'  ? 'text-red-300' : 'text-gray-500'
                  }`}>
                    {s.label}
                  </p>
                  {status === 'active' && (
                    <p className="text-gray-400 text-[10px] mt-0.5 truncate">{execState.message}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Result section */}
        {execState.step === 'completed' && execState.netProfit !== undefined && (
          <div className="mx-5 mb-5 bg-green-950/50 border border-green-700/50 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-green-300 text-sm font-semibold">Net Profit</span>
              <span className="text-green-300 text-xl font-bold">
                +${execState.netProfit.toFixed(2)} USDT
              </span>
            </div>
            <p className="text-green-600 text-xs mt-1">Trade recorded in execution history below.</p>
            <button
              onClick={onClose}
              className="mt-3 w-full py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {execState.step === 'failed' && (
          <div className="mx-5 mb-5 bg-red-950/50 border border-red-700/50 rounded-xl px-4 py-3">
            <p className="text-red-300 text-sm font-semibold mb-1">Trade Failed</p>
            <p className="text-red-400 text-xs">{execState.error}</p>
            <button
              onClick={onClose}
              className="mt-3 w-full py-2 bg-red-800 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {execState.step === 'aborted' && (
          <div className="mx-5 mb-5 bg-amber-950/50 border border-amber-700/50 rounded-xl px-4 py-3 space-y-2">
            <p className="text-amber-300 text-sm font-semibold">⛔ Trade Aborted — No Orders Placed</p>
            <p className="text-amber-400 text-xs leading-relaxed">{execState.abortReason ?? execState.message}</p>
            {execState.liveNetProfitPct !== undefined && (
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-amber-900/40">
                <div>
                  <p className="text-gray-500">Live Net Profit</p>
                  <p className="text-red-400 font-bold">{execState.liveNetProfitPct.toFixed(3)}%</p>
                </div>
                {execState.priceMovedPct !== undefined && (
                  <div>
                    <p className="text-gray-500">Price Moved</p>
                    <p className="text-amber-400 font-bold">
                      {execState.priceMovedPct > 0 ? '+' : ''}{execState.priceMovedPct.toFixed(3)}%
                    </p>
                  </div>
                )}
              </div>
            )}
            <p className="text-amber-600 text-[10px]">
              Your funds were not touched. The scanner will find a new opportunity.
            </p>
            <button
              onClick={onClose}
              className="mt-1 w-full py-2 bg-amber-800 hover:bg-amber-700 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Account info footer */}
        {!isTerminal && opp && (
          <div className="mx-5 mb-5 bg-gray-800/60 border border-gray-700/40 rounded-xl px-4 py-3 space-y-2">
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide">Account Structure</p>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <p className="text-gray-500 mb-0.5">Buy: {opp.buyExchange}</p>
                <p className={`font-semibold ${buyAccInfo?.requiresInternalTransfer ? 'text-amber-300' : 'text-green-300'}`}>
                  {buyAccInfo?.depositAccountLabel ?? '—'}
                  {buyAccInfo?.requiresInternalTransfer ? ' ⟶ Spot' : ' ✓ Direct'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 mb-0.5">Sell: {opp.sellExchange}</p>
                <p className={`font-semibold ${sellAccInfo?.requiresInternalTransfer ? 'text-amber-300' : 'text-green-300'}`}>
                  {sellAccInfo?.depositAccountLabel ?? '—'}
                  {sellAccInfo?.requiresInternalTransfer ? ' ⟶ Trading' : ' ✓ Direct'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Execute Amount Modal ─────────────────────────────────────────────────────
const ExecuteModal: React.FC<{
  opp:          ArbitrageOpportunity;
  onExecute:    (amt: number) => void;
  onClose:      () => void;
  minProfitPct?: number;
}> = ({ opp, onExecute, onClose, minProfitPct = 0 }) => {
  const [amount, setAmount]           = useState('');
  const [verifying, setVerifying]     = useState(false);
  const [verified, setVerified]       = useState<VerifyPriceResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const parsed = parseFloat(amount);
  const valid  = !isNaN(parsed) && parsed > 0;

  // Use verified live data if available, otherwise fall back to scanner data
  const displayBuyPrice  = verified ? verified.liveBuyPrice  : opp.buyPrice;
  const displaySellPrice = verified ? verified.liveSellPrice : opp.sellPrice;

  // ── Profit display numbers ────────────────────────────────────────────────
  // When verified: use exact backend-calculated values (all use last price, consistent)
  // When not verified: estimate from scanner data
  const buyFeeUSD  = verified && valid
    ? verified.buyFeeAmt
    : (valid ? parsed * (opp.buyFee  / 100) : 0);
  const sellFeeUSD = verified && valid
    ? verified.sellFeeAmt
    : (valid ? parsed * (opp.sellFee / 100) : 0);
  const wdFeeUSD   = verified
    ? verified.wdFeeUSD
    : opp.withdrawalFeeUSD;

  // Gross = sale proceeds minus invested amount (before fees)
  // Use backend's grossProfitUSD when available — it uses live last price
  const grossUSD = verified && valid
    ? verified.grossProfitUSD
    : (valid ? parsed * (opp.profitBeforeFees / 100) : 0);

  const netUSD = verified && valid
    ? verified.netProfitUSD
    : grossUSD - buyFeeUSD - sellFeeUSD - wdFeeUSD;
  const netPct = verified && valid
    ? verified.netProfitPct
    : (valid && parsed > 0 ? (netUSD / parsed) * 100 : 0);

  const canExecute = opp.chainCompatible && opp.withdrawalEnabled && opp.depositEnabled;

  const buyAccInfo  = EXCHANGE_ACCOUNT_INFO[opp.buyExchange];
  const sellAccInfo = EXCHANGE_ACCOUNT_INFO[opp.sellExchange];

  // Re-verify price whenever amount changes (debounced)
  useEffect(() => {
    if (!valid || !canExecute) { setVerified(null); return; }
    setVerified(null);
    setVerifyError(null);
    const timer = setTimeout(async () => {
      setVerifying(true);
      try {
        const result = await verifyPrice({ opportunity: opp, amount: parsed, minProfitPct });
        setVerified(result);
        setVerifyError(null);
      } catch (err) {
        setVerifyError((err as Error).message);
        setVerified(null);
      } finally {
        setVerifying(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [amount, valid, canExecute]);

  const handleStartTrade = () => {
    if (!valid) return;
    // If verified and not profitable enough, block
    if (verified && !verified.stillProfitable) return;
    onExecute(parsed);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Title */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base sm:text-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Execute Trade
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Opportunity summary — shows live prices once verified */}
        <div className="bg-gray-800/80 rounded-xl p-4 mb-3 space-y-2.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Pair</span>
            <span className="text-white font-bold">{opp.pair}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Buy on</span>
            <div className="text-right">
              <span className="text-blue-300 font-semibold">
                {opp.buyExchange} @ ${formatPrice(displayBuyPrice)}
              </span>
              {verified && verified.liveBuyPrice !== opp.buyPrice && (
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Scanner: ${formatPrice(opp.buyPrice)}
                  <span className={verified.liveBuyPrice > opp.buyPrice ? ' text-red-400' : ' text-green-400'}>
                    {' '}({verified.liveBuyPrice > opp.buyPrice ? '▲' : '▼'}{Math.abs(verified.priceMovedPct).toFixed(3)}%)
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Sell on</span>
            <span className="text-purple-300 font-semibold">
              {opp.sellExchange} @ ${formatPrice(displaySellPrice)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Transfer Chain</span>
            <span className={`font-mono text-xs px-2 py-0.5 rounded ${
              opp.chainCompatible ? 'bg-cyan-900/60 text-cyan-300' : 'bg-red-900/60 text-red-300'
            }`}>
              {opp.chain}
            </span>
          </div>
          <div className="border-t border-gray-700/60 pt-2.5 grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <p className="text-gray-500 mb-0.5">Buy Fee</p>
              <p className="text-orange-300 font-semibold">{opp.buyFee.toFixed(2)}%</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 mb-0.5">Sell Fee</p>
              <p className="text-orange-300 font-semibold">{opp.sellFee.toFixed(2)}%</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 mb-0.5">W/D Fee</p>
              {verified?.wdFeeInCoin != null ? (
                <div>
                  <p className="text-orange-300 font-semibold">
                    {verified.wdFeeInCoin} {opp.baseToken}
                  </p>
                  <p className="text-orange-400/70 text-[10px]">≈${verified.wdFeeUSD.toFixed(4)}</p>
                  <p className={`text-[9px] mt-0.5 ${verified.wdFeeSource === 'live' ? 'text-green-500' : 'text-gray-600'}`}>
                    {verified.wdFeeSource === 'live' ? '● live' : '● est.'}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-orange-300 font-semibold">${wdFeeUSD.toFixed(4)}</p>
                  <p className={`text-[9px] mt-0.5 ${verified ? (verified.wdFeeSource === 'live' ? 'text-green-500' : 'text-gray-600') : 'text-gray-600'}`}>
                    {verified ? (verified.wdFeeSource === 'live' ? '● live' : '● est.') : '● est.'}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-gray-700/60 pt-2 flex justify-between items-center">
            <span className="text-gray-400 text-xs">Gross Profit</span>
            <span className="text-yellow-400 font-semibold">{opp.profitBeforeFees.toFixed(3)}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">Net Profit (scan)</span>
            <span className="text-green-400 font-bold">{opp.netProfitPct.toFixed(3)}%</span>
          </div>
          {/* Live verified profit — shown once amount entered and verified */}
          {verified && valid && (
            <div className={`flex justify-between items-center rounded-lg px-2 py-1 ${
              verified.stillProfitable ? 'bg-green-950/50' : 'bg-red-950/50'
            }`}>
              <span className="text-gray-400 text-xs">Live Net Profit</span>
              <span className={`font-bold text-xs ${verified.stillProfitable ? 'text-green-400' : 'text-red-400'}`}>
                ${verified.netProfitUSD.toFixed(4)} ({verified.netProfitPct.toFixed(3)}%)
              </span>
            </div>
          )}
        </div>

        {/* Account structure info */}
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-3 mb-3 text-xs space-y-2">
          <p className="text-gray-500 font-semibold uppercase tracking-wide text-[10px]">Account Structure</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-gray-500 mb-1">{opp.buyExchange} (Buy)</p>
              <p className={`font-semibold text-[11px] ${buyAccInfo.requiresInternalTransfer ? 'text-amber-300' : 'text-green-300'}`}>
                {buyAccInfo.depositAccountLabel}
              </p>
              <p className="text-gray-600 text-[10px] mt-0.5">{buyAccInfo.transferPath}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">{opp.sellExchange} (Sell)</p>
              <p className={`font-semibold text-[11px] ${sellAccInfo.requiresInternalTransfer ? 'text-amber-300' : 'text-green-300'}`}>
                {sellAccInfo.depositAccountLabel}
              </p>
              <p className="text-gray-600 text-[10px] mt-0.5">{sellAccInfo.transferPath}</p>
            </div>
          </div>
          {(buyAccInfo.requiresInternalTransfer || sellAccInfo.requiresInternalTransfer) && (
            <p className="text-amber-400/80 text-[10px] border-t border-gray-700/40 pt-2">
              ⚡ Bot will auto-transfer funds to trading account before executing
            </p>
          )}
        </div>

        {/* Warnings */}
        {!opp.chainCompatible && (
          <div className="bg-red-950/50 border border-red-700/50 rounded-lg px-3 py-2.5 mb-3 text-xs text-red-300 flex items-start gap-2">
            <span className="text-red-400 mt-0.5 flex-shrink-0">⛔</span>
            <div>
              <p className="font-semibold">Chain Incompatible</p>
              <p className="text-red-400 mt-0.5">
                {opp.buyExchange} and {opp.sellExchange} share no common withdrawal chain. Cannot execute.
              </p>
            </div>
          </div>
        )}
        {opp.chainCompatible && !opp.withdrawalEnabled && (
          <div className="bg-red-950/50 border border-red-700/50 rounded-lg px-3 py-2.5 mb-3 text-xs text-red-300">
            ⛔ <strong>Withdrawal disabled</strong> on {opp.buyExchange}.
          </div>
        )}
        {opp.chainCompatible && opp.withdrawalEnabled && !opp.depositEnabled && (
          <div className="bg-red-950/50 border border-red-700/50 rounded-lg px-3 py-2.5 mb-3 text-xs text-red-300">
            ⛔ <strong>Deposit disabled</strong> on {opp.sellExchange}.
          </div>
        )}

        {/* Amount input */}
        {canExecute && (
          <div className="mb-4">
            <label className="text-gray-300 text-sm font-semibold mb-1.5 block">Trade Amount (USDT)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter amount in USDT"
              className="w-full bg-gray-800 text-white text-sm rounded-xl px-4 py-3
                border border-gray-600 focus:border-green-500 outline-none transition-colors"
            />

            {/* Verifying price indicator */}
            {verifying && valid && (
              <div className="mt-2 flex items-center gap-2 text-xs text-blue-400 bg-blue-950/40 border border-blue-800/40 rounded-lg px-3 py-2">
                <svg className="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Fetching live market prices from both exchanges...
              </div>
            )}

            {/* Verify error */}
            {verifyError && (
              <div className="mt-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2">
                ⚠️ Could not verify live price: {verifyError}. Scanner prices will be used.
              </div>
            )}

            {/* Warning if price moved and profit dropped */}
            {verified && verified.warning && (
              <div className={`mt-2 text-xs rounded-lg px-3 py-2 border ${
                verified.stillProfitable
                  ? 'text-amber-300 bg-amber-950/40 border-amber-800/40'
                  : 'text-red-300 bg-red-950/50 border-red-700/50'
              }`}>
                {verified.stillProfitable ? '⚠️' : '⛔'} {verified.warning}
              </div>
            )}

            {valid && !verifying && (
              <div className="mt-2 space-y-1">
                <div className="bg-gray-800/60 rounded-lg px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gross profit</span>
                    <span className="text-yellow-400">+${grossUSD.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Buy fee</span>
                    <span className="text-red-400">-${buyFeeUSD.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Sell fee</span>
                    <span className="text-red-400">-${sellFeeUSD.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">
                      W/D fee
                      {verified?.wdFeeSource && (
                        <span className={`ml-1 text-[9px] ${verified.wdFeeSource === 'live' ? 'text-green-500' : 'text-gray-600'}`}>
                          {verified.wdFeeSource === 'live' ? '●live' : '●est.'}
                        </span>
                      )}
                    </span>
                    <span className="text-red-400">
                      {verified?.wdFeeInCoin != null
                        ? `-${verified.wdFeeInCoin} ${opp.baseToken} ($${wdFeeUSD.toFixed(4)})`
                        : `-$${wdFeeUSD.toFixed(4)}`
                      }
                    </span>
                  </div>
                </div>
                <div className={`rounded-lg px-3 py-2 flex justify-between text-xs font-bold ${
                  netUSD > 0 ? 'bg-green-950/60 border border-green-800/50' : 'bg-red-950/60 border border-red-800/50'
                }`}>
                  <span className={netUSD > 0 ? 'text-green-300' : 'text-red-300'}>
                    {verified ? 'Live Net Profit' : 'Est. Net Profit'}
                  </span>
                  <span className={netUSD > 0 ? 'text-green-300' : 'text-red-300'}>
                    {netUSD > 0 ? '+' : ''}{netUSD.toFixed(4)} USDT ({netPct.toFixed(3)}%)
                  </span>
                </div>
                {verified && (
                  <p className="text-[10px] text-center text-gray-600">
                    ✓ Live prices fetched at {new Date(verified.verifiedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            Cancel
          </button>
          {canExecute ? (
            <button
              onClick={handleStartTrade}
              disabled={!valid || verifying || (verified !== null && !verified.stillProfitable)}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40
                disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors
                flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Start Trade
            </button>
          ) : (
            <button disabled className="flex-1 py-2.5 bg-gray-700 text-gray-500 rounded-xl font-bold text-sm cursor-not-allowed opacity-60">
              Cannot Execute
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Network badge colours ────────────────────────────────────────────────────
const CHAIN_BADGE: Record<string, string> = {
  TRC20:    'bg-red-900/60 text-red-300 border-red-700/50',
  ERC20:    'bg-blue-900/60 text-blue-300 border-blue-700/50',
  BEP20:    'bg-yellow-900/60 text-yellow-300 border-yellow-700/50',
  SOL:      'bg-purple-900/60 text-purple-300 border-purple-700/50',
  ARBITRUM: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50',
  OPTIMISM: 'bg-rose-900/60 text-rose-300 border-rose-700/50',
  POLYGON:  'bg-violet-900/60 text-violet-300 border-violet-700/50',
  AVAXC:    'bg-orange-900/60 text-orange-300 border-orange-700/50',
  BASE:     'bg-blue-900/60 text-blue-200 border-blue-600/50',
  TON:      'bg-sky-900/60 text-sky-300 border-sky-700/50',
  KCC:      'bg-green-900/60 text-green-300 border-green-700/50',
};

// ─── Chain Selector Modal ─────────────────────────────────────────────────────
const ChainSelectorModal: React.FC<{
  opp: ArbitrageOpportunity;
  currentChain: string;
  onSelect: (chain: string) => void;
  onClose: () => void;
}> = ({ opp, currentChain, onSelect, onClose }) => {
  // Use viableChains (both W/D enabled) first, then fall back to all commonChains
  const viable  = opp.viableChains?.length  ? opp.viableChains  : [];
  const common  = opp.commonChains?.length   ? opp.commonChains  : [];
  const allChains = [...new Set([...viable, ...common])];

  // Static fallback fees per network (USDT) — used when live fee is unavailable
  const STATIC_FEES: Record<string, number> = {
    TRC20: 1.00, BEP20: 0.80, SOL: 1.00, POLYGON: 1.00,
    ARBITRUM: 0.80, OPTIMISM: 0.80, BASE: 0.50, AVAXC: 1.00,
    KCC: 0.80, TON: 0.50, ERC20: 4.50,
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-bold text-sm">Select Transfer Chain</h3>
            <p className="text-gray-500 text-[10px] mt-0.5">
              {opp.pair} · {opp.buyExchange} → {opp.sellExchange}
            </p>
          </div>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800">
            ✕
          </button>
        </div>

        {allChains.length === 0 ? (
          <p className="text-red-400 text-sm text-center py-4">No common chains found for this coin on these exchanges.</p>
        ) : (
          <div className="space-y-2">
            {allChains.map(chain => {
              const isViable   = viable.includes(chain);
              const isSelected = chain === currentChain;
              const fee        = STATIC_FEES[chain] ?? 1.0;
              return (
                <button
                  key={chain}
                  onClick={() => { onSelect(chain); onClose(); }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                    isSelected
                      ? 'border-blue-500/60 bg-blue-950/40'
                      : isViable
                      ? 'border-gray-700/60 bg-gray-800/60 hover:border-gray-500'
                      : 'border-red-900/40 bg-red-950/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono border font-bold ${
                      CHAIN_BADGE[chain] ?? 'bg-gray-800 text-gray-300 border-gray-600'
                    }`}>
                      {chain}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        {isViable ? (
                          <span className="text-green-400 text-[10px]">✓ W/D enabled</span>
                        ) : (
                          <span className="text-red-400 text-[10px]">⚠ W/D suspended</span>
                        )}
                        {isSelected && (
                          <span className="text-blue-400 text-[10px] font-bold">· Active</span>
                        )}
                      </div>
                      <div className="text-gray-500 text-[10px]">Est. withdrawal fee: ${fee.toFixed(2)}</div>
                    </div>
                  </div>
                  {isSelected && (
                    <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {viable.length < allChains.length && (
          <p className="text-gray-600 text-[10px] mt-3 text-center">
            ⚠ Chains shown in red have withdrawal or deposit suspended on one or both exchanges
          </p>
        )}
      </div>
    </div>
  );
};

// ─── Exchange badge colors ───────────────────────────────────────────────────
const EXCHANGE_BADGE: Record<string, string> = {
  'Binance': 'bg-yellow-900/60 text-yellow-300 border border-yellow-700/40',
  'Bybit':   'bg-orange-900/60 text-orange-300 border border-orange-700/40',
  'MEXC':    'bg-blue-900/60 text-blue-300 border border-blue-700/40',
  'HTX':     'bg-cyan-900/60 text-cyan-300 border border-cyan-700/40',
  'KuCoin':  'bg-green-900/60 text-green-300 border border-green-700/40',
  'BitMart': 'bg-purple-900/60 text-purple-300 border border-purple-700/40',
  'Bitget':  'bg-teal-900/60 text-teal-300 border border-teal-700/40',
  'Gate.io': 'bg-red-900/60 text-red-300 border border-red-700/40',
};

// ─── Mobile opportunity card ─────────────────────────────────────────────────
const MobileCard: React.FC<{
  opp: ArbitrageOpportunity;
  idx: number;
  displayChain: string;
  allChains: string[];
  onExecuteClick: () => void;
  onChainClick: () => void;
}> = ({ opp, idx, displayChain, allChains, onExecuteClick, onChainClick }) => {
  const canExecute = opp.chainCompatible && opp.withdrawalEnabled && opp.depositEnabled;

  return (
    <div className={`bg-gray-800/60 rounded-xl p-3 border ${
      canExecute ? 'border-gray-700/50' : 'border-red-900/30'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-xs font-mono w-5 text-center">{idx}</span>
          <span className="bg-blue-950/60 text-blue-300 text-[10px] font-bold px-1.5 py-0.5 rounded">USDT</span>
          <span className="text-white font-bold text-sm">{opp.pair}</span>
        </div>
        <ElapsedTime timestamp={opp.firstSeenAt ?? opp.discoveredAt} />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
        <div className="bg-gray-900/60 rounded-lg p-2">
          <p className="text-gray-500 text-[10px] mb-0.5">BUY</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${EXCHANGE_BADGE[opp.buyExchange]}`}>
            {opp.buyExchange}
          </span>
          <p className="text-white font-mono font-semibold mt-1">${formatPrice(opp.buyPrice)}</p>
          <p className="text-gray-500 text-[10px]">Fee: {opp.buyFee.toFixed(2)}%</p>
        </div>
        <div className="bg-gray-900/60 rounded-lg p-2">
          <p className="text-gray-500 text-[10px] mb-0.5">SELL</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${EXCHANGE_BADGE[opp.sellExchange]}`}>
            {opp.sellExchange}
          </span>
          <p className="text-white font-mono font-semibold mt-1">${formatPrice(opp.sellPrice)}</p>
          <p className="text-gray-500 text-[10px]">Fee: {opp.sellFee.toFixed(2)}%</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-xs">
          <span className="text-gray-500">Gross: </span>
          <span className="text-yellow-400 font-semibold">+{opp.profitBeforeFees.toFixed(3)}%</span>
        </div>
        <div className="text-xs">
          <span className="text-gray-500">Net: </span>
          <span className="text-green-400 font-bold">+{opp.netProfitPct.toFixed(3)}%</span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
          opp.chainCompatible
            ? (CHAIN_BADGE[displayChain] ?? 'bg-cyan-900/50 text-cyan-300 border-cyan-700/50')
            : 'bg-red-900/50 text-red-300 border-red-700/50'
        }`}>
          {displayChain ?? '—'}
        </span>
        {opp.chainCompatible && allChains.length > 1 && (
          <button
            onClick={onChainClick}
            className="text-[9px] text-blue-400 hover:text-blue-300 underline underline-offset-1"
          >
            {allChains.length} chains ▾
          </button>
        )}
        <span className={`text-[10px] ${opp.withdrawalEnabled ? 'text-green-400' : 'text-red-400'}`}>↑{opp.withdrawalEnabled ? '✓' : '✗'}</span>
        <span className={`text-[10px] ${opp.depositEnabled ? 'text-green-400' : 'text-red-400'}`}>↓{opp.depositEnabled ? '✓' : '✗'}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-500">
            <span className="text-blue-400 font-semibold">Buy 24V:</span>{' '}
            <span className="text-blue-300 font-mono">{formatVolume(opp.buyVolume24hLow)}</span>
          </span>
          <span className="text-gray-700">·</span>
          <span className="text-gray-500">
            <span className="text-purple-400 font-semibold">Sell 24V:</span>{' '}
            <span className="text-purple-300 font-mono">{formatVolume(opp.sellVolume24hLow)}</span>
          </span>
        </div>
        <button
          onClick={onExecuteClick}
          disabled={!canExecute}
          title={!opp.chainCompatible ? 'No compatible chain' : !opp.withdrawalEnabled ? 'Withdrawal disabled' : !opp.depositEnabled ? 'Deposit disabled' : 'Execute trade'}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
            canExecute
              ? 'bg-green-700 hover:bg-green-600 active:scale-95 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'
          }`}
        >
          {canExecute ? (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Execute
            </>
          ) : <>⛔ Blocked</>}
        </button>
      </div>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const OpportunityTable: React.FC<Props> = ({ opportunities, onExecute, execState, onCloseExecModal, backendMode: _backendMode }) => {
  const [executeTarget,    setExecuteTarget]    = useState<ArbitrageOpportunity | null>(null);
  const [sortKey,          setSortKey]          = useState<'netProfit' | 'profitBeforeFees' | 'volume24hLow'>('netProfit');
  const [sortDir,          setSortDir]          = useState<'desc' | 'asc'>('desc');
  // Chain override: oppId → user-selected chain (overrides scanner's bestChain)
  const [chainOverrides,   setChainOverrides]   = useState<Record<string, string>>({});
  // Which opp has chain selector open
  const [chainSelectorOpp, setChainSelectorOpp] = useState<ArbitrageOpportunity | null>(null);

  // Row heights per viewport
  const ROW_HEIGHT        = 44;
  const VISIBLE_ROWS_MOB  = 5;   // mobile: 5 rows
  const VISIBLE_ROWS_DESK = 10;  // desktop: 10 rows
  const TABLE_MAX_H_DESK  = ROW_HEIGHT * VISIBLE_ROWS_DESK;  // 440px

  const sorted = [...opportunities].sort((a, b) => {
    const av = sortKey === 'netProfit' ? a.netProfitPct : sortKey === 'profitBeforeFees' ? a.profitBeforeFees : a.volume24hLow;
    const bv = sortKey === 'netProfit' ? b.netProfitPct : sortKey === 'profitBeforeFees' ? b.profitBeforeFees : b.volume24hLow;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon: React.FC<{ field: typeof sortKey }> = ({ field }) => (
    <span className={`ml-0.5 ${sortKey === field ? 'text-blue-400' : 'text-gray-600'}`}>
      {sortKey === field ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  // Find the opp being executed for the progress modal
  const execOpp = execState ? opportunities.find(o => o.id === execState.oppId) ?? null : null;

  if (opportunities.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 sm:p-14 text-center mb-4">
        <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-gray-400 text-base font-semibold">No opportunities found</p>
        <p className="text-gray-600 text-sm mt-1">
          Configure your parameters above and click <strong className="text-gray-400">Start Scan</strong>
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Chain selector modal */}
      {chainSelectorOpp && (
        <ChainSelectorModal
          opp={chainSelectorOpp}
          currentChain={chainOverrides[chainSelectorOpp.id] ?? chainSelectorOpp.chain}
          onSelect={chain => setChainOverrides(prev => ({ ...prev, [chainSelectorOpp.id]: chain }))}
          onClose={() => setChainSelectorOpp(null)}
        />
      )}

      {/* Execute amount modal */}
      {executeTarget && (
        <ExecuteModal
          opp={{ ...executeTarget, chain: chainOverrides[executeTarget.id] ?? executeTarget.chain }}
          onExecute={(amt) => { onExecute({ ...executeTarget, chain: chainOverrides[executeTarget.id] ?? executeTarget.chain }, amt); setExecuteTarget(null); }}
          onClose={() => setExecuteTarget(null)}
        />
      )}

      {/* Trade execution progress modal */}
      {execState && execState.step !== 'idle' && (
        <ExecutionProgressModal
          execState={execState}
          opp={execOpp}
          onClose={onCloseExecModal}
        />
      )}

      <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden mb-4">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-gray-700/60 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">Arbitrage Opportunities</h2>
            <p className="text-gray-500 text-[10px] sm:text-xs mt-0.5">
              {sorted.length} validated · chain-compatible · withdrawal/deposit checked
              {sorted.length > VISIBLE_ROWS_DESK && (
                <span className="text-blue-400 ml-2">· scroll to see all {sorted.length}</span>
              )}
            </p>
          </div>
          <div className="flex gap-1.5 text-xs">
            {(['netProfit', 'profitBeforeFees', 'volume24hLow'] as const).map(key => (
              <button
                key={key}
                onClick={() => toggleSort(key)}
                className={`px-2.5 py-1 rounded-lg border text-[10px] sm:text-xs transition-colors ${
                  sortKey === key
                    ? 'bg-blue-900/60 border-blue-600/60 text-blue-200'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {key === 'netProfit' ? 'Net' : key === 'profitBeforeFees' ? 'Gross' : 'Min 24V'}
                <SortIcon field={key} />
              </button>
            ))}
          </div>
        </div>

        {/* ── Mobile cards (< sm) — scrollable ──────────────── */}
        <div
          className="sm:hidden p-3 space-y-2 overflow-y-auto"
          style={{ maxHeight: `${VISIBLE_ROWS_MOB * 180}px` }}
        >
          {sorted.map((opp, idx) => {
            const displayChain = chainOverrides[opp.id] ?? opp.chain;
            const allChains    = [...new Set([...(opp.viableChains ?? []), ...(opp.commonChains ?? [])])];
            return (
            <MobileCard
              key={opp.id}
              opp={opp}
              idx={idx + 1}
              displayChain={displayChain}
              allChains={allChains}
              onExecuteClick={() => setExecuteTarget(opp)}
              onChainClick={() => setChainSelectorOpp(opp)}
            />
            );
          })}
        </div>

        {/* ── Desktop table (≥ sm) ─────────────────────────────────────────── */}
        <div className="hidden sm:block overflow-x-auto">

          {/* Fixed header table */}
          <table className="text-xs" style={{ tableLayout:'fixed', minWidth:'1400px', width:'100%', borderCollapse:'collapse' }}>
            <colgroup>
              <col style={{width:'36px'}} />
              <col style={{width:'52px'}} />
              <col style={{width:'110px'}} />
              <col style={{width:'100px'}} />
              <col style={{width:'110px'}} />
              <col style={{width:'100px'}} />
              <col style={{width:'110px'}} />
              <col style={{width:'90px'}} />
              <col style={{width:'100px'}} />
              <col style={{width:'48px'}} />
              <col style={{width:'48px'}} />
              <col style={{width:'120px'}} />
              <col style={{width:'90px'}} />
              <col style={{width:'90px'}} />
              <col style={{width:'64px'}} />
              <col style={{width:'90px'}} />
            </colgroup>
            <thead>
              <tr className="bg-gray-800/90 border-b border-gray-700/60 text-gray-400">
                <th className="text-center py-2.5 px-2 font-semibold">#</th>
                <th className="text-left   py-2.5 px-2 font-semibold">Base</th>
                <th className="text-left   py-2.5 px-2 font-semibold">Pair</th>
                <th className="text-left   py-2.5 px-2 font-semibold">Buy Exch.</th>
                <th className="text-right  py-2.5 px-2 font-semibold">Buy Price</th>
                <th className="text-left   py-2.5 px-2 font-semibold">Sell Exch.</th>
                <th className="text-right  py-2.5 px-2 font-semibold">Sell Price</th>
                <th className="text-right  py-2.5 px-2 font-semibold">Gross</th>
                <th className="text-right  py-2.5 px-2 font-semibold">Net Profit</th>
                <th className="text-center py-2.5 px-2 font-semibold">W/D</th>
                <th className="text-center py-2.5 px-2 font-semibold">Dep</th>
                <th className="text-center py-2.5 px-2 font-semibold">Chain</th>
                <th className="text-right  py-2.5 px-2 font-semibold whitespace-nowrap"><span className="text-blue-300">Buy</span> 24V</th>
                <th className="text-right  py-2.5 px-2 font-semibold whitespace-nowrap"><span className="text-purple-300">Sell</span> 24V</th>
                <th className="text-center py-2.5 px-2 font-semibold">Age</th>
                <th className="text-center py-2.5 px-2 font-semibold">Execute</th>
              </tr>
            </thead>
          </table>

          {/* Scrollable body — separate div so only rows scroll, header stays */}
          <div style={{ maxHeight: `${TABLE_MAX_H_DESK}px`, overflowY: 'auto', overflowX: 'hidden' }}>
            <table className="text-xs" style={{ tableLayout:'fixed', minWidth:'1400px', width:'100%', borderCollapse:'collapse' }}>
              <colgroup>
                <col style={{width:'36px'}} />
                <col style={{width:'52px'}} />
                <col style={{width:'110px'}} />
                <col style={{width:'100px'}} />
                <col style={{width:'110px'}} />
                <col style={{width:'100px'}} />
                <col style={{width:'110px'}} />
                <col style={{width:'90px'}} />
                <col style={{width:'100px'}} />
                <col style={{width:'48px'}} />
                <col style={{width:'48px'}} />
                <col style={{width:'120px'}} />
                <col style={{width:'90px'}} />
                <col style={{width:'90px'}} />
                <col style={{width:'64px'}} />
                <col style={{width:'90px'}} />
              </colgroup>
              <tbody>
                {sorted.map((opp, idx) => {
                  const canExecute  = opp.chainCompatible && opp.withdrawalEnabled && opp.depositEnabled;
                  const blockReason = !opp.chainCompatible      ? 'No compatible chain between exchanges'
                                    : !opp.withdrawalEnabled    ? `Withdrawal disabled on ${opp.buyExchange}`
                                    : `Deposit disabled on ${opp.sellExchange}`;
                  const displayChain = chainOverrides[opp.id] ?? opp.chain;
                  const allChains    = [...new Set([...(opp.viableChains ?? []), ...(opp.commonChains ?? [])])];

                  return (
                    <tr
                      key={opp.id}
                      className={`border-b border-gray-800/50 transition-colors ${
                        canExecute ? 'hover:bg-gray-800/30' : 'hover:bg-gray-800/20 opacity-80'
                      }`}
                    >
                      <td className="py-2.5 px-2 text-center text-gray-600 font-mono">{idx + 1}</td>

                      <td className="py-2.5 px-2">
                        <span className="bg-blue-950/60 text-blue-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                          {opp.baseToken}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-white font-semibold truncate">{opp.pair}</td>

                      <td className="py-2.5 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${EXCHANGE_BADGE[opp.buyExchange]}`}>
                          {opp.buyExchange}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <div className="text-white font-mono font-semibold">${formatPrice(opp.buyPrice)}</div>
                        <div className="text-gray-600 text-[10px]">Fee: {opp.buyFee.toFixed(2)}%</div>
                      </td>

                      <td className="py-2.5 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${EXCHANGE_BADGE[opp.sellExchange]}`}>
                          {opp.sellExchange}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <div className="text-white font-mono font-semibold">${formatPrice(opp.sellPrice)}</div>
                        <div className="text-gray-600 text-[10px]">Fee: {opp.sellFee.toFixed(2)}%</div>
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <span className="text-yellow-400 font-bold">+{opp.profitBeforeFees.toFixed(3)}%</span>
                        <div className="text-gray-600 text-[10px]">W/D: ${opp.withdrawalFeeUSD.toFixed(3)}</div>
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <span className={`font-bold ${
                          opp.netProfitPct >= 1   ? 'text-green-400'
                          : opp.netProfitPct >= 0.5 ? 'text-emerald-400'
                          : 'text-lime-400'
                        }`}>
                          +{opp.netProfitPct.toFixed(3)}%
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <span className={opp.withdrawalEnabled ? 'text-green-400' : 'text-red-400'}
                          title={opp.withdrawalEnabled ? 'Withdrawal Enabled' : 'Withdrawal Disabled'}>
                          {opp.withdrawalEnabled ? '✓' : '✗'}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <span className={opp.depositEnabled ? 'text-green-400' : 'text-red-400'}
                          title={opp.depositEnabled ? 'Deposit Enabled' : 'Deposit Disabled'}>
                          {opp.depositEnabled ? '✓' : '✗'}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                            opp.chainCompatible
                              ? (CHAIN_BADGE[displayChain] ?? 'bg-cyan-950/60 text-cyan-300 border-cyan-700/50')
                              : 'bg-red-950/60 text-red-400 border-red-700/50'
                          }`}>
                            {displayChain ?? '—'}
                          </span>
                          {opp.chainCompatible && allChains.length > 1 && (
                            <button
                              onClick={() => setChainSelectorOpp(opp)}
                              className="text-[9px] text-blue-400 hover:text-blue-300 underline underline-offset-1 leading-tight"
                            >
                              {allChains.length} chains ▾
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <span className="text-blue-300 font-mono font-semibold">{formatVolume(opp.buyVolume24hLow)}</span>
                        <div className="text-gray-600 text-[10px] truncate">{opp.buyExchange}</div>
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <span className="text-purple-300 font-mono font-semibold">{formatVolume(opp.sellVolume24hLow)}</span>
                        <div className="text-gray-600 text-[10px] truncate">{opp.sellExchange}</div>
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <ElapsedTime timestamp={opp.firstSeenAt ?? opp.discoveredAt} />
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => canExecute && setExecuteTarget(opp)}
                          disabled={!canExecute || !!opp.executing}
                          title={canExecute ? 'Execute this trade' : blockReason}
                          className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all
                            flex items-center gap-1 mx-auto ${
                            opp.executing
                              ? 'bg-blue-900/50 text-blue-400 cursor-wait border border-blue-700/50'
                              : canExecute
                              ? 'bg-green-700 hover:bg-green-600 active:scale-95 text-white cursor-pointer'
                              : 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-700/50'
                          }`}
                        >
                          {opp.executing ? (
                            <>
                              <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                              Running
                            </>
                          ) : canExecute ? (
                            <>
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Execute
                            </>
                          ) : '⛔ Blocked'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scroll hint — desktop only */}
        {sorted.length > VISIBLE_ROWS_DESK && (
          <div className="hidden sm:block border-t border-gray-800/60 px-4 py-2 text-center">
            <span className="text-gray-600 text-[10px]">
              ↕ Scroll to view all {sorted.length} opportunities ({sorted.length - VISIBLE_ROWS_DESK} more)
            </span>
          </div>
        )}
      </div>
    </>
  );
};
