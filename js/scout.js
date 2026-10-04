import { shuffle, rint } from './rng.js';

// Scout: hand order is fixed. Show a stronger set of adjacent cards, or scout a card from the table.
export const MIN = 3, MAX = 5;
export const handSize = n => ({ 3: 12, 4: 11, 5: 9 }[n]);

export function deck(n) {
  const d = [];
  for (let a = 1; a <= 10; a++) for (let b = a + 1; b <= 10; b++) d.push([a, b]);
  if (n === 3) return d.filter(c => c[1] !== 10);
  if (n === 4) return d.filter(c => !(c[0] === 9 && c[1] === 10));
  return d;
}

export function newGame(sids) {
  const g = { sids: [...sids], round: 0, rounds: sids.length, start: rint(sids.length), total: {}, hands: {}, ready: [], active: null, turn: null, cap: {}, tok: {}, usedSS: {}, res: null, over: false };
  sids.forEach(s => (g.total[s] = 0));
  dealRound(g);
  return g;
}

export function dealRound(g) {
  const n = g.sids.length, k = handSize(n);
  const d = shuffle(deck(n)).map(c => (rint(2) ? [c[1], c[0]] : [...c]));
  g.round++;
  g.sids.forEach((s, i) => { g.hands[s] = d.slice(i * k, (i + 1) * k); g.cap[s] = 0; g.tok[s] = 0; g.usedSS[s] = false; });
  g.ready = []; g.active = null; g.res = null;
  g.turn = g.sids[(g.start + g.round - 1) % n];
}

export const allReady = g => g.sids.every(s => g.ready.includes(s));
// Turning the hand upside down swaps every card's numbers and reverses the order.
export const flipped = hand => hand.map(([t, b]) => [b, t]).reverse();
export function flipHand(g, s) {
  if (g.ready.includes(s) || !g.hands[s]) return false;
  g.hands[s] = flipped(g.hands[s]);
  return true;
}
export function setReady(g, s) {
  if (!g.hands[s] || g.ready.includes(s)) return false;
  g.ready.push(s);
  return true;
}

// {n, m (1 = same numbers, 0 = run/single), hi} or null if not a legal set.
export function classify(cards) {
  const v = cards.map(c => c[0]), n = v.length;
  if (!n) return null;
  if (n === 1) return { n, m: 0, hi: v[0] };
  if (v.every(x => x === v[0])) return { n, m: 1, hi: v[0] };
  const d = v[1] - v[0];
  if ((d === 1 || d === -1) && v.every((x, i) => i === 0 || x - v[i - 1] === d)) return { n, m: 0, hi: Math.max(...v) };
  return null;
}
export function beats(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.n !== b.n) return a.n > b.n;
  if (a.m !== b.m) return a.m > b.m;
  return a.hi > b.hi;
}
const activeClass = g => (g.active ? classify(g.active.cards) : null);
export const canShow = (g, hand, i, j) => i >= 0 && j < hand.length && i <= j && beats(classify(hand.slice(i, j + 1)), activeClass(g));

const next = (g, s) => g.sids[(g.sids.indexOf(s) + 1) % g.sids.length];

function doShow(g, s, i, j) {
  const hand = g.hands[s];
  if (!canShow(g, hand, i, j)) return false;
  if (g.active) g.cap[s] += g.active.cards.length;
  g.active = { cards: hand.splice(i, j - i + 1), by: s };
  if (!hand.length) endRound(g, s, 'empty');
  else g.turn = next(g, s);
  return true;
}

function doScout(g, s, end, pos, flip) {
  const a = g.active, hand = g.hands[s];
  if (!a || a.by === s || !['L', 'R'].includes(end) || !Number.isInteger(pos) || pos < 0 || pos > hand.length) return false;
  const c = end === 'L' ? a.cards.shift() : a.cards.pop();
  hand.splice(pos, 0, flip ? [c[1], c[0]] : c);
  g.tok[a.by]++;
  return true;
}

export function show(g, s, i, j) {
  if (g.over || g.res || !allReady(g) || g.turn !== s) return false;
  return doShow(g, s, i, j);
}

export function scout(g, s, end, pos, flip) {
  if (g.over || g.res || !allReady(g) || g.turn !== s) return false;
  if (!doScout(g, s, end, pos, flip)) return false;
  const by = g.active.by;
  if (!g.active.cards.length) g.active = null;
  g.turn = next(g, s);
  // Everyone else scouted and it came back to the owner -> round over.
  if (g.turn === by) endRound(g, by, 'unbeaten');
  return true;
}

// Once per round: scout, then immediately show. Atomic so nobody can get stuck.
export function scoutShow(g, s, end, pos, flip, i, j) {
  if (g.over || g.res || !allReady(g) || g.turn !== s || g.usedSS[s]) return false;
  const snap = JSON.stringify([g.hands[s], g.active, g.tok]);
  const undo = () => { [g.hands[s], g.active, g.tok] = JSON.parse(snap); return false; };
  if (!doScout(g, s, end, pos, flip)) return false;
  if (!g.active.cards.length) g.active = null;
  if (!doShow(g, s, i, j)) return undo();
  g.usedSS[s] = true;
  return true;
}

function endRound(g, ender, why) {
  const rows = g.sids.map(s => {
    const minus = s === ender ? 0 : g.hands[s].length, pts = g.cap[s] + g.tok[s] - minus;
    g.total[s] += pts;
    return { sid: s, cap: g.cap[s], tok: g.tok[s], minus, pts, total: g.total[s] };
  });
  g.res = { why, ender, rows };
  g.turn = null;
  if (g.round >= g.rounds) g.over = true;
}

export function nextRound(g) {
  if (!g.res || g.over) return false;
  dealRound(g);
  return true;
}

export function winners(g) {
  const max = Math.max(...Object.values(g.total));
  return g.sids.filter(s => g.total[s] === max);
}
