// Runs test/e2e.html in headless Chrome: bots play every game to the end over a mock broker.
//   node test/e2e.mjs                 all games
//   node test/e2e.mjs sk,sc reps=3    only some games, each scenario 3 times
//   node test/e2e.mjs chaos=0         without the random mid-game browser refreshes
//   node test/e2e.mjs w=320           audit at a small-phone width (default 360)
//   node test/e2e.mjs down=0.3        lose 30% of host → player updates (players must notice and ask again)
//   node test/e2e.mjs loss=0.4        drop 40% of player actions on the way to the host (they must be retried)
//   node test/e2e.mjs ui=0            skip the layout audit (overflowing text, off-screen or overlapping buttons, …)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { spawn as _spawn } from 'node:child_process';
// macOS: headless Chrome stops ticking while the display sleeps, so keep it awake for as long as this script runs.
if (process.platform === 'darwin') try { _spawn('caffeinate', ['-d', '-u', '-w', String(process.pid)], { stdio: 'ignore' }).unref(); } catch {}
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8791;
const args = process.argv.slice(2);
const games = args.find(a => !a.includes('='));
const opt = Object.fromEntries(args.filter(a => a.includes('=')).map(a => a.split('=')));

// Static server with caching switched off — otherwise Chrome may test a stale style.css / app.js from an earlier run.
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png', json: 'application/json', webmanifest: 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
  const file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[file.split('.').pop()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
let results;
try {
  const url = `http://localhost:${PORT}/test/e2e.html?reps=${opt.reps || 1}${games ? '&games=' + games : ''}${opt.chaos != null ? '&chaos=' + opt.chaos : ''}${opt.ui != null ? '&ui=' + opt.ui : ''}${opt.w ? '&w=' + opt.w : ''}${opt.loss ? '&loss=' + opt.loss : ''}${opt.down ? '&down=' + opt.down : ''}`;
  // async on purpose: the server above lives in this same process
  const { stdout: dom } = await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--virtual-time-budget=${opt.budget || 40000000}`, '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: (+opt.timeout || 900) * 1000 });
  const m = dom.match(/E2E_RESULT(.*?)E2E_END/s);
  if (!m) throw new Error('no result in page — the run did not finish within the time budget');
  results = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
} finally {
  server.close();
}
let bad = 0;
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.game.padEnd(8)} ${String(r.n).padStart(2)} คน  ${r.ok ? `(${r.ticks} ticks, รีเฟรช ${r.reloads} ครั้ง)` : r.why}`);
  if (!r.ok) { bad++; for (const e of r.errs || []) console.log('    ' + String(e).split('\n').slice(0, 3).join('\n    ')); (r.screens || []).forEach((s, i) => console.log(`    P${i}: ${s}`)); if (opt.diag) (r.diag || []).forEach((s, i) => console.log(`    P${i} state: ${s}`)); }
}
// UI audit findings, merged across scenarios: "screen | problem | element"
const ui = new Map();
for (const r of results) for (const line of r.ui || []) {
  const [key, rest] = line.split(' ×');
  const k = `${r.game} | ${key}`, e = ui.get(k) || ui.set(k, { n: 0, sample: rest.replace(/^\d+ — /, ''), sizes: new Set() }).get(k);
  e.n += parseInt(rest); e.sizes.add(r.n);
}
if (ui.size) {
  console.log(`\nUI audit: ${ui.size} kinds of layout problems (game | screen | problem | element)`);
  for (const [k, e] of [...ui].sort()) console.log(`  ⚠ ${k}  [${[...e.sizes].sort((a, b) => a - b).join(',')} คน, ×${e.n}]  ${e.sample}`);
} else console.log('\nUI audit: no layout problems found');
console.log(`\n${results.length - bad}/${results.length} scenarios passed`);
process.exit(bad || ui.size ? 1 : 0);
