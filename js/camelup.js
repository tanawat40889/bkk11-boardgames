import { shuffle, rint } from './rng.js';

// Camel Up: bet on a camel race where camels carry each other.
export const MIN = 2, MAX = 8, FINISH = 16, START_COINS = 3;
export const COLORS = ['b', 'g', 'o', 'y', 'w'];
export const NAME = { b: 'ฟ้า', g: 'เขียว', o: 'ส้ม', y: 'เหลือง', w: 'ขาว' };
const TILES = [5, 3, 2], FINAL_PAY = [8, 5, 3, 2, 1];

export function newGame(sids, roll = () => rint(3) + 1) {
  const g = {
    sids: [...sids], coins: {}, stacks: {}, dice: [...COLORS], rolled: [], tiles: {}, bets: {}, desert: {}, fw: [], fl: [], cards: {},
    turn: rint(sids.length), leg: 1, log: [], over: false, res: null, lastLeg: null,
  };
  sids.forEach(s => { g.coins[s] = START_COINS; g.bets[s] = []; g.cards[s] = [...COLORS]; });
  COLORS.forEach(c => (g.tiles[c] = [...TILES]));
  for (const c of shuffle(COLORS)) { const sp = roll(); (g.stacks[sp] ||= []).push(c); }
  return g;
}

export const turnSid = g => g.sids[g.turn % g.sids.length];
export const where = (g, c) => { for (const [sp, st] of Object.entries(g.stacks)) { const i = st.indexOf(c); if (i >= 0) return { sp: +sp, i }; } return null; };
// Race order, leader first: further along wins; on the same space the camel on top leads.
export function order(g) {
  return [...COLORS].sort((a, b) => { const x = where(g, a), y = where(g, b); return y.sp - x.sp || y.i - x.i; });
}
const pay = (g, s, v) => { g.coins[s] = Math.max(0, g.coins[s] + v); };
const next = g => { g.turn = (g.turn + 1) % g.sids.length; };

// Move a camel (and everything riding on it). Returns the space it ends on.
export function move(g, c, v) {
  const { sp, i } = where(g, c);
  const unit = g.stacks[sp].splice(i);
  if (!g.stacks[sp].length) delete g.stacks[sp];
  let dest = sp + v, under = false;
  const d = g.desert[dest];
  if (d && dest <= FINISH) { pay(g, d.sid, 1); dest += d.type; under = d.type < 0; }
  if (dest > FINISH) dest = FINISH + 1;
  const old = g.stacks[dest] || [];
  g.stacks[dest] = under ? [...unit, ...old] : [...old, ...unit];
  return dest;
}

function endLeg(g) {
  const o = order(g), rows = {};
  for (const s of g.sids) {
    let d = 0;
    for (const b of g.bets[s]) d += b.c === o[0] ? b.v : b.c === o[1] ? 1 : -1;
    pay(g, s, d); rows[s] = d; g.bets[s] = [];
  }
  g.lastLeg = { leg: g.leg, first: o[0], second: o[1], rows };
  g.log.push({ t: 'leg', ...g.lastLeg });
  g.dice = [...COLORS]; g.rolled = []; g.desert = {};
  COLORS.forEach(c => (g.tiles[c] = [...TILES]));
  g.leg++;
}

function endGame(g) {
  const o = order(g), fin = { winner: o[0], loser: o.at(-1), w: [], l: [] };
  for (const [list, target, out] of [[g.fw, o[0], fin.w], [g.fl, o.at(-1), fin.l]]) {
    let k = 0;
    for (const b of list) {
      const v = b.c === target ? (FINAL_PAY[k++] ?? 1) : -1;
      pay(g, b.sid, v); out.push({ ...b, v });
    }
  }
  const max = Math.max(...g.sids.map(s => g.coins[s]));
  g.res = { ...fin, order: o, winners: g.sids.filter(s => g.coins[s] === max) };
  g.over = true;
}

const mine = (g, s) => !g.over && turnSid(g) === s;

export function roll(g, s, pick = () => rint(g.dice.length), val = () => rint(3) + 1) {
  if (!mine(g, s)) return null;
  const c = g.dice.splice(pick(), 1)[0], v = val();
  const dest = move(g, c, v);
  pay(g, s, 1);
  g.rolled.push({ c, v });
  g.log.push({ t: 'roll', sid: s, c, v });
  if (dest > FINISH) { endLeg(g); endGame(g); }
  else if (!g.dice.length) { endLeg(g); next(g); }
  else next(g);
  return { c, v };
}

export function takeBet(g, s, c) {
  if (!mine(g, s) || !g.tiles[c]?.length) return false;
  const v = g.tiles[c].shift();
  g.bets[s].push({ c, v });
  g.log.push({ t: 'bet', sid: s, c, v });
  next(g);
  return true;
}

export function canDesert(g, s, sp) {
  if (!Number.isInteger(sp) || sp < 2 || sp > FINISH || g.stacks[sp]?.length) return false;
  return [sp - 1, sp, sp + 1].every(x => !g.desert[x] || g.desert[x].sid === s);
}
export function placeDesert(g, s, sp, type) {
  if (!mine(g, s) || ![1, -1].includes(type) || !canDesert(g, s, sp)) return false;
  for (const k of Object.keys(g.desert)) if (g.desert[k].sid === s) delete g.desert[k];
  g.desert[sp] = { sid: s, type };
  g.log.push({ t: 'desert', sid: s, sp, type });
  next(g);
  return true;
}

export function finalBet(g, s, c, kind) {
  if (!mine(g, s) || !g.cards[s].includes(c) || !['w', 'l'].includes(kind)) return false;
  g.cards[s] = g.cards[s].filter(x => x !== c);
  (kind === 'w' ? g.fw : g.fl).push({ sid: s, c });
  g.log.push({ t: 'final', sid: s, kind });
  next(g);
  return true;
}
