import { rint } from './rng.js';

// Liar's Dice — everyone rolls hidden dice, then bids on how many of a face are on the whole table.
// Call "liar" on the last bid: whoever was wrong loses a die. Last player with dice wins.
export const MIN = 2, MAX = 8;
export function newGame(sids, dice = 5, wild = 1) {
  const g = { sids: [...sids], cnt: {}, dice: {}, wild: !!wild, bid: null, turn: sids[rint(sids.length)], phase: 'bid', res: null, winner: null, round: 1, log: [], n: 0 };
  for (const s of sids) g.cnt[s] = dice;
  roll(g);
  return g;
}
function roll(g) { for (const s of g.sids) g.dice[s] = Array.from({ length: g.cnt[s] }, () => 1 + rint(6)).sort((a, b) => a - b); }
export const alive = g => g.sids.filter(s => g.cnt[s] > 0);
export const total = g => alive(g).reduce((a, s) => a + g.cnt[s], 0);
const next = (g, s) => { let i = g.sids.indexOf(s); do i = (i + 1) % g.sids.length; while (!g.cnt[g.sids[i]]); return g.sids[i]; };
// With wild ones, ones count as every face, so nobody bids on ones.
export const faces = g => (g.wild ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6]);
export function valid(g, q, f) {
  if (!Number.isInteger(q) || !faces(g).includes(f) || q < 1 || q > (g.total ?? total(g))) return false;   // (screens get a public copy with .total)
  const b = g.bid;
  return !b || q > b.q || (q === b.q && f > b.f);
}
// The lowest legal bid for a face (used to preset the picker).
export function minQ(g, f) { const b = g.bid; return !b ? 1 : f > b.f ? b.q : b.q + 1; }
export function bid(g, s, q, f) {
  if (g.phase !== 'bid' || s !== g.turn || !valid(g, q, f)) return false;
  g.bid = { by: s, q, f }; g.log.push({ by: s, q, f }); if (g.log.length > 40) g.log.shift();
  g.turn = next(g, s); g.n++;
  return true;
}
export const count = (g, f) => alive(g).reduce((a, s) => a + g.dice[s].filter(d => d === f || (g.wild && d === 1)).length, 0);
export function call(g, s) {
  if (g.phase !== 'bid' || s !== g.turn || !g.bid) return false;
  const have = count(g, g.bid.f), loser = have >= g.bid.q ? s : g.bid.by;
  g.res = { by: s, bid: g.bid, have, loser, dice: { ...g.dice } };
  g.cnt[loser]--; g.res.out = !g.cnt[loser];
  g.phase = 'reveal';
  if (alive(g).length === 1) g.winner = alive(g)[0];
  g.n++;
  return true;
}
export function nextRound(g) {
  if (g.phase !== 'reveal' || g.winner) return false;
  const l = g.res.loser;
  g.turn = g.cnt[l] ? l : next(g, l);   // the loser starts; if they are out, the next player does
  g.bid = null; g.log = []; g.phase = 'bid'; g.round++; roll(g); g.n++;
  return true;
}
