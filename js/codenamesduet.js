import { shuffle, rint } from './rng.js';
import { wordList, norm } from './words.js';
import { poolFor } from './codenames.js';

// Codenames Duet: everyone on one team. The table splits into two sides (A/B); each side sees its own key.
// 15 agents to find together before the timer tokens run out.
export const MIN = 2, MAX = 8, TOKENS = 9, RECENT = 150;
export const other = s => (s === 'a' ? 'b' : 'a');

// Each cell as [key on side A, key on side B]: g = agent, n = bystander, x = assassin.
// 9 agents and 3 assassins per side, 15 agents in all.
const LAYOUT = [
  ...Array(3).fill(['g', 'g']), ...Array(5).fill(['g', 'n']), ['g', 'x'],
  ...Array(5).fill(['n', 'g']), ['x', 'g'],
  ['x', 'x'], ['x', 'n'], ['n', 'x'], ...Array(7).fill(['n', 'n']),
];

export function newGame(sids, tokens = TOKENS, recent = [], wl = 'th') {
  const POOL = poolFor(wl), W = wordList(wl);
  let pool = POOL.filter(i => !recent.includes(i));
  if (pool.length < 25) pool = [...POOL];
  const idx = shuffle(pool).slice(0, 25), lay = shuffle(LAYOUT), side = {};
  shuffle(sids).forEach((s, i) => (side[s] = i % 2 ? 'b' : 'a'));
  return {
    sids: [...sids], side, idx, words: idx.map(i => W[i]), key: { a: lay.map(c => c[0]), b: lay.map(c => c[1]) },
    found: Array(25).fill(false), nm: Array(25).fill(''), tok: tokens, tok0: tokens, giver: rint(2) ? 'a' : 'b',
    clue: null, guesses: 0, sd: false, log: [], winner: null, why: null, n: 0,
  };
}

// agents a side can still clue (green on its own key, not found yet)
export const left = (g, s) => g.key[s].filter((k, i) => k === 'g' && !g.found[i]).length;
export const total = g => g.key.a.filter((k, i) => !g.found[i] && (k === 'g' || g.key.b[i] === 'g')).length;

export function giveClue(g, s, word, n) {
  word = String(word || '').trim().slice(0, 20);
  if (g.winner || g.sd || g.clue || g.side[s] !== g.giver || !word || /\s/.test(word) || !Number.isInteger(n) || n < 0 || n > 9) return false;
  const w = norm(word);
  if (!w || g.words.some((x, i) => !g.found[i] && (norm(x).includes(w) || w.includes(norm(x))))) return false;
  g.clue = { word, n, by: s };
  g.guesses = 0;
  g.n++;
  g.log.push({ t: 'clue', side: g.giver, sid: s, word, n });
  return true;
}

// Normal turn: the other side guesses against the clue giver's key.
// Sudden death (no tokens left): anyone guesses against the other side's key, one miss loses.
export const judge = (g, s) => (g.sd ? other(g.side[s]) : g.giver);
export function canPick(g, s, i) {
  if (g.winner || !g.side[s] || g.found[i]) return false;
  if (g.sd) return !g.nm[i].includes(other(g.side[s]));
  return !!g.clue && g.side[s] !== g.giver && !g.nm[i].includes(g.giver);
}

function end(g, w, why) { g.winner = w; g.why = why; g.clue = null; }
function endTurn(g) {
  g.tok--;
  g.clue = null;
  g.guesses = 0;
  if (g.tok <= 0) { g.sd = true; g.log.push({ t: 'sd' }); return; }
  const nx = other(g.giver);
  if (left(g, nx)) g.giver = nx;   // a side with nothing left to clue just keeps guessing
}

export function guess(g, s, i) {
  if (!Number.isInteger(i) || i < 0 || i > 24 || !canPick(g, s, i)) return null;
  const by = judge(g, s), k = g.key[by][i], sd = g.sd;
  g.n++;
  g.log.push({ t: 'guess', sid: s, i, k, sd });
  if (k === 'x') end(g, 'lose', 'assassin');
  else if (k === 'n') {
    g.nm[i] += by;
    if (sd) end(g, 'lose', 'sd');
    else endTurn(g);
  } else {
    g.found[i] = true;
    g.guesses++;
    if (!total(g)) end(g, 'win', 'all');
    else if (!sd && !left(g, g.giver)) endTurn(g);
  }
  return k;
}

export function pass(g, s) {
  if (g.winner || g.sd || !g.clue || g.side[s] === g.giver || !g.side[s] || g.guesses < 1) return false;
  g.n++;
  g.log.push({ t: 'pass', sid: s });
  endTurn(g);
  return true;
}
