/**
 * KeyStore — Persistent encrypted API key storage
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PERSISTENCE STRATEGY:
 *
 *  PRIMARY   → PostgreSQL database (Render free PostgreSQL)
 *              Fully permanent. Survives ALL of:
 *                • Server spin-down / spin-up
 *                • New deployments / redeployments
 *                • Filesystem wipes
 *                • Server restarts / crashes
 *
 *  SECONDARY → Local disk (keys.enc)
 *              Used in local development when DATABASE_URL is not set.
 *              Fast warm-up cache on server start.
 *
 * HOW IT WORKS:
 *  1. On startup  → connect to PostgreSQL, create table if not exists,
 *                   load all keys into memory
 *  2. On save()   → update memory + write to PostgreSQL immediately
 *  3. On remove() → delete from memory + delete from PostgreSQL
 *  4. On restart  → PostgreSQL still has all keys → loaded on startup
 *
 * REQUIRED ENVIRONMENT VARIABLE ON RENDER:
 *   DATABASE_URL   — PostgreSQL connection string (auto-set by Render PostgreSQL)
 *   ENCRYPTION_KEY — Your secret encryption key (set manually, NEVER change it)
 *
 * HOW TO SET UP FREE POSTGRESQL ON RENDER:
 *  1. Render Dashboard → New → PostgreSQL
 *  2. Name it "arbitragex-db", choose Free plan, create
 *  3. Copy the "Internal Database URL"
 *  4. Go to your Web Service → Environment → Add:
 *     DATABASE_URL = <paste the Internal Database URL>
 *  That is all. Keys will now persist forever.
 */

import CryptoJS from 'crypto-js';
import fs       from 'fs';
import path     from 'path';
import pg       from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Config ───────────────────────────────────────────────────────────────────
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  'arbitragex-fallback-key-CHANGE-THIS-in-render-env';

const DATABASE_URL = process.env.DATABASE_URL || null;

// Disk fallback (local dev)
const KEYS_DIR  = __dirname;
const KEYS_FILE = path.join(KEYS_DIR, 'keys.enc');

// ─── PostgreSQL pool ──────────────────────────────────────────────────────────
let pool = null;

function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => {
      console.error('[KeyStore] PostgreSQL pool error:', err.message);
    });
  }
  return pool;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function dbQuery(sql, params = []) {
  const p = getPool();
  if (!p) return null;
  try {
    const result = await p.query(sql, params);
    return result;
  } catch (err) {
    console.error('[KeyStore] DB query error:', err.message);
    return null;
  }
}

async function ensureTable() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS arbitragex_keys (
      exchange     TEXT PRIMARY KEY,
      encrypted    TEXT NOT NULL,
      connected_at BIGINT NOT NULL
    )
  `);
}

async function dbLoadAll() {
  const result = await dbQuery(
    'SELECT exchange, encrypted, connected_at FROM arbitragex_keys'
  );
  if (!result) return {};
  const store = {};
  for (const row of result.rows) {
    store[row.exchange] = {
      encrypted:   row.encrypted,
      connectedAt: parseInt(row.connected_at, 10),
    };
  }
  return store;
}

async function dbSave(exchange, encrypted, connectedAt) {
  await dbQuery(
    `INSERT INTO arbitragex_keys (exchange, encrypted, connected_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (exchange) DO UPDATE
       SET encrypted = EXCLUDED.encrypted,
           connected_at = EXCLUDED.connected_at`,
    [exchange, encrypted, connectedAt]
  );
}

async function dbDelete(exchange) {
  await dbQuery(
    'DELETE FROM arbitragex_keys WHERE exchange = $1',
    [exchange]
  );
}

// ─── Encrypt / Decrypt helpers ────────────────────────────────────────────────
function encrypt(obj) {
  return CryptoJS.AES.encrypt(
    JSON.stringify(obj),
    ENCRYPTION_KEY
  ).toString();
}

function decrypt(encrypted) {
  const bytes   = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
  const decoded = bytes.toString(CryptoJS.enc.Utf8);
  if (!decoded) throw new Error('Decryption failed — wrong ENCRYPTION_KEY?');
  return JSON.parse(decoded);
}

// ─── KeyStore Class ────────────────────────────────────────────────────────────
class KeyStore {
  constructor() {
    // In-memory cache: { [exchange]: { encrypted: string, connectedAt: number } }
    this._store       = {};
    this._ready       = false;
    this._usingDB     = false;
    this._initPromise = this._init();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  async _init() {
    if (DATABASE_URL) {
      // PostgreSQL path — primary persistence
      try {
        await ensureTable();
        this._store   = await dbLoadAll();
        this._usingDB = true;
        const exchanges = Object.keys(this._store);
        console.log(
          `[KeyStore] ✓ PostgreSQL connected${exchanges.length > 0
            ? ` — loaded: ${exchanges.join(', ')}`
            : ' — no exchanges connected yet'}`
        );
      } catch (err) {
        console.error('[KeyStore] PostgreSQL init error:', err.message);
        console.log('[KeyStore] Falling back to disk storage');
        this._loadFromDisk();
      }
    } else {
      // Disk fallback — local development
      this._loadFromDisk();
      console.log('[KeyStore] ✓ Disk storage (local dev mode — set DATABASE_URL for production)');
    }

    this._ready = true;
  }

  // ─── Ready guard ───────────────────────────────────────────────────────────
  async ready() {
    if (this._ready) return;
    await this._initPromise;
  }

  // ─── Save ──────────────────────────────────────────────────────────────────
  async save(exchange, credentials) {
    await this.ready();

    if (!exchange || !credentials?.apiKey || !credentials?.apiSecret) {
      throw new Error('exchange, apiKey and apiSecret are required');
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

    const encrypted   = encrypt(sanitized);
    const connectedAt = Date.now();

    // Update memory
    this._store[exchange] = { encrypted, connectedAt };

    // Persist
    if (this._usingDB) {
      await dbSave(exchange, encrypted, connectedAt);
      console.log(`[KeyStore] ✓ Saved to PostgreSQL: ${exchange}`);
    } else {
      this._persistToDisk();
      console.log(`[KeyStore] ✓ Saved to disk: ${exchange}`);
    }
  }

  // ─── Get ───────────────────────────────────────────────────────────────────
  get(exchange) {
    const entry = this._store[exchange];
    if (!entry) return null;
    try {
      return decrypt(entry.encrypted);
    } catch (err) {
      console.error(`[KeyStore] Failed to decrypt ${exchange}:`, err.message);
      return null;
    }
  }

  // ─── Remove ────────────────────────────────────────────────────────────────
  async remove(exchange) {
    await this.ready();
    if (!this._store[exchange]) return;

    delete this._store[exchange];

    if (this._usingDB) {
      await dbDelete(exchange);
      console.log(`[KeyStore] ✓ Deleted from PostgreSQL: ${exchange}`);
    } else {
      this._persistToDisk();
      console.log(`[KeyStore] ✓ Deleted from disk: ${exchange}`);
    }
  }

  // ─── Status helpers ────────────────────────────────────────────────────────
  has(exchange) {
    return !!this._store[exchange];
  }

  getConnectedExchanges() {
    return Object.keys(this._store);
  }

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

  storageMode() {
    return this._usingDB ? 'postgresql' : 'disk';
  }

  // ─── Disk persistence (local dev fallback) ─────────────────────────────────
  _persistToDisk() {
    try {
      const data = CryptoJS.AES.encrypt(
        JSON.stringify(this._store),
        ENCRYPTION_KEY
      ).toString();
      fs.writeFileSync(KEYS_FILE, data, 'utf8');
    } catch (err) {
      console.error('[KeyStore] Disk write error:', err.message);
    }
  }

  _loadFromDisk() {
    if (!fs.existsSync(KEYS_FILE)) return;
    try {
      const data    = fs.readFileSync(KEYS_FILE, 'utf8');
      const bytes   = CryptoJS.AES.decrypt(data, ENCRYPTION_KEY);
      const decoded = bytes.toString(CryptoJS.enc.Utf8);
      if (!decoded) throw new Error('Empty decryption');
      this._store = JSON.parse(decoded);
      const exchanges = Object.keys(this._store);
      if (exchanges.length > 0) {
        console.log(`[KeyStore] Disk: loaded ${exchanges.join(', ')}`);
      }
    } catch (err) {
      console.error('[KeyStore] Disk read error:', err.message);
      this._store = {};
    }
  }
}

// Singleton
export const keyStore = new KeyStore();
