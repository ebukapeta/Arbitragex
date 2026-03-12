/**
 * In-memory trade and transfer history store.
 * In production with PERSIST_KEYS=true, this could be extended to
 * write to a JSON file or a database (SQLite, PostgreSQL etc.)
 */

class HistoryStore {
  constructor() {
    this.trades    = [];
    this.transfers = [];
  }

  addTrade(trade) {
    this.trades.unshift({ ...trade, id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
    // Keep last 500 trades in memory
    if (this.trades.length > 500) this.trades = this.trades.slice(0, 500);
  }

  updateTrade(id, updates) {
    const idx = this.trades.findIndex(t => t.id === id);
    if (idx !== -1) this.trades[idx] = { ...this.trades[idx], ...updates };
  }

  getTrades(limit = 100) {
    return this.trades.slice(0, limit);
  }

  addTransfer(transfer) {
    this.transfers.unshift({ ...transfer, id: `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
    if (this.transfers.length > 200) this.transfers = this.transfers.slice(0, 200);
    return this.transfers[0];
  }

  updateTransfer(id, updates) {
    const idx = this.transfers.findIndex(t => t.id === id);
    if (idx !== -1) this.transfers[idx] = { ...this.transfers[idx], ...updates };
  }

  getTransfers(limit = 50) {
    return this.transfers.slice(0, limit);
  }
}

export const historyStore = new HistoryStore();
