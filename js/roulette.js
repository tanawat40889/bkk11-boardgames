import { shuffle, rint } from './rng.js';

// World Championship Russian Roulette (Tuesday Knight Games). Everyone plays every phase at the same time.
// Each player runs a team of 3 teammates + 1 captain, and a 7-card "gun": 6 CLICK + 1 BULLET.
export const MIN = 2, MAX = 6, TEAM = 4, WIN = 15, MAXBID = 5;
// Action cards: the real box has 30 with more kinds; these four are this app's versions of the ones we could confirm.
export const CARDS = {
  peek: { n: 'แอบส่อง', d: 'ดูการ์ด 3 ใบบนสุดในปืนของคุณ (ก่อนล็อกเดิมพัน)', when: 'bid', k: 8 },
  air: { n: 'ปืนลม', d: 'ทิ้งการ์ดใบบนสุดในปืนของคุณ 1 ใบโดยไม่ต้องดู (ช่วงจับโกง)', when: 'challenge', k: 8 },
  bang: { n: 'ฉันยิงแก!', d: 'เลือกผู้เล่น 1 คน ให้เหนี่ยวไกเพิ่ม 1 ครั้ง ไม่ได้แต้มเพิ่ม (ช่วงจับโกง)', when: 'challenge', k: 7 },
  change: { n: 'เปลี่ยนใจ', d: 'เปลี่ยนเดิมพันของคุณเป็นเลขใหม่ 0–5 (ช่วงจับโกง)', when: 'challenge', k: 7 },
};
const freshGun = () => [...Array(6).fill('C'), 'B'];

export function newGame(sids) {
  const g = { sids: [...sids], team: {}, pts: {}, gun: {}, hand: {}, deck: shuffle(Object.entries(CARDS).flatMap(([k, c]) => Array(c.k).fill(k))), disc: [], round: 0, log: [], winner: null, over: false };
  for (const s of sids) { g.team[s] = TEAM; g.pts[s] = 0; g.gun[s] = freshGun(); g.hand[s] = []; draw(g, s, 1); }
  newRound(g);
  return g;
}

function draw(g, s, n) {
  for (let i = 0; i < n; i++) {
    if (!g.deck.length) { g.deck = shuffle(g.disc); g.disc = []; }
    if (g.deck.length) g.hand[s].push(g.deck.pop());
  }
}
const log = (g, e) => { g.log.push(e); if (g.log.length > 40) g.log.shift(); };
export const inGame = (g, s) => g.team[s] > 0;
export const players = g => g.sids.filter(s => inGame(g, s));

function newRound(g) {
  g.round++; g.phase = 'pocket';
  g.pocket = {}; g.bid = {}; g.acc = {}; g.cdone = {}; g.extra = {}; g.dead = {}; g.pulled = {}; g.fl = {}; g.peek = {}; g.res = null; g.k = 0; g.lastPull = null;
}

// A character dies: tile flipped, an action card as severance pay, and the gun is reset to 1 BULLET + 6 CLICK.
function kill(g, s, why) {
  if (g.dead[s]) return;
  g.dead[s] = why; g.team[s]--;
  log(g, { t: 'dead', sid: s, why, captain: g.team[s] === 0 });
  draw(g, s, 1);
}

export function pocket(g, s, card) {
  if (g.phase !== 'pocket' || !inGame(g, s) || s in g.pocket || !['C', 'B'].includes(card) || !g.gun[s].includes(card)) return false;
  g.gun[s].splice(g.gun[s].indexOf(card), 1);
  g.pocket[s] = card;
  if (players(g).every(x => x in g.pocket)) { g.phase = 'bid'; for (const x of players(g)) g.gun[x] = shuffle(g.gun[x]); }   // spin
  return true;
}

export function bid(g, s, n) {
  if (g.phase !== 'bid' || !inGame(g, s) || s in g.bid || !Number.isInteger(n) || n < 0 || n > MAXBID) return false;
  g.bid[s] = n;
  if (players(g).every(x => x in g.bid)) { g.phase = 'challenge'; log(g, { t: 'bids', bids: { ...g.bid } }); }
  return true;
}

export function accuse(g, s, t) {
  if (g.phase !== 'challenge' || !inGame(g, s) || s in g.acc || s === t || !inGame(g, t) || g.cdone[s]) return false;
  g.acc[s] = t;
  return true;
}
export function ready(g, s) {
  if (g.phase !== 'challenge' || !inGame(g, s)) return false;
  g.cdone[s] = true;
  if (players(g).every(x => g.cdone[x])) resolveChallenges(g);
  return true;
}

export function play(g, s, card, arg) {
  const i = g.hand[s]?.indexOf(card);
  if (i == null || i < 0 || !inGame(g, s) || CARDS[card].when !== g.phase) return false;
  if (card === 'peek') { if (s in g.bid) return false; g.peek[s] = g.gun[s].slice(0, 3); }
  else if (card === 'air') { if (g.dead[s] || !g.gun[s].length) return false; (g.fl[s] ||= []).push(g.gun[s].shift()); }
  else if (card === 'bang') { if (!inGame(g, arg) || g.dead[arg]) return false; g.extra[arg] = (g.extra[arg] || 0) + 1; }
  else if (card === 'change') { if (!Number.isInteger(arg) || arg < 0 || arg > MAXBID) return false; g.bid[s] = arg; }
  g.hand[s].splice(i, 1); g.disc.push(card);
  log(g, { t: 'card', sid: s, card, to: card === 'bang' ? arg : null, bid: card === 'change' ? arg : null });
  return true;
}

function resolveChallenges(g) {
  const by = {};
  for (const [a, t] of Object.entries(g.acc)) (by[t] ||= []).push(a);
  g.reveal = {};
  for (const [t, accusers] of Object.entries(by)) {
    const cheat = g.pocket[t] === 'B';
    g.reveal[t] = g.pocket[t];
    log(g, { t: 'accuse', to: t, by: accusers, cheat });
    if (cheat) { kill(g, t, 'caught'); for (const a of accusers) draw(g, a, 3); }
    else {
      draw(g, t, accusers.length);
      for (const a of accusers) { const c = g.gun[a].indexOf('C'); if (c >= 0) g.gun[a][c] = 'B'; else g.gun[a].push('B'); g.gun[a] = shuffle(g.gun[a]); }
    }
  }
  g.phase = 'trigger'; g.k = 0;
  for (const s of players(g)) g.pulled[s] = 0;
}

export const pullsOf = (g, s) => (g.bid[s] || 0) + (g.extra[s] || 0);
// One trigger pull for everybody still standing who has pulls left. Returns false when the phase is over.
export function pull(g) {
  if (g.phase !== 'trigger') return false;
  g.k++;
  const now = {};
  for (const s of players(g)) {
    if (g.dead[s] || g.pulled[s] >= pullsOf(g, s)) continue;
    const c = g.gun[s].shift() || 'C';     // an empty gun just clicks
    g.pulled[s]++; now[s] = c; (g.fl[s] ||= []).push(c);
    if (c === 'B') kill(g, s, 'shot');
  }
  g.lastPull = { k: g.k, cards: now };
  if (!Object.keys(now).length || players(g).every(s => g.dead[s] || g.pulled[s] >= pullsOf(g, s))) finishRound(g);
  return true;
}

function finishRound(g) {
  const gain = {};
  for (const s of g.sids) {
    if (!inGame(g, s) && !g.dead[s]) continue;
    if (g.dead[s]) { gain[s] = 0; continue; }
    gain[s] = (g.bid[s] || 0) + 1;
    g.pts[s] += gain[s];
  }
  // dead characters' guns are reset; everyone else gets back the flipped cards and the pocketed one
  for (const s of g.sids) {
    if (g.dead[s]) g.gun[s] = freshGun();
    else g.gun[s].push(...(g.fl[s] || []), ...(g.pocket[s] ? [g.pocket[s]] : []));
  }
  g.res = { gain };
  g.phase = 'score';
  const alive = players(g);
  const top = Math.max(...alive.map(s => g.pts[s]), -1), leaders = alive.filter(s => g.pts[s] === top);
  if (alive.length <= 1) { g.winner = alive[0] || null; g.over = true; }
  else if (top >= WIN && leaders.length === 1) { g.winner = leaders[0]; g.over = true; }
  if (g.over) g.phase = 'end';
}

export function nextRound(g) { if (g.phase !== 'score') return false; newRound(g); return true; }
