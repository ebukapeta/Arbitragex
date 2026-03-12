import React from 'react';

export const Footer: React.FC = () => (
  <footer className="mt-6 mb-5 max-w-screen-xl mx-auto px-3 sm:px-6">
    <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-5 sm:p-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-white font-bold text-lg">ArbitrageX</span>
          </div>
          <p className="text-gray-400 text-sm leading-relaxed">
            Professional cross-exchange arbitrage scanner and execution engine.
            Find and exploit price discrepancies across 8 major cryptocurrency exchanges
            with real-time fee calculation, chain validation, and bot execution.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: 'Chain Validated', color: 'text-cyan-400 bg-cyan-950/50 border-cyan-800/40' },
              { label: 'Fee Aware',       color: 'text-green-400 bg-green-950/50 border-green-800/40' },
              { label: 'Real-time',       color: 'text-blue-400 bg-blue-950/50 border-blue-800/40' },
            ].map(b => (
              <span key={b.label} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${b.color}`}>
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div>
          <h4 className="text-white font-semibold mb-3 text-sm">How It Works</h4>
          <ul className="space-y-2.5 text-gray-400 text-xs sm:text-sm">
            {[
              ['Connect', 'Link exchange API keys (read + trade + withdraw permissions)'],
              ['Configure', 'Set min profit %, max profit %, and 24h low-volume filter'],
              ['Scan', 'Scanner validates chain compatibility and withdrawal/deposit status'],
              ['Execute', 'Click Execute → input amount → Start Trade'],
              ['Bot', 'Handles buy on source exchange, withdrawal, deposit, sell on target'],
            ].map(([step, desc]) => (
              <li key={step} className="flex items-start gap-2">
                <span className="text-blue-400 font-bold flex-shrink-0">{step}:</span>
                <span>{desc}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Supported exchanges + disclaimer */}
        <div>
          <h4 className="text-white font-semibold mb-3 text-sm">Supported Exchanges</h4>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {['Binance', 'Bybit', 'MEXC', 'HTX', 'KuCoin', 'BitMart', 'Bitget', 'Gate.io'].map(ex => (
              <span key={ex} className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-lg border border-gray-700/60">
                {ex}
              </span>
            ))}
          </div>

          <h4 className="text-white font-semibold mb-2 text-sm">Key Validations</h4>
          <ul className="space-y-1 text-xs text-gray-400 mb-4">
            {[
              '✓ Shared chain between exchanges required',
              '✓ Withdrawal enabled on buy exchange',
              '✓ Deposit enabled on sell exchange',
              '✓ Net profit after all fees > min threshold',
              '✓ 24h low volume above user threshold',
              '⛔ Execute blocked if any check fails',
            ].map(item => (
              <li key={item} className={item.startsWith('✓') ? 'text-green-500/80' : 'text-red-500/80'}>{item}</li>
            ))}
          </ul>

          <div className="p-3 bg-yellow-950/40 border border-yellow-800/40 rounded-xl">
            <p className="text-yellow-300 text-xs font-semibold mb-1">⚠ Risk Disclaimer</p>
            <p className="text-yellow-600 text-xs leading-relaxed">
              Crypto trading involves significant risk. Arbitrage windows can close before execution.
              Prices shown are simulated. Always test with small amounts and never risk more than you can afford to lose.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-700/40 mt-6 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-600">
        <span>© 2024 ArbitrageX — Cross-Exchange Arbitrage Platform</span>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <span>Prices simulated for demonstration</span>
          <span className="text-violet-600 font-mono hidden sm:inline">DEPLOYMENT.md in project root</span>
        </div>
      </div>
    </div>
  </footer>
);
