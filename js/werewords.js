import { shuffle, rint } from './rng.js';
import { wordList } from './words.js';

// Werewords: the Mayor knows a secret word and answers yes/no questions with tokens.
// A Werewolf (also knows the word) steers people away; the Seer (knows it too) helps quietly.
export const MIN = 4, MAX = 10, RECENT = 80, OPTS = 3;
export const TOKENS = { yn: 36, maybe: 10, close: 1, off: 1 };
export const ANS = ['yes', 'no', 'maybe', 'close', 'off'];
const pot = a => (a === 'yes' || a === 'no' ? 'yn' : a);
export const wolvesFor = n => (n >= 7 ? 2 : 1);

export function newGame(sids, mayor, recent = [], wl = 'th') {
  const W = wordList(wl);
  let pool = W.map((_, i) => i).filter(i => !recent.includes(i));
  if (pool.length < OPTS) pool = W.map((_, i) => i);
  const opts = shuffle(pool).slice(0, OPTS), w = wolvesFor(sids.length), role = {};
  shuffle(sids).forEach((s, i) => (role[s] = i < w ? 'wolf' : i === w ? 'seer' : 'vil'));
  return { sids: [...sids], mayor, role, opts, optw: opts.map(i => W[i]), wi: null, word: null, wl, phase: 'pick', ready: [], log: [], tok: { ...TOKENS }, guesser: null, votes: {}, res: null, n: 0 };
}

export const knows = (g, s) => s === g.mayor || g.role[s] !== 'vil';
export const wolves = g => g.sids.filter(s => g.role[s] === 'wolf');
export const seer = g => g.sids.find(s => g.role[s] === 'seer');

export function pick(g, s, i) {
  if (g.phase !== 'pick' || s !== g.mayor || !Number.isInteger(i) || i < 0 || i >= g.opts.length) return false;
  g.wi = g.opts[i];
  g.word = g.optw[i];
  g.phase = 'role';
  g.n++;
  return true;
}

export function ready(g, s) {
  if (g.phase !== 'role' || !g.sids.includes(s) || g.ready.includes(s)) return false;
  g.ready.push(s);
  if (g.ready.length === g.sids.length) begin(g);
  return true;
}
export function begin(g) { if (g.phase !== 'role') return false; g.phase = 'ask'; g.n++; return true; }

export function answer(g, s, a, to = null) {
  if (g.phase !== 'ask' || s !== g.mayor || !ANS.includes(a) || g.tok[pot(a)] <= 0) return false;
  g.tok[pot(a)]--;
  g.log.push({ a, to: g.sids.includes(to) && to !== g.mayor ? to : null });
  g.n++;
  if (g.tok.yn <= 0) { g.phase = 'vote'; g.why = 'tokens'; }
  return true;
}

export function undo(g, s) {
  if (g.phase !== 'ask' || s !== g.mayor || !g.log.length) return false;
  g.tok[pot(g.log.pop().a)]++;
  g.n++;
  return true;
}

// Someone said the word: the werewolves now get one shot at naming the Seer.
export function correct(g, s, by) {
  if (g.phase !== 'ask' || s !== g.mayor || !g.sids.includes(by) || by === g.mayor) return false;
  g.guesser = by;
  g.phase = 'seer';
  g.n++;
  return true;
}

// Time or yes/no tokens ran out: everyone votes for a werewolf.
export function timeout(g) {
  if (g.phase !== 'ask') return false;
  g.phase = 'vote';
  g.why ||= 'time';
  g.n++;
  return true;
}

function finish(g, w, how, extra = {}) {
  g.res = { w, how, ...extra };
  g.phase = 'end';
  g.n++;
}

export const seerTargets = (g, s) => g.sids.filter(x => x !== s && g.role[x] !== 'wolf');
export function hunt(g, s, to) {
  if (g.phase !== 'seer' || g.role[s] !== 'wolf' || !seerTargets(g, s).includes(to)) return false;
  finish(g, to === seer(g) ? 'wolf' : 'vil', 'seer', { pick: to, by: s });
  return true;
}

export function tally(g) {
  const cnt = Object.fromEntries(g.sids.map(s => [s, 0]));
  Object.values(g.votes).forEach(t => cnt[t]++);
  const max = Math.max(...Object.values(cnt));
  return { cnt, top: g.sids.filter(s => cnt[s] === max) };
}
export function vote(g, s, to) {
  if (g.phase !== 'vote' || !g.sids.includes(s) || !g.sids.includes(to) || to === s) return false;
  g.votes[s] = to;
  g.n++;
  if (g.sids.every(x => g.votes[x])) {
    const { top } = tally(g);
    finish(g, top.some(x => g.role[x] === 'wolf') ? 'vil' : 'wolf', 'vote', { top });
  }
  return true;
}

export const winners = g => Object.fromEntries(g.sids.map(s => [s, g.res ? (g.role[s] === 'wolf') === (g.res.w === 'wolf') : false]));
