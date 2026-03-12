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

// Trust Render's reverse proxy so express-rate-limit reads the real client IP
app.set('trust proxy', 1);

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — allow localhost dev + any *.onrender.com subdomain automatically
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)) return callback(null, true);
    if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
    console.error(`[CORS BLOCKED] Origin not allowed: ${origin}`);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests — slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Trade rate limit exceeded' },
});

const scanLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 6,
  message: { error: 'Scan rate limit exceeded' },
});

app.use('/api/', generalLimiter);
app.use('/api/bot/execute', tradeLimiter);
app.use('/api/scanner/scan', scanLimiter);

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/keys',     keysRouter);
app.use('/api/balances', balanceRouter);
app.use('/api/scanner',  scannerRouter);
app.use('/api/bot',      botRouter);
app.use('/api/transfer', transferRouter);
app.use('/api/networks', networkRouter);
app.use('/api/history',  historyRouter);

// Health check
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

// Serve built frontend from /dist
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback — Express 5 requires '/{*path}' not '*'
app.get('/{*path}', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║           ArbitrageX Backend Server — RUNNING            ║
╠══════════════════════════════════════════════════════════╣
║  Port    : ${PORT}                                          ║
║  Mode    : ${(process.env.NODE_ENV || 'development').padEnd(34)}║
║  Frontend: Served from /dist                             ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export default app;
  
