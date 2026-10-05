import { rint } from './rng.js';

// Cheese Thief: one thief, the rest are sleepyheads. Everyone rolls a secret die = the hour they wake up during the night.
export const MIN = 4, MAX = 8;
export const HOURS = 6;
export const followers = n => (n >= 6 ? 1 : 0);   // big tables: the thief secretly recruits a follower who wins with them

export function newGame(sids) {
  const die = {};
  for (const s of sids) die[s] = 1 + rint(HOURS);
  return { sids: [...sids], thief: sids[rint(sids.length)], follower: null, die, phase: 'role', hour: 0, ready: [], peek: {}, votes: {}, res: null };
}

export const awake = (g, h = g.hour) => (g.phase === 'night' ? g.sids.filter(s => g.die[s] === h) : []);
// What someone awake at hour h sees on the table.
export const cheeseAt = (g, h) => (h < g.die[g.thief] ? 'here' : h === g.die[g.thief] ? 'steal' : 'gone');
export const canPeek = (g, s) => g.phase === 'night' && g.die[s] === g.hour && awake(g).length === 1 && !(s in g.peek);

export function start(g) {
  if (g.phase !== 'role') return false;
  if (followers(g.sids.length)) g.phase = 'pick';
  else { g.phase = 'night'; g.hour = 1; }
  return true;
}

export function pickFollower(g, s, t) {
  if (g.phase !== 'pick' || s !== g.thief || t === s || !g.sids.includes(t)) return false;
  g.follower = t;
  return true;
}

// The night runs on a clock, so nobody can tell from the pace who is awake or whether anyone is.
export function advance(g) {
  if (g.phase === 'pick') {
    if (!g.follower) { const o = g.sids.filter(s => s !== g.thief); g.follower = o[rint(o.length)]; }
    g.phase = 'night'; g.hour = 1;
    return true;
  }
  if (g.phase !== 'night') return false;
  if (g.hour < HOURS) g.hour++;
  else { g.phase = 'day'; g.hour = 0; }
  return true;
}

// Awake alone -> may look at one other player's die.
export function peek(g, s, t) {
  if (!canPeek(g, s) || t === s || !g.sids.includes(t)) return false;
  g.peek[s] = { t, d: g.die[t] };
  return true;
}

// Everything player s has learned so far (only filled in once their hour has come).
export function memo(g, s) {
  const h = g.die[s], seen = g.phase !== 'role' && g.phase !== 'pick' && (g.phase !== 'night' || g.hour >= h);
  if (!seen) return null;
  return { h, with: g.sids.filter(x => x !== s && g.die[x] === h), cheese: cheeseAt(g, h), peek: g.peek[s] || null };
}

export function toVote(g) { if (g.phase !== 'day') return false; g.phase = 'vote'; g.votes = {}; return true; }

export function vote(g, s, t) {
  if (g.phase !== 'vote' || t === s || !g.sids.includes(s) || !g.sids.includes(t)) return false;
  g.votes[s] = t;
  if (g.sids.every(x => x in g.votes)) finish(g);
  return true;
}

// The thief is caught when nobody has more votes than them (a tie that includes the thief counts as caught).
export function finish(g) {
  if (g.phase !== 'vote') return false;
  const tally = Object.fromEntries(g.sids.map(s => [s, 0]));
  for (const t of Object.values(g.votes)) tally[t]++;
  const max = Math.max(...Object.values(tally));
  const caught = max > 0 && tally[g.thief] === max;
  g.res = { tally, max, caught, winner: caught ? 'mice' : 'thief' };
  g.phase = 'end';
  return true;
}

export const team = (g, s) => (s === g.thief || s === g.follower ? 'thief' : 'mice');
