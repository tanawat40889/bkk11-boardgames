// Plays every game on the REAL website over the REAL broker (bots in headless Chrome, real time — takes 15–30 minutes).
//   node test/live.mjs                       all games on the deployed site
//   node test/live.mjs sk,mi                 only some games
//   node test/live.mjs url=http://localhost:8791/   another copy of the site (must be served already)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const games = args.find(a => !a.includes('='));
const opt = Object.fromEntries(args.filter(a => a.includes('=')).map(a => a.split(/=(.*)/s).slice(0, 2)));
const base = opt.url || 'https://tanawat40889.github.io/bkk11-boardgames/';
const PORT = 9333, LIMIT = (+opt.minutes || 45) * 60000;
const url = `${base}test/e2e.html?live=1${games ? '&games=' + games : ''}${opt.chaos != null ? '&chaos=' + opt.chaos : ''}${opt.n ? '&n=' + opt.n : ''}`;

const profile = mkdtempSync(path.join(tmpdir(), 'bkk11-live-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--window-size=1400,900', url], { stdio: 'ignore' });
const stop = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('SIGINT', () => { stop(); process.exit(130); });

console.log('playing on', url);
const t0 = Date.now();
let results = null, last = '';
while (Date.now() - t0 < LIMIT) {
  await new Promise(r => setTimeout(r, 5000));
  let pages;
  try { pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { continue; }
  const page = pages.find(p => p.url.includes('e2e.html'));
  if (!page) continue;
  if (page.title !== last && page.title.startsWith('RUN')) { last = page.title; console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] ${page.title.replace('RUN ', 'เกมที่ ').replace(/ (\w+)$/, ': $1')}`); }
  if (page.title.startsWith('DONE')) { results = JSON.parse(page.title.slice(5)); break; }
}
stop();
if (!results) { console.log('✗ ไม่จบภายในเวลาที่กำหนด — ค้างที่', last || 'ยังไม่เริ่ม'); process.exit(2); }

let bad = 0;
const ui = new Set();
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.game.padEnd(8)} ${String(r.n).padStart(2)} คน  ${r.ok ? `(รีเฟรชกลางเกม ${r.reloads} ครั้ง)` : r.why}`);
  if (!r.ok) { bad++; for (const e of r.errs || []) console.log('    ' + String(e).split('\n').slice(0, 3).join('\n    ')); (r.screens || []).forEach((s, i) => console.log(`    P${i}: ${s}`)); }
  for (const u of r.ui || []) ui.add(`${r.game} | ${u}`);
}
if (ui.size) { console.log(`\nUI audit: ${ui.size} problems`); for (const u of ui) console.log('  ⚠ ' + u); } else console.log('\nUI audit: no layout problems found');
console.log(`\n${results.length - bad}/${results.length} games finished on the live site in ${Math.round((Date.now() - t0) / 60000)} min`);
process.exit(bad || ui.size ? 1 : 0);
