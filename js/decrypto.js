import { shuffle } from './rng.js';
import { wordList } from './words.js';

// Decrypto — 2 teams, each with 4 secret numbered words. Each round one player per team gets a 3-digit code
// (e.g. 3-1-4) and gives 3 clues. Their team must decode it; from round 2 the other team tries to intercept it.
// 2 interceptions = win, 2 miscommunications = lose. After 8 rounds: interceptions − miscommunications.
export const MIN = 4, MAX = 10, ROUNDS = 8, RECENT = 80;
export const other = t => (t === 'r' ? 'b' : 'r');
export const TEAMS = ['r', 'b'];

export function newGame(sids, recent = [], wl = 'th') {
  const W = wordList(wl);
  let pool = W.map((w, i) => i).filter(i => !recent.includes(i));
  if (pool.length < 8) pool = W.map((w, i) => i);
  const idx = shuffle(pool).slice(0, 8);
  const o = shuffle(sids), half = Math.ceil(o.length / 2), team = {}, mem = { r: [], b: [] };
  o.forEach((s, i) => { const t = i < half ? 'r' : 'b'; team[s] = t; mem[t].push(s); });
  const g = { sids: [...sids], team, mem, idx, kw: { r: idx.slice(0, 4).map(i => W[i]), b: idx.slice(4).map(i => W[i]) }, round: 0,
    enc: {}, code: {}, clues: {}, guess: {}, hist: { r: [], b: [] }, tok: { r: { i: 0, m: 0 }, b: { i: 0, m: 0 } }, phase: 'clue', res: null, winner: null, n: 0 };
  start(g);
  return g;
}
function start(g) {
  g.round++;
  for (const t of TEAMS) { g.enc[t] = g.mem[t][(g.round - 1) % g.mem[t].length]; g.code[t] = shuffle([1, 2, 3, 4]).slice(0, 3); }
  g.clues = { r: null, b: null };
  g.guess = { r: {}, b: {} };   // guess[x][t] = team t's guess at team x's code
  g.phase = 'clue'; g.res = null; g.n++;
}
export const intercepts = g => g.round >= 2;
const okCode = c => Array.isArray(c) && c.length === 3 && c.every(n => [1, 2, 3, 4].includes(n)) && new Set(c).size === 3;
const same = (a, b) => !!a && a.every((n, i) => n === b[i]);

export function clue(g, s, arr) {
  const t = g.team[s];
  if (g.phase !== 'clue' || !t || g.enc[t] !== s || g.clues[t] || !Array.isArray(arr) || arr.length !== 3) return false;
  const c = arr.map(x => String(x ?? '').trim().slice(0, 30));
  if (c.some(x => !x)) return false;
  g.clues[t] = c; g.n++;
  if (g.clues.r && g.clues.b) g.phase = 'guess';
  return true;
}
// Which guesses a player may still make: their own team's code (not the encryptor) and, from round 2, the other team's.
export function canGuess(g, s, x) {
  const t = g.team[s];
  if (g.phase !== 'guess' || !t || !TEAMS.includes(x) || g.guess[x][t]) return false;
  return x === t ? g.enc[t] !== s : intercepts(g);
}
export function guess(g, s, x, code) {
  if (!canGuess(g, s, x) || !okCode(code)) return false;
  g.guess[x][g.team[s]] = [...code]; g.n++;
  if (TEAMS.every(x => g.guess[x][x] && (!intercepts(g) || g.guess[x][other(x)]))) resolve(g);
  return true;
}
function resolve(g) {
  const res = {};
  for (const x of TEAMS) {
    const o = other(x), dec = same(g.guess[x][x], g.code[x]), int = intercepts(g) && same(g.guess[x][o], g.code[x]);
    if (!dec) g.tok[x].m++;
    if (int) g.tok[o].i++;
    res[x] = { clues: g.clues[x], code: g.code[x], dec: g.guess[x][x], int: g.guess[x][o] || null, decOk: dec, intOk: int, enc: g.enc[x] };
    g.hist[x].push({ round: g.round, clues: g.clues[x], code: g.code[x] });
  }
  g.res = res; g.phase = 'reveal';
  const won = TEAMS.filter(t => g.tok[t].i >= 2 || g.tok[other(t)].m >= 2);
  if (won.length === 1) g.winner = won[0];
  else if (won.length === 2 || g.round >= ROUNDS) {
    const sc = t => g.tok[t].i - g.tok[t].m;
    g.winner = sc('r') > sc('b') ? 'r' : sc('b') > sc('r') ? 'b' : 'tie';
  }
}
export function next(g) { if (g.phase !== 'reveal' || g.winner) return false; start(g); return true; }
