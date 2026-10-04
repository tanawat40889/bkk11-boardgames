// Runs test/e2e.html in headless Chrome: bots play every game to the end over a mock broker.
//   node test/e2e.mjs                 all games
//   node test/e2e.mjs sk,sc reps=3    only some games, each scenario 3 times
//   node test/e2e.mjs chaos=0         without the random mid-game browser refreshes
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8791;
const args = process.argv.slice(2);
const games = args.find(a => !a.includes('='));
const opt = Object.fromEntries(args.filter(a => a.includes('=')).map(a => a.split('=')));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', root], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
let results;
try {
  const url = `http://localhost:${PORT}/test/e2e.html?reps=${opt.reps || 1}${games ? '&games=' + games : ''}${opt.chaos != null ? '&chaos=' + opt.chaos : ''}`;
  const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--virtual-time-budget=${opt.budget || 40000000}`, '--dump-dom', url],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: (+opt.timeout || 900) * 1000, stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/E2E_RESULT(.*?)E2E_END/s);
  if (!m) throw new Error('no result in page — the run did not finish within the time budget');
  results = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
} finally {
  server.kill();
}
let bad = 0;
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.game.padEnd(8)} ${String(r.n).padStart(2)} คน  ${r.ok ? `(${r.ticks} ticks, รีเฟรช ${r.reloads} ครั้ง)` : r.why}`);
  if (!r.ok) { bad++; for (const e of r.errs || []) console.log('    ' + String(e).split('\n').slice(0, 3).join('\n    ')); (r.screens || []).forEach((s, i) => console.log(`    P${i}: ${s}`)); }
}
console.log(`\n${results.length - bad}/${results.length} scenarios passed`);
process.exit(bad ? 1 : 0);
