# ArbitrageX — Cross-Exchange Crypto Arbitrage Tool

A professional-grade cross-exchange arbitrage finder and execution bot for:
**Binance · Bybit · MEXC · HTX · KuCoin · BitMart · Bitget · Gate.io**

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Build for production
npm run build

# 4. Preview production build
npm run preview

# 5. Create repository ZIP (for sharing)
node scripts/create-zip.js
```

---

## 📁 Project Structure

```
arbitragex/
├── src/
│   ├── App.tsx                    # Root component + state management
│   ├── types/
│   │   └── index.ts               # All TypeScript types, exchange configs,
│   │                              #   account structure info per exchange
│   ├── data/
│   │   └── mockData.ts            # Simulated prices, fees, volumes, networks
│   └── components/
│       ├── ExchangeDashboard.tsx  # Exchange cards, Connect API, Transfer funds
│       ├── ControlPanel.tsx       # Scanner parameters, Start/Stop scan
│       ├── OpportunityTable.tsx   # Results table + execution progress modal
│       ├── TradeHistoryPanel.tsx  # Full trade history table
│       ├── DeploymentGuide.tsx    # In-app deployment documentation
│       └── Footer.tsx             # Footer with info links
├── scripts/
│   └── create-zip.js             # Generates arbitragex-repo.zip
├── DEPLOYMENT.md                  # Full offline deployment reference
└── README.md                      # This file
```

---

## ✨ Features

### 🔍 Arbitrage Scanner
- Scans 8 exchanges × 25 trading pairs every 8 seconds
- **Chain compatibility validation** — only shows cross-exchange opportunities where a shared withdrawal network exists
- **Withdrawal/Deposit validation** — checks if W/D is enabled on both exchanges per pair
- **Fee calculation** — buy fee + sell fee + withdrawal fee → gross profit vs. net profit
- **Per-exchange 24h low volume** — separate buy exchange and sell exchange volumes displayed
- **Live aging timer** — color-coded: green (seconds) → yellow (minutes) → red (hours)
- **Minimum/Maximum profit % filter** + minimum 24h low volume filter

### ⚡ Bot Execution
- **Step-by-step execution modal** showing live progress:
  1. Checking Accounts
  2. Internal Transfer (if needed — e.g. Bybit Funding → Unified, KuCoin Main → Trading)
  3. Buying Asset
  4. Withdrawing Asset (cross-exchange via selected chain)
  5. Awaiting Deposit Confirmation
  6. Internal Transfer on Sell Exchange (if needed)
  7. Selling Asset
  8. Completed → Net Profit displayed
- **Execute button is greyed/blocked** when chain is incompatible, withdrawal disabled, or deposit disabled
- Trade amount input with real-time profit preview before execution

### 🏦 Exchange Dashboard
- 8 exchange cards with balance, connection status, deposit/withdraw indicators
- **Deposit account indicator** per card:
  - ⚡ `Xfer` — deposits land in Funding/Main account (Bybit, KuCoin, Bitget) → bot auto-transfers to Spot
  - ✓ `Spot` — deposits land in Spot/Trading account directly (Binance, MEXC, HTX, BitMart, Gate.io)
- **Connect API panel** — exchange-specific fields (passphrase for KuCoin/Bitget, memo for BitMart)
- Account structure info shown per exchange in the Connect panel

### 💸 Transfer Funds
- Select From Exchange + Network (auto-selects cheapest — prefers TRC20)
- Network modal shows all USDT networks per exchange with fees, min amounts, confirmations, estimated time
- View Networks button on destination exchange (deposit view)
- Network compatibility check (warns if selected network not supported on destination)
- Live fee preview: You send → Network fee → Recipient gets

### 📊 Trade History
- Full table format on all screen sizes (horizontal scroll on mobile)
- Columns: Time, Pair, Buy Exchange, Buy Price, Sell Exchange, Sell Price, Amount, Chain, Buy Fee, Sell Fee, W/D Fee, Total After, Net Profit, Status
- Filter by: All / Completed / Failed / Pending
- Running P&L totals

---

## 🔑 Exchange API Requirements

| Exchange | Extra Fields         | Deposit Account | Requires Internal Transfer |
|----------|---------------------|-----------------|---------------------------|
| Binance  | Key + Secret        | Spot Wallet     | ❌ No                      |
| Bybit    | Key + Secret        | Funding Account | ✅ Yes → Unified Trading   |
| MEXC     | Key + Secret        | Spot Account    | ❌ No                      |
| HTX      | Access Key + Secret | Spot Account    | ❌ No                      |
| KuCoin   | Key + Secret + **Passphrase** | Main Account | ✅ Yes → Trading  |
| BitMart  | Key + Secret + **Memo** | Assets Account | ❌ No                 |
| Bitget   | Key + Secret + **Passphrase** | Funding Account | ✅ Yes → Spot  |
| Gate.io  | Key + Secret        | Spot Account    | ❌ No                      |

---

## 🔒 Security Notes

- API keys are stored **locally in your browser only** — never sent to any server in this demo
- For production use, proxy all exchange API calls through a backend server (prevents CORS + keeps secrets server-side)
- Enable **IP whitelisting** on all API keys
- Use **read-only keys** for the scanner, trade+withdraw permissions only for the bot
- See the full security checklist in the in-app **Deploy Guide** or `DEPLOYMENT.md`

---

## 📦 Create ZIP Repository

To share or archive the full project:

```bash
node scripts/create-zip.js
# Creates: arbitragex-repo.zip
```

Extract and run:

```bash
unzip arbitragex-repo.zip
cd arbitragex
npm install
npm run dev
```

---

## 📖 Deployment

See **`DEPLOYMENT.md`** or click the **📦 Deploy Guide** button in the app for full instructions on:
- Vercel (recommended — 3 min, free)
- Netlify (drag & drop — 2 min, free)  
- GitHub Pages
- Cloudflare Pages
- VPS with Nginx + SSL

---

## ⚠️ Disclaimer

This tool is for educational and research purposes. Cryptocurrency trading involves significant risk. Always test with small amounts first. The developers are not responsible for any financial losses.
