import { shuffle, rint } from './rng.js';

// Toy Battle (Paolo Mori & Alessandro Zucchini) — 2 players. Place toys on a network of bases, keep them linked
// to your H.Q., surround regions for medals, or capture the enemy H.Q.
export const MIN = 2, MAX = 2, RACK = 8, OBJECTIVE = 6;
// strength null = Kwak (no value: goes on anything, and anything goes on it)
export const TROOPS = {
  kwak: { n: 'Kwak', s: null, d: 'ไม่มีค่าพลัง — วางทับตัวไหนก็ได้ และตัวไหนก็วางทับมันได้' },
  skully: { n: 'Skully', s: 1, d: 'วางแล้วจั่วทันที (เหมือนเลือก "จั่ว")' },
  capn: { n: "Cap'N", s: 2, d: 'วางแล้ววางของเล่นได้อีก 1 ตัว' },
  jumbo: { n: 'Jumbo', s: 3, d: 'วางแล้วเลือกเอาของเล่นศัตรูที่อยู่ติดกันออกจากกระดานได้ 1 ตัว' },
  hook: { n: 'Hook', s: 4, d: 'วางได้โดยไม่ต้องต่อกับ H.Q. (แต่วางบน H.Q. ศัตรูไม่ได้)' },
  xb42: { n: 'XB-42', s: 5, d: 'วางแล้วสุ่มทิ้งของเล่น 1 ตัวจากชั้นวางของศัตรู' },
  star: { n: 'Star', s: 6, d: 'วางแล้วจั่วของเล่น 1 ตัว' },
  roxy: { n: 'Roxy', s: 7, d: 'พลัง 7 ไม่มีความสามารถ' },
};
// Map (designed for this app — the real boards were not available): a 5 x 3 grid of bases between the two H.Q.s.
// Each square between four bases is a region with medals in it.
const COLS = 5, ROWS = 3;
export const BASES = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) BASES.push({ id: `b${r}${c}`, x: c + 1, y: r });
export const HQ = [{ id: 'hq0', x: 0, y: 1 }, { id: 'hq1', x: COLS + 1, y: 1 }];
export const EDGES = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if (c < COLS - 1) EDGES.push([`b${r}${c}`, `b${r}${c + 1}`]);
  if (r < ROWS - 1) EDGES.push([`b${r}${c}`, `b${r + 1}${c}`]);
}
for (let r = 0; r < ROWS; r++) { EDGES.push(['hq0', `b${r}0`]); EDGES.push(['hq1', `b${r}${COLS - 1}`]); }
const VAL = [[1, 2, 2, 1], [1, 2, 2, 1]];
export const REGIONS = [];
for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++)
  REGIONS.push({ id: `g${r}${c}`, x: c + 1.5, y: r + 0.5, m: VAL[r][c], bases: [`b${r}${c}`, `b${r}${c + 1}`, `b${r + 1}${c}`, `b${r + 1}${c + 1}`] });
export const NB = {};
for (const [a, b] of EDGES) { (NB[a] ||= []).push(b); (NB[b] ||= []).push(a); }

export function newGame(sids, first = 0) {
  const g = { sids: [...sids], hq: { [sids[0]]: 'hq0', [sids[1]]: 'hq1' }, stack: {}, reserve: {}, rack: {}, medals: {}, taken: {}, disc: [], turn: sids[first], extra: false, jumbo: null, n: 0, log: [], winner: null, why: null };
  for (const b of BASES) g.stack[b.id] = [];
  sids.forEach((s, i) => {
    g.reserve[s] = shuffle(Object.keys(TROOPS).flatMap(t => [t, t, t])).slice(4);   // 4 left in the box unseen
    g.rack[s] = []; g.medals[s] = 0;
    draw(g, s, i === first ? 3 : 4);
  });
  return g;
}

const log = (g, e) => { g.log.push(e); if (g.log.length > 30) g.log.shift(); };
const other = (g, s) => g.sids.find(x => x !== s);
function draw(g, s, k) { let got = 0; while (got < k && g.reserve[s].length && g.rack[s].length < RACK) { g.rack[s].push(g.reserve[s].pop()); got++; } return got; }
export const top = (g, b) => g.stack[b]?.at(-1) || null;
const owner = (g, b) => (b === 'hq0' ? g.sids[0] : b === 'hq1' ? g.sids[1] : top(g, b)?.o ?? null);

// Bases linked to s's H.Q. through bases s holds.
export function linked(g, s) {
  const start = g.hq[s], seen = new Set([start]), q = [start];
  while (q.length) for (const nb of NB[q.shift()]) if (!seen.has(nb) && !nb.startsWith('hq') && owner(g, nb) === s) { seen.add(nb); q.push(nb); }
  return seen;
}

export function canPlaceOn(g, s, type, b) {
  if (b === g.hq[s]) return false;
  const enemyHQ = b === g.hq[other(g, s)];
  if (enemyHQ && type === 'hook') return false;
  if (!enemyHQ) {
    const t = top(g, b);
    if (t && t.o !== s) {
      const a = TROOPS[type].s, d = TROOPS[t.t].s;
      if (!(a === null || d === null || d < a)) return false;     // only on a strictly weaker enemy (Kwak is the exception)
    }
  }
  if (type === 'hook') return true;
  const L = linked(g, s);
  return NB[b].some(nb => L.has(nb));
}
export const spots = (g, s, type) => [...BASES.map(b => b.id), 'hq0', 'hq1'].filter(b => canPlaceOn(g, s, type, b));
const canDraw = (g, s) => g.reserve[s].length > 0 && g.rack[s].length < RACK;
const canPlace = (g, s) => g.rack[s].some(t => spots(g, s, t).length);

function regions(g, s) {
  for (const R of REGIONS) {
    if (g.taken[R.id] || !R.bases.every(b => owner(g, b) === s)) continue;
    g.taken[R.id] = s; g.medals[s] += R.m;
    log(g, { t: 'medal', sid: s, m: R.m });
  }
  if (g.medals[s] >= OBJECTIVE) win(g, s, 'medals');
}
function win(g, s, why) { if (!g.winner) { g.winner = s; g.why = why; } }

function endTurn(g) {
  if (g.winner) return;
  g.extra = false; g.jumbo = null;
  g.turn = other(g, g.turn);
  // a player who can neither draw nor place ends the game: most medals wins, a tie goes against the one who is stuck
  const s = g.turn;
  if (!canDraw(g, s) && !canPlace(g, s)) {
    const o = other(g, s);
    win(g, g.medals[o] >= g.medals[s] ? o : s, 'stuck');
  }
}

export function drawAction(g, s) {
  if (g.winner || s !== g.turn || g.extra || g.jumbo || !canDraw(g, s)) return false;
  draw(g, s, 2); g.n++;
  log(g, { t: 'draw', sid: s });
  endTurn(g);
  return true;
}

export function place(g, s, i, b) {
  if (g.winner || s !== g.turn || g.jumbo) return false;
  const type = g.rack[s][i];
  if (!type || !canPlaceOn(g, s, type, b)) return false;
  g.rack[s].splice(i, 1); g.n++;
  const wasExtra = g.extra; g.extra = false;
  if (b.startsWith('hq')) { log(g, { t: 'place', sid: s, type, b }); win(g, s, 'hq'); return true; }
  g.stack[b].push({ o: s, t: type });
  log(g, { t: 'place', sid: s, type, b, extra: wasExtra });
  regions(g, s);
  if (g.winner) return true;
  // troop effects
  const o = other(g, s);
  if (type === 'skully') draw(g, s, 2);
  if (type === 'star') draw(g, s, 1);
  if (type === 'xb42' && g.rack[o].length) { const k = rint(g.rack[o].length); const lost = g.rack[o].splice(k, 1)[0]; g.disc.push(lost); log(g, { t: 'xb', sid: s, lost }); }
  if (type === 'jumbo') {
    const opts = NB[b].filter(x => !x.startsWith('hq') && top(g, x)?.o === o);
    if (opts.length) { g.jumbo = opts; return true; }
  }
  if (type === 'capn' && canPlace(g, s)) { g.extra = true; return true; }
  endTurn(g);
  return true;
}

// Jumbo: remove the top enemy toy from one adjacent base (or pass with b = null).
export function jumbo(g, s, b) {
  if (s !== g.turn || !g.jumbo || (b !== null && !g.jumbo.includes(b))) return false;
  if (b) { g.disc.push(g.stack[b].pop().t); log(g, { t: 'jumbo', sid: s, b }); regions(g, s); }
  g.jumbo = null; g.n++;
  if (g.winner) return true;
  endTurn(g);
  return true;
}
// Cap'N's extra placement may be skipped.
export function skip(g, s) { if (s !== g.turn || !g.extra) return false; g.n++; endTurn(g); return true; }
