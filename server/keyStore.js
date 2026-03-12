/**
 * KeyStore — Server-side encrypted API key storage
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores API credentials in memory on the server, encrypted with AES-256.
 * Keys are NEVER sent to the browser — the frontend only receives a
 * connection status (connected: true/false) and balance data.
 *
 * For production persistence across server restarts, keys are optionally
 * written to an encrypted file (server/store/keys.enc) if PERSIST_KEYS=true.
 *
 * Supported exchanges and their credential structures:
 *   Binance  — apiKey, apiSecret
 *   Bybit    — apiKey, apiSecret
 *   MEXC     — apiKey, apiSecret
 *   HTX      — apiKey (accessKey), apiSecret (secretKey)
 *   KuCoin   — apiKey, apiSecret, apiPassphrase
 *   BitMart  — apiKey, apiSecret, apiMemo
 *   Bitget   — apiKey, apiSecret, apiPassphrase
 *   Gate.io  — apiKey, apiSecret
 */

import CryptoJS from 'crypto-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Encryption key — loaded from environment or a fallback (CHANGE IN PRODUCTION)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'arbitragex-secure-key-change-this-in-production';
const KEYS_FILE = path.join(__dirname, 'keys.enc');

class KeyStore {
  constructor() {
    // In-memory store: { [exchange]: { apiKey, apiSecret, apiPassphrase?, apiMemo? } }
    this._store = {};
    this._loadFromDisk();
  }

  /**
   * Save credentials for an exchange.
   * Credentials are AES-encrypted before being stored.
   */
  save(exchange, credentials) {
    if (!exchange || !credentials?.apiKey || !credentials?.apiSecret) {
      throw new Error('Exchange, apiKey and apiSecret are required');
    }

    const sanitized = {
      apiKey:    credentials.apiKey.trim(),
      apiSecret: credentials.apiSecret.trim(),
    };

    if (credentials.apiPassphrase) {
      sanitized.apiPassphrase = credentials.apiPassphrase.trim();
    }
    if (credentials.apiMemo) {
      sanitized.apiMemo = credentials.apiMemo.trim();
    }

    // Encrypt the credentials object
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(sanitized),
      ENCRYPTION_KEY,
    ).toString();

    this._store[exchange] = { encrypted, connectedAt: Date.now() };
    this._persistToDisk();

    console.log(`[KeyStore] ✓ Credentials saved for ${exchange}`);
  }

  /**
   * Retrieve decrypted credentials for an exchange.
   * Returns null if not found.
   */
  get(exchange) {
    const entry = this._store[exchange];
    if (!entry) return null;

    try {
      const bytes = CryptoJS.AES.decrypt(entry.encrypted, ENCRYPTION_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(decrypted);
    } catch (err) {
      console.error(`[KeyStore] Failed to decrypt credentials for ${exchange}:`, err.message);
      return null;
    }
  }

  /**
   * Remove credentials for an exchange.
   */
  remove(exchange) {
    delete this._store[exchange];
    this._persistToDisk();
    console.log(`[KeyStore] ✓ Credentials removed for ${exchange}`);
  }

  /**
   * Check if an exchange has credentials stored.
   */
  has(exchange) {
    return !!this._store[exchange];
  }

  /**
   * Get list of all exchanges that have credentials stored.
   */
  getConnectedExchanges() {
    return Object.keys(this._store);
  }

  /**
   * Get connection metadata (no secrets) for all exchanges.
   * Safe to send to frontend.
   */
  getConnectionStatus() {
    const EXCHANGES = ['Binance', 'Bybit', 'MEXC', 'HTX', 'KuCoin', 'BitMart', 'Bitget', 'Gate.io'];
    return EXCHANGES.map(exchange => ({
      exchange,
      connected: this.has(exchange),
      connectedAt: this._store[exchange]?.connectedAt ?? null,
    }));
  }

  /**
   * Persist encrypted store to disk (if PERSIST_KEYS env is set).
   */
  _persistToDisk() {
    if (process.env.PERSIST_KEYS !== 'true') return;
    try {
      const data = CryptoJS.AES.encrypt(
        JSON.stringify(this._store),
        ENCRYPTION_KEY,
      ).toString();
      fs.writeFileSync(KEYS_FILE, data, 'utf8');
    } catch (err) {
      console.error('[KeyStore] Failed to persist to disk:', err.message);
    }
  }

  /**
   * Load encrypted store from disk on startup.
   */
  _loadFromDisk() {
    if (process.env.PERSIST_KEYS !== 'true') return;
    if (!fs.existsSync(KEYS_FILE)) return;
    try {
      const data = fs.readFileSync(KEYS_FILE, 'utf8');
      const bytes = CryptoJS.AES.decrypt(data, ENCRYPTION_KEY);
      this._store = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      console.log(`[KeyStore] Loaded credentials for: ${Object.keys(this._store).join(', ')}`);
    } catch (err) {
      console.error('[KeyStore] Failed to load from disk:', err.message);
      this._store = {};
    }
  }
}

// Singleton — shared across all route modules
export const keyStore = new KeyStore();
