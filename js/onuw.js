import { shuffle, pick } from './rng.js';

export const ROLES = {
  werewolf: { n: 'มนุษย์หมาป่า', e: '🐺', t: 'wolf', d: 'ตื่นมาดูว่าใครเป็นหมาป่าอีกตัว ถ้าเป็นหมาป่าตัวเดียว ดูการ์ดกลางได้ 1 ใบ · ชนะถ้าไม่มีหมาป่าถูกโหวตตาย' },
  minion: { n: 'สมุนหมาป่า', e: '😈', t: 'wolf', d: 'ตื่นมาดูว่าใครเป็นหมาป่า (หมาป่าไม่รู้ว่าคุณคือใคร) · ชนะไปพร้อมหมาป่า ตัวคุณเองตายได้' },
  mason: { n: 'ช่างก่ออิฐ', e: '🧱', t: 'village', d: 'ตื่นมาดูว่าใครเป็นช่างก่ออิฐอีกคน · ฝ่ายชาวบ้าน' },
  seer: { n: 'หมอดู', e: '🔮', t: 'village', d: 'ดูการ์ดของผู้เล่น 1 คน หรือดูการ์ดกลาง 2 ใบ' },
  robber: { n: 'โจร', e: '🦹', t: 'village', d: 'สลับการ์ดตัวเองกับผู้เล่น 1 คน แล้วดูการ์ดใหม่ (คุณจะอยู่ฝ่ายตามการ์ดใหม่)' },
  troublemaker: { n: 'ตัวป่วน', e: '🃏', t: 'village', d: 'สลับการ์ดของผู้เล่นอื่น 2 คน โดยไม่ได้ดู' },
  drunk: { n: 'ขี้เมา', e: '🍺', t: 'village', d: 'ต้องสลับการ์ดตัวเองกับการ์ดกลาง 1 ใบ โดยไม่รู้ว่าได้อะไร' },
  insomniac: { n: 'คนนอนไม่หลับ', e: '🥱', t: 'village', d: 'ตื่นเป็นคนสุดท้าย ดูว่าการ์ดตัวเองถูกสลับไปหรือยัง' },
  villager: { n: 'ชาวบ้าน', e: '🧑‍🌾', t: 'village', d: 'ไม่มีความสามารถพิเศษ · ช่วยหาหมาป่าให้เจอ' },
  hunter: { n: 'นายพราน', e: '🏹', t: 'village', d: 'ถ้าคุณถูกโหวตตาย คนที่คุณโหวตจะตายตามไปด้วย' },
  tanner: { n: 'คนฟอกหนัง', e: '💀', t: 'tanner', d: 'เบื่อชีวิต อยากตาย · ชนะคนเดียวถ้าคุณถูกโหวตตาย' },
};
export const LIMIT = { werewolf: 2, minion: 1, mason: 2, seer: 1, robber: 1, troublemaker: 1, drunk: 1, insomniac: 1, villager: 3, hunter: 1, tanner: 1 };
export const UI_ORDER = ['werewolf', 'minion', 'seer', 'robber', 'troublemaker', 'drunk', 'insomniac', 'mason', 'villager', 'hunter', 'tanner'];
export const NIGHT = ['werewolf', 'minion', 'mason', 'seer', 'robber', 'troublemaker', 'drunk', 'insomniac'];
export const MIN = 3, MAX = 10;

export function recommend(n) {
  const k = n + 3, out = [];
  const order = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager', 'insomniac', 'drunk', 'minion', 'mason', 'mason', 'tanner', 'hunter', 'villager', 'villager'];
  for (let i = 0; i < order.length && out.length < k; i++) {
    if (order[i] === 'mason') {
      if (k - out.length >= 2) out.push('mason', 'mason');
      i++;
      continue;
    }
    out.push(order[i]);
  }
  return out;
}

export const count = (deck, r) => deck.filter(x => x === r).length;

export function validate(deck, n) {
  const e = [];
  if (n < MIN) e.push(`ต้องมีผู้เล่นอย่างน้อย ${MIN} คน`);
  if (n > MAX) e.push(`ผู้เล่นได้สูงสุด ${MAX} คน`);
  if (deck.length !== n + 3) e.push(`ต้องใช้การ์ด ${n + 3} ใบ (ผู้เล่น ${n} + กลาง 3) ตอนนี้มี ${deck.length}`);
  for (const r of Object.keys(LIMIT)) if (count(deck, r) > LIMIT[r]) e.push(`${ROLES[r].n} ได้สูงสุด ${LIMIT[r]} ใบ`);
  if (![0, 2].includes(count(deck, 'mason'))) e.push('ช่างก่ออิฐต้องใส่ 0 หรือ 2 ใบ');
  if (!count(deck, 'werewolf')) e.push('ต้องมีมนุษย์หมาป่าอย่างน้อย 1 ใบ');
  return e;
}

export function newGame(sids, deck) {
  const cards = shuffle(deck);
  const init = {};
  sids.forEach((s, i) => (init[s] = cards[i]));
  const center = cards.slice(sids.length);
  return {
    deck: [...deck], sids: [...sids], init, cur: { ...init },
    centerInit: [...center], center: [...center],
    phases: NIGHT.filter(r => deck.includes(r)), pi: -1,
    acted: {}, log: [], votes: {}, know: {}, ready: [],
  };
}

export const holders = (g, r) => g.sids.filter(s => g.init[s] === r);
export const phaseRole = g => g.phases[g.pi];

export function actionKind(g, r, sid) {
  if (g.init[sid] !== r) return null;
  if (r === 'werewolf') return holders(g, 'werewolf').length === 1 ? 'peek' : null;
  return ['seer', 'robber', 'troublemaker', 'drunk'].includes(r) ? r : null;
}

// Info a role gets automatically when its phase starts.
export function phaseInfo(g, r, sid) {
  if (r === 'werewolf') return { k: 'wolves', others: holders(g, 'werewolf').filter(x => x !== sid) };
  if (r === 'minion') return { k: 'minion', wolves: holders(g, 'werewolf') };
  if (r === 'mason') return { k: 'masons', others: holders(g, 'mason').filter(x => x !== sid) };
  if (r === 'insomniac') return { k: 'self', card: g.cur[sid] };
  return null;
}

const isC = i => Number.isInteger(i) && i >= 0 && i < 3;

// Apply a night action for the current phase. Returns a log entry, or null if invalid.
export function act(g, sid, a = {}) {
  const r = phaseRole(g);
  if (!r || g.acted[sid]) return null;
  const kind = actionKind(g, r, sid);
  if (!kind) return null;
  const isP = x => x !== sid && g.sids.includes(x);
  let out;
  switch (kind) {
    case 'peek':
      if (!isC(a.c)) return null;
      out = { k: 'peek', sid, cards: [{ c: a.c, card: g.center[a.c] }] };
      break;
    case 'seer':
      if (a.p != null) {
        if (!isP(a.p)) return null;
        out = { k: 'seer', sid, cards: [{ p: a.p, card: g.cur[a.p] }] };
      } else {
        const [i, j] = a.cs || [];
        if (!isC(i) || !isC(j) || i === j) return null;
        out = { k: 'seer', sid, cards: [{ c: i, card: g.center[i] }, { c: j, card: g.center[j] }] };
      }
      break;
    case 'robber':
      if (!isP(a.p)) return null;
      [g.cur[sid], g.cur[a.p]] = [g.cur[a.p], g.cur[sid]];
      out = { k: 'rob', sid, p: a.p, card: g.cur[sid] };
      break;
    case 'troublemaker': {
      const [x, y] = a.ps || [];
      if (!isP(x) || !isP(y) || x === y) return null;
      [g.cur[x], g.cur[y]] = [g.cur[y], g.cur[x]];
      out = { k: 'swap', sid, ps: [x, y] };
      break;
    }
    case 'drunk':
      if (!isC(a.c)) return null;
      [g.cur[sid], g.center[a.c]] = [g.center[a.c], g.cur[sid]];
      out = { k: 'drunk', sid, c: a.c, auto: !!a.auto };
      break;
  }
  g.acted[sid] = true;
  g.log.push(out);
  return out;
}

// Mandatory actions that weren't taken before the phase timer ran out.
export function endPhase(g) {
  const outs = [];
  if (phaseRole(g) === 'drunk')
    for (const s of holders(g, 'drunk')) if (!g.acted[s]) outs.push(act(g, s, { c: pick([0, 1, 2]), auto: true }));
  return outs;
}

export const teamOf = r => ROLES[r].t;

export function resolve(g, votes) {
  const cnt = {};
  g.sids.forEach(s => (cnt[s] = 0));
  for (const [v, t] of Object.entries(votes)) if (t in cnt && t !== v && g.sids.includes(v)) cnt[t]++;
  const max = Math.max(0, ...Object.values(cnt));
  const dead = max > 1 ? g.sids.filter(s => cnt[s] === max) : [];
  const fin = g.cur;
  for (const s of [...dead]) {
    const t = votes[s];
    if (fin[s] === 'hunter' && t && g.sids.includes(t) && !dead.includes(t)) dead.push(t);
  }
  const wolvesIn = g.sids.filter(s => fin[s] === 'werewolf');
  const minionIn = g.sids.some(s => fin[s] === 'minion');
  const tanner = dead.some(s => fin[s] === 'tanner');
  const wolfDead = dead.some(s => fin[s] === 'werewolf');
  let village, wolf;
  if (wolvesIn.length) {
    village = wolfDead;
    wolf = !wolfDead && !tanner;
  } else {
    const otherDead = dead.some(s => fin[s] !== 'minion');
    village = !otherDead;
    wolf = minionIn && otherDead && !tanner;
  }
  const win = {};
  for (const s of g.sids) {
    const t = teamOf(fin[s]);
    win[s] = t === 'village' ? village : t === 'wolf' ? wolf : dead.includes(s);
  }
  return { cnt, dead, village, wolf, tanner, noWolves: !wolvesIn.length, win };
}
