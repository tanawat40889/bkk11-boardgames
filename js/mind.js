import { shuffle } from './rng.js';

// The Mind: play all cards in ascending order without talking.
export const MIN = 2, MAX = 8;
export const levelsFor = n => (n <= 2 ? 12 : n === 3 ? 10 : 8);
export const livesFor = n => Math.min(n, 4);
export const REWARD = { 2: 'star', 3: 'life', 5: 'star', 6: 'life', 8: 'star', 9: 'life' };
const MAX_LIVES = 5, MAX_STARS = 3;

export function newGame(sids) {
  const g = { sids: [...sids], level: 0, max: levelsFor(sids.length), lives: livesFor(sids.length), stars: 1, hands: {}, pile: [], last: null, prop: null, over: null, mistakes: 0 };
  deal(g);
  return g;
}

export function deal(g) {
  g.level++;
  const deck = shuffle(Array.from({ length: 100 }, (_, i) => i + 1));
  g.sids.forEach((s, k) => (g.hands[s] = deck.slice(k * g.level, (k + 1) * g.level).sort((a, b) => a - b)));
  g.pile = []; g.last = null; g.prop = null;
}

export const left = g => g.sids.reduce((a, s) => a + g.hands[s].length, 0);
export const holders = g => g.sids.filter(s => g.hands[s].length);
export const cleared = g => left(g) === 0;

// Play your lowest card. Anyone holding lower cards -> lose a life and those cards are burned.
export function play(g, s) {
  if (g.over || !g.hands[s]?.length) return null;
  const card = g.hands[s].shift(), burned = [];
  for (const t of g.sids) {
    while (g.hands[t].length && g.hands[t][0] < card) burned.push({ sid: t, card: g.hands[t].shift() });
  }
  g.pile.push({ sid: s, card });
  g.prop = null;
  if (burned.length) { g.lives--; g.mistakes++; if (g.lives <= 0) g.over = 'lose'; }
  g.last = { by: s, card, burned };
  return g.last;
}

export function propose(g, s) {
  if (g.over || g.prop || g.stars < 1 || !g.hands[s]?.length) return false;
  g.prop = { by: s, yes: [s] };
  resolveProp(g);
  return true;
}
export function agree(g, s) {
  if (!g.prop || !g.hands[s]?.length || g.prop.yes.includes(s)) return false;
  g.prop.yes.push(s);
  resolveProp(g);
  return true;
}
export function decline(g, s) {
  if (!g.prop || !g.sids.includes(s)) return false;
  g.prop = null;
  return true;
}
function resolveProp(g) {
  if (!holders(g).every(s => g.prop.yes.includes(s))) return;
  g.stars--;
  const burned = holders(g).map(s => ({ sid: s, card: g.hands[s].shift() }));
  g.last = { star: true, burned };
  g.prop = null;
}

// After a cleared level. Returns the reward ('star' | 'life' | null) or sets over = 'win'.
export function nextLevel(g) {
  if (g.over || !cleared(g)) return null;
  if (g.level >= g.max) { g.over = 'win'; return null; }
  const r = REWARD[g.level] || null;
  if (r === 'star') g.stars = Math.min(MAX_STARS, g.stars + 1);
  if (r === 'life') g.lives = Math.min(MAX_LIVES, g.lives + 1);
  deal(g);
  return r;
}
