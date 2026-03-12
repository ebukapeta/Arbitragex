#!/usr/bin/env node
/**
 * ArbitrageX — Repository ZIP creator
 * Run: node scripts/create-zip.js
 * Output: arbitragex-repo.zip (in project root)
 */

const fs   = require('fs');
const path = require('path');

// Minimal ZIP implementation (no external deps needed)
// Uses Node.js built-in zlib for deflate

const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');

// Files to include in the ZIP (relative to project root)
const INCLUDE_PATTERNS = [
  'src/**/*',
  'public/**/*',
  'index.html',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'tsconfig.json',
  'tsconfig.node.json',
  'DEPLOYMENT.md',
  '.gitignore',
];

const EXCLUDE = [
  'node_modules',
  'dist',
  '.git',
  'arbitragex-repo.zip',
  'scripts',
];

function walk(dir, base = ROOT) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath  = path.relative(base, fullPath).replace(/\\/g, '/');
    const topDir   = relPath.split('/')[0];
    if (EXCLUDE.includes(topDir) || EXCLUDE.includes(entry.name)) continue;
    if (entry.isDirectory()) {
      results.push(...walk(fullPath, base));
    } else {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

// ── Tiny ZIP builder ──────────────────────────────────────────────────────────
function uint16LE(n)  { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function uint32LE(n)  { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files) {
  const localHeaders  = [];
  const centralDirs   = [];
  let   offset        = 0;

  for (const { relPath, content } of files) {
    const name       = Buffer.from(relPath);
    const crc        = crc32(content);
    const compressed = zlib.deflateRawSync(content, { level: 6 });
    const useDeflate = compressed.length < content.length;
    const compData   = useDeflate ? compressed : content;
    const compMethod = useDeflate ? 8 : 0;

    // Local file header
    const lh = Buffer.concat([
      Buffer.from([0x50,0x4B,0x03,0x04]),  // sig
      uint16LE(20),                          // version needed
      uint16LE(0),                           // flags
      uint16LE(compMethod),
      uint16LE(0), uint16LE(0),             // mod time/date
      uint32LE(crc),
      uint32LE(compData.length),
      uint32LE(content.length),
      uint16LE(name.length),
      uint16LE(0),                           // extra field length
      name,
      compData,
    ]);

    localHeaders.push(lh);

    // Central directory entry
    const cd = Buffer.concat([
      Buffer.from([0x50,0x4B,0x01,0x02]),  // sig
      uint16LE(20), uint16LE(20),           // version made / needed
      uint16LE(0), uint16LE(compMethod),
      uint16LE(0), uint16LE(0),             // mod time/date
      uint32LE(crc),
      uint32LE(compData.length),
      uint32LE(content.length),
      uint16LE(name.length),
      uint16LE(0), uint16LE(0),             // extra / comment len
      uint16LE(0), uint16LE(0),             // disk start / int attrs
      uint32LE(0),                           // ext attrs
      uint32LE(offset),
      name,
    ]);

    centralDirs.push(cd);
    offset += lh.length;
  }

  const centralDir    = Buffer.concat(centralDirs);
  const centralOffset = offset;

  // End of central directory
  const eocd = Buffer.concat([
    Buffer.from([0x50,0x4B,0x05,0x06]),
    uint16LE(0), uint16LE(0),
    uint16LE(files.length), uint16LE(files.length),
    uint32LE(centralDir.length),
    uint32LE(centralOffset),
    uint16LE(0),
  ]);

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('🗜  Building ArbitrageX repository ZIP...\n');

const allFiles = walk(ROOT);
const fileData = [];

for (const { fullPath, relPath } of allFiles) {
  try {
    const content = fs.readFileSync(fullPath);
    fileData.push({ relPath: `arbitragex/${relPath}`, content });
    console.log(`  + ${relPath}`);
  } catch (e) {
    console.warn(`  ! skipped: ${relPath} (${e.message})`);
  }
}

const zipBuf  = buildZip(fileData);
const outPath = path.join(ROOT, 'arbitragex-repo.zip');
fs.writeFileSync(outPath, zipBuf);

console.log(`\n✅ Created: arbitragex-repo.zip`);
console.log(`   Files:   ${fileData.length}`);
console.log(`   Size:    ${(zipBuf.length / 1024).toFixed(1)} KB`);
console.log('\nExtract with:');
console.log('  unzip arbitragex-repo.zip');
console.log('  cd arbitragex && npm install && npm run dev');
