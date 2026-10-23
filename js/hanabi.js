import { shuffle } from './rng.js';

// Hanabi (Antoine Bauza) — co-op. You see everyone's cards except your own; build five fireworks 1→5 by colour.
export const MIN = 2, MAX = 5, CLUES = 8, FUSES = 3;
export const COLORS = ['r', 'y', 'g', 'b', 'w'];
export const CNAME = { r: 'แดง', y: 'เหลือง', g: 'เขียว', b: 'น้ำเงิน', w: 'ขาว' };
export const COPIES = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 };
export const handSize = n => (n <= 3 ? 5 : 4);

export function newGame(sids) {
  const deck = [];
  let id = 0;
  for (const c of COLORS) for (const [v, k] of Object.entries(COPIES)) for (let i = 0; i < k; i++) deck.push({ id: id++, c, n: +v });
  const g = { sids: [...sids], deck: shuffle(deck), hand: {}, fw: Object.fromEntries(COLORS.map(c => [c, 0])), disc: [], clues: CLUES, fuses: FUSES,
    turn: sids[0], left: null, n: 0, log: [], last: null, over: false, why: null };
  for (const s of sids) { g.hand[s] = []; for (let i = 0; i < handSize(sids.length); i++) draw(g, s); }
  return g;
}

// What the holder knows about a card: a known colour / number, and the ones it has been told it is not.
const know = () => ({ c: null, n: null, nc: [], nn: [] });
function draw(g, s) { const card = g.deck.pop(); if (card) g.hand[s].unshift({ ...card, k: know() }); }   // new cards go on the left
export const score = g => COLORS.reduce((a, c) => a + g.fw[c], 0);
const log = (g, e) => { g.log.push(e); if (g.log.length > 30) g.log.shift(); };

function endTurn(g) {
  if (score(g) === 25) return finish(g, 'perfect');
  if (g.left !== null && --g.left <= 0) return finish(g, 'deck');
  if (g.left === null && !g.deck.length) g.left = g.sids.length;   // last card drawn: everyone gets one more turn
  g.turn = g.sids[(g.sids.indexOf(g.turn) + 1) % g.sids.length];
}
function finish(g, why) { g.over = true; g.why = why; }

export function play(g, s, i) {
  if (g.over || s !== g.turn || !g.hand[s][i]) return false;
  const card = g.hand[s].splice(i, 1)[0];
  const ok = g.fw[card.c] === card.n - 1;
  if (ok) { g.fw[card.c] = card.n; if (card.n === 5 && g.clues < CLUES) g.clues++; }
  else { g.disc.push(card); g.fuses--; }
  log(g, { t: 'play', sid: s, c: card.c, num: card.n, ok });
  g.last = null; g.n++;
  draw(g, s);
  if (!g.fuses) return finish(g, 'boom'), true;
  endTurn(g);
  return true;
}

export function discard(g, s, i) {
  if (g.over || s !== g.turn || !g.hand[s][i] || g.clues >= CLUES) return false;
  const card = g.hand[s].splice(i, 1)[0];
  g.disc.push(card); g.clues++;
  log(g, { t: 'disc', sid: s, c: card.c, num: card.n });
  g.last = null; g.n++;
  draw(g, s);
  endTurn(g);
  return true;
}

// kind 'c' (colour) or 'n' (number). Must point at one card or more.
export function clue(g, s, to, kind, v) {
  if (g.over || s !== g.turn || to === s || !g.hand[to] || g.clues <= 0) return false;
  if (kind === 'n') v = +v;
  if (kind === 'c' ? !COLORS.includes(v) : !(v >= 1 && v <= 5)) return false;
  const hit = g.hand[to].filter(c => c[kind] === v);
  if (!hit.length) return false;
  for (const c of g.hand[to]) {
    if (c[kind] === v) c.k[kind] = v;
    else if (!c.k['n' + kind].includes(v)) c.k['n' + kind].push(v);
  }
  g.clues--;
  log(g, { t: 'clue', sid: s, to, kind, v, k: hit.length });
  g.last = { to, ids: hit.map(c => c.id) };
  g.n++;
  endTurn(g);
  return true;
}
