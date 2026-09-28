import { roomCode, uid } from './rng.js';
import * as Net from './net.js';
import * as SF from './spyfall.js';
import * as WW from './onuw.js';
import * as UC from './undercover.js';
import * as AV from './avalon.js';

const app = document.getElementById('app');
const now = () => Date.now();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mkStore = get => ({
  get(k, d) { try { const v = get().getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { get().setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { get().removeItem(k); } catch {} },
});
const LS = mkStore(() => localStorage), SS = mkStore(() => sessionStorage);

const GAMES = {
  onuw: { n: 'One Night Ultimate Werewolf', s: 'Werewolf', e: '🐺', min: WW.MIN, max: WW.MAX },
  spyfall: { n: 'Spyfall', s: 'Spyfall', e: '🕵️', min: SF.MIN, max: SF.MAX },
  uc: { n: 'Undercover', s: 'Undercover', e: '🎭', min: UC.MIN, max: UC.MAX },
  av: { n: 'Avalon', s: 'Avalon', e: '🏰', min: AV.MIN, max: AV.MAX },
};
const ROLE = WW.ROLES;
const RL = r => `${ROLE[r].e} ${ROLE[r].n}`;
const TEAM = { village: 'ฝ่ายชาวบ้าน', wolf: 'ฝ่ายหมาป่า', tanner: 'ฝ่ายตัวเอง' };
const ONLINE_MS = 25000;
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const S = {
  conn: null, room: null, pid: null, isHost: false, name: LS.get('bg_name', ''), codeIn: new URLSearchParams(location.search).get('r')?.toUpperCase() || '',
  pub: null, priv: null, endsAt: 0, online: true, busy: '', err: '', toast: '', joinErr: '',
  key: '', round: -1, reveal: false, sel: [], decoy: null, guess: false, crossed: new Set(), rules: false, qr: false,
  voice: LS.get('bg_voice', true),
};
let H = null, lastPub = '', lastTimed = 0, hostTimer = 0, pingTimer = 0;
const sentPriv = {};

/* ───────────── host engine ───────────── */
const hn = sid => H.players.find(p => p.sid === sid)?.name || '?';
const isOn = p => p.pid === S.pid || now() - p.seen < ONLINE_MS;

function newHost(room, game, name) {
  return {
    room, game, phase: 'lobby', round: 0, endsAt: null, paused: null, g: null, recent: [],
    players: [{ sid: 's' + uid(6), pid: S.pid, name, seen: now() }],
    settings: { onuw: { auto: true, deck: null, night: 15, day: 300 }, spyfall: { spies: 1, min: 8 }, uc: { auto: true, uc: 1, white: 0 }, av: AV.defaults() },
  };
}

function deckNow() {
  const s = H.settings.onuw;
  return s.auto || !s.deck ? WW.recommend(Math.max(WW.MIN, Math.min(WW.MAX, H.players.length))) : s.deck;
}

function pubOf() {
  const t = now(), g = H.g;
  const p = {
    v: 1, room: H.room, game: H.game, phase: H.phase, round: H.round, host: H.players[0].sid,
    players: H.players.map(x => ({ sid: x.sid, name: x.name, on: isOn(x) })),
    set: { ...H.settings, deck: H.game === 'onuw' ? deckNow() : null, ucc: ucCounts() },
  };
  if (H.endsAt) p.left = Math.max(0, H.endsAt - t);
  if (H.paused != null) p.paused = H.paused;
  if (g && H.phase !== 'lobby') {
    if (H.game === 'onuw') {
      p.deck = g.deck;
      if (H.phase === 'deal') p.ready = g.ready;
      if (H.phase === 'night') { p.night = WW.phaseRole(g) || null; p.step = [g.pi + 1, g.phases.length]; }
      if (H.phase === 'vote') p.voted = Object.keys(g.votes);
      if (H.phase === 'result') p.result = g.result;
    } else if (H.game === 'av') {
      p.av = {
        quests: g.quests.map(q => ({ size: q.size, need: q.need, res: q.res, fails: q.fails })),
        q: g.q, leader: AV.leaderSid(g), rejects: g.rejects, team: g.team, cfg: g.cfg,
        hist: g.history, nh: g.history.length,
      };
      if (H.phase === 'aroles') p.ready = g.ready;
      if (H.phase === 'avote') p.voted = Object.keys(g.votes);
      if (H.phase === 'aquest') p.played = Object.keys(g.cards).length;
      if (H.phase === 'aend') p.result = g.result;
    } else if (H.game === 'uc') {
      p.alive = g.alive; p.out = g.out; p.turn = g.turn;
      p.counts = { uc: Object.values(g.role).filter(r => r === 'uc').length, white: Object.values(g.role).filter(r => r === 'white').length };
      if (H.phase === 'uword') p.ready = g.ready;
      if (H.phase === 'udesc') p.order = g.order;
      if (H.phase === 'uvote') { p.voted = Object.keys(g.votes).filter(s => g.alive.includes(s)); p.cand = g.cand; p.vr = g.vr; }
      if (H.phase === 'uout') p.last = g.last;
      if (H.phase === 'uend') p.result = g.result;
    } else {
      p.first = g.first;
      p.nspies = g.spies.length;
      if (H.phase === 'reveal') p.result = g.result;
    }
  }
  return p;
}

function privOf(sid) {
  const v = { sid, round: H.round }, g = H.g;
  if (!g || H.phase === 'lobby') return v;
  if (!g.sids.includes(sid)) return { sid, spectator: true };
  if (H.game === 'onuw') {
    v.role = g.init[sid];
    v.know = g.know[sid] || [];
    v.ready = g.ready.includes(sid);
    if (H.phase === 'night' && g.pi >= 0) {
      v.act = g.acted[sid] ? null : WW.actionKind(g, WW.phaseRole(g), sid);
      v.done = !!g.acted[sid];
    }
    if (H.phase === 'vote') v.vote = g.votes[sid] || null;
  } else if (H.game === 'av') {
    v.role = g.role[sid];
    v.info = avInfo(sid);
    v.ready = g.ready.includes(sid);
    if (H.phase === 'avote') v.vote = sid in g.votes ? g.votes[sid] : null;
    if (H.phase === 'aquest') v.played = sid in g.cards;
  } else if (H.game === 'uc') {
    v.word = UC.wordOf(g, sid);
    v.white = g.role[sid] === 'white';
    v.alive = g.alive.includes(sid);
    v.ready = g.ready.includes(sid);
    if (H.phase === 'uvote') v.vote = g.votes[sid] || null;
  } else {
    v.spy = g.spies.includes(sid);
    if (!v.spy) { v.loc = g.loc; v.role = g.roles[sid]; }
  }
  return v;
}

function broadcast() {
  LS.set('bg_host_' + H.room, H);
  const pub = pubOf();
  S.conn?.send('pub', pub, true);
  for (const p of H.players) {
    const v = privOf(p.sid);
    if (p.pid === S.pid) { S.priv = v; continue; }
    const j = JSON.stringify(v);
    if (sentPriv[p.pid] !== j) { sentPriv[p.pid] = j; S.conn?.send('p/' + p.pid, v, true); }
  }
  applyPub(pub, true);
}

function hostTick() {
  if (!H) return;
  const t = now();
  if (H.endsAt && t >= H.endsAt) {
    if (H.phase === 'night') return nextNight();
    if (H.phase === 'day') return startVote();
  }
  const on = H.players.map(isOn).join();
  if (on !== H._on || (H.endsAt && H.endsAt > t - 3000 && t - lastTimed > 3000)) {
    H._on = on;
    lastTimed = t;
    broadcast();
  }
}

const know = (sid, txt) => (H.g.know[sid] ||= []).push({ ph: H.g.pi, txt });
const names = a => a.map(hn).join(', ');

function infoText(i) {
  if (i.k === 'wolves') return i.others.length ? `🐺 หมาป่าอีกตัวคือ ${names(i.others)}` : '🐺 คุณเป็นหมาป่าตัวเดียว — ดูการ์ดกลางได้ 1 ใบ';
  if (i.k === 'minion') return i.wolves.length ? `😈 หมาป่าคือ ${names(i.wolves)}` : '😈 ไม่มีผู้เล่นคนไหนเป็นหมาป่า — ถ้ามีคนอื่นที่ไม่ใช่คุณถูกโหวตตาย คุณชนะ';
  if (i.k === 'masons') return i.others.length ? `🧱 ช่างก่ออิฐอีกคนคือ ${names(i.others)}` : '🧱 ไม่มีช่างก่ออิฐคนอื่น (อีกใบอยู่ตรงกลาง)';
  if (i.k === 'self') return `🥱 ตอนจบคืน การ์ดของคุณคือ ${RL(i.card)}`;
  return '';
}
const seen = cards => cards.map(x => (x.p ? `การ์ดของ ${hn(x.p)} คือ ${RL(x.card)}` : `การ์ดกลางใบที่ ${x.c + 1} คือ ${RL(x.card)}`)).join(' · ');
function knowText(o) {
  if (o.k === 'peek') return `🐺 ${seen(o.cards)}`;
  if (o.k === 'seer') return `🔮 ${seen(o.cards)}`;
  if (o.k === 'rob') return `🦹 คุณขโมยการ์ดของ ${hn(o.p)} → ตอนนี้คุณคือ ${RL(o.card)}`;
  if (o.k === 'swap') return `🃏 คุณสลับการ์ดของ ${hn(o.ps[0])} กับ ${hn(o.ps[1])}`;
  if (o.k === 'drunk') return `🍺 ${o.auto ? 'หมดเวลา ระบบสุ่มให้ — ' : ''}คุณสลับการ์ดตัวเองกับการ์ดกลางใบที่ ${o.c + 1} (ไม่รู้ว่าได้อะไร)`;
  return '';
}
function logText(o) {
  const n = hn(o.sid);
  if (o.k === 'peek') return `🐺 ${n} (หมาป่าตัวเดียว) ดู${seen(o.cards)}`;
  if (o.k === 'seer') return `🔮 ${n} ดู${seen(o.cards)}`;
  if (o.k === 'rob') return `🦹 ${n} ขโมยการ์ดของ ${hn(o.p)} ได้ ${RL(o.card)}`;
  if (o.k === 'swap') return `🃏 ${n} สลับการ์ดของ ${hn(o.ps[0])} กับ ${hn(o.ps[1])}`;
  if (o.k === 'drunk') return `🍺 ${n} สลับการ์ดกับการ์ดกลางใบที่ ${o.c + 1}${o.auto ? ' (ระบบสุ่มให้)' : ''}`;
  return '';
}

function say(txt) {
  if (!S.voice || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = 'th-TH';
    speechSynthesis.speak(u);
  } catch {}
}

function nextNight() {
  const g = H.g;
  if (g.pi >= 0) for (const o of WW.endPhase(g)) know(o.sid, knowText(o));
  g.pi++;
  if (g.pi >= g.phases.length) {
    H.phase = 'day';
    H.endsAt = now() + H.settings.onuw.day * 1000;
    say('ทุกคน ตื่นได้แล้ว');
    return broadcast();
  }
  const r = WW.phaseRole(g);
  for (const s of WW.holders(g, r)) {
    const i = WW.phaseInfo(g, r, s);
    if (i) know(s, infoText(i));
  }
  H.endsAt = now() + H.settings.onuw.night * 1000;
  say(`${ROLE[r].n} ตื่น`);
  broadcast();
}

function startVote() {
  H.phase = 'vote';
  H.endsAt = null;
  H.g.votes = {};
  say('หมดเวลา โหวตได้เลย');
  broadcast();
}

function finishVote() {
  const g = H.g, r = WW.resolve(g, g.votes);
  const head = [];
  if (r.village) head.push('🏡 ฝ่ายชาวบ้านชนะ');
  if (r.wolf) head.push('🐺 ฝ่ายหมาป่าชนะ');
  if (r.tanner) head.push('💀 คนฟอกหนังชนะ');
  if (!head.length) head.push('ไม่มีฝ่ายไหนชนะ');
  g.result = {
    head: head.join(' · '),
    sub: r.dead.length ? `ถูกโหวตตาย: ${names(r.dead)}` : 'ไม่มีใครตาย (ไม่มีใครได้เกิน 1 เสียง)',
    noWolves: r.noWolves,
    rows: g.sids.map(s => ({ sid: s, init: g.init[s], fin: g.cur[s], votes: r.cnt[s], to: g.votes[s] || null, dead: r.dead.includes(s), win: r.win[s] })),
    center: g.centerInit.map((c, i) => ({ init: c, fin: g.center[i] })),
    log: g.log.map(logText),
  };
  H.phase = 'result';
  broadcast();
}

function endSpy(guess) {
  const g = H.g;
  g.result = { loc: g.loc, spies: g.spies, roles: g.roles, guess: guess ? { ...guess, ok: guess.loc === g.loc } : null };
  H.phase = 'reveal';
  H.endsAt = null;
  H.paused = null;
  broadcast();
}

function avInfo(sid) {
  const g = H.g, k = AV.knowledge(g, sid), ns = names(k.sids);
  if (k.k === 'merlin') return (k.sids.length ? `😈 ฝ่ายร้ายที่คุณเห็น: ${ns}` : '😈 คุณไม่เห็นฝ่ายร้ายเลย') + (g.cfg.mordred ? ' · มอเดรดซ่อนตัวจากคุณ' : '');
  if (k.k === 'percival') return k.sids.length > 1 ? `🧙 เมอร์ลินคือหนึ่งในสองคนนี้: ${ns}` : `🧙 เมอร์ลินคือ ${ns}`;
  if (k.k === 'evil') return (k.sids.length ? `😈 พวกพ้องฝ่ายร้าย: ${ns}` : '😈 คุณไม่รู้จักพวกพ้องคนอื่น') + (g.cfg.oberon ? ' · มีโอเบรอนซ่อนอยู่ (ไม่รู้ว่าใคร)' : '');
  if (g.role[sid] === 'oberon') return '👻 คุณไม่รู้ว่าพวกพ้องคือใคร';
  return '';
}
function avEnd(r) {
  const g = H.g;
  g.result = { ...r, roles: g.role, kill: g.kill };
  H.phase = 'aend';
  broadcast();
}

function ucCounts() {
  const s = H.settings.uc, n = H.players.length;
  return s.auto ? UC.recommend(Math.max(UC.MIN, Math.min(UC.MAX, n))) : { uc: s.uc, white: s.white };
}
function ucNextTurn() {
  const g = H.g;
  g.turn++;
  g.order = UC.speakOrder(g);
  g.votes = {}; g.cand = null; g.last = null;
  H.phase = 'udesc';
  broadcast();
}
function ucResolve() {
  const g = H.g, { top } = UC.tally(g);
  if (top.length > 1 && !g.cand) { g.cand = top; g.votes = {}; g.vr++; return broadcast(); }
  if (top.length > 1) g.last = { sid: null, tie: top };
  else {
    const role = UC.eliminate(g, top[0]);
    g.last = { sid: top[0], role, guessing: role === 'white' };
  }
  H.phase = 'uout';
  broadcast();
}
function ucEnd(w) {
  const g = H.g;
  g.result = { w, words: g.words, role: g.role, win: UC.winners(g, w), guess: g.last?.guess ?? null };
  H.phase = 'uend';
  broadcast();
}

function reject(pid, msg) { S.conn.send('p/' + pid, { error: msg }); }

function hostJoin(m) {
  const name = cleanName(m.name) || 'ผู้เล่น';
  const p = H.players.find(x => x.pid === m.pid);
  if (p) { delete sentPriv[p.pid]; return broadcast(); }
  if (H.phase === 'lobby') {
    if (H.players.length >= 10) return reject(m.pid, 'ห้องเต็มแล้ว (สูงสุด 10 คน)');
    let n = name, i = 2;
    while (H.players.some(x => x.name.toLowerCase() === n.toLowerCase())) n = `${name} ${i++}`;
    H.players.push({ sid: 's' + uid(6), pid: m.pid, name: n, seen: now() });
    return broadcast();
  }
  // Mid-game: reclaim an offline seat by using the same name.
  const q = H.players.find(x => x.name.toLowerCase() === name.toLowerCase() && x.pid !== S.pid);
  if (q && !isOn(q)) {
    S.conn.send('p/' + q.pid, null, true);
    delete sentPriv[q.pid];
    q.pid = m.pid;
    q.seen = now();
    return broadcast();
  }
  reject(m.pid, q ? `ชื่อ "${q.name}" ยังออนไลน์อยู่ ถ้าเป็นคุณ รอ ~20 วินาทีแล้วกดลองใหม่` : 'เกมกำลังเล่นอยู่ — รอเจ้าของห้องกลับล็อบบี้ หรือใช้ชื่อเดิมเพื่อกลับเข้าที่นั่ง');
}

function hostIn(m) {
  if (!H || !m || typeof m.pid !== 'string') return;
  const p = H.players.find(x => x.pid === m.pid);
  if (p) p.seen = now();
  if (m.t === 'join') return hostJoin(m);
  if (!p) return;
  const g = H.g, sid = p.sid;
  switch (m.t) {
    case 'leave':
      if (H.phase === 'lobby' && p.pid !== S.pid) {
        H.players = H.players.filter(x => x !== p);
        S.conn.send('p/' + p.pid, null, true);
        broadcast();
      }
      break;
    case 'ready':
      if ((H.phase === 'deal' || H.phase === 'uword' || H.phase === 'aroles') && !g.ready.includes(sid)) { g.ready.push(sid); broadcast(); }
      break;
    case 'act':
      if (H.phase === 'night') {
        const o = WW.act(g, sid, m.a || {});
        if (o) { know(sid, knowText(o)); broadcast(); }
      }
      break;
    case 'vote':
      if (H.phase === 'uvote' && g.alive.includes(sid) && (g.cand || g.alive).includes(m.to) && m.to !== sid) {
        g.votes[sid] = m.to;
        g.alive.every(s => g.votes[s]) ? ucResolve() : broadcast();
      }
      if (H.phase === 'vote' && g.sids.includes(m.to) && m.to !== sid) {
        g.votes[sid] = m.to;
        g.sids.every(s => g.votes[s]) ? finishVote() : broadcast();
      }
      break;
    case 'apropose':
      if (H.phase === 'ateam' && AV.propose(g, sid, m.team)) { H.phase = 'avote'; broadcast(); }
      break;
    case 'avote':
      if (H.phase === 'avote' && g.sids.includes(sid)) {
        g.votes[sid] = !!m.ok;
        if (g.sids.every(s => s in g.votes)) { AV.afterVote(g); H.phase = 'avres'; }
        broadcast();
      }
      break;
    case 'acard':
      if (H.phase === 'aquest' && AV.play(g, sid, m.ok)) {
        if (g.team.every(s => s in g.cards)) { AV.afterQuest(g); H.phase = 'aqres'; }
        broadcast();
      }
      break;
    case 'akill':
      if (H.phase === 'aassn') { const r = AV.assassinate(g, sid, m.to); if (r) avEnd(r); }
      break;
    case 'wguess':
      if (H.phase === 'uout' && g.last?.guessing && g.last.sid === sid && typeof m.text === 'string' && m.text.trim()) {
        g.last.guess = m.text.trim().slice(0, 40);
        g.last.ok = UC.guessOk(g, g.last.guess);
        g.last.guessing = false;
        broadcast();
      }
      break;
    case 'guess':
      if (H.phase === 'play' && g.spies.includes(sid) && Number.isInteger(m.loc) && SF.LOCATIONS[m.loc]) endSpy({ by: sid, loc: m.loc });
      break;
  }
}

const HA = {
  hgame(d) { if (H.phase === 'lobby') { H.game = d.g; broadcast(); } },
  kick(d) {
    const p = H.players.find(x => x.sid === d.sid);
    if (!p || p.pid === S.pid || H.phase !== 'lobby') return;
    if (!confirm(`เชิญ ${p.name} ออกจากห้อง?`)) return;
    H.players = H.players.filter(x => x !== p);
    S.conn.send('p/' + p.pid, null, true);
    S.conn.send('p/' + p.pid, { kicked: true });
    broadcast();
  },
  deck(d) {
    const s = H.settings.onuw, deck = [...deckNow()], r = d.r, step = r === 'mason' ? 2 : 1;
    if (+d.d > 0) { if (WW.count(deck, r) + step > WW.LIMIT[r]) return; for (let i = 0; i < step; i++) deck.push(r); }
    else { if (!WW.count(deck, r)) return; for (let i = 0; i < step; i++) deck.splice(deck.lastIndexOf(r), 1); }
    s.deck = deck;
    s.auto = false;
    broadcast();
  },
  autodeck() { H.settings.onuw.auto = true; broadcast(); },
  ucauto() { H.settings.uc.auto = true; broadcast(); },
  atoggle(d) {
    const a = H.settings.av;
    a[d.r] = !a[d.r];
    if (!a.merlin) a.percival = false;
    if (d.r === 'percival' && a.percival) a.merlin = true;
    broadcast();
  },
  astart() { if (H.phase === 'aroles') { H.phase = 'ateam'; broadcast(); } },
  anext() {
    const g = H.g;
    if (H.phase === 'avres') {
      if (g.history.at(-1).ok) H.phase = 'aquest';
      else { const st = AV.status(g); if (st) return avEnd(st); H.phase = 'ateam'; }
      return broadcast();
    }
    if (H.phase === 'aqres') {
      const st = AV.status(g);
      if (st === 'assassin') H.phase = 'aassn';
      else if (st) return avEnd(st);
      else H.phase = 'ateam';
      broadcast();
    }
  },
  set(d) {
    const [g, k] = d.k.split('.'), lim = { 'onuw.night': [10, 30, 5], 'onuw.day': [120, 600, 60], 'spyfall.min': [4, 12, 1], 'spyfall.spies': [1, 2, 1], 'uc.uc': [1, 3, 1], 'uc.white': [0, 1, 1] }[d.k];
    if (g === 'uc' && H.settings.uc.auto) Object.assign(H.settings.uc, ucCounts(), { auto: false });
    const v = H.settings[g][k] + lim[2] * +d.d;
    if (v < lim[0] || v > lim[1]) return;
    H.settings[g][k] = v;
    broadcast();
  },
  start() {
    const sids = H.players.map(p => p.sid), n = sids.length, G = GAMES[H.game];
    if (n < G.min || n > G.max) return toast(`${G.s} ต้องมีผู้เล่น ${G.min}–${G.max} คน`);
    if (H.game === 'onuw') {
      const deck = deckNow(), e = WW.validate(deck, n);
      if (e.length) return toast(e[0]);
      H.g = WW.newGame(sids, deck);
      H.phase = 'deal';
      H.endsAt = null;
    } else if (H.game === 'av') {
      const e = AV.validate(n, H.settings.av);
      if (e.length) return toast(e[0]);
      H.g = AV.deal(sids, H.settings.av);
      H.phase = 'aroles';
      H.endsAt = null;
    } else if (H.game === 'uc') {
      const c = ucCounts(), e = UC.validate(n, c.uc, c.white);
      if (e.length) return toast(e[0]);
      H.g = UC.deal(sids, c.uc, c.white, H.recentUC || []);
      H.recentUC = [H.g.pair, ...(H.recentUC || [])].slice(0, UC.RECENT);
      H.phase = 'uword';
      H.endsAt = null;
    } else {
      const d = SF.deal(sids, H.settings.spyfall.spies, H.recent);
      H.recent = [d.loc, ...H.recent].slice(0, SF.RECENT);
      H.g = { ...d, sids, result: null };
      H.phase = 'play';
      H.endsAt = now() + H.settings.spyfall.min * 60000;
    }
    H.paused = null;
    H.round++;
    broadcast();
  },
  night() {
    if (H.phase !== 'deal') return;
    H.phase = 'night';
    H.g.pi = -1;
    H.endsAt = now() + 5000;
    say('ทุกคน หลับตา');
    broadcast();
  },
  tovote() {
    if (H.phase === 'udesc') { H.g.votes = {}; H.g.cand = null; H.g.vr++; H.phase = 'uvote'; return broadcast(); }
    if (H.phase === 'day' && confirm('จบการคุยแล้วไปโหวตเลย?')) startVote();
  },
  udesc() { if (H.phase === 'uword') ucNextTurn(); },
  unext() {
    const g = H.g;
    if (H.phase !== 'uout') return;
    if (g.last?.guessing) return toast('รอ Mr. White ทายคำก่อน');
    if (g.last?.ok) return ucEnd('white');
    const w = UC.winner(g);
    w ? ucEnd(w) : ucNextTurn();
  },
  uskip() {
    const l = H.g.last;
    if (H.phase === 'uout' && l?.guessing && confirm('ข้ามการทาย (ถือว่าทายผิด)?')) { l.guessing = false; l.guess = ''; l.ok = false; broadcast(); }
  },
  uaccept() {
    const l = H.g.last;
    if (H.phase === 'uout' && l?.role === 'white' && l.guess && !l.ok && confirm(`นับ “${l.guess}” ว่าทายถูก?`)) { l.ok = true; broadcast(); }
  },
  extend() { if (H.phase === 'day') { H.endsAt += 60000; broadcast(); } },
  finish() {
    if (H.phase === 'uvote') {
      const miss = H.g.alive.filter(s => !H.g.votes[s]).length;
      if (confirm(miss ? `ยังมี ${miss} คนไม่โหวต สรุปผลเลย?` : 'สรุปผลเลย?')) ucResolve();
      return;
    }
    const miss = H.g.sids.filter(s => !H.g.votes[s]).length;
    if (confirm(miss ? `ยังมี ${miss} คนไม่โหวต (นับเป็นงดออกเสียง) สรุปผลเลย?` : 'สรุปผลเลย?')) finishVote();
  },
  pause() {
    if (H.phase !== 'play') return;
    if (H.paused == null) { H.paused = Math.max(0, H.endsAt - now()); H.endsAt = null; }
    else { H.endsAt = now() + H.paused; H.paused = null; }
    broadcast();
  },
  reveal() { if (H.phase === 'play' && confirm('เฉลยสถานที่และสปาย?')) endSpy(null); },
  again() { HA.start(); },
  lobby() { H.phase = 'lobby'; H.g = null; H.endsAt = null; H.paused = null; broadcast(); },
};

/* ───────────── client / session ───────────── */
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16);

function toast(t) {
  S.toast = t;
  render();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { S.toast = ''; render(); }, 2800);
}

function applyPub(pub) {
  const { left, ...rest } = pub;
  S.endsAt = left != null ? now() + left : 0;
  const j = JSON.stringify(rest);
  if (j !== lastPub) { lastPub = j; S.pub = pub; render(); }
  else { S.pub = pub; tickTimers(); }
}

function send(m) {
  m.pid = S.pid;
  if (S.isHost) hostIn(m);
  else S.conn?.send('in', m);
}

function saveSess() {
  const s = { room: S.room, pid: S.pid, name: S.name, host: S.isHost, bi: S.conn?.bi ?? 0 };
  SS.set('bg_sess', s);
  LS.set('bg_last', { ...s, t: now() });
}

function hello() { S.conn?.send('in', { t: 'join', pid: S.pid, name: S.name }); }

function startClient() {
  const c = S.conn;
  c.sub('pub', v => (!v || v.closed ? leave('เจ้าของห้องปิดห้องแล้ว') : applyPub(v)));
  c.sub('p/' + S.pid, v => {
    if (!v) return;
    if (v.kicked) return leave('คุณถูกเชิญออกจากห้อง');
    if (v.error) { S.joinErr = v.error; S.priv = null; return render(); }
    S.joinErr = '';
    S.priv = v;
    render();
  });
  c.onStatus = on => { S.online = on; if (on) hello(); render(); };
  hello();
  pingTimer = setInterval(() => c.send('in', { t: 'ping', pid: S.pid }), 8000);
  saveSess();
}

function startHost() {
  H.settings.uc ||= { auto: true, uc: 1, white: 0 };
  H.settings.av ||= AV.defaults();
  S.conn.sub('in', hostIn);
  S.conn.onStatus = on => {
    S.online = on;
    if (on) { for (const k in sentPriv) delete sentPriv[k]; broadcast(); } else render();
  };
  hostTimer = setInterval(hostTick, 1000);
  saveSess();
  broadcast();
}

function nameOk() {
  S.name = cleanName(S.name);
  if (!S.name) { S.err = 'ใส่ชื่อของคุณก่อน'; render(); document.getElementById('name')?.focus(); return false; }
  LS.set('bg_name', S.name);
  return true;
}

async function createRoom(game) {
  if (!nameOk() || S.busy) return;
  S.busy = 'create'; S.err = ''; render();
  try {
    S.conn = await Net.create(roomCode);
    S.room = S.conn.room;
    S.pid = uid();
    S.isHost = true;
    H = newHost(S.room, game, S.name);
    startHost();
  } catch (e) { S.err = e.message; S.conn = null; }
  S.busy = '';
  render();
}

async function joinRoom(code, pid = uid(), bi) {
  code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!nameOk() || S.busy) return;
  if (code.length !== 4) { S.err = 'รหัสห้องต้องมี 4 ตัวอักษร'; return render(); }
  S.busy = 'join'; S.err = ''; render();
  try {
    const r = await Net.join(code, bi);
    if (!r) S.err = `ไม่พบห้อง ${code} (ห้องอาจปิดไปแล้ว)`;
    else {
      S.conn = r.room; S.room = code; S.pid = pid; S.isHost = false;
      history.replaceState(null, '', location.pathname + '?r=' + code);
      startClient();
      applyPub(r.pub);
    }
  } catch (e) { S.err = e.message; }
  S.busy = '';
  render();
}

async function resume(s) {
  S.name = s.name;
  if (!s.host) return joinRoom(s.room, s.pid, s.bi);
  const h = LS.get('bg_host_' + s.room, null);
  if (!h) { S.err = 'ไม่พบข้อมูลห้องเดิมในเครื่องนี้'; LS.del('bg_last'); return render(); }
  S.busy = 'resume'; render();
  try {
    S.conn = await Net.reopen(s.room, s.bi);
    S.room = s.room; S.pid = s.pid; S.isHost = true; H = h;
    startHost();
  } catch (e) { S.err = e.message; S.conn = null; }
  S.busy = '';
  render();
}

function leave(msg = '') {
  if (S.conn) {
    if (S.isHost && H) {
      for (const p of H.players) S.conn.send('p/' + p.pid, null, true);
      S.conn.send('pub', null, true);
      LS.del('bg_host_' + H.room);
    } else S.conn.send('in', { t: 'leave', pid: S.pid });
    const c = S.conn;
    setTimeout(() => c.end(), 400);
  }
  clearInterval(hostTimer); clearInterval(pingTimer);
  SS.del('bg_sess'); LS.del('bg_last');
  H = null; lastPub = '';
  Object.assign(S, { conn: null, room: null, pid: null, isHost: false, pub: null, priv: null, joinErr: '', err: msg, key: '', round: -1 });
  history.replaceState(null, '', location.pathname);
  render();
}

/* ───────────── views ───────────── */
const me = () => S.priv?.sid;
const isHostView = () => S.isHost;
const pl = () => S.pub?.players || [];
const pn = sid => pl().find(p => p.sid === sid)?.name || '?';
const btn = (act, label, cls = '', data = {}, dis = false) =>
  `<button class="btn ${cls}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} ${dis ? 'disabled' : ''}>${label}</button>`;

function home() {
  const last = LS.get('bg_last', null);
  const lastOk = last && now() - last.t < 12 * 3600e3;
  const g = (k, desc) => `<button class="game g-${k}" data-act="create" data-game="${k}" ${S.busy ? 'disabled' : ''}>
      <span class="gemo">${GAMES[k].e}</span><span><b>${GAMES[k].n}</b><small>${desc}</small></span></button>`;
  return `<main class="wrap home">
    <header class="brand"><img class="logo" src="icons/icon-192.png" alt="" width="96" height="96"><h1>BKK11 Boardgames</h1><p>ทุกคนเปิดเว็บนี้บนมือถือตัวเอง แล้วเข้าห้องเดียวกัน</p></header>
    ${S.err ? `<div class="alert">${esc(S.err)}</div>` : ''}
    <section class="panel"><label for="name">ชื่อของคุณ</label>
      <input id="name" maxlength="16" autocomplete="nickname" placeholder="เช่น ต้น" value="${esc(S.name)}"></section>
    <section class="panel"><h2>เข้าร่วมห้อง</h2>
      <div class="row"><input id="code" class="code-in" maxlength="4" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="ABCD" value="${esc(S.codeIn)}">
      ${btn('join', S.busy === 'join' ? 'กำลังหา…' : 'เข้าห้อง', 'primary', {}, !!S.busy)}</div></section>
    <section class="panel"><h2>สร้างห้องใหม่</h2>
      ${g('onuw', '3–10 คน · ~10 นาที · หาหมาป่าให้เจอในคืนเดียว')}
      ${g('spyfall', '3–10 คน · ~8 นาที · หาสปายที่ไม่รู้ว่าอยู่ที่ไหน')}
      ${g('uc', '4–10 คน · ~10 นาที · หาคนที่ได้คำไม่เหมือนเพื่อน')}
      ${g('av', '5–10 คน · ~30 นาที · ภารกิจ โหวต และหักหลัง')}
      ${S.busy === 'create' ? '<p class="muted center">กำลังสร้างห้อง…</p>' : ''}</section>
    ${installHint()}
    ${lastOk && !S.busy ? `<section class="panel"><button class="btn ghost wide" data-act="resume">↩︎ กลับเข้าห้อง ${esc(last.room)}${last.host ? ' (เจ้าของห้อง)' : ''}</button></section>` : ''}
  </main>`;
}

// Install as a home-screen app.
let installEvt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!S.conn) render(); });
addEventListener('appinstalled', () => { installEvt = null; if (!S.conn) render(); });
function installHint() {
  if (standalone()) return '';
  if (installEvt) return `<section class="panel install">${btn('install', '📲 ติดตั้งเป็นแอปบนมือถือ', 'ghost wide')}</section>`;
  if (isIOS()) return '<section class="panel install small">📲 ติดตั้งเป็นแอป: กดปุ่ม <b>แชร์</b> <span aria-hidden="true">⬆︎</span> ใน Safari แล้วเลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b></section>';
  return '';
}

const loading = t => `<main class="wrap"><div class="loading"><div class="spin"></div><p>${t}</p></div></main>`;

function shell(body) {
  const p = S.pub, G = GAMES[p.game];
  return `<div class="top"><div class="wrap topin">
      <div class="tl"><span class="tg">${G.e} ${G.s}</span><span class="tc">ห้อง <b>${p.room}</b></span></div>
      <div class="tr"><button class="ib" data-act="rules" aria-label="กติกา">?</button><button class="ib out" data-act="leave">ออก</button></div>
    </div></div>
    ${S.online ? '' : '<div class="offline">⚠︎ การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…</div>'}
    <main class="wrap phase-${p.phase} game-${p.game}">${body}</main>
    ${S.rules ? rulesView() : ''}
    ${S.toast ? `<div class="toast">${esc(S.toast)}</div>` : ''}`;
}

function view() {
  if (S.busy === 'resume') return loading('กำลังกลับเข้าห้อง…');
  if (!S.conn) return home();
  if (!S.pub) return loading('กำลังเชื่อมต่อ…');
  if (!S.priv) {
    return shell(S.joinErr
      ? `<div class="panel center"><p class="alert">${esc(S.joinErr)}</p><div class="row">${btn('rejoin', 'ลองใหม่', 'primary')}${btn('leave', 'ออก', 'ghost')}</div></div>`
      : `<div class="loading"><div class="spin"></div><p>กำลังเข้าห้อง…</p><p class="muted small">ถ้านานเกินไป เจ้าของห้องอาจปิดจอหรือออฟไลน์อยู่</p></div>`);
  }
  if (S.priv.spectator) return shell(`<div class="panel center"><p>รอบนี้เริ่มไปแล้ว รอเล่นรอบถัดไปนะ</p></div>`);
  if (S.pub.phase !== 'lobby' && S.priv.round !== S.pub.round) return shell('<div class="loading"><div class="spin"></div><p>กำลังรับข้อมูล…</p></div>');
  const p = S.pub, v = {
    lobby, aroles: avRolesV, ateam: avTeamV, avote: avVoteV, avres: avResV, aquest: avQuestV, aqres: avQResV, aassn: avAssnV, aend: avEndV,
    uword: ucWordV, udesc: ucDescV, uvote: ucVoteV, uout: ucOutV, uend: ucEndV, deal: dealV, night: nightV, day: dayV, vote: voteV, result: resultV, play: playV, reveal: revealV,
  }[p.phase];
  try { return shell(v ? v() : ''); } catch (e) {
    console.error(e);
    return shell('<div class="loading"><div class="spin"></div><p>กำลังรับข้อมูล…</p></div>');
  }
}

function players(opts = {}) {
  const p = S.pub;
  return `<ul class="players">${pl().map(x => `<li class="${x.on ? '' : 'off'}">
      <span class="dot"></span><span class="pname">${esc(x.name)}${x.sid === me() ? ' <em>(คุณ)</em>' : ''}${x.sid === p.host ? ' 👑' : ''}</span>
      ${opts.ready?.includes(x.sid) ? '<span class="tag ok">พร้อม</span>' : ''}
      ${opts.voted?.includes(x.sid) ? '<span class="tag ok">โหวตแล้ว</span>' : ''}
      ${opts.kick && x.sid !== me() ? `<button class="x" data-act="kick" data-sid="${x.sid}" aria-label="เอาออก">✕</button>` : ''}
    </li>`).join('')}</ul>`;
}

const stepper = (k, label, val, unit) => `<div class="stepper"><span>${label}</span>
  <div class="sctl"><button class="sb" data-act="set" data-k="${k}" data-d="-1">−</button><b>${val}${unit}</b><button class="sb" data-act="set" data-k="${k}" data-d="1">+</button></div></div>`;

function deckChips(deck) {
  const c = {};
  deck.forEach(r => (c[r] = (c[r] || 0) + 1));
  return `<div class="chips">${WW.UI_ORDER.filter(r => c[r]).map(r => `<span class="chip t-${ROLE[r].t}">${ROLE[r].e} ${ROLE[r].n}${c[r] > 1 ? ` ×${c[r]}` : ''}</span>`).join('')}</div>`;
}

function lobby() {
  const p = S.pub, n = pl().length, host = isHostView(), G = GAMES[p.game];
  const link = location.origin + location.pathname + '?r=' + p.room;
  let settings = '', errs = [];
  if (p.game === 'onuw') {
    const deck = p.set.deck, need = n + 3;
    errs = WW.validate(deck, n);
    settings = host
      ? `<div class="deck">${WW.UI_ORDER.map(r => `<div class="drow t-${ROLE[r].t}"><span>${ROLE[r].e} ${ROLE[r].n}</span>
          <div class="sctl"><button class="sb" data-act="deck" data-r="${r}" data-d="-1">−</button><b>${WW.count(deck, r)}</b><button class="sb" data-act="deck" data-r="${r}" data-d="1">+</button></div></div>`).join('')}</div>
        <div class="deckfoot ${deck.length === need ? 'ok' : 'bad'}">การ์ด ${deck.length} / ${need} ใบ ${p.set.onuw.auto ? '· ชุดแนะนำ (ปรับตามจำนวนคนอัตโนมัติ)' : ''}</div>
        ${p.set.onuw.auto ? '' : btn('autodeck', '↺ ใช้ชุดแนะนำ', 'ghost small')}
        ${stepper('onuw.night', 'เวลาต่อบทบาทตอนกลางคืน', p.set.onuw.night, ' วิ')}
        ${stepper('onuw.day', 'เวลาคุยตอนกลางวัน', p.set.onuw.day / 60, ' นาที')}
        <label class="toggle"><input type="checkbox" data-act="voice" ${S.voice ? 'checked' : ''}> 🔊 เสียงบรรยายจากเครื่องนี้</label>`
      : `${deckChips(deck)}<p class="muted small">การ์ด ${deck.length} ใบ · กลางคืน ${p.set.onuw.night} วิ/บทบาท · กลางวัน ${p.set.onuw.day / 60} นาที</p>`;
  } else if (p.game === 'av') {
    const a = p.set.av, T = AV.TEAMS[Math.max(AV.MIN, Math.min(AV.MAX, n))];
    errs = AV.validate(n, a);
    const lbl = { merlin: '🧙 เมอร์ลิน + 🗡️ นักฆ่า', percival: '🛡️ เพอร์ซิวัล', morgana: '🔮 มอร์แกนา', mordred: '🐍 มอเดรด', oberon: '👻 โอเบรอน' };
    settings = `${host
      ? AV.OPTIONAL.map(r => `<label class="toggle"><input type="checkbox" data-act="atoggle" data-r="${r}" ${a[r] ? 'checked' : ''}> ${lbl[r]}</label>`).join('')
      : `<div class="chips">${AV.OPTIONAL.filter(r => a[r]).map(r => `<span class="chip">${lbl[r]}</span>`).join('') || '<span class="muted small">ไม่มีบทบาทพิเศษ</span>'}</div>`}
      <p class="muted small">${n >= AV.MIN ? `ฝ่ายดี ${T[0]} · ฝ่ายร้าย ${T[1]} · ภารกิจ ${AV.QUESTS[n].map((x, i) => x + (AV.failsNeeded(n, i) > 1 ? '*' : '')).join('-')} คน${n >= 7 ? ' (* ต้องมี ❌ 2 ใบถึงล้ม)' : ''}` : ''}</p>`;
  } else if (p.game === 'uc') {
    const c = p.set.ucc;
    errs = UC.validate(n, c.uc, c.white);
    settings = host
      ? `${stepper('uc.uc', '🕶️ Undercover', c.uc, ' คน')}${stepper('uc.white', '🎩 Mr. White', c.white, ' คน')}
         <p class="muted small">พลเมือง ${Math.max(0, n - c.uc - c.white)} คน${p.set.uc.auto ? ' · ชุดแนะนำ (ปรับตามจำนวนคนอัตโนมัติ)' : ''}</p>
         ${p.set.uc.auto ? '' : btn('ucauto', '↺ ใช้ชุดแนะนำ', 'ghost small')}`
      : `<p class="muted small">Undercover ${c.uc} คน · Mr. White ${c.white} คน · พลเมือง ${Math.max(0, n - c.uc - c.white)} คน</p>`;
  } else {
    const ms = SF.maxSpies(n);
    if (n < SF.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${SF.MIN} คน`);
    const spies = Math.min(p.set.spyfall.spies, ms);
    settings = host
      ? `${stepper('spyfall.min', 'เวลาต่อรอบ', p.set.spyfall.min, ' นาที')}
         ${stepper('spyfall.spies', 'จำนวนสปาย', spies, ' คน')}
         ${p.set.spyfall.spies > ms ? '<p class="muted small">สปาย 2 คนใช้ได้เมื่อมีผู้เล่น 7 คนขึ้นไป</p>' : ''}`
      : `<p class="muted small">รอบละ ${p.set.spyfall.min} นาที · สปาย ${spies} คน · ${SF.LOCATIONS.length} สถานที่</p>`;
  }
  return `
    <section class="panel roomcard">
      <div class="label">รหัสห้อง — ให้เพื่อนกรอก หรือสแกน QR</div>
      <div class="roomcode">${p.room}</div>
      <div class="row">${btn('share', '🔗 แชร์ลิงก์', 'ghost')}${btn('qr', S.qr ? 'ซ่อน QR' : '▦ QR', 'ghost')}</div>
      ${S.qr ? `<div class="qr" id="qr" data-link="${esc(link)}"></div>` : ''}
    </section>
    <section class="panel">
      <h2>เกม</h2>
      <div class="seg">${Object.keys(GAMES).map(k => `<button class="${k === p.game ? 'on' : ''}" ${host ? `data-act="hgame" data-g="${k}"` : 'disabled'}>${GAMES[k].e} ${GAMES[k].s}</button>`).join('')}</div>
    </section>
    <section class="panel"><h2>ผู้เล่น <span class="muted">${n}/${G.max}</span></h2>${players({ kick: host })}</section>
    <section class="panel"><h2>ตั้งค่า</h2>${settings}</section>
    ${host
      ? `${errs.length ? `<p class="alert">${esc(errs[0])}</p>` : ''}${btn('start', `▶︎ เริ่มเกม ${G.s}`, 'primary wide big', {}, errs.length > 0)}
         <p class="muted small center">เจ้าของห้องควรเปิดจอค้างไว้ตลอดเกม (เครื่องนี้เป็นตัวคุมเวลา)</p>`
      : '<p class="muted center">รอเจ้าของห้องเริ่มเกม…</p>'}`;
}

function secret(inner, label) {
  return S.reveal
    ? `<button class="secret open" data-act="hide">${inner}<span class="hint">แตะเพื่อซ่อน</span></button>`
    : `<button class="secret closed" data-act="show"><span class="back">🂠</span><span class="hint">${label}</span><span class="muted small">อย่าให้คนอื่นเห็นจอ</span></button>`;
}

const roleCard = r => `<span class="role t-${ROLE[r].t}"><span class="remo">${ROLE[r].e}</span><span class="rn">${ROLE[r].n}</span>
  <span class="team">${TEAM[ROLE[r].t]}</span><span class="rd">${ROLE[r].d}</span></span>`;

function dealV() {
  const p = S.pub, v = S.priv, n = pl().length, rd = p.ready || [];
  return `<h1 class="ph">🃏 แจกการ์ดแล้ว</h1>
    ${secret(roleCard(v.role), 'แตะเพื่อดูบทบาทของคุณ')}
    <p class="muted small center">จำบทบาทไว้ แล้วกดซ่อน · ตอนกลางคืนการ์ดอาจถูกสลับ</p>
    ${v.ready ? '<p class="center ok-text">✔ คุณพร้อมแล้ว</p>' : btn('ready', 'ดูแล้ว พร้อม', 'primary wide big')}
    <section class="panel"><h2>พร้อม ${rd.length}/${n}</h2>${players({ ready: rd })}</section>
    <section class="panel"><h2>การ์ดในเกมนี้</h2>${deckChips(p.deck)}<p class="muted small">มีการ์ด 3 ใบวางคว่ำอยู่ตรงกลาง</p></section>
    ${isHostView() ? btn('night', rd.length >= n ? '🌙 เริ่มกลางคืน' : `🌙 เริ่มกลางคืน (พร้อม ${rd.length}/${n})`, 'primary wide big') : ''}`;
}

const phaseKnow = () => {
  const pi = (S.pub.step?.[0] || 0) - 1;
  return (S.priv.know || []).filter(k => k.ph === pi);
};

function actUI(kind) {
  const others = pl().filter(x => x.sid !== me());
  const pbtn = x => { const k = 'p:' + x.sid; return `<button class="pick ${S.sel.includes(k) ? 'on' : ''}" data-act="sel" data-v="${k}">${esc(x.name)}</button>`; };
  const cbtn = i => { const k = 'c:' + i; return `<button class="pick cc ${S.sel.includes(k) ? 'on' : ''}" data-act="sel" data-v="${k}">🂠<small>กลาง ${i + 1}</small></button>`; };
  const centers = `<div class="picks c3">${[0, 1, 2].map(cbtn).join('')}</div>`;
  const people = `<div class="picks">${others.map(pbtn).join('')}</div>`;
  const q = {
    peek: ['เลือกดูการ์ดกลาง 1 ใบ', centers],
    seer: ['ดูการ์ดผู้เล่น 1 คน', people + '<p class="or">หรือ ดูการ์ดกลาง 2 ใบ</p>' + centers],
    robber: ['เลือกผู้เล่นที่จะขโมยการ์ด', people],
    troublemaker: ['เลือกผู้เล่น 2 คนที่จะสลับการ์ดกัน', people],
    drunk: ['เลือกการ์ดกลาง 1 ใบมาสลับ (จะไม่ได้ดู)', centers],
  }[kind];
  return `<p class="ask">${q[0]}</p>${q[1]}${btn('doact', 'ยืนยัน', 'primary wide', {}, !actPayload(kind))}`;
}

function actPayload(kind) {
  const ps = S.sel.filter(x => x[0] === 'p').map(x => x.slice(2)), cs = S.sel.filter(x => x[0] === 'c').map(x => +x.slice(2));
  if ((kind === 'peek' || kind === 'drunk') && cs.length === 1 && !ps.length) return { c: cs[0] };
  if (kind === 'robber' && ps.length === 1 && !cs.length) return { p: ps[0] };
  if (kind === 'troublemaker' && ps.length === 2) return { ps };
  if (kind === 'seer') { if (ps.length === 1 && !cs.length) return { p: ps[0] }; if (cs.length === 2 && !ps.length) return { cs }; }
  return null;
}

function decoy() {
  return `<p class="ask">😴 หลับตาไว้… แต่แตะการ์ดเล่นไปด้วย</p>
    <div class="picks c3">${[0, 1, 2].map(i => `<button class="pick cc ${S.decoy === i ? 'on' : ''}" data-act="decoy" data-i="${i}">🂠<small>การ์ด ${i + 1}</small></button>`).join('')}</div>
    <p class="muted small center">ทุกคนแตะจอเหมือนกัน คนอื่นจะได้ไม่รู้ว่าใครตื่นอยู่</p>`;
}

function nightV() {
  const p = S.pub, v = S.priv, r = p.night;
  let body;
  if (!r) body = '<p class="big-t">ทุกคนหลับตา…</p><p class="muted center">คืนนี้กำลังจะเริ่ม วางมือถือให้คนอื่นมองไม่เห็นจอ</p>';
  else if (v.role === r) {
    const ks = phaseKnow();
    body = `<div class="wake">✨ ถึงตาคุณแล้ว (${RL(r)})</div>
      ${ks.map(k => `<div class="info">${esc(k.txt)}</div>`).join('')}
      ${v.act ? actUI(v.act) : `<p class="muted center">${ks.length ? 'จำไว้แล้วหลับตาต่อ' : 'เสร็จแล้ว หลับตาต่อ'}</p>`}`;
  } else body = decoy();
  return `<div class="night">
      <div class="moon">🌙</div>
      ${r ? `<div class="nphase">${RL(r)} ตื่น</div><div class="muted small">ลำดับ ${p.step[0]}/${p.step[1]}</div>` : ''}
      <div class="timer" data-timer></div>
      ${body}
    </div>`;
}

function knowList() {
  const ks = S.priv.know || [];
  return ks.length ? `<ul class="know">${ks.map(k => `<li>${esc(k.txt)}</li>`).join('')}</ul>` : '<span class="muted small">คืนนี้คุณไม่ได้ข้อมูลอะไรเพิ่ม</span>';
}

function dayV() {
  const p = S.pub, v = S.priv;
  return `<h1 class="ph">☀️ กลางวัน</h1>
    <div class="timer big" data-timer></div>
    <p class="center">คุยกัน หาว่าใครคือมนุษย์หมาป่า — พูดความจริงหรือโกหกก็ได้</p>
    ${secret(`<span class="small muted">การ์ดเริ่มต้นของคุณ</span>${roleCard(v.role)}<span class="klabel">สิ่งที่คุณรู้จากคืนนี้</span>${knowList()}`, 'แตะเพื่อดูบทบาท + สิ่งที่รู้')}
    <section class="panel"><h2>การ์ดในเกมนี้</h2>${deckChips(p.deck)}<p class="muted small">3 ใบอยู่ตรงกลาง · การ์ดของทุกคนอาจถูกสลับไปแล้ว ฝ่ายวัดจากการ์ดใบสุดท้าย</p></section>
    ${isHostView() ? `<div class="row">${btn('extend', '+1 นาที', 'ghost')}${btn('tovote', '🗳️ ไปโหวตเลย', 'primary')}</div>` : ''}`;
}

function voteV() {
  const p = S.pub, v = S.priv, voted = p.voted || [];
  return `<h1 class="ph">🗳️ โหวต</h1>
    <p class="center">นับ 3 แล้วชี้พร้อมกัน — หรือโหวตในนี้เลย<br><span class="muted small">คนที่ได้มากที่สุด (อย่างน้อย 2 เสียง) จะตาย · เปลี่ยนใจได้จนกว่าจะครบทุกคน</span></p>
    <div class="picks">${pl().filter(x => x.sid !== me()).map(x => `<button class="pick ${v.vote === x.sid ? 'on' : ''}" data-act="vote" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div>
    <p class="center">${v.vote ? `คุณโหวต <b>${esc(pn(v.vote))}</b>` : 'ยังไม่ได้โหวต'}</p>
    <section class="panel"><h2>โหวตแล้ว ${voted.length}/${pl().length}</h2>${players({ voted })}</section>
    ${isHostView() ? btn('finish', 'สรุปผลเลย', 'ghost wide') : ''}`;
}

function resultV() {
  const R = S.pub.result, mine = R.rows.find(r => r.sid === me());
  return `<div class="banner ${mine?.win ? 'win' : 'lose'}"><div class="bt">${mine?.win ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>${esc(R.head)}</div><div class="small">${esc(R.sub)}</div>
      ${R.noWolves ? '<div class="small">ไม่มีหมาป่าในหมู่ผู้เล่น (อยู่ตรงกลางทั้งหมด)</div>' : ''}</div>
    <section class="panel"><h2>เฉลยการ์ด</h2>
      <table class="res"><thead><tr><th>ผู้เล่น</th><th>เริ่ม → จบ</th><th>โหวต</th></tr></thead><tbody>
      ${R.rows.map(r => `<tr class="${r.win ? 'w' : ''}"><td>${r.dead ? '💀 ' : ''}${esc(pn(r.sid))}${r.win ? ' 🏆' : ''}<div class="muted small">→ ${r.to ? esc(pn(r.to)) : '—'}</div></td>
        <td>${ROLE[r.init].e}${r.init !== r.fin ? ` → ${ROLE[r.fin].e}` : ''} <span class="small">${ROLE[r.fin].n}</span></td><td class="c">${r.votes}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted small">กลาง: ${R.center.map((c, i) => `${i + 1}) ${c.init !== c.fin ? `${ROLE[c.init].e}→` : ''}${RL(c.fin)}`).join(' · ')}</p>
    </section>
    <section class="panel"><h2>เกิดอะไรขึ้นตอนกลางคืน</h2>${R.log.length ? `<ol class="log">${R.log.map(l => `<li>${esc(l)}</li>`).join('')}</ol>` : '<p class="muted">ไม่มีใครทำอะไร</p>'}</section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

function locGrid(clickable) {
  return `<div class="locs ${S.guess ? 'guessing' : ''}">${SF.LOCATIONS.map((l, i) => `<button class="loc ${S.crossed.has(i) ? 'x' : ''}" data-act="${clickable}" data-i="${i}"><span>${l.e}</span>${esc(l.n)}</button>`).join('')}</div>`;
}

function playV() {
  const p = S.pub, v = S.priv, host = isHostView();
  const card = v.spy
    ? `<span class="spy"><span class="remo">🕵️</span><span class="rn">คุณคือสปาย</span><span class="rd">ฟังคำถามคำตอบ แล้วเดาให้ได้ว่าทุกคนอยู่ที่ไหน · อย่าให้ใครจับได้${p.nspies > 1 ? ' · รอบนี้มีสปาย 2 คน (ไม่รู้ว่าอีกคนคือใคร)' : ''}</span></span>`
    : `<span class="spyloc"><span class="remo">${SF.LOCATIONS[v.loc].e}</span><span class="rn">${esc(SF.LOCATIONS[v.loc].n)}</span><span class="team">บทบาท: ${esc(v.role)}</span><span class="rd">ตอบคำถามให้คนอื่นรู้ว่าคุณรู้สถานที่ แต่อย่าชัดจนสปายเดาได้</span></span>`;
  return `<div class="timer big" data-timer></div>
    ${host ? `<div class="row">${btn('pause', p.paused != null ? '▶︎ เล่นต่อ' : '⏸ หยุดเวลา', 'ghost')}${btn('reveal', '🔍 เฉลย / จบรอบ', 'primary')}</div>` : ''}
    <p class="center first">🎤 <b>${esc(pn(p.first))}</b> เริ่มถามก่อน</p>
    ${secret(card, 'แตะเพื่อดูสถานที่ของคุณ')}
    <p class="muted small center">สปาย ${p.nspies} คน · ผู้เล่น ${pl().length} คน</p>
    <section class="panel"><h2>สถานที่ทั้งหมด</h2>
      ${v.spy ? btn('guessmode', S.guess ? 'ยกเลิกการเดา' : '🎯 เดาสถานที่ (จบรอบทันที)', S.guess ? 'danger wide' : 'ghost wide') : ''}
      <p class="muted small">${S.guess ? 'แตะสถานที่ที่คิดว่าใช่' : 'แตะเพื่อขีดฆ่าสถานที่ที่ตัดทิ้งแล้ว (เห็นแค่คุณ)'}</p>
      ${locGrid('loc')}
    </section>`;
}

function revealV() {
  const R = S.pub.result, L = SF.LOCATIONS[R.loc], host = isHostView();
  let verdict = 'หมดเวลา/เฉลยแล้ว — ถ้าโหวตจับสปายได้ ฝ่ายชาวบ้านชนะ ถ้าจับผิดคน สปายชนะ';
  if (R.guess) verdict = R.guess.ok
    ? `🕵️ ${esc(pn(R.guess.by))} เดาว่า “${esc(SF.LOCATIONS[R.guess.loc].n)}” — ถูกต้อง! สปายชนะ`
    : `🕵️ ${esc(pn(R.guess.by))} เดาว่า “${esc(SF.LOCATIONS[R.guess.loc].n)}” — ผิด! ฝ่ายชาวบ้านชนะ`;
  return `<div class="banner ${R.guess ? (R.guess.ok ? 'lose' : 'win') : ''}"><div class="remo">${L.e}</div><div class="bt">${esc(L.n)}</div>
      <div>สปาย: <b>${R.spies.map(s => esc(pn(s))).join(', ')}</b></div></div>
    <p class="center">${verdict}</p>
    <section class="panel"><h2>บทบาทของทุกคน</h2><ul class="players">${pl().map(x => `<li><span class="pname">${esc(x.name)}</span><span class="${R.spies.includes(x.sid) ? 'tag bad' : 'muted'}">${R.spies.includes(x.sid) ? '🕵️ สปาย' : esc(R.roles[x.sid] || '')}</span></li>`).join('')}</ul></section>
    ${host ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 รอบใหม่', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

const AR = r => `${AV.ROLES[r].e} ${AV.ROLES[r].n}`;

function avRoleCard() {
  const v = S.priv, R = AV.ROLES[v.role], t = R.t === 'good' ? 'village' : 'wolf';
  return `<span class="role t-${t}"><span class="remo">${R.e}</span><span class="rn">${R.n}</span><span class="team">${R.t === 'good' ? 'ฝ่ายดี' : 'ฝ่ายร้าย'}</span><span class="rd">${R.d}</span>
    ${v.info ? `<span class="info">${esc(v.info)}</span>` : ''}</span>`;
}

function avBoard() {
  const a = S.pub.av;
  return `<section class="panel board">
    <div class="quests">${a.quests.map((q, i) => `<div class="qc ${q.res === 'S' ? 'ok' : q.res === 'F' ? 'bad' : i === a.q ? 'cur' : ''}">
      <b>${q.res === 'S' ? '✅' : q.res === 'F' ? '❌' : q.size}</b><small>${q.res ? `${q.size} คน` : `ภารกิจ ${i + 1}`}${q.need > 1 ? ' · ❌2' : ''}</small></div>`).join('')}</div>
    <div class="rej">โหวตไม่ผ่าน ${[0, 1, 2, 3, 4].map(i => `<span class="rd2 ${i < a.rejects ? 'on' : ''}"></span>`).join('')} <span class="muted small">(5 = ฝ่ายร้ายชนะ)</span></div>
    <div class="small">👑 หัวหน้า: <b>${esc(pn(a.leader))}</b>${a.leader === me() ? ' (คุณ)' : ''}</div>
  </section>`;
}

const avMine = () => secret(avRoleCard(), 'แตะเพื่อดูบทบาทของคุณ');
const avTeam = t => `<div class="chips">${t.map(s => `<span class="chip">${esc(pn(s))}</span>`).join('')}</div>`;

function avRolesV() {
  const p = S.pub, v = S.priv, n = pl().length, rd = p.ready || [];
  return `<h1 class="ph">🏰 ดูบทบาทของคุณ</h1>
    ${avMine()}
    <p class="muted small center">จำไว้แล้วกดซ่อน · อย่าให้ใครเห็นจอ</p>
    ${v.ready ? '<p class="center ok-text">✔ คุณพร้อมแล้ว</p>' : btn('ready', 'ดูแล้ว พร้อม', 'primary wide big')}
    <section class="panel"><h2>พร้อม ${rd.length}/${n}</h2>${players({ ready: rd })}</section>
    ${isHostView() ? btn('astart', rd.length >= n ? '⚔️ เริ่มภารกิจแรก' : `⚔️ เริ่มภารกิจแรก (พร้อม ${rd.length}/${n})`, 'primary wide big') : ''}`;
}

function avTeamV() {
  const a = S.pub.av, size = a.quests[a.q].size;
  const body = a.leader === me()
    ? `<p class="ask center">👑 คุณเป็นหัวหน้า — เลือกทีม ${size} คน (เลือกตัวเองได้)</p>
       <div class="picks">${pl().map(x => `<button class="pick ${S.sel.includes(x.sid) ? 'on' : ''}" data-act="apick" data-sid="${x.sid}">${esc(x.name)}${x.sid === me() ? ' (คุณ)' : ''}</button>`).join('')}</div>
       ${btn('apropose', `เสนอทีมนี้ (${S.sel.length}/${size})`, 'primary wide big', {}, S.sel.length !== size)}`
    : `<p class="center big-t">👑 ${esc(pn(a.leader))} กำลังเลือกทีม ${size} คน</p><p class="muted center">คุยกัน เสนอกันได้เลยว่าควรส่งใคร</p>`;
  return `${avBoard()}${body}${avMine()}`;
}

function avVoteV() {
  const a = S.pub.av, v = S.priv, voted = S.pub.voted || [];
  return `${avBoard()}
    <h1 class="ph">🗳️ อนุมัติทีมนี้ไหม?</h1>${avTeam(a.team)}
    <div class="row">${btn('avote', '✅ อนุมัติ', v.vote === true ? 'primary' : '', { ok: 1 })}${btn('avote', '❌ ไม่อนุมัติ', v.vote === false ? 'danger' : '', { ok: 0 })}</div>
    <p class="center muted small">ผลโหวตของทุกคนจะเปิดพร้อมกัน · เปลี่ยนใจได้จนกว่าจะครบ</p>
    <section class="panel"><h2>โหวตแล้ว ${voted.length}/${pl().length}</h2>${players({ voted })}</section>
    ${avMine()}`;
}

function avResV() {
  const h = S.pub.av.hist.at(-1);
  return `${avBoard()}
    <div class="banner ${h.ok ? 'win' : 'lose'}"><div class="bt">${h.ok ? '✅ ทีมผ่าน' : '❌ ทีมไม่ผ่าน'}</div>
      <div class="small">${h.ok ? 'ทีมนี้ออกไปทำภารกิจ' : 'หัวหน้าเปลี่ยนเป็นคนถัดไป'}</div></div>
    <section class="panel"><h2>ทีม</h2>${avTeam(h.team)}</section>
    <section class="panel"><h2>ใครโหวตอะไร</h2><ul class="players">${pl().map(x => `<li><span class="pname">${esc(x.name)}</span><span>${h.votes[x.sid] ? '✅' : '❌'}</span></li>`).join('')}</ul></section>
    ${isHostView() ? btn('anext', 'ต่อไป ▶', 'primary wide big') : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
}

function avQuestV() {
  const a = S.pub.av, v = S.priv, onTeam = a.team.includes(me()), evil = AV.ROLES[v.role].t === 'evil';
  let body = `<p class="center">ทีมกำลังทำภารกิจ… (${S.pub.played}/${a.team.length})</p>`;
  if (onTeam) body = v.played
    ? `<p class="center ok-text">✔ ส่งการ์ดแล้ว รอคนอื่น (${S.pub.played}/${a.team.length})</p>`
    : `<p class="ask center">เลือกการ์ดภารกิจ (ไม่มีใครรู้ว่าใครส่งอะไร)</p>
       <div class="row">${btn('acard', '✅ สำเร็จ', 'primary big', { ok: 1 })}${evil ? btn('acard', '❌ ล้มเหลว', 'danger big', { ok: 0 }) : ''}</div>
       ${evil ? '' : '<p class="muted small center">ฝ่ายดีส่งได้แค่ ✅ เท่านั้น</p>'}`;
  return `${avBoard()}<h1 class="ph">⚔️ ภารกิจที่ ${a.q + 1}</h1>${avTeam(a.team)}${body}${avMine()}`;
}

function avQResV() {
  const a = S.pub.av, Q = a.quests[a.q - 1];
  const cards = [...Array(Q.size - Q.fails).fill('✅'), ...Array(Q.fails).fill('❌')];
  return `${avBoard()}
    <div class="banner ${Q.res === 'S' ? 'win' : 'lose'}"><div class="small">ภารกิจที่ ${a.q}</div><div class="bt">${Q.res === 'S' ? '✅ สำเร็จ' : '❌ ล้มเหลว'}</div>
      <div class="qcards">${cards.join(' ')}</div><div class="small">มีการ์ด ❌ ${Q.fails} ใบ${Q.need > 1 ? ' (ภารกิจนี้ต้อง ❌ 2 ใบถึงล้ม)' : ''}</div></div>
    ${isHostView() ? btn('anext', 'ต่อไป ▶', 'primary wide big') : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
}

function avAssnV() {
  const v = S.priv, evil = AV.ROLES[v.role].t === 'evil';
  const body = v.role === 'assassin'
    ? `<p class="ask center">🗡️ คุณคือนักฆ่า — เลือกคนที่คิดว่าเป็นเมอร์ลิน (ปรึกษาพวกพ้องได้)</p>
       <div class="picks">${pl().filter(x => x.sid !== me()).map(x => `<button class="pick" data-act="akill" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div>`
    : evil ? '<p class="center">ช่วยนักฆ่าคิดว่าใครคือเมอร์ลิน!</p>' : '<p class="center">🤐 นักฆ่ากำลังตามหาเมอร์ลิน… ห้ามบอกใบ้</p>';
  return `${avBoard()}<div class="banner"><div class="bt">🗡️ นักฆ่ามีโอกาสสุดท้าย</div><div class="small">ฝ่ายดีสำเร็จ 3 ภารกิจ แต่ถ้านักฆ่าเดาเมอร์ลินถูก ฝ่ายร้ายชนะ</div></div>${body}${avMine()}`;
}

function avEndV() {
  const R = S.pub.result, myTeam = AV.ROLES[S.priv.role].t, win = myTeam === R.w;
  const why = { rejects: 'โหวตไม่ผ่าน 5 ครั้งติด', quests: R.w === 'good' ? 'ภารกิจสำเร็จ 3 ครั้ง' : 'ภารกิจล้มเหลว 3 ครั้ง', merlin: `นักฆ่าเดาถูก — ${pn(R.kill)} คือเมอร์ลิน`, missed: `นักฆ่าเดาผิด — ${pn(R.kill)} ไม่ใช่เมอร์ลิน` }[R.why];
  return `<div class="banner ${win ? 'win' : 'lose'}"><div class="bt">${win ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>${R.w === 'good' ? '🛡️ ฝ่ายดีชนะ' : '😈 ฝ่ายร้ายชนะ'}</div><div class="small">${esc(why)}</div></div>
    ${avBoard()}
    <section class="panel"><h2>บทบาทของทุกคน</h2><table class="res"><tbody>${pl().map(x => `<tr class="${AV.ROLES[R.roles[x.sid]].t === R.w ? 'w' : ''}"><td>${esc(x.name)}${x.sid === R.kill ? ' 🗡️' : ''}</td><td>${AR(R.roles[x.sid])}</td></tr>`).join('')}</tbody></table></section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

const UCR = { civ: '🙂 พลเมือง', uc: '🕶️ Undercover', white: '🎩 Mr. White' };

function wordCard(v) {
  return v.white
    ? `<span class="role"><span class="remo">🎩</span><span class="rn">Mr. White</span><span class="team">คุณไม่มีคำ</span><span class="rd">ฟังคนอื่นแล้วบรรยายให้เนียน ถ้าถูกโหวตออก ได้ทายคำของพลเมือง — ทายถูกชนะทันที</span></span>`
    : `<span class="role"><span class="small muted">คำของคุณ</span><span class="rn word">${esc(v.word)}</span><span class="rd">คุณอาจเป็นพลเมืองหรือ Undercover — ไม่มีใครรู้ แม้แต่ตัวคุณเอง</span></span>`;
}

function ucInfo() {
  const p = S.pub, n = pl().length;
  return `<div class="chips"><span class="chip">🙂 พลเมือง ${n - p.counts.uc - p.counts.white}</span><span class="chip">🕶️ Undercover ${p.counts.uc}</span>${p.counts.white ? '<span class="chip">🎩 Mr. White 1</span>' : ''}</div>`;
}

function ucOutList() {
  const o = S.pub.out || [];
  return o.length ? `<section class="panel"><h2>ออกไปแล้ว</h2><ul class="players">${o.map(x => `<li class="off"><span class="dot"></span><span class="pname">${esc(pn(x.sid))}</span><span class="muted small">${UCR[x.role]}</span></li>`).join('')}</ul></section>` : '';
}

const deadNote = () => (S.priv.alive ? '' : '<p class="alert center">คุณตกรอบแล้ว — ดูต่อได้ แต่ห้ามบอกใบ้นะ</p>');

function ucWordV() {
  const p = S.pub, v = S.priv, n = pl().length, rd = p.ready || [];
  return `<h1 class="ph">🎭 รับคำของคุณ</h1>
    ${secret(wordCard(v), 'แตะเพื่อดูคำของคุณ')}
    <p class="muted small center">จำคำไว้ แล้วกดซ่อน</p>
    ${v.ready ? '<p class="center ok-text">✔ คุณพร้อมแล้ว</p>' : btn('ready', 'ดูแล้ว พร้อม', 'primary wide big')}
    <section class="panel"><h2>ในเกมนี้มี</h2>${ucInfo()}</section>
    <section class="panel"><h2>พร้อม ${rd.length}/${n}</h2>${players({ ready: rd })}</section>
    ${isHostView() ? btn('udesc', rd.length >= n ? '🎤 เริ่มบรรยาย' : `🎤 เริ่มบรรยาย (พร้อม ${rd.length}/${n})`, 'primary wide big') : ''}`;
}

function ucDescV() {
  const p = S.pub, v = S.priv;
  return `<h1 class="ph">🎤 รอบที่ ${p.turn}</h1>
    ${deadNote()}
    <p class="center">พูดบรรยายคำของตัวเองทีละคน คนละ 1 ประโยค<br><span class="muted small">ห้ามพูดคำนั้นตรงๆ · Mr. White จะไม่ได้พูดคนแรก</span></p>
    <section class="panel"><h2>ลำดับการพูด</h2><ol class="order">${p.order.map(s => `<li${s === me() ? ' class="me"' : ''}>${esc(pn(s))}${s === me() ? ' <em>(คุณ)</em>' : ''}</li>`).join('')}</ol></section>
    ${secret(wordCard(v), 'แตะเพื่อดูคำของคุณอีกครั้ง')}
    <section class="panel"><h2>ในเกมนี้มี</h2>${ucInfo()}</section>
    ${ucOutList()}
    ${isHostView() ? btn('tovote', '🗳️ พูดครบแล้ว ไปโหวต', 'primary wide big') : ''}`;
}

function ucVoteV() {
  const p = S.pub, v = S.priv, pool = p.cand || p.alive, voted = p.voted || [];
  const alivePl = pl().filter(x => p.alive.includes(x.sid));
  return `<h1 class="ph">🗳️ โหวตออก</h1>
    ${p.cand ? `<p class="alert center">คะแนนเสมอ! โหวตใหม่เฉพาะ ${p.cand.map(s => esc(pn(s))).join(', ')}</p>` : '<p class="center muted small">โหวตคนที่คิดว่าเป็น Undercover หรือ Mr. White · เปลี่ยนใจได้จนกว่าจะครบทุกคน</p>'}
    ${v.alive
      ? `<div class="picks">${pool.filter(s => s !== me()).map(s => `<button class="pick ${v.vote === s ? 'on' : ''}" data-act="vote" data-sid="${s}">${esc(pn(s))}</button>`).join('')}</div>
         <p class="center">${v.vote ? `คุณโหวต <b>${esc(pn(v.vote))}</b>` : 'ยังไม่ได้โหวต'}</p>`
      : deadNote()}
    <section class="panel"><h2>โหวตแล้ว ${voted.length}/${alivePl.length}</h2>${players({ voted })}</section>
    ${ucOutList()}
    ${isHostView() ? btn('finish', 'สรุปผลเลย', 'ghost wide') : ''}`;
}

function ucOutV() {
  const p = S.pub, L = p.last, host = isHostView();
  let body;
  if (L.tie) body = `<div class="banner"><div class="bt">เสมออีกครั้ง</div><div>รอบนี้ไม่มีใครออก</div></div>`;
  else {
    body = `<div class="banner ${L.role === 'civ' ? 'lose' : 'win'}"><div class="small">ถูกโหวตออก</div><div class="bt">${esc(pn(L.sid))}</div><div>${UCR[L.role]}</div></div>`;
    if (L.role === 'white') {
      if (L.guessing) body += L.sid === me()
        ? `<section class="panel"><h2>🎩 ทายคำของพลเมือง</h2><p class="muted small">ทายถูก = คุณชนะทันที</p>
            <div class="row"><input id="wg" maxlength="40" autocomplete="off" placeholder="พิมพ์คำที่คิดว่าใช่" value="${esc(S.wg || '')}">${btn('wguess', 'ทาย', 'primary')}</div></section>`
        : `<p class="center">🎩 Mr. White กำลังทายคำของพลเมือง…</p>${host ? btn('uskip', 'ข้าม (ถือว่าทายผิด)', 'ghost wide small') : ''}`;
      else body += `<p class="center big-t">ทายว่า “${esc(L.guess || '—')}” — ${L.ok ? '✅ ถูก!' : '❌ ผิด'}</p>
        ${host && !L.ok && L.guess ? btn('uaccept', 'นับว่าถูก (สะกดต่างนิดหน่อย)', 'ghost wide small') : ''}`;
    }
  }
  return `${body}${ucOutList()}
    ${host ? btn('unext', 'ต่อไป ▶', 'primary wide big', {}, !!L.guessing) : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
}

function ucEndV() {
  const R = S.pub.result, mine = R.win[me()];
  const head = { civ: '🙂 พลเมืองชนะ', inf: '🕶️ ฝ่าย Undercover ชนะ', white: '🎩 Mr. White ชนะ (ทายคำถูก)' }[R.w];
  const outSet = new Set((S.pub.out || []).map(o => o.sid));
  return `<div class="banner ${mine ? 'win' : 'lose'}"><div class="bt">${mine ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>${head}</div></div>
    <section class="panel"><h2>เฉลยคำ</h2><p>🙂 พลเมือง: <b>${esc(R.words.civ)}</b><br>🕶️ Undercover: <b>${esc(R.words.uc)}</b></p></section>
    <section class="panel"><h2>บทบาทของทุกคน</h2>
      <table class="res"><tbody>${pl().map(x => `<tr class="${R.win[x.sid] ? 'w' : ''}"><td>${outSet.has(x.sid) ? '❌ ' : ''}${esc(x.name)}${R.win[x.sid] ? ' 🏆' : ''}</td><td>${UCR[R.role[x.sid]]}</td></tr>`).join('')}</tbody></table>
    </section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

function rulesView() {
  const g = S.pub.game;
  const body = g === 'av' ? `
    <p><b>เป้าหมาย:</b> ฝ่ายดีต้องทำภารกิจสำเร็จ 3 ใน 5 ครั้ง · ฝ่ายร้ายที่แฝงตัวอยู่ต้องทำให้ล้มเหลว 3 ครั้ง</p>
    <ol><li><b>👑 หัวหน้า</b> เลือกทีมตามจำนวนที่ภารกิจกำหนด (หัวหน้าวนไปทีละคน)</li>
    <li>ทุกคนโหวต ✅/❌ ทีมนั้นพร้อมกัน เสียงเห็นด้วยต้อง<b>เกินครึ่ง</b> ไม่ผ่านก็เปลี่ยนหัวหน้า · ไม่ผ่าน 5 ครั้งติด ฝ่ายร้ายชนะทันที</li>
    <li>คนในทีมส่งการ์ดลับ ฝ่ายดีส่งได้แค่ ✅ ฝ่ายร้ายเลือกได้ · มี ❌ แม้ใบเดียว ภารกิจล้ม (ภารกิจที่ 4 ตอนมี 7 คนขึ้นไปต้อง ❌ 2 ใบ)</li>
    <li>ถ้าฝ่ายดีสำเร็จ 3 ครั้ง <b>นักฆ่า</b> ได้เดาว่าใครคือเมอร์ลิน เดาถูก = ฝ่ายร้ายชนะ</li></ol>
    <ul class="rl">${Object.keys(AV.ROLES).map(r => `<li><b>${AV.ROLES[r].e} ${AV.ROLES[r].n}</b> — ${AV.ROLES[r].d}</li>`).join('')}</ul>` : g === 'uc' ? `
    <p><b>เป้าหมาย:</b> ทุกคนได้คำ 1 คำ พลเมืองได้คำเดียวกัน แต่ Undercover ได้คำที่<b>คล้ายกัน</b> และไม่มีใครรู้ว่าตัวเองอยู่ฝ่ายไหน</p>
    <ol><li>ผลัดกันบรรยายคำของตัวเองคนละ 1 ประโยค ตามลำดับบนจอ ห้ามพูดคำนั้นตรงๆ</li>
    <li>ฟังคนอื่น ถ้าคำคนส่วนใหญ่ไม่ตรงกับของคุณ แปลว่าคุณอาจเป็น Undercover ให้พูดกลมกลืนไว้</li>
    <li>โหวตออกทีละคน คนที่ถูกโหวตออกจะถูกเปิดเผยบทบาท · ถ้าเสมอ โหวตใหม่เฉพาะคนที่เสมอ ถ้ายังเสมอ รอบนั้นไม่มีใครออก</li>
    <li><b>🎩 Mr. White</b> ไม่ได้คำเลย ถ้าถูกโหวตออก ได้ทายคำของพลเมือง ทายถูก = ชนะทันที</li></ol>
    <p><b>พลเมืองชนะ</b> เมื่อ Undercover และ Mr. White ออกหมด · <b>Undercover ชนะ</b> เมื่อเหลือพลเมืองแค่ 1 คน</p>
    <p class="muted small">คู่คำ ${UC.PAIRS.length} คู่ · ไม่วนซ้ำภายใน ${UC.RECENT} รอบ</p>` : g === 'onuw' ? `
    <p><b>เป้าหมาย:</b> ฝ่ายชาวบ้านต้องโหวตฆ่าหมาป่าให้ได้อย่างน้อย 1 ตัว ฝ่ายหมาป่าต้องรอดทุกตัว</p>
    <ol><li>ทุกคนดูบทบาทของตัวเอง (มีการ์ดเกิน 3 ใบวางกลาง)</li>
    <li><b>กลางคืน:</b> ระบบเรียกบทบาทตามลำดับ ใครถึงตาจะเห็นปุ่มให้ทำ คนอื่นแตะการ์ดหลอกไปเรื่อยๆ ทุกบทบาทใช้เวลาเท่ากันแม้การ์ดนั้นอยู่ตรงกลาง</li>
    <li><b>กลางวัน:</b> คุยกันหาหมาป่า จะโกหกหรือพูดจริงก็ได้</li>
    <li><b>โหวต:</b> คนที่ได้เสียงมากสุด (≥2) ตาย ถ้าทุกคนได้ 1 เสียง ไม่มีใครตาย</li>
    <li>คุณอยู่ฝ่ายตาม <b>การ์ดใบสุดท้าย</b> ของคุณ ไม่ใช่ใบแรก</li></ol>
    <p class="muted small">ลำดับกลางคืน: ${WW.NIGHT.map(RL).join(' → ')}</p>
    <ul class="rl">${WW.UI_ORDER.map(r => `<li><b>${RL(r)}</b> — ${ROLE[r].d}</li>`).join('')}</ul>` : `
    <p><b>เป้าหมาย:</b> ทุกคนรู้สถานที่เดียวกัน ยกเว้นสปาย — ชาวบ้านต้องหาสปาย สปายต้องเดาสถานที่</p>
    <ol><li>คนที่ระบบสุ่มเริ่มถามก่อน ถามใครก็ได้ 1 คำถามเกี่ยวกับสถานที่</li>
    <li>คนตอบเป็นคนถามคนต่อไป (ห้ามถามกลับคนที่เพิ่งถามตัวเอง)</li>
    <li>ใครสงสัยใครก็เสนอโหวตได้ ถ้าทุกคน (ยกเว้นผู้ถูกกล่าวหา) เห็นด้วย ให้เจ้าของห้องกดเฉลย</li>
    <li>สปายกด “เดาสถานที่” ได้ตลอดเวลา — ถูกชนะ ผิดแพ้</li>
    <li>หมดเวลา: คุยแล้วโหวตหาสปายรอบสุดท้าย</li></ol>
    <p class="muted small">บทบาทในสถานที่ไม่ซ้ำกัน · สถานที่จะไม่วนซ้ำภายใน ${SF.RECENT} รอบ</p>`;
  return `<div class="modal" data-act="rules"><div class="sheet" data-act="noop"><div class="sh"><h2>กติกา ${GAMES[g].s}</h2><button class="ib" data-act="rules">✕</button></div>${body}</div></div>`;
}

/* ───────────── render & events ───────────── */
function render() {
  const p = S.pub;
  if (p) {
    const k = `${p.phase}|${p.round}|${p.step?.[0] ?? ''}|${p.vr ?? ''}|${p.turn ?? ''}|${p.av ? p.av.q + '.' + p.av.nh : ''}`;
    if (k !== S.key) {
      S.key = k; S.reveal = false; S.sel = []; S.decoy = null; S.guess = false;
      if (p.round !== S.round) { S.round = p.round; S.crossed = new Set(); }
    }
  }
  const focus = document.activeElement?.id, pos = focus && document.activeElement.selectionStart;
  app.innerHTML = view();
  if (focus) { const el = document.getElementById(focus); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
  const q = document.getElementById('qr');
  if (q && window.QRCode) new QRCode(q, { text: q.dataset.link, width: 200, height: 200, colorDark: '#111', colorLight: '#fff' });
  tickTimers();
}

function tickTimers() {
  const els = document.querySelectorAll('[data-timer]');
  if (!els.length || !S.pub) return;
  const p = S.pub;
  const t = p.paused != null ? `⏸ ${fmt(p.paused)}` : S.endsAt ? fmt(S.endsAt - now()) : '';
  const low = p.paused == null && S.endsAt && S.endsAt - now() < 30000;
  els.forEach(e => { e.textContent = t || (p.phase === 'play' ? 'หมดเวลา' : ''); e.classList.toggle('low', !!low); });
}
setInterval(tickTimers, 250);

function toggleSel(v) {
  const kind = S.priv?.act;
  let s = S.sel.includes(v) ? S.sel.filter(x => x !== v) : [...S.sel, v];
  if (kind === 'seer') s = v[0] === 'p' ? (s.includes(v) ? [v] : []) : s.filter(x => x[0] === 'c').slice(-2);
  else if (kind === 'troublemaker') s = s.filter(x => x[0] === 'p').slice(-2);
  else s = s.includes(v) ? [v] : [];
  S.sel = s;
}

const ACT = {
  create: d => createRoom(d.game),
  join: () => joinRoom(S.codeIn),
  resume: () => { const l = LS.get('bg_last', null); if (l) resume(l); },
  rejoin: () => { S.joinErr = ''; render(); hello(); },
  leave: () => { if (confirm(S.isHost ? 'ออกและปิดห้องนี้? ทุกคนจะหลุดจากห้อง' : 'ออกจากห้อง?')) leave(); },
  rules: () => { S.rules = !S.rules; render(); },
  noop: () => {},
  share: async () => {
    const url = location.origin + location.pathname + '?r=' + S.pub.room;
    try { if (navigator.share) return await navigator.share({ title: 'BKK11 Boardgames', text: `เข้าห้อง ${S.pub.room}`, url }); } catch { return; }
    try { await navigator.clipboard.writeText(url); toast('คัดลอกลิงก์แล้ว'); } catch { prompt('คัดลอกลิงก์นี้', url); }
  },
  install: async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch {}
    installEvt = null;
    render();
  },
  qr: () => { S.qr = !S.qr; render(); },
  show: () => { S.reveal = true; render(); },
  hide: () => { S.reveal = false; render(); },
  voice: (d, el) => { S.voice = el.checked; LS.set('bg_voice', S.voice); if (S.voice) say('เปิดเสียงบรรยาย'); },
  ready: () => send({ t: 'ready' }),
  sel: d => { toggleSel(d.v); render(); },
  doact: () => { const a = actPayload(S.priv.act); if (a) send({ t: 'act', a }); },
  decoy: d => { S.decoy = +d.i; render(); },
  vote: d => send({ t: 'vote', to: d.sid }),
  apick: d => {
    const size = S.pub.av.quests[S.pub.av.q].size;
    S.sel = S.sel.includes(d.sid) ? S.sel.filter(x => x !== d.sid) : [...S.sel, d.sid].slice(-size);
    render();
  },
  apropose: () => send({ t: 'apropose', team: S.sel }),
  avote: d => send({ t: 'avote', ok: d.ok === '1' }),
  acard: d => { if (confirm(d.ok === '1' ? 'ส่งการ์ด ✅ สำเร็จ?' : 'ส่งการ์ด ❌ ล้มเหลว?')) send({ t: 'acard', ok: d.ok === '1' }); },
  akill: d => { if (confirm(`ฆ่า ${pn(d.sid)} ? (เลือกได้ครั้งเดียว)`)) send({ t: 'akill', to: d.sid }); },
  wguess: () => { const t = (S.wg || '').trim(); if (t && confirm(`ทายว่า “${t}” ?`)) send({ t: 'wguess', text: t }); },
  guessmode: () => { S.guess = !S.guess; render(); },
  loc: d => {
    const i = +d.i;
    if (S.guess && S.priv.spy) {
      if (confirm(`เดาว่าเป็น “${SF.LOCATIONS[i].n}” ? (จบรอบทันที)`)) send({ t: 'guess', loc: i });
      return;
    }
    S.crossed.has(i) ? S.crossed.delete(i) : S.crossed.add(i);
    render();
  },
};
for (const k of Object.keys(HA)) ACT[k] = d => S.isHost && H && HA[k](d);

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.dataset.act === 'rules' && el.classList.contains('modal') && e.target !== el) return;
  if (el.tagName !== 'INPUT') e.preventDefault();
  ACT[el.dataset.act]?.(el.dataset, el);
  wake();
});
document.addEventListener('input', e => {
  if (e.target.id === 'name') S.name = e.target.value;
  if (e.target.id === 'wg') S.wg = e.target.value;
  if (e.target.id === 'code') { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); S.codeIn = e.target.value; }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'code') joinRoom(S.codeIn); });

// Keep screen on while in a room.
let lock = null;
async function wake() {
  if (!S.conn || lock || !navigator.wakeLock) return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => (lock = null)); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  wake();
  if (S.conn) { S.conn.kick(); if (S.isHost && H) hostTick(); }
});

// Boot: resume this tab's session after a reload.
const sess = SS.get('bg_sess', null);
if (sess?.room) resume(sess);
else render();
