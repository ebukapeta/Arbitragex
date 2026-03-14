/**
 * KeyStore — Server-side encrypted API key storage
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores API credentials encrypted with AES-256.
 *
 * Keys are ALWAYS persisted to disk (server/store/keys.enc) so they survive:
 *   • Server restarts
 *   • Render spin-down / spin-up cycles
 *   • Deployments (as long as keys.enc is on a persistent disk)
 *
 * Keys are NEVER sent to the browser — the frontend only ever receives:
 *   • connection status (connected: true/false)
 *   • balance data
 *
 * Environment variables:
 *   ENCRYPTION_KEY  — Your secret encryption key (set this on Render!)
 *                     Default fallback is used if not set but CHANGE IT.
 *
 * Supported exchanges:
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

// ─── Encryption Key ───────────────────────────────────────────────────────────
// Set ENCRYPTION_KEY as an environment variable on Render.
// If not set, a fallback is used — keys are still encrypted but less secure.
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  'arbitragex-fallback-key-set-ENCRYPTION_KEY-env-var-on-render';

// ─── Storage File ─────────────────────────────────────────────────────────────
// On Render free tier: this file lives on the ephemeral filesystem.
// On Render paid tier with a Persistent Disk mounted at /data:
//   set KEYS_DIR=/data as an env var to store keys on the persistent disk.
const KEYS_DIR = process.env.KEYS_DIR || __dirname;
const KEYS_FILE = path.join(KEYS_DIR, 'keys.enc');

class KeyStore {
  constructor() {
    // In-memory store: { [exchange]: { encrypted: string, connectedAt: number } }
    this._store = {};
    this._loadFromDisk();
  }

  // ─── Save ──────────────────────────────────────────────────────────────────
  /**
   * Save credentials for an exchange.
   * Always encrypts before storing in memory and on disk.
   */
  save(exchange, credentials) {
    if (!exchange || !credentials?.apiKey || !credentials?.apiSecret) {
      throw new Error('Exchange, apiKey and apiSecret are required');
    }

    const sanitized = {
      apiKey:    credentials.apiKey.trim(),
      apiSecret: credentials.apiSecret.trim(),
    };

    if (credentials.apiPassphrase?.trim()) {
      sanitized.apiPassphrase = credentials.apiPassphrase.trim();
    }
    if (credentials.apiMemo?.trim()) {
      sanitized.apiMemo = credentials.apiMemo.trim();
    }

    // Encrypt the credentials object with AES-256
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(sanitized),
      ENCRYPTION_KEY,
    ).toString();

    this._store[exchange] = {
      encrypted,
      connectedAt: Date.now(),
    };

    // Always persist to disk immediately after saving
    this._persistToDisk();

    console.log(`[KeyStore] ✓ Credentials saved and persisted for ${exchange}`);
  }

  // ─── Get ───────────────────────────────────────────────────────────────────
  /**
   * Retrieve decrypted credentials for an exchange.
   * Returns null if not found or decryption fails.
   */
  get(exchange) {
    const entry = this._store[exchange];
    if (!entry) return null;

    try {
      const bytes    = CryptoJS.AES.decrypt(entry.encrypted, ENCRYPTION_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted) throw new Error('Empty decryption result');
      return JSON.parse(decrypted);
    } catch (err) {
      console.error(`[KeyStore] Failed to decrypt credentials for ${exchange}:`, err.message);
      return null;
    }
  }

  // ─── Remove ────────────────────────────────────────────────────────────────
  /**
   * Permanently remove credentials for an exchange.
   * Updates both memory and disk immediately.
   */
  remove(exchange) {
    if (this._store[exchange]) {
      delete this._store[exchange];
      this._persistToDisk();
      console.log(`[KeyStore] ✓ Credentials removed for ${exchange}`);
    }
  }

  // ─── Has ───────────────────────────────────────────────────────────────────
  has(exchange) {
    return !!this._store[exchange];
  }

  // ─── List Connected ────────────────────────────────────────────────────────
  getConnectedExchanges() {
    return Object.keys(this._store);
  }

  // ─── Status (safe for frontend) ────────────────────────────────────────────
  /**
   * Returns connection status for all exchanges.
   * Never includes any secret data — safe to send to browser.
   */
  getConnectionStatus() {
    const EXCHANGES = [
      'Binance', 'Bybit', 'MEXC', 'HTX',
      'KuCoin', 'BitMart', 'Bitget', 'Gate.io',
    ];
    return EXCHANGES.map(exchange => ({
      exchange,
      connected:   this.has(exchange),
      connectedAt: this._store[exchange]?.connectedAt ?? null,
    }));
  }

  // ─── Persist to Disk ───────────────────────────────────────────────────────
  /**
   * Write the full encrypted store to keys.enc.
   * Called automatically on every save() and remove().
   * The file itself is double-encrypted:
   *   1. Each credential set is individually AES-encrypted (in save())
   *   2. The entire store JSON is AES-encrypted again before writing to disk
   */
  _persistToDisk() {
    try {
      // Ensure the directory exists
      if (!fs.existsSync(KEYS_DIR)) {
        fs.mkdirSync(KEYS_DIR, { recursive: true });
      }

      const data = CryptoJS.AES.encrypt(
        JSON.stringify(this._store),
        ENCRYPTION_KEY,
      ).toString();

      fs.writeFileSync(KEYS_FILE, data, 'utf8');
      console.log(`[KeyStore] ✓ Store persisted to disk (${Object.keys(this._store).length} exchange(s))`);
    } catch (err) {
      console.error('[KeyStore] ✗ Failed to persist to disk:', err.message);
    }
  }

  // ─── Load from Disk ────────────────────────────────────────────────────────
  /**
   * Load the encrypted store from disk on server startup.
   * Called automatically in the constructor.
   * If the file doesn't exist or is corrupt, starts with an empty store.
   */
  _loadFromDisk() {
    if (!fs.existsSync(KEYS_FILE)) {
      console.log('[KeyStore] No existing keys file found — starting fresh');
      return;
    }

    try {
      const data    = fs.readFileSync(KEYS_FILE, 'utf8');
      const bytes   = CryptoJS.AES.decrypt(data, ENCRYPTION_KEY);
      const decoded = bytes.toString(CryptoJS.enc.Utf8);

      if (!decoded) throw new Error('Decryption returned empty string — wrong ENCRYPTION_KEY?');

      this._store = JSON.parse(decoded);

      const exchanges = Object.keys(this._store);
      if (exchanges.length > 0) {
        console.log(`[KeyStore] ✓ Loaded persisted credentials for: ${exchanges.join(', ')}`);
      } else {
        console.log('[KeyStore] Keys file loaded — no exchanges connected yet');
      }
    } catch (err) {
      console.error('[KeyStore] ✗ Failed to load from disk:', err.message);
      console.error('[KeyStore]   This can happen if ENCRYPTION_KEY changed since keys were saved.');
      console.error('[KeyStore]   Starting with empty store — you will need to reconnect exchanges.');
      this._store = {};
    }
  }
}

// Singleton — shared across all route modules
export const keyStore = new KeyStore();
