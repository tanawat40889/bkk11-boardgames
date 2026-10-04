import { shuffle, rint } from './rng.js';

// Abraca...what?: you see everyone's spell stones except your own. Name a spell you think you hold.
export const MIN = 2, MAX = 5, LIFE = 6, WIN = 8, HAND = 5, SECRET = 4;
export const SPELLS = {
  1: { n: 'มังกรโบราณ', d: 'ทอยเต๋า 1–3 คนอื่นทุกคนเสียชีวิตเท่านั้น', c: 355 },
  2: { n: 'ผู้พเนจรแห่งความมืด', d: 'คนอื่นทุกคนเสีย 1 · คุณได้ 1', c: 270 },
  3: { n: 'ฝันหวาน', d: 'ทอยเต๋า 1–3 คุณได้ชีวิตเท่านั้น', c: 325 },
  4: { n: 'นกฮูกราตรี', d: 'หยิบหินลับ 1 ก้อน (ดูได้คนเดียว +1 แต้มตอนจบรอบ)', c: 175 },
  5: { n: 'พายุสายฟ้า', d: 'คนซ้ายและขวาเสีย 1', c: 52 },
  6: { n: 'พายุหิมะ', d: 'คนซ้ายเสีย 1', c: 205 },
  7: { n: 'ลูกไฟ', d: 'คนขวาเสีย 1', c: 22 },
  8: { n: 'ยาวิเศษ', d: 'คุณได้ 1 ชีวิต', c: 130 },
};
// spell N exists N times -> 36 stones
export const stones = () => Object.keys(SPELLS).flatMap(k => Array(+k).fill(+k));
const die = () => rint(3) + 1;

export function newGame(sids) {
  const g = { sids: [...sids], pts: {}, round: 0, first: rint(sids.length), over: false, winners: null, log: [] };
  sids.forEach(s => (g.pts[s] = 0));
  deal(g);
  return g;
}

export function deal(g) {
  const d = shuffle(stones());
  g.round++;
  g.hands = {}; g.life = {}; g.owned = {};
  g.sids.forEach(s => { g.hands[s] = d.splice(0, HAND); g.life[s] = LIFE; g.owned[s] = []; });
  g.secret = d.splice(0, SECRET);
  g.pile = d;
  g.board = Object.fromEntries(Object.keys(SPELLS).map(k => [k, 0]));
  g.turn = (g.first + g.round - 1) % g.sids.length;
  g.min = 1; g.casts = 0; g.last = null; g.res = null;
}

export const turnSid = g => g.sids[g.turn];
const left = (g, s) => g.sids[(g.sids.indexOf(s) + 1) % g.sids.length];
const right = (g, s) => g.sids[(g.sids.indexOf(s) - 1 + g.sids.length) % g.sids.length];
const hurt = (g, s, n) => { g.life[s] = Math.max(0, g.life[s] - n); };
const heal = (g, s, n) => { g.life[s] = Math.min(LIFE, g.life[s] + n); };

function refill(g, s) { while (g.hands[s].length < HAND && g.pile.length) g.hands[s].push(g.pile.shift()); }
function endTurn(g, s) {
  refill(g, s);
  g.turn = (g.turn + 1) % g.sids.length;
  g.min = 1; g.casts = 0;
}

// Name spell n. roll is injectable for tests.
export function cast(g, s, n, roll = die) {
  if (g.over || g.res || turnSid(g) !== s || !SPELLS[n] || n < g.min) return null;
  const i = g.hands[s].indexOf(n), ev = { by: s, n, ok: i >= 0, roll: null, hit: [], gain: 0 };
  const others = g.sids.filter(x => x !== s);
  if (!ev.ok) {
    ev.roll = n === 1 ? roll() : null;                 // a failed Dragon costs a die roll
    ev.lost = ev.roll || 1;
    hurt(g, s, ev.lost);
    g.last = ev; g.log.push(ev);
    if (g.life[s] <= 0) endRound(g, s, 'dead'); else endTurn(g, s);
    return ev;
  }
  g.hands[s].splice(i, 1);
  g.board[n]++; g.casts++; g.min = n;
  const hit = (list, k) => { [...new Set(list)].forEach(x => { hurt(g, x, k); ev.hit.push(x); }); ev.dmg = k; };
  if (n === 1) { ev.roll = roll(); hit(others, ev.roll); }
  if (n === 2) { hit(others, 1); heal(g, s, 1); ev.gain = 1; }
  if (n === 3) { ev.roll = roll(); heal(g, s, ev.roll); ev.gain = ev.roll; }
  if (n === 4 && g.secret.length) { g.owned[s].push(g.secret.shift()); ev.owl = true; }
  if (n === 5) hit([left(g, s), right(g, s)], 1);
  if (n === 6) hit([left(g, s)], 1);
  if (n === 7) hit([right(g, s)], 1);
  if (n === 8) { heal(g, s, 1); ev.gain = 1; }
  g.last = ev; g.log.push(ev);
  if (g.sids.some(x => g.life[x] <= 0)) endRound(g, s, 'kill');
  else if (!g.hands[s].length) endRound(g, s, 'empty');
  return ev;
}

// Stop casting (only after at least one successful spell this turn).
export function stop(g, s) {
  if (g.over || g.res || turnSid(g) !== s || !g.casts) return false;
  endTurn(g, s);
  return true;
}

function endRound(g, actor, why) {
  const dead = g.sids.filter(s => g.life[s] <= 0), rows = {};
  for (const s of g.sids) {
    let p = 0;
    if (!dead.includes(s)) p = (why !== 'dead' && s === actor) ? 3 : 1;
    p += g.owned[s].length;
    g.pts[s] += p; rows[s] = p;
  }
  g.res = { why, actor, dead, rows, hands: g.hands, secret: g.secret, owned: g.owned };
  const max = Math.max(...Object.values(g.pts));
  if (max >= WIN) { g.over = true; g.winners = g.sids.filter(s => g.pts[s] === max); }
}

export function nextRound(g) {
  if (!g.res || g.over) return false;
  deal(g);
  return true;
}
