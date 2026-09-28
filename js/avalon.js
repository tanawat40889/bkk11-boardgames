import { shuffle, rint } from './rng.js';

export const MIN = 5, MAX = 10;
// players -> [good, evil]
export const TEAMS = { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4] };
export const QUESTS = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
};
// Quest 4 needs two fail cards with 7+ players.
export const failsNeeded = (n, q) => (q === 3 && n >= 7 ? 2 : 1);

export const ROLES = {
  merlin: { n: 'เมอร์ลิน', e: '🧙', t: 'good', d: 'รู้ว่าใครเป็นฝ่ายร้าย (ยกเว้นมอเดรด) · ต้องช่วยฝ่ายดีแบบเนียนๆ ถ้านักฆ่าเดาถูกว่าคุณคือเมอร์ลิน ฝ่ายดีแพ้' },
  percival: { n: 'เพอร์ซิวัล', e: '🛡️', t: 'good', d: 'รู้ว่าใครคือเมอร์ลิน · ถ้ามีมอร์แกนา คุณจะเห็น 2 คนและไม่รู้ว่าคนไหนตัวจริง' },
  servant: { n: 'อัศวินผู้ภักดี', e: '⚔️', t: 'good', d: 'ฝ่ายดี ไม่มีข้อมูลพิเศษ · ใช้การสังเกตและการโหวตหาฝ่ายร้าย' },
  assassin: { n: 'นักฆ่า', e: '🗡️', t: 'evil', d: 'ฝ่ายร้าย · ถ้าฝ่ายดีทำภารกิจสำเร็จ 3 ครั้ง คุณได้เลือกฆ่า 1 คน ถ้าเป็นเมอร์ลิน ฝ่ายร้ายชนะ' },
  morgana: { n: 'มอร์แกนา', e: '🔮', t: 'evil', d: 'ฝ่ายร้าย · ในสายตาเพอร์ซิวัล คุณดูเหมือนเมอร์ลิน' },
  mordred: { n: 'มอเดรด', e: '🐍', t: 'evil', d: 'ฝ่ายร้าย · เมอร์ลินมองไม่เห็นคุณ' },
  oberon: { n: 'โอเบรอน', e: '👻', t: 'evil', d: 'ฝ่ายร้ายที่ไม่รู้จักพวกพ้อง และพวกพ้องก็ไม่รู้จักคุณ (แต่เมอร์ลินเห็นคุณ)' },
  minion: { n: 'สมุนของมอเดรด', e: '😈', t: 'evil', d: 'ฝ่ายร้าย · รู้จักพวกพ้อง ช่วยกันทำภารกิจให้ล้มเหลว' },
};
export const OPTIONAL = ['merlin', 'percival', 'morgana', 'mordred', 'oberon'];
export const defaults = () => ({ merlin: true, percival: true, morgana: true, mordred: false, oberon: false });

export function validate(n, cfg) {
  const e = [];
  if (n < MIN) return [`ต้องมีผู้เล่นอย่างน้อย ${MIN} คน`];
  if (n > MAX) return [`ผู้เล่นได้สูงสุด ${MAX} คน`];
  const [good, evil] = TEAMS[n];
  const evilSp = (cfg.merlin ? 1 : 0) + ['morgana', 'mordred', 'oberon'].filter(r => cfg[r]).length;
  const goodSp = (cfg.merlin ? 1 : 0) + (cfg.percival ? 1 : 0);
  if (evilSp > evil) e.push(`ผู้เล่น ${n} คนมีฝ่ายร้าย ${evil} คน — บทบาทพิเศษฝ่ายร้าย (นักฆ่า/มอร์แกนา/มอเดรด/โอเบรอน) ใส่ได้ไม่เกิน ${evil}`);
  if (goodSp > good) e.push('บทบาทพิเศษฝ่ายดีมากเกินไป');
  if (cfg.percival && !cfg.merlin) e.push('เพอร์ซิวัลต้องมีเมอร์ลินด้วย');
  return e;
}

export function deal(sids, cfg) {
  const n = sids.length, [good, evil] = TEAMS[n];
  const g = [...(cfg.merlin ? ['merlin'] : []), ...(cfg.percival ? ['percival'] : [])];
  const b = [...(cfg.merlin ? ['assassin'] : []), ...['morgana', 'mordred', 'oberon'].filter(r => cfg[r])];
  while (g.length < good) g.push('servant');
  while (b.length < evil) b.push('minion');
  const cards = shuffle([...g, ...b]), role = {};
  sids.forEach((s, i) => (role[s] = cards[i]));
  return {
    sids: [...sids], role, cfg: { ...cfg },
    quests: QUESTS[n].map((size, i) => ({ size, need: failsNeeded(n, i), res: null, fails: 0, team: null })),
    q: 0, leader: rint(n), rejects: 0, team: [], votes: {}, cards: {}, history: [], ready: [], kill: null, result: null,
  };
}

export const team = r => ROLES[r].t;
export const isEvil = (g, s) => team(g.role[s]) === 'evil';
export const leaderSid = g => g.sids[g.leader % g.sids.length];

// What each player learns at the start. Returns {k, sids}.
export function knowledge(g, s) {
  const r = g.role[s], who = f => g.sids.filter(x => x !== s && f(x));
  if (r === 'merlin') return { k: 'merlin', sids: who(x => isEvil(g, x) && g.role[x] !== 'mordred') };
  if (r === 'percival') return { k: 'percival', sids: who(x => ['merlin', 'morgana'].includes(g.role[x])) };
  if (team(r) === 'evil' && r !== 'oberon') return { k: 'evil', sids: who(x => isEvil(g, x) && g.role[x] !== 'oberon') };
  return { k: 'none', sids: [] };
}

export function propose(g, s, t) {
  const size = g.quests[g.q].size;
  if (s !== leaderSid(g) || !Array.isArray(t) || new Set(t).size !== size || !t.every(x => g.sids.includes(x))) return false;
  g.team = [...t];
  g.votes = {};
  return true;
}

// After all votes: true = approved (strict majority).
export function tallyVotes(g) {
  const yes = g.sids.filter(s => g.votes[s] === true).length;
  return yes * 2 > g.sids.length;
}

export function afterVote(g) {
  const ok = tallyVotes(g);
  g.history.push({ q: g.q, leader: leaderSid(g), team: [...g.team], votes: { ...g.votes }, ok });
  if (ok) { g.rejects = 0; g.cards = {}; }
  else { g.rejects++; g.leader++; }
  return ok;
}

// Good players can only succeed.
export function play(g, s, ok) {
  if (!g.team.includes(s) || s in g.cards) return false;
  g.cards[s] = isEvil(g, s) ? !!ok : true;
  return true;
}

export function afterQuest(g) {
  const Q = g.quests[g.q];
  Q.fails = Object.values(g.cards).filter(v => !v).length;
  Q.res = Q.fails >= Q.need ? 'F' : 'S';
  Q.team = [...g.team];
  g.q++;
  g.leader++;
  g.team = [];
  g.cards = {};
  return Q.res;
}

// null = keep playing; 'assassin' = good got 3 but Merlin is in play; otherwise final {w, why}
export function status(g) {
  const s = g.quests.filter(q => q.res === 'S').length, f = g.quests.filter(q => q.res === 'F').length;
  if (g.rejects >= 5) return { w: 'evil', why: 'rejects' };
  if (f >= 3) return { w: 'evil', why: 'quests' };
  if (s >= 3) return g.cfg.merlin ? 'assassin' : { w: 'good', why: 'quests' };
  return null;
}

export function assassinate(g, s, target) {
  if (g.role[s] !== 'assassin' || !g.sids.includes(target) || target === s) return null;
  g.kill = target;
  return g.role[target] === 'merlin' ? { w: 'evil', why: 'merlin' } : { w: 'good', why: 'missed' };
}
