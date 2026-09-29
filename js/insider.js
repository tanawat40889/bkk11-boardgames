import { rint } from './rng.js';
import { WORDS } from './words.js';

export const MIN = 4, MAX = 10, RECENT = 60;
export const ROLE = { master: '🎓 ผู้คุมเกม', insider: '🕵️ อินไซเดอร์', common: '🙂 คนทั่วไป' };

export function deal(sids, master, recent = []) {
  let pool = WORDS.map((_, i) => i).filter(i => !recent.includes(i));
  if (!pool.length) pool = WORDS.map((_, i) => i);
  const wi = pool[rint(pool.length)];
  const others = sids.filter(s => s !== master);
  const insider = others[rint(others.length)];
  return { sids: [...sids], master, insider, wi, word: WORDS[wi], guesser: null, v1: {}, v2: {}, cand: null, result: null, used: 0, ready: [] };
}

export const roleOf = (g, s) => (s === g.master ? 'master' : s === g.insider ? 'insider' : 'common');

// Vote 1: "Is the guesser the Insider?" — strict majority of all players.
export const v1Yes = g => g.sids.filter(s => g.v1[s] === true).length * 2 > g.sids.length;

// Vote 2 targets: anyone but yourself and the (public) Master.
export const canAccuse = (g, voter, t) => g.sids.includes(t) && t !== voter && t !== g.master;

export function v2Top(g) {
  const cnt = {};
  g.sids.filter(s => s !== g.master).forEach(s => (cnt[s] = 0));
  for (const [v, t] of Object.entries(g.v2)) if (canAccuse(g, v, t)) cnt[t]++;
  const max = Math.max(...Object.values(cnt));
  return { cnt, top: Object.keys(cnt).filter(s => cnt[s] === max) };
}

// Final: accused is Insider -> Master + commons win; otherwise Insider wins. 'none' = word not found in time.
export function outcome(g, accused, how) {
  if (how === 'timeout') return { w: 'none', how };
  return { w: accused === g.insider ? 'common' : 'insider', accused, how };
}

export const winners = (g, r) => Object.fromEntries(g.sids.map(s => [s, r.w === 'none' ? false : r.w === 'insider' ? s === g.insider : s !== g.insider]));
