import { rint } from './rng.js';

// Skull: each player owns 3 flowers ('f') + 1 skull ('s'). First to 2 successful challenges, or last player with discs, wins.
export const MIN = 3, MAX = 10, WIN = 2;

export function newGame(sids) {
  const g = { sids: [...sids], hand: {}, pts: {}, stacks: {}, flipped: {}, passed: [], bid: null, turn: null, ch: null, reveals: [], res: null, starter: null, winner: null, round: 0 };
  sids.forEach(s => { g.hand[s] = { f: 3, s: 1 }; g.pts[s] = 0; });
  startRound(g, sids[rint(sids.length)]);
  return g;
}

export const discs = (g, s) => g.hand[s].f + g.hand[s].s;
export const alive = g => g.sids.filter(s => discs(g, s) > 0);
export const total = g => Object.values(g.stacks).reduce((a, x) => a + x.length, 0);
const inHand = (g, s, d) => g.hand[s][d] - g.stacks[s].filter(x => x === d).length;
export const canPlace = (g, s, d) => (d === 'f' || d === 's') && inHand(g, s, d) > 0;

export function startRound(g, starter) {
  g.round++;
  g.stacks = {}; g.flipped = {};
  alive(g).forEach(s => { g.stacks[s] = []; g.flipped[s] = 0; });
  g.passed = []; g.bid = null; g.ch = null; g.reveals = []; g.res = null;
  g.starter = starter; g.turn = null;
}

// Clockwise to the next living player who can still act.
function nextFrom(g, s, ok = () => true) {
  const a = alive(g), i = a.indexOf(s);
  for (let k = 1; k <= a.length; k++) { const t = a[(i + k) % a.length]; if (ok(t)) return t; }
  return null;
}

// Opening: everyone lays one disc at the same time.
export function placeInit(g, s, d) {
  if (g.turn || !(s in g.stacks) || g.stacks[s].length || !canPlace(g, s, d)) return false;
  g.stacks[s].push(d);
  if (alive(g).every(x => g.stacks[x].length)) g.turn = g.starter;
  return true;
}

export function add(g, s, d) {
  if (g.turn !== s || g.bid || !canPlace(g, s, d)) return false;
  g.stacks[s].push(d);
  g.turn = nextFrom(g, s);
  return true;
}

export function bid(g, s, n) {
  if (g.turn !== s || g.ch || g.passed.includes(s) || !Number.isInteger(n) || n <= (g.bid?.n || 0) || n > total(g)) return false;
  g.bid = { n, by: s };
  if (n === total(g)) g.ch = s;
  else g.turn = nextFrom(g, s, t => !g.passed.includes(t));
  if (g.ch) beginFlip(g);
  return true;
}

export function pass(g, s) {
  if (g.turn !== s || !g.bid || g.ch || s === g.bid.by) return false;
  g.passed.push(s);
  const left = alive(g).filter(t => !g.passed.includes(t));
  if (left.length === 1) { g.ch = g.bid.by; beginFlip(g); }
  else g.turn = nextFrom(g, s, t => !g.passed.includes(t));
  return true;
}

const flowers = g => g.reveals.filter(r => r.d === 'f').length;

// The challenger must reveal their whole own stack first (top to bottom).
function beginFlip(g) {
  g.turn = null;
  const own = g.stacks[g.ch];
  for (let k = own.length - 1; k >= 0; k--) {
    const d = own[k];
    g.flipped[g.ch]++;
    g.reveals.push({ sid: g.ch, d });
    if (d === 's') { g.res = { ok: false, owner: g.ch }; return; }
    if (flowers(g) >= g.bid.n) { g.res = { ok: true }; return; }
  }
}

export const flippable = (g, t) => t !== g.ch && t in g.stacks && g.flipped[t] < g.stacks[t].length;

export function flip(g, s, t) {
  if (s !== g.ch || g.res || !flippable(g, t)) return false;
  const st = g.stacks[t], d = st[st.length - 1 - g.flipped[t]];
  g.flipped[t]++;
  g.reveals.push({ sid: t, d });
  if (d === 's') g.res = { ok: false, owner: t };
  else if (flowers(g) >= g.bid.n) g.res = { ok: true };
  return true;
}

// Challenger hit their own skull -> they choose which disc to lose.
export const needsChoice = g => g.res && !g.res.ok && g.res.owner === g.ch && !g.res.settled;

// Apply the result. For own-skull failures pass the chosen disc type.
export function settle(g, choice) {
  const r = g.res, c = g.ch;
  if (!r || r.settled) return false;
  if (r.ok) g.pts[c]++;
  else {
    const h = g.hand[c];
    let lose;
    if (r.owner === c) {
      if (!['f', 's'].includes(choice) || !h[choice]) return false;
      lose = choice;
    } else lose = rint(h.f + h.s) < h.f ? 'f' : 's';
    h[lose]--;
    r.lost = lose;
  }
  r.settled = true;
  const a = alive(g);
  g.winner = g.pts[c] >= WIN ? c : a.length === 1 ? a[0] : null;
  return true;
}

// Challenger starts next round; if eliminated, the skull's owner; if eliminated by own skull, the next living player.
export function nextStarter(g) {
  const c = g.ch, a = alive(g);
  if (a.includes(c)) return c;
  if (g.res.owner !== c && a.includes(g.res.owner)) return g.res.owner;
  const i = g.sids.indexOf(c);
  for (let k = 1; k < g.sids.length; k++) { const t = g.sids[(i + k) % g.sids.length]; if (a.includes(t)) return t; }
  return a[0];
}
