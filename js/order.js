import { shuffle, rint } from './rng.js';

// Order Overload: Cafe (Oink Games) — co-op memory. Orders are read out once, dealt face down, then players
// must call orders that sit in SOMEONE ELSE's hand. Wrong call = your smile token flips and you stop calling.
export const MIN = 2, MAX = 6, LEVELS = 7, COPIES = 3;
// Menu: base drink x temperature, deliberately similar so they are easy to mix up.
export const BASES = [
  ['americano', 'อเมริกาโน่', 'HI'], ['latte', 'ลาเต้', 'HIF'], ['cappu', 'คาปูชิโน่', 'HI'], ['mocha', 'มอคค่า', 'HIF'],
  ['espresso', 'เอสเปรสโซ่', 'HI'], ['caramel', 'คาราเมลมัคคิอาโต้', 'HI'], ['thaitea', 'ชาไทย', 'IF'], ['green', 'ชาเขียว', 'HIF'],
  ['cocoa', 'โกโก้', 'HIF'], ['milk', 'นมสด', 'I'], ['lemontea', 'ชามะนาว', 'I'],
];
export const TEMP = { H: 'ร้อน', I: 'เย็น', F: 'ปั่น' };
export const OTHER = [['soda', 'อิตาเลียนโซดา'], ['honey', 'น้ำผึ้งมะนาว'], ['croissant', 'ครัวซองต์'], ['cake', 'ชีสเค้ก']];
export const MENU = {};
for (const [k, n, ts] of BASES) for (const t of ts) MENU[`${k}.${t}`] = { n: `${n}${TEMP[t]}`, b: k, t };
for (const [k, n] of OTHER) MENU[k] = { n, b: k, t: null };
export const ITEMS = Object.keys(MENU);            // 28 items x 3 copies = 84 cards, like the real deck
export const ABILITIES = { drop: 'ทิ้งออร์เดอร์ 1 ใบจากมือ (ห้ามทิ้งใบสุดท้าย)', hint: 'ให้เพื่อนบอกพยัญชนะตัวแรกของออร์เดอร์ 1 ใบในมือ' };
export const need = n => (n <= 2 ? 1 : n <= 4 ? 2 : 3);     // players who must empty their hand to clear a level
export const lives0 = n => (n === 2 ? 2 : 1);              // 2 players: two tokens and two ability cards each

export function newGame(sids) {
  const n = sids.length, ab = {};
  sids.forEach(s => { ab[s] = n === 2 ? ['drop', 'hint'] : [Object.keys(ABILITIES)[rint(2)]]; });
  const g = { sids: [...sids], level: 0, taker: rint(n), ab, used: {}, phase: 'read', over: null, best: 0 };
  sids.forEach(s => (g.used[s] = []));
  startLevel(g, 1);
  return g;
}

function startLevel(g, lv) {
  const n = g.sids.length, deck = shuffle(ITEMS.flatMap(i => Array(COPIES).fill(i)));
  g.level = lv; g.phase = 'read'; g.ri = 0;
  g.orders = deck.slice(0, lv * n);                 // read aloud in this order
  const dealt = shuffle(g.orders);
  g.hand = {}; g.lives = {};
  g.sids.forEach((s, i) => { g.hand[s] = dealt.slice(i * lv, (i + 1) * lv); g.lives[s] = lives0(n); });
  g.table = []; g.last = null; g.hints = [];
  g.turn = g.sids[(g.taker + 1) % n];
}

export const done = g => g.sids.filter(s => !g.hand[s].length).length;
const canCall = (g, s) => g.lives[s] > 0;
function nextTurn(g) {
  const i = g.sids.indexOf(g.turn), n = g.sids.length;
  for (let k = 1; k <= n; k++) { const t = g.sids[(i + k) % n]; if (canCall(g, t)) { g.turn = t; return; } }
  g.turn = null;
}
function check(g) {
  if (done(g) >= need(g.sids.length)) { g.phase = 'clear'; g.best = g.level; if (g.level >= LEVELS) { g.phase = 'over'; g.over = 'win'; } return true; }
  if (!g.sids.some(s => canCall(g, s))) { g.phase = 'over'; g.over = 'lose'; return true; }
  return false;
}

// Reading: one order at a time (the app advances it on a timer).
export function readNext(g) {
  if (g.phase !== 'read') return false;
  if (++g.ri >= g.orders.length) { g.phase = 'play'; g.ri = null; }
  return true;
}

// Call an order. The first player clockwise from the caller (never the caller) who holds it serves it.
export function call(g, s, item) {
  if (g.phase !== 'play' || s !== g.turn || !MENU[item]) return false;
  const i = g.sids.indexOf(s), n = g.sids.length;
  let hit = null;
  for (let k = 1; k < n; k++) { const t = g.sids[(i + k) % n]; if (g.hand[t].includes(item)) { hit = t; break; } }
  if (hit) { g.hand[hit].splice(g.hand[hit].indexOf(item), 1); g.table.push({ item, by: s, from: hit }); }
  else g.lives[s]--;
  g.last = { item, by: s, hit };
  if (!check(g)) nextTurn(g);
  return true;
}

// Single-use abilities, usable any time during play (even after your token flipped).
export function useAbility(g, s, kind, arg) {
  if (g.phase !== 'play' || !g.ab[s].includes(kind) || g.used[s].includes(kind)) return false;
  if (kind === 'drop') {
    const h = g.hand[s];
    if (h.length < 2 || !(arg in h)) return false;
    h.splice(+arg, 1);
  } else {
    const t = arg;
    if (t === s || !g.sids.includes(t) || !g.hand[t].length) return false;
    const card = g.hand[t][rint(g.hand[t].length)];
    g.hints.push({ by: s, to: t, id: card, ch: firstConsonant(MENU[card].n) });
  }
  g.used[s].push(kind);
  if (!check(g)) { if (!canCall(g, g.turn)) nextTurn(g); }
  return true;
}
// Thai leading vowels (เ แ โ ใ ไ) are written before the consonant they follow; skip them.
export const firstConsonant = w => [...w].find(c => !'เแโใไ'.includes(c)) || w[0];

export function nextLevel(g) {
  if (g.phase !== 'clear') return false;
  g.taker = (g.taker + 1) % g.sids.length;
  startLevel(g, g.level + 1);
  return true;
}
