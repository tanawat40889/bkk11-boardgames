import { shuffle, rint } from './rng.js';

// Salem 1692: accuse your neighbours until every Witch card is revealed — while the witches kill at night.
export const MIN = 4, MAX = 10;
// players -> [Not a Witch, Witch, Constable, Tryal cards per player]
const TRY = { 4: [18, 1, 1, 5], 5: [23, 1, 1, 5], 6: [27, 2, 1, 5], 7: [32, 2, 1, 5], 8: [29, 2, 1, 4], 9: [33, 2, 1, 4], 10: [27, 2, 1, 3] };
export const CARDS = {
  acc: { k: 'red', v: 1, n: 'กล่าวหา', d: 'กล่าวหา 1 แต้ม' },
  evi: { k: 'red', v: 3, n: 'หลักฐาน', d: 'กล่าวหา 3 แต้ม' },
  wit: { k: 'red', v: 7, n: 'พยาน', d: 'กล่าวหา 7 แต้ม (เปิดการ์ดทันที)' },
  alibi: { k: 'green', n: 'ข้ออ้าง', d: 'เอาการ์ดกล่าวหาออกจากผู้เล่น 1 คน สูงสุด 3 ใบ', t: 1, self: true },
  stocks: { k: 'green', n: 'ขื่อคา', d: 'ผู้เล่น 1 คนต้องข้ามตาถัดไป', t: 1 },
  scape: { k: 'green', n: 'แพะรับบาป', d: 'ย้ายการ์ดทั้งหมดหน้าผู้เล่นคนหนึ่ง ไปให้อีกคน', t: 2, self: true },
  arson: { k: 'green', n: 'วางเพลิง', d: 'ผู้เล่น 1 คนทิ้งการ์ดในมือทั้งหมด', t: 1 },
  curse: { k: 'green', n: 'คำสาป', d: 'ทิ้งการ์ดสีน้ำเงิน 1 ใบของผู้เล่น 1 คน', t: 1, self: true },
  rob: { k: 'green', n: 'ปล้น', d: 'เอาการ์ดในมือทั้งหมดของคนหนึ่ง ไปให้อีกคน', t: 2, self: true },
  asylum: { k: 'blue', n: 'ที่ลี้ภัย', d: 'ผู้ถือไม่ถูกแม่มดฆ่าตอนกลางคืน', t: 1, self: true },
  piety: { k: 'blue', n: 'ศรัทธา', d: 'ผู้ถือไม่ถูกกล่าวหาได้', t: 1, self: true },
  match: { k: 'blue', n: 'แม่สื่อ', d: 'ถ้าผู้ถือแม่สื่อคนหนึ่งตาย อีกคนตายตาม', t: 1, self: true },
  cat: { k: 'blue', n: 'แมวดำ', d: 'ตอนสมคบคิด ผู้ถือต้องเปิดการ์ดตัวเอง 1 ใบ' },
  night: { k: 'black', n: 'กลางคืน', d: 'แม่มดเลือกฆ่า 1 คน' },
  consp: { k: 'black', n: 'สมคบคิด', d: 'ทุกคนหยิบการ์ดตัวตน 1 ใบจากคนข้างๆ' },
};
const COUNT = { acc: 35, evi: 5, wit: 1, alibi: 3, stocks: 3, scape: 2, arson: 1, curse: 1, rob: 1, asylum: 1, piety: 1, match: 2 };
export const LIMIT = 7;   // accusation points that force a reveal

export function newGame(sids) {
  const n = sids.length, [nw, w, c, per] = TRY[n];
  const td = shuffle([...Array(nw).fill('N'), ...Array(w).fill('W'), ...Array(c).fill('C')]);
  const g = {
    sids: [...sids], alive: [...sids], tryal: {}, witch: {}, hand: {}, front: {}, deck: [], discard: [], turn: rint(n), played: 0,
    phase: 'dawn', dawn: {}, reveal: null, night: null, confess: null, queue: [], cat: null, log: [], last: null, winner: null,
  };
  sids.forEach((s, i) => {
    g.tryal[s] = td.slice(i * per, (i + 1) * per).map(t => ({ t, up: false }));
    g.witch[s] = g.tryal[s].some(x => x.t === 'W');
    g.front[s] = { red: [], blue: [], stocks: 0 };
  });
  const d = shuffle(Object.entries(COUNT).flatMap(([id, k]) => Array(k).fill(id)));
  sids.forEach(s => (g.hand[s] = d.splice(0, 3)));
  g.deck = [...shuffle([...d, 'consp']), 'night'];     // Night starts at the bottom
  return g;
}

export const turnSid = g => g.sids[g.turn % g.sids.length];
export const points = (g, s) => g.front[s].red.reduce((a, b) => a + b, 0);
export const hidden = (g, s) => g.tryal[s].filter(x => !x.up).length;
export const witches = g => g.alive.filter(s => g.witch[s]);
export const constable = g => g.alive.find(s => g.tryal[s].some(x => x.t === 'C' && !x.up)) || null;
const has = (g, s, b) => g.front[s].blue.includes(b);
const say = (g, e) => { g.log.push(e); if (g.log.length > 60) g.log.shift(); };

function checkWin(g) {
  if (g.winner) return;
  if (!g.sids.some(s => g.tryal[s].some(x => x.t === 'W' && !x.up))) g.winner = 'T';
  else if (g.alive.every(s => g.witch[s])) g.winner = 'W';
  if (g.winner) g.phase = 'end';
}

function kill(g, s, why) {
  if (!g.alive.includes(s)) return;
  g.alive = g.alive.filter(x => x !== s);
  g.tryal[s].forEach(x => (x.up = true));
  const f = g.front[s], lover = f.blue.includes('match') ? g.alive.find(x => has(g, x, 'match')) : null;
  g.discard.push(...g.hand[s], ...f.blue.filter(b => b !== 'cat'));
  if (f.blue.includes('cat')) g.cat = null;
  g.hand[s] = []; g.front[s] = { red: [], blue: [], stocks: 0 };
  say(g, { t: 'dead', sid: s, why });
  if (lover) kill(g, lover, 'match');
}

function flip(g, s, i) {
  const c = g.tryal[s][i];
  if (!c || c.up) return null;
  c.up = true;
  say(g, { t: 'flip', sid: s, card: c.t });
  if (c.t === 'W') kill(g, s, 'witch');
  else if (!hidden(g, s)) kill(g, s, 'tryal');
  return c.t;
}

function drawCard(g) {
  if (!g.deck.length) {
    const rest = g.discard.filter(c => c !== 'night'), hadNight = g.discard.includes('night');
    g.deck = [...shuffle(rest), ...(hadNight ? ['night'] : [])];
    g.discard = [];
  }
  return g.deck.shift() || null;
}

function advance(g) {
  for (let k = 0; k < g.sids.length * 2; k++) {
    g.turn = (g.turn + 1) % g.sids.length;
    const s = turnSid(g);
    if (!g.alive.includes(s)) continue;
    if (g.front[s].stocks > 0) { g.front[s].stocks--; say(g, { t: 'skip', sid: s }); continue; }
    break;
  }
  g.played = 0;
}

// Resolve black cards that were drawn, then hand control back to the turn player.
function run(g) {
  checkWin(g);
  if (g.winner) return;
  while (g.queue.length) {
    const c = g.queue.shift();
    g.discard.push(c);
    if (c === 'consp') { conspiracy(g); checkWin(g); if (g.winner) return; continue; }
    if (witches(g).length) { g.phase = 'night'; g.night = { kill: {}, save: null, saved: false }; say(g, { t: 'night' }); return; }
  }
  if (!g.alive.includes(turnSid(g))) advance(g);
  g.phase = 'turn';
}

function conspiracy(g) {
  say(g, { t: 'consp' });
  if (g.cat && g.alive.includes(g.cat)) {
    const idx = g.tryal[g.cat].map((x, i) => (x.up ? -1 : i)).filter(i => i >= 0);
    flip(g, g.cat, idx[rint(idx.length)]);
  }
  const ring = g.sids.filter(s => g.alive.includes(s));
  if (ring.length < 2) return;
  // everyone simultaneously takes one face-down card from the next player
  const taken = ring.map(s => { const idx = g.tryal[s].map((x, i) => (x.up ? -1 : i)).filter(i => i >= 0); return g.tryal[s].splice(idx[rint(idx.length)], 1)[0]; });
  ring.forEach((s, i) => {
    const card = taken[(i + 1) % ring.length];
    g.tryal[s].push(card);
    if (card.t === 'W') g.witch[s] = true;
  });
  g.last = { t: 'consp' };
}

/* ── dawn: the witches hand out the Black Cat ── */
export function dawnPick(g, s, t) {
  if (g.phase !== 'dawn' || !g.witch[s] || !g.alive.includes(t)) return false;
  g.dawn[s] = t;
  const w = witches(g);
  if (!w.every(x => g.dawn[x])) return true;
  g.cat = majority(w.map(x => g.dawn[x]));
  g.front[g.cat].blue.push('cat');
  say(g, { t: 'cat', sid: g.cat });
  g.phase = 'turn';
  return true;
}
function majority(list) {
  const c = {};
  list.forEach(x => (c[x] = (c[x] || 0) + 1));
  const max = Math.max(...Object.values(c)), top = Object.keys(c).filter(k => c[k] === max);
  return top[rint(top.length)];
}

/* ── your turn: draw two, or play cards then end ── */
const myTurn = (g, s) => g.phase === 'turn' && turnSid(g) === s;

export function draw(g, s) {
  if (!myTurn(g, s) || g.played) return false;
  for (let k = 0; k < 2; k++) {
    const c = drawCard(g);
    if (!c) break;
    if (CARDS[c].k === 'black') g.queue.push(c); else g.hand[s].push(c);
  }
  say(g, { t: 'draw', sid: s });
  advance(g);
  run(g);
  return true;
}

export function endTurn(g, s) {
  if (!myTurn(g, s) || !g.played) return false;
  advance(g);
  run(g);
  return true;
}

export function canTarget(g, s, id, a) {
  const C = CARDS[id];
  if (!C || !g.alive.includes(a)) return false;
  if (C.k === 'red') return a !== s && !has(g, a, 'piety');
  return C.self || a !== s;
}

// a = target (or "from" for two-target cards), b = "to"
export function play(g, s, i, a, b) {
  if (!myTurn(g, s)) return false;
  const id = g.hand[s][i], C = CARDS[id];
  if (!C || C.k === 'black' || id === 'cat' || !canTarget(g, s, id, a)) return false;
  if (C.t === 2 && (!g.alive.includes(b) || a === b)) return false;
  g.hand[s].splice(i, 1);
  g.played++;
  const fa = g.front[a];
  say(g, { t: 'play', sid: s, card: id, a, b: C.t === 2 ? b : null });
  if (C.k === 'red') { fa.red.push(C.v); g.discard.push(id); }
  else if (C.k === 'blue') { fa.blue.push(id); if (id === 'piety') fa.red = []; }
  else {
    g.discard.push(id);
    if (id === 'alibi') { fa.red.sort((x, y) => y - x); fa.red.splice(0, 3); }
    if (id === 'stocks') fa.stocks++;
    if (id === 'arson') { g.discard.push(...g.hand[a]); g.hand[a] = []; }
    if (id === 'curse' && fa.blue.length) {
      const k = rint(fa.blue.length), bl = fa.blue.splice(k, 1)[0];
      if (bl === 'cat') g.cat = null; else g.discard.push(bl);
    }
    if (id === 'rob') { g.hand[b].push(...g.hand[a]); g.hand[a] = []; }
    if (id === 'scape') {
      const fb = g.front[b];
      fb.blue.push(...fa.blue); fb.stocks += fa.stocks;
      if (fa.blue.includes('cat')) g.cat = b;
      if (!fb.blue.includes('piety')) fb.red.push(...fa.red);
      g.front[a] = { red: [], blue: [], stocks: 0 };
      if (points(g, b) >= LIMIT) { g.phase = 'reveal'; g.reveal = { by: s, target: b }; }
    }
  }
  if (C.k === 'red' && points(g, a) >= LIMIT) { g.phase = 'reveal'; g.reveal = { by: s, target: a }; }
  return true;
}

export function revealPick(g, s, i) {
  if (g.phase !== 'reveal' || g.reveal.by !== s) return false;
  const t = g.reveal.target;
  if (flip(g, t, i) == null) return false;
  if (g.alive.includes(t)) g.front[t].red = [];
  g.reveal = null;
  g.phase = 'turn';
  checkWin(g);
  if (!g.winner && !g.alive.includes(turnSid(g))) { advance(g); run(g); }
  return true;
}

/* ── night: witches kill, the constable protects, then everyone may confess ── */
export function nightKill(g, s, t) {
  if (g.phase !== 'night' || !g.alive.includes(s) || !g.witch[s] || !g.alive.includes(t) || t === s) return false;
  g.night.kill[s] = t;
  nightReady(g);
  return true;
}
export function nightSave(g, s, t) {
  if (g.phase !== 'night' || constable(g) !== s || !g.alive.includes(t) || t === s) return false;
  g.night.save = t; g.night.saved = true;
  nightReady(g);
  return true;
}
function nightReady(g) {
  const w = witches(g);
  if (!w.every(x => g.night.kill[x]) || (constable(g) && !g.night.saved)) return;
  g.night.target = majority(w.map(x => g.night.kill[x]));
  g.phase = 'confess'; g.confess = {};
}
// i = index of one of your own face-down cards to reveal (you are then safe tonight), or null to stay silent.
export function confess(g, s, i) {
  if (g.phase !== 'confess' || !g.alive.includes(s) || s in g.confess) return false;
  if (i != null && (!g.tryal[s][i] || g.tryal[s][i].up)) return false;
  g.confess[s] = i;
  if (!g.alive.every(x => x in g.confess)) return true;
  const { target, save } = g.night, list = Object.entries(g.confess).filter(([, v]) => v != null);
  for (const [p, idx] of list) flip(g, p, idx);
  const safe = target === save || !g.alive.includes(target) ? (g.alive.includes(target) ? 'constable' : 'gone')
    : has(g, target, 'asylum') ? 'asylum' : g.confess[target] != null ? 'confess' : null;
  if (!safe) kill(g, target, 'night');
  g.last = { t: 'night', target, safe, confessed: list.map(([p]) => p) };
  say(g, g.last);
  g.night = null; g.confess = null;
  run(g);
  return true;
}
