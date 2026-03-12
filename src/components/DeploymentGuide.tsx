import React, { useState } from "react";

type Section = "overview" | "build" | "vercel" | "netlify" | "render" | "github" | "vps" | "cloudflare" | "envvars" | "domain" | "security" | "troubleshoot" | "repostructure";

const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => {
  const colors: Record<string, string> = {
    green:  "bg-green-500/20 text-green-400 border border-green-500/30",
    blue:   "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    yellow: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    red:    "bg-red-500/20 text-red-400 border border-red-500/30",
    purple: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
    cyan:   "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
    orange: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  };
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[color]}`}>{children}</span>;
};

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language = "bash" }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-gray-700/60">
      <div className="flex items-center justify-between bg-gray-900/80 px-4 py-2 border-b border-gray-700/40">
        <span className="text-xs text-gray-500 font-mono uppercase tracking-wider">{language}</span>
        <button onClick={handleCopy} className="text-xs text-gray-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5">
          {copied ? <><span className="text-green-400">✓</span><span className="text-green-400">Copied!</span></> : <><span>⎘</span>Copy</>}
        </button>
      </div>
      <pre className="bg-gray-950/70 p-4 overflow-x-auto text-sm text-gray-300 font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const Step: React.FC<{ num: number; title: string; children?: React.ReactNode }> = ({ num, title, children }) => (
  <div className="flex gap-4 mb-6">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
      {num}
    </div>
    <div className="flex-1">
      <h4 className="text-white font-semibold mb-2">{title}</h4>
      <div className="text-gray-300 text-sm leading-relaxed">{children}</div>
    </div>
  </div>
);

const Alert: React.FC<{ type: "info" | "warning" | "success" | "danger"; children: React.ReactNode }> = ({ type, children }) => {
  const styles = {
    info:    "bg-blue-500/10 border-blue-500/40 text-blue-300",
    warning: "bg-yellow-500/10 border-yellow-500/40 text-yellow-300",
    success: "bg-green-500/10 border-green-500/40 text-green-300",
    danger:  "bg-red-500/10 border-red-500/40 text-red-300",
  };
  const icons = { info: "ℹ️", warning: "⚠️", success: "✅", danger: "🚨" };
  return (
    <div className={`border rounded-xl p-4 mb-4 flex gap-3 text-sm ${styles[type]}`}>
      <span className="text-lg flex-shrink-0">{icons[type]}</span>
      <div>{children}</div>
    </div>
  );
};

const SectionCard: React.FC<{ title: string; icon: string; children: React.ReactNode; accent?: string }> = ({
  title, icon, children, accent = "from-cyan-500/20 to-blue-600/20"
}) => (
  <div className={`rounded-2xl border border-gray-700/50 bg-gradient-to-br ${accent} bg-gray-800/40 p-5 mb-5 backdrop-blur-sm`}>
    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      {title}
    </h3>
    {children}
  </div>
);

const navItems: { id: Section; label: string; icon: string }[] = [
  { id: "overview",      label: "Overview",        icon: "🗺️" },
  { id: "build",         label: "Build Locally",   icon: "🔨" },
  { id: "render",        label: "Render",          icon: "🟣" },
  { id: "vercel",        label: "Vercel",          icon: "▲"  },
  { id: "netlify",       label: "Netlify",         icon: "🌐" },
  { id: "github",        label: "GitHub Pages",    icon: "🐙" },
  { id: "vps",           label: "VPS Server",      icon: "🖥️" },
  { id: "cloudflare",    label: "Cloudflare",      icon: "☁️" },
  { id: "envvars",       label: "API Keys & Env",  icon: "🔑" },
  { id: "domain",        label: "Custom Domain",   icon: "🌍" },
  { id: "security",      label: "Security",        icon: "🔒" },
  { id: "troubleshoot",  label: "Troubleshoot",    icon: "🛠️" },
  { id: "repostructure", label: "Repo Structure",  icon: "📁" },
];

const DeploymentGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSelectSection = (id: Section) => {
    setActiveSection(id);
    setSidebarOpen(false);
  };

  const activeLabel = navItems.find(n => n.id === activeSection);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/98 backdrop-blur-sm overflow-hidden">

      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-gray-900/90 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="sm:hidden p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            {sidebarOpen
              ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
            }
          </button>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">📦</span>
          </div>
          <div>
            <span className="text-white font-bold text-sm">Deploy Guide</span>
            {activeLabel && (
              <span className="sm:hidden text-gray-500 text-xs ml-2">
                {activeLabel.icon} {activeLabel.label}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors border border-gray-700"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
          Close
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">

        {sidebarOpen && (
          <div className="sm:hidden fixed inset-0 bg-black/50 z-10" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <div className={`
          fixed sm:relative top-0 left-0 h-full z-20
          w-56 flex-shrink-0 bg-gray-900/95 border-r border-gray-700/50 flex flex-col
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          sm:translate-x-0 sm:block
        `}>
          <div className="sm:hidden h-14 flex-shrink-0" />
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelectSection(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2.5 ${
                  activeSection === item.id
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                <span className="w-5 text-center flex-shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-700/50 flex-shrink-0">
            <div className="bg-gray-800/60 rounded-xl p-3 text-center">
              <p className="text-gray-500 text-xs mb-1.5">Also available as</p>
              <div className="text-cyan-400 text-xs font-mono bg-gray-900/50 rounded-lg px-2 py-1">DEPLOYMENT.md</div>
              <p className="text-gray-600 text-[10px] mt-1">in project root</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto sm:ml-0">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8">

            {/* ── OVERVIEW ── */}
            {activeSection === "overview" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Deployment Overview</h2>
                  <p className="text-gray-400">ArbitrageX is a Web Service — deploy it on Render for full backend + frontend</p>
                </div>
                <Alert type="success">
                  <strong>Recommended:</strong> Deploy as a <strong>Render Web Service</strong> — same repo, same files, full backend with encrypted API key storage and a fixed server IP for exchange whitelisting.
                </Alert>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {[
                    { id: "render",     title: "Render",        tag: "Recommended", color: "purple", icon: "🟣", desc: "Web Service with real backend. Fixed IP. Same repo.", time: "~5 min", cost: "$7/mo" },
                    { id: "vps",        title: "VPS Server",    tag: "Max Control",  color: "blue",   icon: "🖥️", desc: "Full server control. Ubuntu + Nginx + PM2.", time: "~30 min", cost: "$5-10/mo" },
                    { id: "vercel",     title: "Vercel",        tag: "Frontend Only", color: "cyan",  icon: "▲",  desc: "Frontend only — no fixed IP for API restriction.", time: "~3 min", cost: "Free" },
                    { id: "netlify",    title: "Netlify",       tag: "Frontend Only", color: "green", icon: "🌐", desc: "Drag & drop or Git deploy. Frontend only.", time: "~2 min", cost: "Free" },
                    { id: "github",     title: "GitHub Pages",  tag: "Frontend Only", color: "purple",icon: "🐙", desc: "Free hosting from your repo. Frontend only.", time: "~5 min", cost: "Free" },
                    { id: "cloudflare", title: "Cloudflare",    tag: "Frontend Only", color: "orange",icon: "☁️", desc: "Global CDN, unlimited bandwidth. Frontend only.", time: "~5 min", cost: "Free" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 hover:border-gray-600/50 transition-colors text-left"
                      onClick={() => handleSelectSection(opt.id as Section)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{opt.icon}</span>
                          <span className="text-white font-bold">{opt.title}</span>
                        </div>
                        <Badge color={opt.color}>{opt.tag}</Badge>
                      </div>
                      <p className="text-gray-400 text-sm mb-3">{opt.desc}</p>
                      <div className="flex gap-3 text-xs">
                        <span className="text-gray-500">⏱ {opt.time}</span>
                        <span className="text-gray-500">💰 {opt.cost}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <SectionCard title="What You Need Before Starting" icon="📋" accent="from-purple-500/10 to-pink-500/10">
                  <div className="space-y-3">
                    {[
                      { tool: "Node.js v18+",     url: "https://nodejs.org",   desc: "JavaScript runtime for building the project" },
                      { tool: "npm v9+",           url: null,                   desc: "Comes bundled with Node.js" },
                      { tool: "Git",               url: "https://git-scm.com", desc: "Required for GitHub + Render auto-deploy" },
                      { tool: "GitHub Account",    url: "https://github.com",  desc: "Connect your repo to Render" },
                      { tool: "Render Account",    url: "https://render.com",  desc: "Where the Web Service is deployed" },
                      { tool: "Exchange API Keys", url: null,                   desc: "Binance, Bybit, MEXC, HTX, KuCoin, BitMart, Bitget, Gate.io" },
                    ].map((item) => (
                      <div key={item.tool} className="flex items-start gap-3 bg-gray-900/40 rounded-lg p-3">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <div>
                          <span className="text-white font-medium text-sm">{item.tool}</span>
                          {item.url && <span className="text-cyan-400 text-xs ml-2 font-mono">{item.url}</span>}
                          <p className="text-gray-500 text-xs mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── BUILD LOCALLY ── */}
            {activeSection === "build" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Build the Project Locally</h2>
                  <p className="text-gray-400">Test ArbitrageX on your machine before deploying</p>
                </div>
                <Step num={1} title="Install dependencies">
                  <CodeBlock code={`cd arbitragex\nnpm install`} />
                </Step>
                <Step num={2} title="Build frontend for production">
                  <CodeBlock code={`npm run build`} />
                  <p className="text-gray-400 mt-1">Creates <code className="text-cyan-400 text-xs bg-gray-900/50 px-1.5 py-0.5 rounded">dist/</code> folder with compiled React app.</p>
                </Step>
                <Step num={3} title="Start the backend server">
                  <CodeBlock code={`node server/index.js`} />
                  <p className="text-gray-400 mt-1">Opens at <code className="text-cyan-400 text-xs bg-gray-900/50 px-1.5 py-0.5 rounded">http://localhost:3001</code> — serves both frontend and API.</p>
                </Step>
                <Step num={4} title="Or run frontend dev server (no backend)">
                  <CodeBlock code={`npm run dev`} />
                  <p className="text-gray-400 mt-1">Opens at <code className="text-cyan-400 text-xs bg-gray-900/50 px-1.5 py-0.5 rounded">http://localhost:5173</code> with mock data (no real exchange data).</p>
                </Step>
                <Alert type="info">
                  For real exchange connectivity you must run <code>node server/index.js</code> and connect your API keys through the Connect API window.
                </Alert>
              </div>
            )}

            {/* ── RENDER ── */}
            {activeSection === "render" && (
              <div>
                <div className="mb-6 flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-2xl">🟣</div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-white">Deploy to Render</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge color="purple">Recommended</Badge>
                      <Badge color="blue">Web Service</Badge>
                      <Badge color="cyan">Fixed IP</Badge>
                      <Badge color="green">~5 min setup</Badge>
                    </div>
                  </div>
                </div>
                <Alert type="success">
                  Render is the right choice for ArbitrageX. It gives you a real backend server, a fixed outbound IP address for exchange API whitelisting, and auto-deploys from GitHub.
                </Alert>
                <SectionCard title="Deploy Steps" icon="🚀" accent="from-purple-500/10 to-violet-600/5">
                  <Step num={1} title="Push your repo to GitHub (see Repo Structure section)">
                    <CodeBlock code={`git push -u origin main`} />
                  </Step>
                  <Step num={2} title="Create a Web Service on Render">
                    <div className="space-y-1.5 text-sm text-gray-300">
                      <p>1. Go to <span className="text-cyan-400 font-mono">render.com</span> → <strong className="text-white">New → Web Service</strong></p>
                      <p>2. Connect your GitHub repo</p>
                      <p>3. Render reads <code className="text-cyan-400 bg-gray-900/50 px-1 rounded">render.yaml</code> automatically</p>
                    </div>
                  </Step>
                  <Step num={3} title="Build settings (auto-filled from render.yaml)">
                    <div className="bg-gray-900/60 rounded-xl p-4 space-y-2 text-sm">
                      {[
                        ["Type", "Web Service"],
                        ["Runtime", "Node"],
                        ["Build Command", "npm install && npm run build"],
                        ["Start Command", "node server/index.js"],
                        ["Plan", "Starter ($7/mo) — for always-on bot"],
                        ["Health Check", "/api/health"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-3">
                          <span className="text-gray-400 w-36 flex-shrink-0">{k}:</span>
                          <code className="text-cyan-400 bg-gray-800 px-2 py-0.5 rounded text-xs">{v}</code>
                        </div>
                      ))}
                    </div>
                  </Step>
                  <Step num={4} title="Set environment variables">
                    <div className="bg-gray-900/60 rounded-xl p-4 space-y-2 text-sm">
                      {[
                        ["NODE_ENV", "production"],
                        ["ENCRYPTION_KEY", "Render auto-generates — or enter 32-char random string"],
                        ["PERSIST_KEYS", "true"],
                        ["FRONTEND_URL", "https://arbitragex.onrender.com (set after first deploy)"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex flex-col sm:flex-row gap-1 sm:gap-3 mb-2">
                          <code className="text-yellow-400 text-xs w-36 flex-shrink-0">{k}</code>
                          <span className="text-gray-400 text-xs">{v}</span>
                        </div>
                      ))}
                    </div>
                  </Step>
                  <Step num={5} title="Click Create Web Service — wait ~3-5 min">
                    <p className="text-gray-400">Render installs dependencies, builds React frontend, starts Express server.</p>
                  </Step>
                  <Step num={6} title="Connect API keys through the tool">
                    <p className="text-gray-400">Open your Render URL → click <strong className="text-white">Connect API</strong> on each exchange card → enter your API key and secret. Keys are stored encrypted on the server.</p>
                  </Step>
                  <Step num={7} title="Get your server IP and whitelist on exchanges">
                    <p className="text-gray-400 mb-2">Render dashboard → your service → <strong className="text-white">Settings → Outbound IP Addresses</strong></p>
                    <p className="text-gray-400">Add this IP to the API whitelist on each exchange for IP restriction.</p>
                  </Step>
                </SectionCard>
                <SectionCard title="Why Render over Vercel/Netlify for ArbitrageX" icon="⚖️" accent="from-blue-500/10 to-cyan-600/5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700/60 text-gray-400">
                          <th className="text-left py-2 px-3">Feature</th>
                          <th className="text-center py-2 px-3">Render</th>
                          <th className="text-center py-2 px-3">Vercel</th>
                          <th className="text-center py-2 px-3">Netlify</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {[
                          ["Real backend server",        "✅", "⚠️ Serverless", "⚠️ Serverless"],
                          ["Fixed outbound IP",           "✅", "❌ Rotating IPs", "❌ Rotating IPs"],
                          ["API key IP whitelisting",     "✅", "❌ Not reliable", "❌ Not reliable"],
                          ["Always-on process",           "✅", "❌ Cold starts", "❌ Cold starts"],
                          ["Keys stored on server",       "✅", "❌", "❌"],
                          ["Same repo deployment",        "✅", "✅", "✅"],
                          ["Auto-deploy from GitHub",     "✅", "✅", "✅"],
                          ["Free tier",                   "⚠️ $7/mo for web", "✅", "✅"],
                        ].map(([feat, r, v, n]) => (
                          <tr key={feat} className="hover:bg-gray-800/20">
                            <td className="py-2 px-3 text-gray-300">{feat}</td>
                            <td className="py-2 px-3 text-center">{r}</td>
                            <td className="py-2 px-3 text-center">{v}</td>
                            <td className="py-2 px-3 text-center">{n}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── VERCEL ── */}
            {activeSection === "vercel" && (
              <div>
                <div className="mb-6 flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl font-bold text-black">▲</div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-white">Deploy to Vercel</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge color="yellow">Frontend Only</Badge>
                      <Badge color="blue">Free Tier</Badge>
                      <Badge color="cyan">~3 min setup</Badge>
                    </div>
                  </div>
                </div>
                <Alert type="warning">
                  Vercel hosts the frontend only. It cannot provide a fixed IP for exchange API whitelisting. Use Render if you need IP restriction and a real backend.
                </Alert>
                <SectionCard title="Deploy Steps" icon="🖱️" accent="from-gray-700/20 to-gray-800/20">
                  <Step num={1} title="Push to GitHub">
                    <CodeBlock code={`git init && git add . && git commit -m "initial commit"\ngit remote add origin https://github.com/YOUR_USERNAME/arbitragex.git\ngit push -u origin main`} />
                  </Step>
                  <Step num={2} title="Import on Vercel">
                    <p>Go to <span className="text-cyan-400 font-mono text-sm">https://vercel.com</span> → Sign in → <strong>Add New Project</strong> → Import your repo.</p>
                  </Step>
                  <Step num={3} title="Build settings">
                    <div className="bg-gray-900/60 rounded-xl p-4 space-y-2 text-sm">
                      {[["Framework", "Vite"], ["Build Command", "npm run build"], ["Output Dir", "dist"]].map(([k, v]) => (
                        <div key={k} className="flex gap-3"><span className="text-gray-400 w-32">{k}:</span><code className="text-cyan-400 bg-gray-800 px-2 py-0.5 rounded text-xs">{v}</code></div>
                      ))}
                    </div>
                  </Step>
                  <Step num={4} title="Click Deploy">
                    <p className="text-gray-400">Live at <span className="text-cyan-400 font-mono">https://arbitragex.vercel.app</span> in ~2 minutes.</p>
                  </Step>
                </SectionCard>
              </div>
            )}

            {/* ── NETLIFY ── */}
            {activeSection === "netlify" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Deploy to Netlify</h2>
                  <Badge color="yellow">Frontend Only</Badge>
                </div>
                <Alert type="warning">Netlify hosts the frontend only. No fixed server IP available for exchange API whitelisting.</Alert>
                <SectionCard title="Method 1 — Drag & Drop (Fastest)" icon="📦" accent="from-green-500/10 to-teal-600/5">
                  <Step num={1} title="Build locally"><CodeBlock code="npm run build" /></Step>
                  <Step num={2} title="Drag the dist/ folder">
                    <p>Go to <span className="text-cyan-400 font-mono">app.netlify.com</span> → drag the <code className="text-cyan-400 bg-gray-900/50 px-1 rounded">dist/</code> folder onto the deploy area.</p>
                  </Step>
                  <Step num={3} title="Done — live in seconds" />
                </SectionCard>
                <SectionCard title="Method 2 — Git Deploy (Auto-redeploy)" icon="🔄" accent="from-blue-500/10 to-cyan-600/5">
                  <Step num={1} title="Push to GitHub" ><CodeBlock code="git push -u origin main" /></Step>
                  <Step num={2} title="Connect repo on Netlify"><p>New site → Import from Git → select repo → Build command: <code className="text-cyan-400">npm run build</code> → Publish dir: <code className="text-cyan-400">dist</code></p></Step>
                  <Step num={3} title="Deploy" ><p>Every push to main auto-redeploys.</p></Step>
                </SectionCard>
              </div>
            )}

            {/* ── GITHUB PAGES ── */}
            {activeSection === "github" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">GitHub Pages</h2>
                  <Badge color="yellow">Frontend Only</Badge>
                </div>
                <Alert type="warning">GitHub Pages is for static sites only. No backend. No fixed IP for API whitelisting.</Alert>
                <SectionCard title="Deploy Steps" icon="🐙" accent="from-purple-500/10 to-violet-600/5">
                  <Step num={1} title="Install gh-pages"><CodeBlock code="npm install -D gh-pages" /></Step>
                  <Step num={2} title="Update vite.config.ts">
                    <CodeBlock language="typescript" code={`// Add base path matching your repo name\nexport default defineConfig({\n  base: '/arbitragex/',\n  // ... rest of config\n})`} />
                  </Step>
                  <Step num={3} title="Add deploy script to package.json">
                    <CodeBlock language="json" code={`"scripts": {\n  "deploy": "npm run build && gh-pages -d dist"\n}`} />
                  </Step>
                  <Step num={4} title="Deploy"><CodeBlock code="npm run deploy" /></Step>
                  <Step num={5} title="Enable Pages on GitHub">
                    <p>GitHub repo → Settings → Pages → Source: <code className="text-cyan-400">gh-pages</code> branch</p>
                  </Step>
                </SectionCard>
              </div>
            )}

            {/* ── VPS ── */}
            {activeSection === "vps" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">VPS Server Deployment</h2>
                  <div className="flex gap-2 flex-wrap mt-1">
                    <Badge color="blue">Max Control</Badge>
                    <Badge color="green">Fixed IP</Badge>
                    <Badge color="orange">~30 min setup</Badge>
                  </div>
                </div>
                <Alert type="info">Best for advanced users who want full control. Same fixed-IP benefits as Render but you manage the server yourself.</Alert>
                <SectionCard title="Server Setup — Ubuntu 22.04" icon="🖥️" accent="from-blue-500/10 to-indigo-600/5">
                  <Step num={1} title="Install Node.js 20">
                    <CodeBlock code={`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\nsudo apt-get install -y nodejs`} />
                  </Step>
                  <Step num={2} title="Clone and build">
                    <CodeBlock code={`git clone https://github.com/YOUR_USERNAME/arbitragex.git\ncd arbitragex\nnpm install\nnpm run build`} />
                  </Step>
                  <Step num={3} title="Install PM2 (keep server alive)">
                    <CodeBlock code={`sudo npm install -g pm2\npm2 start server/index.js --name arbitragex\npm2 startup && pm2 save`} />
                  </Step>
                  <Step num={4} title="Install and configure Nginx">
                    <CodeBlock code={`sudo apt install nginx -y`} />
                    <CodeBlock language="nginx" code={`server {\n  listen 80;\n  server_name yourdomain.com;\n  location / {\n    proxy_pass http://localhost:3001;\n    proxy_http_version 1.1;\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection 'upgrade';\n  }\n}`} />
                  </Step>
                  <Step num={5} title="Enable SSL with Let's Encrypt">
                    <CodeBlock code={`sudo apt install certbot python3-certbot-nginx -y\nsudo certbot --nginx -d yourdomain.com`} />
                  </Step>
                </SectionCard>
              </div>
            )}

            {/* ── CLOUDFLARE ── */}
            {activeSection === "cloudflare" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Cloudflare Pages</h2>
                  <Badge color="yellow">Frontend Only</Badge>
                </div>
                <Alert type="warning">Cloudflare Pages is frontend-only. No fixed IP for exchange API whitelisting.</Alert>
                <SectionCard title="Deploy Steps" icon="☁️" accent="from-orange-500/10 to-yellow-600/5">
                  <Step num={1} title="Push to GitHub"><CodeBlock code="git push -u origin main" /></Step>
                  <Step num={2} title="Connect on Cloudflare">
                    <p>Go to <span className="text-cyan-400 font-mono">pages.cloudflare.com</span> → Create a project → Connect to Git → select your repo.</p>
                  </Step>
                  <Step num={3} title="Build settings">
                    <div className="bg-gray-900/60 rounded-xl p-4 space-y-2 text-sm">
                      {[["Framework preset", "Vite"], ["Build command", "npm run build"], ["Build output", "dist"]].map(([k, v]) => (
                        <div key={k} className="flex gap-3"><span className="text-gray-400 w-36">{k}:</span><code className="text-cyan-400 bg-gray-800 px-2 py-0.5 rounded text-xs">{v}</code></div>
                      ))}
                    </div>
                  </Step>
                  <Step num={4} title="Deploy — live on global CDN" />
                </SectionCard>
              </div>
            )}

            {/* ── ENV VARS ── */}
            {activeSection === "envvars" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">API Keys & Environment Variables</h2>
                  <p className="text-gray-400">What goes where — and why exchange keys are NOT environment variables</p>
                </div>
                <Alert type="success">
                  <strong>Your exchange API keys (Binance, Bybit etc.) are NOT environment variables.</strong> They are entered through the <strong>Connect API window</strong> in ArbitrageX and stored encrypted on the server. Environment variables are only for server configuration.
                </Alert>
                <SectionCard title="Server Environment Variables — Render Dashboard" icon="⚙️" accent="from-purple-500/10 to-violet-600/5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700/60 text-gray-400">
                          <th className="text-left py-2 px-3">Variable</th>
                          <th className="text-left py-2 px-3">Value</th>
                          <th className="text-left py-2 px-3 hidden sm:table-cell">Purpose</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {[
                          ["NODE_ENV", "production", "Tells Express it is running in production"],
                          ["PORT", "3001", "Port the Express server listens on"],
                          ["ENCRYPTION_KEY", "Auto-generated by Render", "AES-256 key to encrypt stored API credentials"],
                          ["PERSIST_KEYS", "true", "Save keys to disk so they survive server restarts"],
                          ["FRONTEND_URL", "https://arbitragex.onrender.com", "Your live URL — for CORS whitelist"],
                        ].map(([k, v, p]) => (
                          <tr key={k} className="hover:bg-gray-800/20">
                            <td className="py-2 px-3 font-mono text-yellow-400">{k}</td>
                            <td className="py-2 px-3 text-cyan-300 text-xs">{v}</td>
                            <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">{p}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
                <SectionCard title="Exchange API Keys — Connect API Window" icon="🔑" accent="from-green-500/10 to-teal-600/5">
                  <p className="text-gray-400 text-sm mb-4">These are entered through the ArbitrageX UI — NOT in any config file or environment variable:</p>
                  <div className="space-y-2">
                    {[
                      { ex: "Binance",  fields: ["API Key", "Secret Key"] },
                      { ex: "Bybit",    fields: ["API Key", "Secret Key"] },
                      { ex: "MEXC",     fields: ["API Key", "Secret Key"] },
                      { ex: "HTX",      fields: ["Access Key", "Secret Key"] },
                      { ex: "KuCoin",   fields: ["API Key", "Secret Key", "Passphrase ★"] },
                      { ex: "BitMart",  fields: ["API Key", "Secret Key", "Memo ★"] },
                      { ex: "Bitget",   fields: ["API Key", "Secret Key", "Passphrase ★"] },
                      { ex: "Gate.io",  fields: ["API Key", "Secret Key"] },
                    ].map(item => (
                      <div key={item.ex} className="flex items-center gap-3 bg-gray-900/60 rounded-lg p-3">
                        <span className="text-white font-semibold text-sm w-20 flex-shrink-0">{item.ex}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {item.fields.map(f => (
                            <span key={f} className={`text-xs px-2 py-0.5 rounded-full border ${f.includes('★') ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>{f}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-500 text-xs mt-3">★ These exchanges require an extra field — KuCoin and Bitget need a Passphrase, BitMart needs a Memo.</p>
                </SectionCard>
              </div>
            )}

            {/* ── DOMAIN ── */}
            {activeSection === "domain" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Custom Domain</h2>
                  <p className="text-gray-400">Point your own domain to your ArbitrageX deployment</p>
                </div>
                <SectionCard title="DNS Records for Render" icon="🌍" accent="from-cyan-500/10 to-blue-600/5">
                  <Step num={1} title="Add custom domain in Render">
                    <p>Render dashboard → your service → <strong className="text-white">Settings → Custom Domains → Add Domain</strong></p>
                  </Step>
                  <Step num={2} title="Add these DNS records at your registrar">
                    <div className="bg-gray-900/60 rounded-xl p-4 space-y-2 text-xs font-mono">
                      {[
                        ["CNAME", "www", "arbitragex.onrender.com"],
                        ["A", "@", "Render IP (shown in dashboard)"],
                      ].map(([type, name, val]) => (
                        <div key={name} className="flex gap-3">
                          <span className="text-yellow-400 w-16">{type}</span>
                          <span className="text-cyan-400 w-8">{name}</span>
                          <span className="text-gray-300">{val}</span>
                        </div>
                      ))}
                    </div>
                  </Step>
                  <Step num={3} title="SSL is auto-provisioned">
                    <p className="text-gray-400">Render provisions a free Let's Encrypt SSL certificate automatically. Allow ~5 minutes for DNS propagation.</p>
                  </Step>
                </SectionCard>
                <SectionCard title="Recommended Domain Registrars" icon="🛒" accent="from-purple-500/10 to-violet-600/5">
                  <div className="space-y-2">
                    {[
                      { name: "Cloudflare Registrar", url: "cloudflare.com/products/registrar", note: "At-cost pricing — cheapest option" },
                      { name: "Namecheap", url: "namecheap.com", note: "Affordable + free WhoisGuard privacy" },
                      { name: "Google Domains", url: "domains.google", note: "Simple interface, now merged into Squarespace" },
                    ].map(item => (
                      <div key={item.name} className="bg-gray-900/60 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <p className="text-white text-sm font-medium">{item.name}</p>
                          <p className="text-gray-500 text-xs">{item.note}</p>
                        </div>
                        <code className="text-cyan-400 text-xs">{item.url}</code>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── SECURITY ── */}
            {activeSection === "security" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Security</h2>
                  <p className="text-gray-400">Protecting your API keys and your funds</p>
                </div>
                <Alert type="danger">
                  ArbitrageX has withdraw permissions on your exchange accounts. Security is critical. Follow every item on this checklist.
                </Alert>
                <SectionCard title="API Key Security" icon="🔑" accent="from-red-500/10 to-rose-600/5">
                  {[
                    { item: "Whitelist Render's outbound IP on every exchange", critical: true },
                    { item: "Enable trade + withdraw permissions only — disable deposit/login alerts", critical: true },
                    { item: "Set withdrawal limits on each exchange API key", critical: true },
                    { item: "Rotate API keys every 90 days", critical: false },
                    { item: "Never share your API keys or secret with anyone", critical: true },
                    { item: "Never commit .env or keys.enc to GitHub", critical: true },
                    { item: "Use a dedicated email address for your exchange accounts", critical: false },
                  ].map(item => (
                    <div key={item.item} className={`flex items-start gap-3 p-3 rounded-lg mb-2 ${item.critical ? 'bg-red-900/20 border border-red-500/20' : 'bg-gray-900/40'}`}>
                      <span className={item.critical ? "text-red-400" : "text-green-400"}>
                        {item.critical ? "🚨" : "✓"}
                      </span>
                      <span className="text-gray-300 text-sm">{item.item}</span>
                      {item.critical && <span className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0">Critical</span>}
                    </div>
                  ))}
                </SectionCard>
                <SectionCard title="Exchange 2FA — Enable on All Accounts" icon="📱" accent="from-yellow-500/10 to-orange-600/5">
                  <p className="text-gray-400 text-sm mb-3">Enable 2FA on every exchange account. Use an authenticator app — not SMS.</p>
                  {["Binance", "Bybit", "MEXC", "HTX", "KuCoin", "BitMart", "Bitget", "Gate.io"].map(ex => (
                    <div key={ex} className="flex items-center justify-between py-2 border-b border-gray-800/60 last:border-0">
                      <span className="text-gray-300 text-sm">{ex}</span>
                      <span className="text-green-400 text-xs">Account → Security → 2FA</span>
                    </div>
                  ))}
                </SectionCard>
              </div>
            )}

            {/* ── TROUBLESHOOT ── */}
            {activeSection === "troubleshoot" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Troubleshooting</h2>
                  <p className="text-gray-400">Common issues and how to fix them</p>
                </div>
                {[
                  { problem: "Build fails with TypeScript errors", solution: "Check the exact error in terminal. Fix type errors in the identified files.", code: `npm run build 2>&1 | head -80` },
                  { problem: "Blank white page after deployment", solution: "Open DevTools (F12) → Console. If on GitHub Pages, set base in vite.config.ts.", code: `// vite.config.ts\nbase: '/arbitragex/',`, language: "typescript" },
                  { problem: "CORS errors / exchange API not connecting", solution: "Make sure you are using the Render Web Service — not a static deployment. Exchange APIs block direct browser calls.", code: `# Check your server logs\nrender.com → your service → Logs` },
                  { problem: "API keys not persisting after Render restart", solution: "Set PERSIST_KEYS=true in Render environment variables.", code: `PERSIST_KEYS=true\nENCRYPTION_KEY=your-32-char-key` },
                  { problem: "npm install fails on Render", solution: "Check Node.js version — requires v18+. Render uses Node 20 by default.", code: `# In render.yaml add:\nenvVars:\n  - key: NODE_VERSION\n    value: "20"` },
                  { problem: "Exchange API keys not working after connecting", solution: "Verify: correct permissions enabled, Render IP whitelisted on exchange, key not expired.", code: `# Test Binance key directly:\ncurl -H "X-MBX-APIKEY: YOUR_KEY" https://api.binance.com/api/v3/account` },
                  { problem: ".gitignore not working — node_modules was committed", solution: "Rename gitignore.txt to .gitignore BEFORE running git init. Remove cached files.", code: `git rm -r --cached node_modules/\ngit rm -r --cached dist/\ngit commit -m "remove gitignored files"` },
                ].map(item => (
                  <div key={item.problem} className="mb-5 bg-gray-800/40 border border-gray-700/50 rounded-2xl overflow-hidden">
                    <div className="flex items-start gap-3 p-4 border-b border-gray-700/30">
                      <span className="text-red-400 text-lg mt-0.5">⚠</span>
                      <div>
                        <h4 className="text-white font-semibold">{item.problem}</h4>
                        <p className="text-gray-400 text-sm mt-1">{item.solution}</p>
                      </div>
                    </div>
                    <div className="p-4 bg-gray-900/40">
                      <CodeBlock code={item.code} language={(item as { language?: string }).language || "bash"} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── REPO STRUCTURE ── */}
            {activeSection === "repostructure" && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Repository Structure</h2>
                  <p className="text-gray-400">Every file in your downloaded project — exactly where it goes in GitHub</p>
                </div>

                {/* DOTFILE WARNING */}
                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5 mb-5">
                  <h3 className="text-lg font-bold text-yellow-300 mb-3 flex items-center gap-2">
                    <span className="text-2xl">⚠️</span> The Dotfile Problem — Read This First
                  </h3>
                  <p className="text-yellow-200 text-sm mb-4">
                    Files starting with a <strong>dot</strong> (like <code className="bg-yellow-900/40 px-1 rounded">.gitignore</code>) are called <strong>dotfiles</strong>.
                    Most download systems and Windows File Explorer <strong>hide or skip dotfiles</strong> — so they appear missing from your download even though they exist.
                  </p>
                  <div className="space-y-3">
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-red-300 text-sm font-mono font-bold">.gitignore</code>
                        <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full font-bold">REQUIRED</span>
                      </div>
                      <p className="text-gray-300 text-xs mb-2">Your download includes <code className="bg-gray-800 px-1 rounded">gitignore.txt</code> — rename it to <code className="bg-gray-800 px-1 rounded">.gitignore</code></p>
                      <div className="space-y-0.5 text-xs text-gray-500 font-mono">
                        <p>→ Windows: right-click → Rename → type <strong>.gitignore</strong> → press Enter → click Yes</p>
                        <p>→ Mac Terminal: <strong>mv gitignore.txt .gitignore</strong></p>
                      </div>
                    </div>
                    <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3">
                      <code className="text-yellow-300 text-sm font-mono">.env.example</code>
                      <p className="text-gray-400 text-xs mt-1">May be hidden — enable "show hidden files" in your file manager (Windows: View → Show → Hidden items)</p>
                    </div>
                    <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3">
                      <code className="text-gray-400 text-sm font-mono">.env</code>
                      <p className="text-gray-400 text-xs mt-1">You create this yourself: copy .env.example → rename to .env → fill in values. Never committed to GitHub.</p>
                    </div>
                  </div>
                  <Alert type="danger">
                    <strong>Do not skip renaming gitignore.txt to .gitignore.</strong> Without it, Git will push <code>node_modules/</code> (500MB+) and your secret files to GitHub.
                  </Alert>
                </div>

                {/* COMPLETE FILE LIST */}
                <SectionCard title="Every File in Your Download — Complete Accurate List" icon="📁" accent="from-cyan-500/10 to-blue-600/5">
                  <Alert type="success">
                    This is a <strong>100% accurate audit</strong> of every file that exists in your downloaded project. Nothing missing. Nothing extra.
                  </Alert>
                  <CodeBlock language="text" code={`arbitragex/
│
├── src/                               ← React frontend source code
│   ├── api/
│   │   └── client.ts                  ← Frontend → backend API calls
│   ├── components/
│   │   ├── ControlPanel.tsx
│   │   ├── DeploymentGuide.tsx
│   │   ├── ExchangeDashboard.tsx
│   │   ├── Footer.tsx
│   │   ├── OpportunityTable.tsx
│   │   └── TradeHistoryPanel.tsx
│   ├── data/
│   │   └── mockData.ts                ← Fallback simulation data
│   ├── types/
│   │   └── index.ts                   ← TypeScript interfaces
│   ├── utils/
│   │   └── cn.ts                      ← Tailwind class utility
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
│
├── server/                            ← ★ EXPRESS BACKEND
│   ├── exchanges/
│   │   ├── connector.js               ← CCXT for all 8 exchanges
│   │   └── accountManager.js
│   ├── routes/
│   │   ├── keys.js
│   │   ├── balances.js
│   │   ├── scanner.js
│   │   ├── bot.js
│   │   ├── transfer.js
│   │   ├── networks.js
│   │   └── history.js
│   ├── store/
│   │   ├── keyStore.js
│   │   └── tradeHistory.js
│   ├── start.js
│   └── index.js                       ← ★ Main Express entry point
│
├── scripts/
│   └── create-zip.js
│
├── .gitignore          ← ✅ COMMIT (may be hidden — use gitignore.txt)
├── .env.example        ← ✅ COMMIT (may be hidden — show hidden files)
├── gitignore.txt       ← ✅ COMMIT — rename to .gitignore if needed
├── index.html          ← ✅ COMMIT
├── package.json        ← ✅ COMMIT
├── package-lock.json   ← ✅ COMMIT — always commit this
├── render.yaml         ← ✅ COMMIT
├── tsconfig.json       ← ✅ COMMIT
├── vite.config.ts      ← ✅ COMMIT
├── DEPLOYMENT.md       ← ✅ COMMIT
├── REPO_STRUCTURE.md   ← ✅ COMMIT
└── README.md           ← ✅ COMMIT`} />
                </SectionCard>

                {/* FILES NOT IN DOWNLOAD */}
                <SectionCard title="Files NOT in Your Download — And Why" icon="⛔" accent="from-red-500/10 to-rose-600/5">
                  <div className="space-y-2">
                    {[
                      { file: "node_modules/",        reason: "Auto-generated by npm install. Can be 500MB+. Run npm install locally. Render generates it during build." },
                      { file: "dist/",                reason: "Auto-generated by npm run build. Render runs this itself. You never commit it." },
                      { file: ".env",                 reason: "You create this by copying .env.example. Contains real secrets — NEVER commit." },
                      { file: "server/store/keys.enc",reason: "Auto-generated by the server the first time you save an API key. Does not exist until server runs." },
                      { file: "tailwind.config.js",   reason: "NOT needed. ArbitrageX uses Tailwind v4 via vite.config.ts. No separate config file." },
                      { file: "tsconfig.node.json",   reason: "NOT needed. Older Vite templates used two tsconfig files. ArbitrageX uses one." },
                    ].map(item => (
                      <div key={item.file} className="bg-gray-900/60 rounded-xl p-3 flex gap-3">
                        <span className="text-red-400 font-bold text-sm mt-0.5 flex-shrink-0">✗</span>
                        <div>
                          <code className="text-red-300 text-sm font-mono">{item.file}</code>
                          <p className="text-gray-400 text-xs mt-1">{item.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* FILE COMMIT TABLE */}
                <SectionCard title="File Commit Reference — Every File" icon="📋" accent="from-blue-500/10 to-indigo-600/5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700/60 text-gray-400">
                          <th className="text-left py-2 px-3 font-semibold">File</th>
                          <th className="text-left py-2 px-3 font-semibold hidden sm:table-cell">Purpose</th>
                          <th className="text-center py-2 px-3 font-semibold">Commit?</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {[
                          { file: "src/",                         desc: "All React frontend source",                     commit: true },
                          { file: "src/api/client.ts",            desc: "Frontend → backend API calls",                  commit: true },
                          { file: "src/components/*.tsx",         desc: "All 6 UI components",                           commit: true },
                          { file: "src/types/index.ts",           desc: "TypeScript types + constants",                  commit: true },
                          { file: "src/data/mockData.ts",         desc: "Fallback simulation data",                      commit: true },
                          { file: "src/utils/cn.ts",              desc: "Tailwind class utility",                        commit: true },
                          { file: "server/index.js",              desc: "★ Main Express server",                         commit: true },
                          { file: "server/start.js",              desc: "Startup env validation",                        commit: true },
                          { file: "server/exchanges/",            desc: "CCXT connector + account manager",              commit: true },
                          { file: "server/routes/ (7 files)",     desc: "All API route handlers",                        commit: true },
                          { file: "server/store/keyStore.js",     desc: "AES-256 encrypted key storage",                 commit: true },
                          { file: "server/store/tradeHistory.js", desc: "Trade + transfer history",                      commit: true },
                          { file: "server/store/keys.enc",        desc: "Auto-generated at runtime — never exists yet",  commit: false },
                          { file: "scripts/create-zip.js",        desc: "Utility script",                                commit: true },
                          { file: "index.html",                   desc: "Vite HTML entry point",                         commit: true },
                          { file: "package.json",                 desc: "All dependencies + scripts",                    commit: true },
                          { file: "package-lock.json",            desc: "Exact dependency versions — always commit",     commit: true },
                          { file: "vite.config.ts",               desc: "Vite build + Tailwind v4 + /api proxy",         commit: true },
                          { file: "tsconfig.json",                desc: "TypeScript config (single file)",               commit: true },
                          { file: "render.yaml",                  desc: "Render Web Service config",                     commit: true },
                          { file: ".gitignore",                   desc: "Excludes secrets, node_modules, dist",          commit: true },
                          { file: "gitignore.txt",                desc: "Backup — rename to .gitignore",                 commit: true },
                          { file: ".env.example",                 desc: "Env template — no real values",                 commit: true },
                          { file: ".env",                         desc: "Real local env vars",                           commit: false },
                          { file: "README.md",                    desc: "Project overview",                              commit: true },
                          { file: "DEPLOYMENT.md",                desc: "Deployment guide",                              commit: true },
                          { file: "REPO_STRUCTURE.md",            desc: "This layout guide",                             commit: true },
                          { file: "node_modules/",               desc: "npm packages — auto-generated",                 commit: false },
                          { file: "dist/",                        desc: "Build output — Render generates this",          commit: false },
                        ].map(row => (
                          <tr key={row.file} className="hover:bg-gray-800/20">
                            <td className="py-2 px-3 font-mono text-cyan-400">{row.file}</td>
                            <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">{row.desc}</td>
                            <td className="py-2 px-3 text-center">
                              {row.commit
                                ? <span className="text-green-400 font-bold">✅ Yes</span>
                                : <span className="text-red-400 font-bold">❌ Never</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                {/* FAQ */}
                <SectionCard title="Frequently Asked Confusion Points" icon="❓" accent="from-purple-500/10 to-violet-600/5">
                  <div className="space-y-4">
                    {[
                      {
                        q: "package-lock.json is in my download but not in some guides — should I commit it?",
                        a: "YES — always commit package-lock.json. It locks exact dependency versions so Render builds with the exact same packages. Never delete it."
                      },
                      {
                        q: ".gitignore is on the repo structure but not in my download folder",
                        a: "Download systems hide dotfiles (files starting with a dot). Your download includes gitignore.txt which is the exact same content. Rename it to .gitignore before running git init."
                      },
                      {
                        q: "Should I delete gitignore.txt after renaming it?",
                        a: "You can delete it or keep it. It does no harm in the repo and serves as a backup for anyone else who downloads the project and has the same dotfile issue."
                      },
                      {
                        q: "What is the difference between package.json and package-lock.json?",
                        a: "package.json lists dependencies with version ranges (e.g. ^4.5.0). package-lock.json locks the exact version installed (e.g. 4.5.42). Both must be committed. Render uses package-lock.json to install identical packages every build."
                      },
                      {
                        q: "tailwind.config.js is missing",
                        a: "Correct. ArbitrageX uses Tailwind CSS v4 which is configured inside vite.config.ts via the @tailwindcss/vite plugin. No separate config file is needed or should be created."
                      },
                      {
                        q: "tsconfig.node.json is missing",
                        a: "Correct. Older Vite templates used two tsconfig files. ArbitrageX uses a single tsconfig.json for everything. No action needed."
                      },
                    ].map((item, i) => (
                      <div key={i} className="bg-gray-900/60 rounded-xl p-4">
                        <p className="text-white font-semibold text-sm mb-2">Q: {item.q}</p>
                        <p className="text-gray-400 text-sm">A: {item.a}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* CREATE REPO STEPS */}
                <SectionCard title="Creating the GitHub Repository — Step by Step" icon="🐙" accent="from-gray-700/20 to-gray-800/20">
                  <Step num={1} title="Rename gitignore.txt to .gitignore first">
                    <div className="bg-gray-900/60 rounded-lg p-3 space-y-1 text-xs font-mono">
                      <p className="text-gray-400"># Mac / Linux terminal:</p>
                      <p className="text-cyan-400">mv gitignore.txt .gitignore</p>
                      <p className="text-gray-400 mt-2"># Windows Command Prompt:</p>
                      <p className="text-cyan-400">ren gitignore.txt .gitignore</p>
                    </div>
                  </Step>
                  <Step num={2} title="Initialize Git and make first commit">
                    <CodeBlock code={`cd arbitragex\ngit init\ngit add .\ngit commit -m "feat: initial ArbitrageX web service commit"`} />
                  </Step>
                  <Step num={3} title="Verify sensitive files are NOT staged">
                    <CodeBlock code={`git status\n# These must NOT appear:\n# .env\n# server/store/keys.enc\n# node_modules/\n# dist/`} />
                    <p className="text-yellow-400 text-xs mt-2">⚠ If any appear — your .gitignore is not in place. Repeat Step 1.</p>
                  </Step>
                  <Step num={4} title="Create a Private repository on GitHub">
                    <div className="space-y-1.5 text-sm text-gray-300">
                      <p>1. Go to <span className="text-cyan-400 font-mono">github.com</span> → click <strong className="text-white">New repository</strong></p>
                      <p>2. Name: <code className="text-cyan-400 bg-gray-900/50 px-1.5 py-0.5 rounded">arbitragex</code></p>
                      <p>3. Visibility: <strong className="text-yellow-400">Private</strong> ← this repo contains your server code</p>
                      <p>4. Do <strong className="text-red-400">NOT</strong> tick "Initialize with README"</p>
                      <p>5. Click <strong className="text-white">Create repository</strong></p>
                    </div>
                  </Step>
                  <Step num={5} title="Push to GitHub">
                    <CodeBlock code={`git remote add origin https://github.com/YOUR_USERNAME/arbitragex.git\ngit branch -M main\ngit push -u origin main`} />
                  </Step>
                  <Step num={6} title="Verify on GitHub — what you should and should NOT see">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                        <p className="text-green-400 font-bold mb-2">✅ Should be there</p>
                        <div className="space-y-1 font-mono text-green-300 text-xs">
                          {["src/", "server/", "scripts/", ".gitignore", ".env.example", "gitignore.txt", "index.html", "package.json", "package-lock.json", "render.yaml", "tsconfig.json", "vite.config.ts", "README.md", "DEPLOYMENT.md", "REPO_STRUCTURE.md"].map(f => <p key={f}>{f}</p>)}
                        </div>
                      </div>
                      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                        <p className="text-red-400 font-bold mb-2">❌ Must NOT be there</p>
                        <div className="space-y-1 font-mono text-red-300 text-xs">
                          {["node_modules/", "dist/", ".env", "server/store/keys.enc"].map(f => <p key={f}>{f}</p>)}
                        </div>
                      </div>
                    </div>
                  </Step>
                  <Step num={7} title="Connect to Render and deploy">
                    <div className="space-y-1.5 text-sm text-gray-300">
                      <p>1. <span className="text-cyan-400 font-mono">render.com</span> → <strong className="text-white">New → Web Service</strong></p>
                      <p>2. Connect <code className="text-cyan-400 bg-gray-900/50 px-1 rounded">arbitragex</code> repo → Render reads <code className="text-cyan-400 bg-gray-900/50 px-1 rounded">render.yaml</code> automatically</p>
                      <p>3. Add env var: <code className="text-cyan-400 bg-gray-900/50 px-1 rounded">FRONTEND_URL</code> after first deploy</p>
                      <p>4. <strong className="text-white">Create Web Service</strong> → ~3–5 min build</p>
                      <p>5. Open live URL → <strong className="text-white">Connect API</strong> → enter exchange keys</p>
                      <p>6. Render dashboard → Settings → Outbound IPs → whitelist on each exchange</p>
                    </div>
                  </Step>
                </SectionCard>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default DeploymentGuide;
