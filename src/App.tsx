import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Exchange, ExchangeBalance, ArbitrageOpportunity, TradeHistory,
  TransferHistory, ScannerParams, BotState, ApiCredentials,
  EXCHANGES, EXCHANGE_ACCOUNT_INFO,
} from './types';
import { generateMockBalances, generateOpportunity, MOCK_PAIRS, MOCK_TRADE_HISTORY } from './data/mockData';
import { ExchangeDashboard } from './components/ExchangeDashboard';
import { ControlPanel }      from './components/ControlPanel';
import { OpportunityTable }  from './components/OpportunityTable';
import { TradeHistoryPanel } from './components/TradeHistoryPanel';
import { Footer }            from './components/Footer';
import * as api              from './api/client';

let oppIdCounter = 1;

export interface TradeExecutionState {
  oppId:   string;
  tradeId?: string;
  step:
    | 'idle'
    | 'checking_accounts'
    | 'transferring_to_spot'
    | 'transfer_to_spot_done'
    | 'buying'
    | 'buy_filled'
    | 'withdrawing'
    | 'withdrawal_submitted'
    | 'waiting_deposit'
    | 'deposit_confirmed'
    | 'transferring_to_trading'
    | 'transfer_to_trading_done'
    | 'selling'
    | 'completed'
    | 'failed';
  message:    string;
  netProfit?: number;
  error?:     string;
  steps?:     Array<{ step: string; message: string; timestamp: number }>;
}

let BACKEND_AVAILABLE = false;

async function checkBackend(): Promise<boolean> {
  try {
    const health = await api.fetchHealth();
    return health.status === 'ok';
  } catch {
    return false;
  }
}

export function App() {
  const [backendMode, setBackendMode]         = useState(false);
  const [balances, setBalances]               = useState<ExchangeBalance[]>(generateMockBalances());
  const [opportunities, setOpportunities]     = useState<ArbitrageOpportunity[]>([]);
  const [tradeHistory, setTradeHistory]       = useState<TradeHistory[]>(MOCK_TRADE_HISTORY);
  const [transferHistory, setTransferHistory] = useState<TransferHistory[]>([]);
  const [botState, setBotState]               = useState<BotState>({ running: false, scanning: false, lastScan: null });
  const [params, setParams]                   = useState<ScannerParams>({
    buyExchanges:    [...EXCHANGES],
    sellExchanges:   [...EXCHANGES],
    minProfitPct:    0.3,
    maxProfitPct:    15,
    minVolume24hLow: 100000,
  });

  const [execState, setExecState]                   = useState<TradeExecutionState | null>(null);
  const [activeTransferId, setActiveTransferId]     = useState<string | null>(null);
  const [notification, setNotification]             = useState<{ message: string; type: 'success'|'error'|'info' } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen]         = useState(false);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStopRef     = useRef<(() => void) | null>(null);

  // ── Check backend on mount ─────────────────────────────────────────────────
  useEffect(() => {
    checkBackend().then(available => {
      BACKEND_AVAILABLE = available;
      setBackendMode(available);
      if (available) loadBackendState();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load state from backend ────────────────────────────────────────────────
  const loadBackendState = useCallback(async () => {
    try {
      const [statuses, balanceData, trades, transfers] = await Promise.allSettled([
        api.fetchConnectionStatus(),
        api.fetchAllBalances(),
        api.fetchTradeHistory(),
        api.fetchTransferHistory(),
      ]);

      if (balanceData.status === 'fulfilled') {
        setBalances(balanceData.value.map(b => ({
          exchange:        b.exchange,
          balance:         b.totalUSDT,
          connected:       b.connected,
          credentials:     {} as ApiCredentials,
          depositEnabled:  true,
          withdrawEnabled: true,
          lastUpdated:     b.lastUpdated,
        })));
      }
      if (trades.status === 'fulfilled')     setTradeHistory(trades.value);
      if (transfers.status === 'fulfilled')  setTransferHistory(transfers.value);
      if (statuses.status === 'fulfilled') {
        setBalances(prev => prev.map(b => {
          const status = statuses.value.find(s => s.exchange === b.exchange);
          return status ? { ...b, connected: status.connected } : b;
        }));
      }
    } catch (err) {
      console.error('[App] Failed to load backend state:', err);
    }
  }, []);

  // ── Notification helper ────────────────────────────────────────────────────
  const showNotification = useCallback((message: string, type: 'success'|'error'|'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  }, []);

  // ── Scanner ────────────────────────────────────────────────────────────────
  const runScan = useCallback(async (currentParams: ScannerParams) => {
    if (BACKEND_AVAILABLE) {
      try {
        const result = await api.runScan({
          buyExchanges:    currentParams.buyExchanges,
          sellExchanges:   currentParams.sellExchanges,
          minProfitPct:    currentParams.minProfitPct,
          maxProfitPct:    currentParams.maxProfitPct,
          minVolume24hLow: currentParams.minVolume24hLow,
        });
        if (result.message) showNotification(result.message, 'info');
        setOpportunities(prev => {
          const executing = prev.filter(o => o.executing);
          const newOpps   = result.opportunities.filter(o => !executing.some(e => e.id === o.id));
          return [...executing, ...newOpps].slice(0, 25);
        });
        setBotState(prev => ({ ...prev, lastScan: Date.now() }));
      } catch (err) {
        console.error('[App] Scan error:', err);
        showNotification('Scan error — check backend connection', 'error');
      }
    } else {
      // Mock scan
      const newOpps: ArbitrageOpportunity[] = [];
      const buyExs  = currentParams.buyExchanges.length  > 0 ? currentParams.buyExchanges  : [...EXCHANGES];
      const sellExs = currentParams.sellExchanges.length > 0 ? currentParams.sellExchanges : [...EXCHANGES];
      const shuffled = [...MOCK_PAIRS].sort(() => Math.random() - 0.5).slice(0, 18);

      for (const pair of shuffled) {
        const buyEx  = buyExs[Math.floor(Math.random() * buyExs.length)];
        let   sellEx = sellExs[Math.floor(Math.random() * sellExs.length)];
        if (sellEx === buyEx) sellEx = sellExs.find(e => e !== buyEx) ?? sellExs[0];
        if (sellEx === buyEx) continue;
        const opp = generateOpportunity(pair, buyEx as Exchange, sellEx as Exchange, `opp-${oppIdCounter++}`);
        if (!opp) continue;
        if (opp.netProfitPct < currentParams.minProfitPct)    continue;
        if (opp.netProfitPct > currentParams.maxProfitPct)    continue;
        if (opp.volume24hLow < currentParams.minVolume24hLow) continue;
        newOpps.push(opp);
      }

      setOpportunities(prev => {
        const aged   = prev
          .filter(o => Date.now() - o.discoveredAt < 120_000)
          .map(o => ({ ...o, sellPrice: parseFloat((o.sellPrice * (1 + (Math.random() - 0.5) * 0.0008)).toFixed(8)) }));
        const combined = [...aged, ...newOpps];
        const unique   = combined.filter((o, i, arr) =>
          arr.findIndex(x => x.pair === o.pair && x.buyExchange === o.buyExchange && x.sellExchange === o.sellExchange) === i,
        );
        return unique.slice(0, 25);
      });
      setBotState(prev => ({ ...prev, lastScan: Date.now() }));
    }
  }, [showNotification]);

  const startScanner = useCallback(() => {
    setBotState(prev => ({ ...prev, scanning: true, running: true }));
    showNotification('Scanner started — fetching live prices from exchanges...', 'success');
    runScan(params);
    scanIntervalRef.current = setInterval(() => runScan(params), 8000);
  }, [params, runScan, showNotification]);

  const stopScanner = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    setBotState(prev => ({ ...prev, scanning: false }));
    showNotification('Scanner stopped', 'info');
  }, [showNotification]);

  useEffect(() => {
    if (botState.scanning) {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      runScan(params);
      scanIntervalRef.current = setInterval(() => runScan(params), 8000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (pollStopRef.current)     pollStopRef.current();
    };
  }, []);

  // ── Execute trade ──────────────────────────────────────────────────────────
  const handleExecute = useCallback((
    opp:             ArbitrageOpportunity,
    amount:          number,
    depositAddress?: string,
  ) => {
    if (!opp.chainCompatible) {
      showNotification('❌ Cannot execute — no compatible transfer chain', 'error');
      return;
    }
    if (!opp.withdrawalEnabled) {
      showNotification(`❌ Cannot execute — withdrawal disabled on ${opp.buyExchange}`, 'error');
      return;
    }
    if (!opp.depositEnabled) {
      showNotification(`❌ Cannot execute — deposit disabled on ${opp.sellExchange}`, 'error');
      return;
    }

    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, executing: true } : o));

    if (BACKEND_AVAILABLE && depositAddress) {
      setExecState({ oppId: opp.id, step: 'checking_accounts', message: 'Connecting to backend...' });
      api.executeTrade({ opportunity: opp, amount, depositAddress })
        .then(response => {
          if (pollStopRef.current) pollStopRef.current();
          pollStopRef.current = api.pollTradeStatus(
            response.tradeId,
            (status) => {
              const lastStep = status.steps[status.steps.length - 1];
              setExecState({
                oppId:   opp.id,
                tradeId: response.tradeId,
                step:    status.currentStep as TradeExecutionState['step'],
                message: lastStep?.message ?? status.currentStep,
                steps:   status.steps,
              });
            },
            (finalStatus) => {
              const lastStep  = finalStatus.steps[finalStatus.steps.length - 1];
              const netProfit = lastStep?.netProfit ?? finalStatus.netProfit;
              setExecState({
                oppId:     opp.id,
                tradeId:   response.tradeId,
                step:      finalStatus.status === 'completed' ? 'completed' : 'failed',
                message:   finalStatus.status === 'completed' ? 'Trade completed!' : (finalStatus.error ?? 'Trade failed'),
                netProfit: netProfit ?? undefined,
              });
              if (finalStatus.status === 'completed') {
                setOpportunities(prev => prev.filter(o => o.id !== opp.id));
              } else {
                setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, executing: false } : o));
              }
              loadBackendState();
            },
            (err) => {
              setExecState({ oppId: opp.id, step: 'failed', message: err.message, error: err.message });
              setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, executing: false } : o));
            },
          );
        })
        .catch(err => {
          setExecState({ oppId: opp.id, step: 'failed', message: err.message, error: err.message });
          setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, executing: false } : o));
        });
    } else {
      // Mock execution
      const buyAccInfo  = EXCHANGE_ACCOUNT_INFO[opp.buyExchange];
      const sellAccInfo = EXCHANGE_ACCOUNT_INFO[opp.sellExchange];
      const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

      setExecState({ oppId: opp.id, step: 'checking_accounts', message: `Checking account structure on ${opp.buyExchange} & ${opp.sellExchange}...` });

      (async () => {
        await delay(900);
        if (buyAccInfo.requiresInternalTransfer) {
          setExecState({ oppId: opp.id, step: 'transferring_to_spot', message: `${opp.buyExchange}: Moving USDT from ${buyAccInfo.depositAccountLabel} → Spot/Trading Account...` });
          await delay(1200);
        }
        setExecState({ oppId: opp.id, step: 'buying', message: `Buying ${opp.pair.split('/')[0]} on ${opp.buyExchange} at $${opp.buyPrice.toLocaleString()}...` });
        await delay(1400);
        setExecState({ oppId: opp.id, step: 'withdrawing', message: `Withdrawing ${opp.pair.split('/')[0]} from ${opp.buyExchange} via ${opp.chain} to ${opp.sellExchange}...` });
        await delay(1600);
        setExecState({ oppId: opp.id, step: 'waiting_deposit', message: `Waiting for ${opp.chain} deposit confirmation on ${opp.sellExchange}...` });
        await delay(1800);
        if (sellAccInfo.requiresInternalTransfer) {
          setExecState({ oppId: opp.id, step: 'transferring_to_trading', message: `${opp.sellExchange}: Moving ${opp.pair.split('/')[0]} to ${sellAccInfo.tradingAccountLabel}...` });
          await delay(1200);
        }
        setExecState({ oppId: opp.id, step: 'selling', message: `Selling ${opp.pair.split('/')[0]} on ${opp.sellExchange} at $${opp.sellPrice.toLocaleString()}...` });
        await delay(1500);

        const success     = Math.random() > 0.12;
        const grossProfit = amount * (opp.profitBeforeFees / 100);
        const buyFeeAmt   = amount * (opp.buyFee / 100);
        const sellFeeAmt  = amount * (opp.sellFee / 100);
        const wdFeeAmt    = opp.withdrawalFeeUSD;
        const netProfit   = grossProfit - buyFeeAmt - sellFeeAmt - wdFeeAmt;
        const totalAfter  = amount + netProfit;

        const trade: TradeHistory = {
          id:              `trade-${Date.now()}`,
          timestamp:       Date.now(),
          pair:            opp.pair,
          buyExchange:     opp.buyExchange,
          buyPrice:        opp.buyPrice,
          sellExchange:    opp.sellExchange,
          sellPrice:       opp.sellPrice,
          amount,
          buyFee:          opp.buyFee,
          sellFee:         opp.sellFee,
          withdrawalFee:   opp.withdrawalFeeUSD,
          chain:           opp.chain,
          totalAfterTrade: parseFloat(totalAfter.toFixed(2)),
          netProfit:       parseFloat(netProfit.toFixed(2)),
          status:          success ? 'completed' : 'failed',
        };

        setTradeHistory(prev => [trade, ...prev]);

        if (success) {
          setExecState({ oppId: opp.id, step: 'completed', message: 'Trade completed successfully!', netProfit: parseFloat(netProfit.toFixed(2)) });
          setBalances(prev => prev.map(b => {
            if (b.exchange === opp.buyExchange)  return { ...b, balance: parseFloat((b.balance - amount).toFixed(2)) };
            if (b.exchange === opp.sellExchange) return { ...b, balance: parseFloat((b.balance + totalAfter).toFixed(2)) };
            return b;
          }));
          setOpportunities(prev => prev.filter(o => o.id !== opp.id));
        } else {
          setExecState({ oppId: opp.id, step: 'failed', message: 'Trade failed — opportunity closed.', error: 'Price moved during transfer. No funds lost.' });
          setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, executing: false } : o));
        }
      })();
    }
  }, [showNotification, loadBackendState]);

  // ── Transfer funds ─────────────────────────────────────────────────────────
  const handleTransfer = useCallback((
    from:            Exchange,
    to:              Exchange,
    amount:          number,
    network:         string,
    depositAddress?: string,
  ) => {
    const fromAccInfo = EXCHANGE_ACCOUNT_INFO[from];
    const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

    if (BACKEND_AVAILABLE && depositAddress) {
      api.initiateTransfer({ fromExchange: from, toExchange: to, amount, network, depositAddress })
        .then(response => {
          setActiveTransferId(response.transferId);
          const pollStop = api.pollTransferStatus(
            response.transferId,
            (t) => setTransferHistory(prev => {
              const idx = prev.findIndex(x => x.id === t.id);
              if (idx === -1) return [t, ...prev];
              const updated = [...prev]; updated[idx] = t; return updated;
            }),
            (t) => {
              setTransferHistory(prev => {
                const idx = prev.findIndex(x => x.id === t.id);
                if (idx === -1) return [t, ...prev];
                const updated = [...prev]; updated[idx] = t; return updated;
              });
              setActiveTransferId(null);
              if (t.status === 'completed') {
                showNotification(`✅ Transfer complete: $${amount.toLocaleString()} USDT via ${network} → ${to}`, 'success');
                loadBackendState();
              } else {
                showNotification('❌ Transfer failed', 'error');
              }
              pollStop();
            },
            (err) => {
              showNotification(`❌ Transfer error: ${err.message}`, 'error');
              setActiveTransferId(null);
            },
          );
        })
        .catch(err => showNotification(`❌ Transfer failed: ${err.message}`, 'error'));
    } else {
      // Mock transfer
      const baseSteps: TransferHistory['steps'] = [
        { key: 'checking',   label: 'Checking Account Balance',        status: 'pending' },
        ...(fromAccInfo.requiresInternalTransfer ? [{
          key:    'internal',
          label:  `Moving USDT: ${fromAccInfo.depositAccountLabel} → Spot`,
          status: 'pending' as const,
        }] : []),
        { key: 'sending',    label: `Sending via ${network} to ${to}`, status: 'pending' },
        { key: 'confirming', label: 'Awaiting Blockchain Confirmation', status: 'pending' },
        { key: 'credited',   label: `Crediting ${to} Account`,         status: 'pending' },
      ];

      const transfer: TransferHistory = {
        id:           `xfer-${Date.now()}`,
        timestamp:    Date.now(),
        fromExchange: from,
        toExchange:   to,
        amount,
        network,
        status:       'pending',
        steps:        baseSteps,
      };

      setTransferHistory(prev => [transfer, ...prev]);
      setActiveTransferId(transfer.id);

      const updateStep = (key: string, status: 'active'|'done'|'error', message?: string) => {
        setTransferHistory(prev => prev.map(t =>
          t.id === transfer.id
            ? { ...t, steps: t.steps?.map(s => s.key === key ? { ...s, status, message } : s) }
            : t,
        ));
      };

      (async () => {
        updateStep('checking', 'active', `Locating USDT in ${from} ${fromAccInfo.depositAccountLabel}...`);
        await delay(900);
        updateStep('checking', 'done', `Found $${amount.toLocaleString()} USDT in ${fromAccInfo.depositAccountLabel}`);

        if (fromAccInfo.requiresInternalTransfer) {
          updateStep('internal', 'active', `Transferring from ${fromAccInfo.depositAccountLabel} to Spot/Trading account...`);
          await delay(1100);
          updateStep('internal', 'done', 'Internal transfer complete — funds ready in Spot account');
        }

        updateStep('sending', 'active', `Broadcasting transaction via ${network}...`);
        await delay(1200);
        updateStep('sending', 'done', `Transaction submitted — ${network} hash confirmed`);

        updateStep('confirming', 'active', `Waiting for ${network} block confirmations...`);
        await delay(1400);

        const success = Math.random() > 0.05;
        if (success) {
          updateStep('confirming', 'done', 'Block confirmations received');
          updateStep('credited', 'active', `Crediting ${to} with $${amount.toLocaleString()} USDT...`);
          await delay(700);
          updateStep('credited', 'done', `Successfully credited $${amount.toLocaleString()} USDT to ${to}`);
          setTransferHistory(prev => prev.map(t => t.id === transfer.id ? { ...t, status: 'completed' } : t));
          setBalances(prev => prev.map(b => {
            if (b.exchange === from) return { ...b, balance: parseFloat((b.balance - amount).toFixed(2)) };
            if (b.exchange === to)   return { ...b, balance: parseFloat((b.balance + amount).toFixed(2)) };
            return b;
          }));
          showNotification(`✅ Transfer complete: $${amount.toLocaleString()} USDT via ${network} → ${to}`, 'success');
        } else {
          updateStep('confirming', 'error', 'Transaction failed — please retry');
          setTransferHistory(prev => prev.map(t => t.id === transfer.id ? { ...t, status: 'failed' } : t));
          showNotification('❌ Transfer failed — no funds deducted.', 'error');
        }
        setActiveTransferId(null);
      })();
    }
  }, [showNotification, loadBackendState]);

  // ── Disconnect / Delete exchange keys ─────────────────────────────────────
  const handleDisconnectExchange = useCallback(async (exchange: Exchange) => {
    if (BACKEND_AVAILABLE) {
      try {
        await api.removeApiKey(exchange);
        setBalances(prev => prev.map(b =>
          b.exchange === exchange
            ? { ...b, connected: false, balance: 0, lastUpdated: Date.now() }
            : b,
        ));
        showNotification(`🗑️ ${exchange} disconnected — API keys permanently deleted from server`, 'info');
      } catch (err: unknown) {
        showNotification(`❌ Failed to delete ${exchange} keys: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      }
    } else {
      setBalances(prev => prev.map(b =>
        b.exchange === exchange
          ? { ...b, connected: false, balance: 0, credentials: {} as ApiCredentials, lastUpdated: Date.now() }
          : b,
      ));
      showNotification(`🗑️ ${exchange} disconnected`, 'info');
    }
  }, [showNotification]);

  // ── Connect exchange ───────────────────────────────────────────────────────
  const handleConnectExchange = useCallback(async (exchange: Exchange, credentials: ApiCredentials) => {
    if (BACKEND_AVAILABLE) {
      try {
        const result = await api.saveApiKey({
          exchange,
          apiKey:        credentials.apiKey,
          apiSecret:     credentials.apiSecret,
          apiPassphrase: credentials.apiPassphrase,
          apiMemo:       credentials.apiMemo,
        });
        if (result.success) {
          const validation = await api.validateApiKey(exchange);
          if (validation.success) {
            setBalances(prev => prev.map(b =>
              b.exchange === exchange
                ? { ...b, connected: true, balance: validation.usdtBalance ?? 0, lastUpdated: Date.now() }
                : b,
            ));
            showNotification(`✅ ${exchange} connected — Balance: $${validation.usdtBalance?.toFixed(2) ?? '?'} USDT`, 'success');
          } else {
            showNotification(`⚠️ ${exchange} key saved but validation failed: ${validation.error}`, 'error');
          }
        }
      } catch (err: unknown) {
        showNotification(`❌ ${exchange} connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      }
    } else {
      setBalances(prev => prev.map(b =>
        b.exchange === exchange
          ? { ...b, connected: true, credentials, balance: parseFloat((Math.random() * 5000 + 500).toFixed(2)), lastUpdated: Date.now() }
          : b,
      ));
      showNotification(`✅ ${exchange} connected`, 'success');
    }
  }, [showNotification]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalPortfolio  = balances.filter(b => b.connected).reduce((s, b) => s + b.balance, 0);
  const activeExchanges = balances.filter(b => b.connected).length;
  const completedTrades = tradeHistory.filter(t => t.status === 'completed').length;
  const totalNetProfit  = tradeHistory.filter(t => t.status === 'completed').reduce((s, t) => s + t.netProfit, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Notification Toast ──────────────────────────────── */}
      {notification && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-xl shadow-2xl text-sm font-medium
          transition-all duration-300 max-w-xs sm:max-w-sm border ${
          notification.type === 'success' ? 'bg-green-900/95 border-green-600/60 text-green-100' :
          notification.type === 'error'   ? 'bg-red-900/95 border-red-600/60 text-red-100' :
                                            'bg-blue-900/95 border-blue-600/60 text-blue-100'
        }`}>
          {notification.message}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-gray-900/95 border-b border-gray-700/60 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600
              flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-white font-bold text-base sm:text-lg leading-none">ArbitrageX</h1>
              <p className="text-gray-500 text-[10px] sm:text-xs leading-tight">Cross-Exchange Arbitrage</p>
            </div>
          </div>

          {/* Desktop right side */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-gray-400 border-r border-gray-700 pr-3">
              <span>{activeExchanges}/8 exchanges</span>
              <span className="text-gray-700">·</span>
              <span className={opportunities.length > 0 ? 'text-yellow-400 font-semibold' : ''}>
                {opportunities.length} signals
              </span>
              <span className="text-gray-700">·</span>
              <span className="text-emerald-400 font-semibold">P&L: ${totalNetProfit.toFixed(2)}</span>
            </div>
            {/* Scanner status */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
              botState.scanning
                ? 'border-green-700/60 bg-green-950/60 text-green-300'
                : 'border-gray-700/60 bg-gray-800/60 text-gray-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${botState.scanning ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              {botState.scanning ? 'Scanning' : 'Idle'}
            </div>
            {/* Backend status */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
              backendMode
                ? 'border-emerald-700/60 bg-emerald-950/60 text-emerald-300'
                : 'border-gray-700/60 bg-gray-800/60 text-gray-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${backendMode ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
              {backendMode ? 'Live' : 'Offline'}
            </div>
          </div>

          {/* Mobile right side */}
          <div className="flex sm:hidden items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border ${
              botState.scanning
                ? 'border-green-700/50 bg-green-950/50 text-green-300'
                : 'border-gray-700/50 bg-gray-800/50 text-gray-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${botState.scanning ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
              {botState.scanning ? 'Scanning' : 'Idle'}
            </div>
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-700/50 bg-gray-900/95 px-4 py-3 space-y-1.5 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Exchanges:</span>
              <span className="text-white font-semibold">{activeExchanges}/8 connected</span>
            </div>
            <div className="flex justify-between">
              <span>Signals:</span>
              <span className={opportunities.length > 0 ? 'text-yellow-400 font-semibold' : 'text-white'}>{opportunities.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Trades completed:</span>
              <span className="text-purple-400 font-semibold">{completedTrades}</span>
            </div>
            <div className="flex justify-between">
              <span>Net P&L:</span>
              <span className="text-emerald-400 font-semibold">${totalNetProfit.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Portfolio:</span>
              <span className="text-green-400 font-semibold">${totalPortfolio.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span>Server:</span>
              <span className={backendMode ? 'text-emerald-400 font-semibold' : 'text-gray-500'}>{backendMode ? 'Connected' : 'Offline'}</span>
            </div>
          </div>
        )}
      </header>

      {/* ── Stats Bar ──────────────────────────────────────── */}
      <div className="bg-gray-900/80 border-b border-gray-800/60 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-hide">
          {[
            { label: 'Portfolio',  value: `$${totalPortfolio.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: 'text-green-400' },
            { label: 'Exchanges',  value: `${activeExchanges}/8`,        color: 'text-blue-400'    },
            { label: 'Signals',    value: `${opportunities.length}`,     color: 'text-yellow-400'  },
            { label: 'Trades',     value: `${completedTrades}`,          color: 'text-purple-400'  },
            { label: 'Net P&L',    value: `$${totalNetProfit.toFixed(2)}`, color: 'text-emerald-400' },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
              <span className="text-gray-600 text-[10px] sm:text-xs">{stat.label}:</span>
              <span className={`text-[10px] sm:text-xs font-bold ${stat.color}`}>{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────── */}
      <main className="max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <ExchangeDashboard
          balances={balances}
          onTransfer={handleTransfer}
          transferHistory={transferHistory}
          onConnectExchange={handleConnectExchange}
          onDisconnectExchange={handleDisconnectExchange}
          activeTransferId={activeTransferId}
          backendMode={backendMode}
        />

        <ControlPanel
          params={params}
          onParamsChange={setParams}
          botState={botState}
          onStartScan={startScanner}
          onStopScan={stopScanner}
          opportunityCount={opportunities.length}
        />

        <OpportunityTable
          opportunities={opportunities}
          onExecute={handleExecute}
          execState={execState}
          onCloseExecModal={() => setExecState(null)}
          backendMode={backendMode}
        />

        <TradeHistoryPanel history={tradeHistory} />
      </main>

      <Footer />
    </div>
  );
}
