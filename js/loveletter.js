import { shuffle, rint } from './rng.js';

// Love Letter (21-card edition, 2–6 players). Hold 1 card; on your turn draw 1 and play 1.
// Knock others out with card effects, or hold the highest card when the deck runs out. Win tokens of affection.
export const MIN = 2, MAX = 6;
// value: [count, needs a target, may target yourself]
export const CARDS = { 0: [2, 0, 0], 1: [6, 1, 0], 2: [2, 1, 0], 3: [2, 1, 0], 4: [2, 0, 0], 5: [2, 1, 1], 6: [2, 0, 0], 7: [1, 1, 0], 8: [1, 0, 0], 9: [1, 0, 0] };
export const NEED = { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 };
export const GUESS = [0, 2, 3, 4, 5, 6, 7, 8, 9];   // a Guard can name anything but a Guard

export function newGame(sids) {
  const g = { sids: [...sids], tok: Object.fromEntries(sids.map(s => [s, 0])), need: NEED[sids.length] || 3, round: 0, winner: null, n: 0 };
  newRound(g, sids[rint(sids.length)]);
  return g;
}
function newRound(g, first) {
  const deck = shuffle(Object.entries(CARDS).flatMap(([v, [c]]) => Array(c).fill(+v)));
  g.round++; g.aside = deck.pop(); g.up = g.sids.length === 2 ? [deck.pop(), deck.pop(), deck.pop()] : [];
  g.deck = deck; g.hand = {}; g.out = {}; g.prot = {}; g.disc = {}; g.spy = {}; g.peek = {}; g.log = []; g.res = null; g.chan = null; g.phase = 'play';
  for (const s of g.sids) { g.hand[s] = [deck.pop()]; g.disc[s] = []; }
  g.turn = first; draw(g, first); g.n++;
}
// only a Prince's victim may take the face-down set-aside card when the deck is empty
const draw = (g, s, aside = false) => { if (g.deck.length) g.hand[s].push(g.deck.pop()); else if (aside && g.aside != null) { g.hand[s].push(g.aside); g.aside = null; } };
export const alive = g => g.sids.filter(s => !g.out[s]);
// players a targeted card may pick (alive, not protected); a Prince may also pick yourself
export const targets = (g, s, v) => alive(g).filter(x => (x === s ? CARDS[v][2] : !g.prot[x]));
export const mustCountess = h => h.includes(8) && (h.includes(5) || h.includes(7));
const say = (g, e) => { g.log.push(e); if (g.log.length > 30) g.log.shift(); };
function discard(g, s, v) { g.disc[s].push(v); if (v === 0) g.spy[s] = true; }
function knock(g, s) { g.out[s] = true; for (const v of g.hand[s]) discard(g, s, v); g.hand[s] = []; }

export function play(g, s, v, to = null, guess = null) {
  if (g.phase !== 'play' || s !== g.turn || g.winner) return false;
  const h = g.hand[s], i = h.indexOf(v);
  if (i < 0 || (mustCountess(h) && v !== 8)) return false;
  const T = CARDS[v][1] ? targets(g, s, v) : [];
  if (CARDS[v][1] && T.length && !T.includes(to)) return false;
  if (!CARDS[v][1] || !T.length) to = null;
  if (v === 1 && to && !GUESS.includes(guess)) return false;
  h.splice(i, 1); discard(g, s, v); delete g.peek[s];
  const e = { t: 'play', by: s, v, to };
  if (v === 1 && to) { e.guess = guess; e.hit = g.hand[to][0] === guess; if (e.hit) knock(g, to); }
  else if (v === 2 && to) g.peek[s] = { who: to, v: g.hand[to][0] };
  else if (v === 3 && to) { const a = h[0], b = g.hand[to][0]; if (a !== b) { const lo = a < b ? s : to; e.lose = lo; e.lv = g.hand[lo][0]; knock(g, lo); } else e.tie = true; }
  else if (v === 4) g.prot[s] = true;
  else if (v === 5 && to) { const old = g.hand[to].pop(); discard(g, to, old); e.lv = old; if (old === 9) { e.lose = to; knock(g, to); } else draw(g, to, true); }
  else if (v === 7 && to) [g.hand[s], g.hand[to]] = [g.hand[to], g.hand[s]];
  else if (v === 9) { e.lose = s; knock(g, s); }
  say(g, e);
  if (v === 6 && !g.out[s] && g.deck.length) { draw(g, s); draw(g, s); g.phase = 'chan'; g.chan = s; g.n++; return true; }
  endTurn(g);
  return true;
}
// Chancellor: keep one card, the others go to the bottom of the deck
export function keep(g, s, v) {
  const h = g.hand[s];
  if (g.phase !== 'chan' || g.chan !== s || !h.includes(v)) return false;
  h.splice(h.indexOf(v), 1);
  g.deck.unshift(...shuffle(h)); g.hand[s] = [v];
  g.phase = 'play'; g.chan = null;
  endTurn(g);
  return true;
}
function endTurn(g) {
  const A = alive(g);
  if (A.length <= 1 || !g.deck.length) return endRound(g);
  let i = g.sids.indexOf(g.turn);
  do i = (i + 1) % g.sids.length; while (g.out[g.sids[i]]);
  g.turn = g.sids[i]; delete g.prot[g.turn]; draw(g, g.turn); g.n++;
}
function endRound(g) {
  const A = alive(g), top = Math.max(...A.map(s => g.hand[s][0] ?? -1));
  const win = A.length === 1 ? A : A.filter(s => g.hand[s][0] === top);
  const spies = A.filter(s => g.spy[s]), spy = spies.length === 1 ? spies[0] : null;
  for (const s of win) g.tok[s]++;
  if (spy) g.tok[spy]++;
  g.res = { win, spy, hands: Object.fromEntries(A.map(s => [s, g.hand[s][0]])), byDeck: A.length > 1 };
  g.phase = 'end'; g.turn = null; g.n++;
  const done = g.sids.filter(s => g.tok[s] >= g.need);
  if (done.length) g.winner = done.sort((a, b) => g.tok[b] - g.tok[a])[0];
}
export function next(g) {
  if (g.phase !== 'end' || g.winner) return false;
  const w = g.res.win;
  newRound(g, w[rint(w.length)]);
  return true;
}
