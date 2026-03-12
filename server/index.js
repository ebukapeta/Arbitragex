/**
 * ArbitrageX Backend Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Express server that acts as a secure proxy between the ArbitrageX frontend
 * and exchange APIs. All API keys are stored server-side — the browser never
 * holds or sends raw API credentials to exchanges directly.
 *
 * When deployed as a Render Web Service, this server gets a FIXED IP address.
 * You whitelist that IP on every exchange → maximum security.
 *
 * Routes:
 *   POST /api/keys/save          — Save encrypted API credentials server-side
 *   DELETE /api/keys/:exchange   — Remove credentials for an exchange
 *   GET  /api/keys/status        — Which exchanges are connected (no secrets)
 *   GET  /api/balances           — Fetch live balances from all connected exchanges
 *   GET  /api/balances/:exchange — Fetch balance for one exchange
 *   POST /api/scanner/scan       — Run arbitrage scan across connected exchanges
 *   POST /api/bot/execute        — Execute an arbitrage trade
 *   POST /api/transfer           — Transfer USDT between exchanges
 *   GET  /api/networks/:exchange — Get USDT withdrawal networks for an exchange
 *   GET  /api/history/trades     — Get trade execution history
 *   GET  /api/history/transfers  — Get transfer history
 *   GET  /api/health             — Health check
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';
import { keyStore } from './store/keyStore.js';
import { balanceRouter } from './routes/balances.js';
import { scannerRouter } from './routes/scanner.js';
import { botRouter } from './routes/bot.js';
import { transferRouter } from './routes/transfer.js';
import { networkRouter } from './routes/networks.js';
import { historyRouter } from './routes/history.js';
import { keysRouter } from './routes/keys.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Frontend served separately
}));

// ─── CORS — only allow requests from your deployed frontend ───────────────────
const allowedOrigins = [
  'http://localhost:5173',   // Vite dev server
  'http://localhost:4173',   // Vite preview
  process.env.FRONTEND_URL, // Your deployed Render/Vercel/Netlify URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Render health checks, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// ─── Rate limiting — prevent API abuse ────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: 'Too many requests — slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // Max 10 trade executions per minute
  message: { error: 'Trade rate limit exceeded' },
});

const scanLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 6, // Max 1 scan per ~1.7s
  message: { error: 'Scan rate limit exceeded' },
});

app.use('/api/', generalLimiter);
app.use('/api/bot/execute', tradeLimiter);
app.use('/api/scanner/scan', scanLimiter);

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/keys',     keysRouter);
app.use('/api/balances', balanceRouter);
app.use('/api/scanner',  scannerRouter);
app.use('/api/bot',      botRouter);
app.use('/api/transfer', transferRouter);
app.use('/api/networks', networkRouter);
app.use('/api/history',  historyRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const connected = keyStore.getConnectedExchanges();
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    server: 'ArbitrageX Backend v1.0',
    connectedExchanges: connected.length,
    exchanges: connected,
    uptime: Math.floor(process.uptime()),
  });
});

// ─── Serve built frontend (when running as unified Render Web Service) ─────────
// The Vite build outputs to /dist — serve it from the same server
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// All non-API routes serve index.html (React SPA routing)
app.get('/{*path}', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║           ArbitrageX Backend Server — RUNNING            ║
╠══════════════════════════════════════════════════════════╣
║  Port    : ${PORT}                                          ║
║  Mode    : ${process.env.NODE_ENV || 'development'}                               ║
║  API Base: http://0.0.0.0:${PORT}/api                      ║
║  Frontend: Served from /dist                             ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export default app;
