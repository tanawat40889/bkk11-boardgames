import { roomCode, uid } from './rng.js';
import * as Net from './net.js';
import * as SF from './spyfall.js';
import * as WW from './onuw.js';
import * as UC from './undercover.js';
import * as AV from './avalon.js';
import * as IN from './insider.js';
import * as JO from './justone.js';
import * as SK from './skull.js';
import * as MI from './mind.js';
import * as CN from './codenames.js';
import * as SC from './scout.js';
import { norm } from './words.js';
import { rint } from './rng.js';

const app = document.getElementById('app');
const now = () => Date.now();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// ?ns=… gives each simulated player in the e2e test its own storage (they share one browser tab).
const NS = new URLSearchParams(location.search).get('ns') || '';
const mkStore = get => ({
  get(k, d) { try { const v = get().getItem(NS + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { get().setItem(NS + k, JSON.stringify(v)); } catch {} },
  del(k) { try { get().removeItem(NS + k); } catch {} },
});
const LS = mkStore(() => localStorage), SS = mkStore(() => sessionStorage);

const GAMES = {
  onuw: { n: 'One Night Ultimate Werewolf', s: 'Werewolf', e: '🐺', min: WW.MIN, max: WW.MAX, t: 10, c: ['ded'], d: 'หาหมาป่าให้เจอในคืนเดียว บทบาทสลับกันได้ตอนกลางคืน' },
  spyfall: { n: 'Spyfall', s: 'Spyfall', e: '🕵️', min: SF.MIN, max: SF.MAX, t: 8, c: ['ded'], d: 'ทุกคนรู้สถานที่ ยกเว้นสปาย ถามตอบจับพิรุธ' },
  uc: { n: 'Undercover', s: 'Undercover', e: '🎭', min: UC.MIN, max: UC.MAX, t: 10, c: ['ded', 'word'], d: 'หาคนที่ได้คำไม่เหมือนเพื่อน โดยที่ตัวเองก็ไม่รู้ฝ่าย' },
  av: { n: 'Avalon', s: 'Avalon', e: '🏰', min: AV.MIN, max: AV.MAX, t: 30, c: ['ded'], d: 'ส่งทีมทำภารกิจ โหวต และหักหลัง เกมยาวสำหรับวงใหญ่' },
  ins: { n: 'Insider', s: 'Insider', e: '🔎', min: IN.MIN, max: IN.MAX, t: 10, c: ['ded', 'word'], d: 'ถามใช่/ไม่ใช่หาคำลับ แล้วจับคนที่รู้คำตอบอยู่แล้ว' },
  jo: { n: 'Just One', s: 'Just One', e: '💡', min: JO.MIN, max: JO.MAX, t: 20, c: ['coop', 'word'], d: 'ช่วยกันใบ้คนละคำ คำใบ้ที่ซ้ำกันโดนลบ' },
  cn: { n: 'Codenames', s: 'Codenames', e: '🗝️', min: CN.MIN, max: CN.MAX, t: 15, c: ['word'], d: '2 ทีม หัวหน้าใบ้คำเดียวให้ทีมเดาหลายคำบนตาราง' },
  mi: { n: 'The Mind', s: 'The Mind', e: '🧠', min: MI.MIN, max: MI.MAX, t: 15, c: ['coop', 'card'], d: 'วางเลขเรียงจากน้อยไปมากโดยห้ามคุยกัน' },
  sc: { n: 'Scout', s: 'Scout', e: '🎪', min: SC.MIN, max: SC.MAX, t: 30, c: ['card'], d: 'ไพ่สองหัว ห้ามสลับมือ ลงชุดให้แรงกว่า หรือขโมยไพ่จากโต๊ะ' },
  sk: { n: 'Skull', s: 'Skull', e: '💀', min: SK.MIN, max: SK.MAX, t: 20, c: ['card'], d: 'บลัฟดอกไม้กับหัวกะโหลก ประมูลแล้วเปิด' },
};
const CATS = { all: 'ทั้งหมด', ded: '🕵️ จับผิด', word: '💬 คำ', card: '🃏 การ์ด/บลัฟ', coop: '🤝 ช่วยกัน' };
const ROLE = WW.ROLES;
const RL = r => `${ROLE[r].e} ${ROLE[r].n}`;
const TEAM = { village: 'ฝ่ายชาวบ้าน', wolf: 'ฝ่ายหมาป่า', tanner: 'ฝ่ายตัวเอง' };
const ONLINE_MS = 25000;
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const S = {
  conn: null, room: null, pid: null, isHost: false, name: LS.get('bg_name', ''), codeIn: new URLSearchParams(location.search).get('r')?.toUpperCase() || '',
  pub: null, priv: null, endsAt: 0, online: true, busy: '', err: '', toast: '', joinErr: '',
  key: '', round: -1, reveal: false, sel: [], decoy: null, guess: false, crossed: new Set(), rules: false, qr: false, pick: false, cat: 'all', scSel: [], scM: null, cw: '', cnN: 1,
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
    settings: { onuw: { auto: true, deck: null, night: 15, day: 300 }, spyfall: { spies: 1, min: 8 }, uc: { auto: true, uc: 1, white: 0 }, av: AV.defaults(), ins: { min: 5 }, jo: { rounds: 13 } },
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
    } else if (H.game === 'ins') {
      p.ins = { master: g.master, guesser: g.guesser, cand: g.cand, word: g.guesser ? g.word : null };
      if (H.phase === 'iword') p.ready = g.ready;
      if (H.phase === 'iv1') p.voted = Object.keys(g.v1);
      if (H.phase === 'iv2') p.voted = Object.keys(g.v2);
      if (H.phase === 'iend') p.result = g.result;
    } else if (H.game === 'mi') {
      p.mi = {
        level: g.level, max: g.max, lives: g.lives, stars: g.stars, np: g.pile.length, top: g.pile.at(-1) || null,
        n: Object.fromEntries(g.sids.map(x => [x, g.hands[x].length])), prop: g.prop, last: g.last, reward: g.reward || null, over: g.over, mistakes: g.mistakes,
      };
    } else if (H.game === 'cn') {
      p.cn = g.words
        ? { team: g.team, master: g.master, words: g.words, rev: g.rev, turn: g.turn, clue: g.clue, left: g.left, rem: { r: CN.remain(g, 'r'), b: CN.remain(g, 'b') }, log: g.log.slice(-6), winner: g.winner, why: g.why, key: g.winner ? g.key : null }
        : { team: g.team, master: g.master };
    } else if (H.game === 'sc') {
      p.sc = {
        round: g.round, rounds: g.rounds, ready: g.ready, started: SC.allReady(g), turn: g.turn, active: g.active,
        n: Object.fromEntries(g.sids.map(x => [x, g.hands[x].length])), cap: g.cap, tok: g.tok, used: g.usedSS, total: g.total, res: g.res, over: g.over,
        win: g.over ? SC.winners(g) : null,
      };
    } else if (H.game === 'sk') {
      p.sk = {
        pl: Object.fromEntries(g.sids.map(x => [x, { n: g.stacks[x]?.length ?? 0, d: SK.discs(g, x), pts: g.pts[x], fl: g.flipped[x] ?? 0 }])),
        turn: g.turn, bid: g.bid, passed: g.passed, ch: g.ch, reveals: g.reveals, total: SK.total(g), round: g.round, winner: g.winner,
        res: g.res && { ok: g.res.ok, owner: g.res.owner, settled: !!g.res.settled, choose: SK.needsChoice(g) },
      };
    } else if (H.game === 'jo') {
      p.jo = { guesser: JO.guesser(g), i: g.i, total: g.deck.length, score: g.score, lost: g.lost, per: JO.cluesPer(g.sids.length), submitted: Object.keys(g.clues) };
      if (H.phase === 'jguess') p.jo.shown = JO.shown(g);
      if (H.phase === 'jres') p.jo.res = { word: JO.word(g), guess: g.guess, clues: JO.review(g) };
      if (H.phase === 'jend') { p.jo.log = g.log; p.jo.rating = JO.rating(g.score, g.deck.length); }
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
  } else if (H.game === 'ins') {
    v.role = IN.roleOf(g, sid);
    if (v.role !== 'common') v.word = g.word;
    v.ready = g.ready.includes(sid);
    if (H.phase === 'iv1') v.v1 = sid in g.v1 ? g.v1[sid] : null;
    if (H.phase === 'iv2') v.v2 = g.v2[sid] || null;
  } else if (H.game === 'mi') {
    v.hand = g.hands[sid];
  } else if (H.game === 'cn') {
    if (g.words && CN.isMaster(g, sid)) v.key = g.key;
  } else if (H.game === 'sc') {
    v.hand = g.hands[sid];
  } else if (H.game === 'sk') {
    v.hand = g.hand[sid];
    v.stack = g.stacks[sid] || [];
    v.canF = sid in g.stacks && SK.canPlace(g, sid, 'f');
    v.canS = sid in g.stacks && SK.canPlace(g, sid, 's');
    if (g.res?.settled && g.ch === sid && g.res.lost) v.lost = g.res.lost;
  } else if (H.game === 'jo') {
    v.guesser = JO.guesser(g) === sid;
    if (!v.guesser) {
      v.word = JO.word(g);
      v.mine = g.clues[sid] || null;
      if (H.phase === 'jcheck') v.review = JO.review(g);
    }
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
    // Host's own private view changed (e.g. flipped hand) -> force a re-render even if the public state is identical.
    if (p.pid === S.pid) { if (JSON.stringify(S.priv) !== JSON.stringify(v)) lastPub = ''; S.priv = v; continue; }
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
    if (H.phase === 'iask') return inEnd(IN.outcome(H.g, null, 'timeout'));
    if (H.phase === 'idisc') { H.phase = 'iv1'; H.endsAt = null; return broadcast(); }
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

function inEnd(r) {
  const g = H.g;
  g.result = { ...r, insider: g.insider, master: g.master, word: g.word, guesser: g.guesser, v1: g.v1, v2: g.v2, win: IN.winners(g, r) };
  H.phase = 'iend';
  H.endsAt = null;
  broadcast();
}
function inFound(by) {
  const g = H.g;
  if (H.phase !== 'iask' || !g.sids.includes(by) || by === g.master) return;
  g.guesser = by;
  g.used = Math.max(0, now() - g.t0);
  H.phase = 'idisc';
  H.endsAt = now() + Math.max(30000, g.used);
  broadcast();
}
function inTie(to) {
  const g = H.g;
  if (H.phase === 'itie' && g.cand?.includes(to)) inEnd(IN.outcome(g, to, 'tie'));
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
    case 'mplay': case 'mprop': case 'magree': case 'mdecline': {
      if (H.phase !== 'mind') break;
      // The card the player saw must still be their lowest (their screen may lag behind).
      if (m.t === 'mplay' && g.hands[sid]?.[0] !== m.card) break;
      const ok = m.t === 'mplay' ? MI.play(g, sid) : m.t === 'mprop' ? MI.propose(g, sid) : m.t === 'magree' ? MI.agree(g, sid) : MI.decline(g, sid);
      if (!ok) break;
      if (g.over) H.phase = 'mend';
      else if (MI.cleared(g)) H.phase = 'mlvl';
      broadcast();
      break;
    }
    case 'cteam':
      if (H.phase === 'cteam' && ['r', 'b'].includes(m.team) && g.team[sid] !== m.team) {
        const old = g.team[sid];
        if (g.master[old] === sid) g.master[old] = null;
        g.team[sid] = m.team;
        broadcast();
      }
      break;
    case 'cmaster':
      if (H.phase === 'cteam') { g.master[g.team[sid]] = sid; broadcast(); }
      break;
    case 'cclue': case 'cguess': case 'cpass': {
      if (H.phase !== 'cn') break;
      const ok = m.t === 'cclue' ? CN.giveClue(g, sid, m.word, m.n) : m.t === 'cguess' ? CN.guess(g, sid, m.i) : CN.pass(g, sid);
      if (!ok) { if (m.t === 'cclue' && sid === H.players[0].sid) toast('คำใบ้ใช้ไม่ได้ (ห้ามซ้ำหรือมีส่วนของคำบนกระดาน)'); break; }
      if (g.winner) H.phase = 'cnend';
      broadcast();
      break;
    }
    case 'scflip': case 'scready': case 'scshow': case 'scscout': case 'scss': {
      if (H.phase !== 'scout') break;
      const ok = m.t === 'scflip' ? SC.flipHand(g, sid) : m.t === 'scready' ? SC.setReady(g, sid)
        : m.t === 'scshow' ? SC.show(g, sid, m.i, m.j)
        : m.t === 'scscout' ? SC.scout(g, sid, m.end, m.pos, !!m.flip)
        : SC.scoutShow(g, sid, m.end, m.pos, !!m.flip, m.i, m.j);
      if (ok) broadcast();
      break;
    }
    case 'skplace': case 'skbid': case 'skpass': case 'skflip': case 'sklose': {
      if (H.phase !== 'sk') break;
      const ok = m.t === 'skplace' ? (g.turn ? SK.add(g, sid, m.d) : SK.placeInit(g, sid, m.d))
        : m.t === 'skbid' ? SK.bid(g, sid, m.n)
        : m.t === 'skpass' ? SK.pass(g, sid)
        : m.t === 'skflip' ? SK.flip(g, sid, m.to)
        : sid === g.ch && SK.needsChoice(g) && SK.settle(g, m.d);
      if (!ok) break;
      if (g.res && !g.res.settled && !SK.needsChoice(g)) SK.settle(g);
      broadcast();
      break;
    }
    case 'ifound':
      if (sid === g.master) inFound(m.by);
      break;
    case 'iv1':
      if (H.phase === 'iv1') {
        g.v1[sid] = !!m.yes;
        if (g.sids.every(s => s in g.v1)) {
          if (IN.v1Yes(g)) return inEnd(IN.outcome(g, g.guesser, 'v1'));
          H.phase = 'iv2';
        }
        broadcast();
      }
      break;
    case 'iv2':
      if (H.phase === 'iv2' && IN.canAccuse(g, sid, m.to)) {
        g.v2[sid] = m.to;
        if (g.sids.every(s => g.v2[s])) {
          const { top } = IN.v2Top(g);
          if (top.length === 1) return inEnd(IN.outcome(g, top[0], 'v2'));
          g.cand = top;
          H.phase = 'itie';
        }
        broadcast();
      }
      break;
    case 'itie':
      if (sid === g.master) inTie(m.to);
      break;
    case 'jclue':
      if (H.phase === 'jclue' && JO.setClues(g, sid, m.list)) {
        if (JO.allIn(g)) H.phase = 'jcheck';
        broadcast();
      }
      break;
    case 'jstrike':
      if (H.phase === 'jcheck' && sid !== JO.guesser(g)) {
        const it = JO.review(g).find(x => x.id === m.id);
        if (it) { g.manual[it.id] = !it.out; broadcast(); }
      }
      break;
    case 'jdone':
      if (H.phase === 'jcheck' && sid !== JO.guesser(g)) { H.phase = 'jguess'; broadcast(); }
      break;
    case 'jguess':
      if (H.phase === 'jguess' && sid === JO.guesser(g)) {
        JO.resolve(g, typeof m.text === 'string' && m.text.trim() ? m.text.trim().slice(0, 40) : null);
        H.phase = 'jres';
        broadcast();
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
  hgame(d) { if (H.phase === 'lobby' && GAMES[d.g]) { H.game = d.g; LS.set('bg_game', d.g); S.pick = false; broadcast(); } },
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
  mnext() {
    const g = H.g;
    if (H.phase !== 'mlvl') return;
    g.reward = MI.nextLevel(g);
    H.phase = g.over ? 'mend' : 'mind';
    broadcast();
  },
  cshuffle() { if (H.phase === 'cteam') { Object.assign(H.g, CN.autoTeams(H.g.sids)); broadcast(); } },
  cstart() {
    const g = H.g;
    if (H.phase !== 'cteam') return;
    const e = CN.validTeams(g.sids, g);
    if (e.length) return toast(e[0]);
    H.g = CN.newGame(g.sids, g, H.recentCN || []);
    H.recentCN = [...H.g.idx, ...(H.recentCN || [])].slice(0, CN.RECENT);
    H.phase = 'cn';
    broadcast();
  },
  scnext() {
    const g = H.g;
    if (H.phase !== 'scout' || !g.res) return;
    if (g.over) H.phase = 'scend';
    else SC.nextRound(g);
    broadcast();
  },
  sknext() {
    const g = H.g;
    if (H.phase !== 'sk' || !g.res?.settled) return;
    if (g.winner) H.phase = 'skend';
    else SK.startRound(g, SK.nextStarter(g));
    broadcast();
  },
  istart() { if (H.phase === 'iask' || H.phase !== 'iword') return; H.phase = 'iask'; H.g.t0 = now(); H.endsAt = now() + H.settings.ins.min * 60000; broadcast(); },
  hfound(d) { if (confirm(`${pn(d.sid)} ทายคำถูกแล้ว?`)) inFound(d.sid); },
  itovote() { if (H.phase === 'idisc') { H.phase = 'iv1'; H.endsAt = null; broadcast(); } },
  htie(d) { if (confirm(`ตัดสินว่า ${pn(d.sid)} คืออินไซเดอร์?`)) inTie(d.sid); },
  jforce() {
    const g = H.g;
    if (H.phase === 'jclue' && Object.keys(g.clues).length && confirm('ข้ามคนที่ยังไม่ส่งคำใบ้?')) { H.phase = 'jcheck'; broadcast(); }
  },
  jok() { if (H.phase === 'jres' && confirm('นับคำตอบนี้ว่าถูก?')) { JO.override(H.g); broadcast(); } },
  jnext() {
    if (H.phase !== 'jres') return;
    H.phase = JO.advance(H.g) ? 'jend' : 'jclue';
    broadcast();
  },
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
    const [g, k] = d.k.split('.'), lim = { 'onuw.night': [10, 30, 5], 'onuw.day': [120, 600, 60], 'spyfall.min': [4, 12, 1], 'spyfall.spies': [1, 2, 1], 'uc.uc': [1, 3, 1], 'uc.white': [0, 1, 1], 'ins.min': [3, 8, 1], 'jo.rounds': [5, 13, 1] }[d.k];
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
    } else if (H.game === 'ins') {
      H.inm = (H.inm ?? rint(n)) + 1;
      const master = sids[H.inm % n];
      H.g = IN.deal(sids, master, H.recentIN || []);
      H.recentIN = [H.g.wi, ...(H.recentIN || [])].slice(0, IN.RECENT);
      H.phase = 'iword';
      H.endsAt = null;
    } else if (H.game === 'mi') {
      H.g = MI.newGame(sids);
      H.phase = 'mind';
      H.endsAt = null;
    } else if (H.game === 'cn') {
      H.g = { sids, ...CN.autoTeams(sids) };
      H.phase = 'cteam';
      H.endsAt = null;
    } else if (H.game === 'sc') {
      H.g = SC.newGame(sids);
      H.phase = 'scout';
      H.endsAt = null;
    } else if (H.game === 'sk') {
      H.g = SK.newGame(sids);
      H.phase = 'sk';
      H.endsAt = null;
    } else if (H.game === 'jo') {
      H.g = JO.newGame(sids, H.settings.jo.rounds, H.recentJO || []);
      H.recentJO = [...H.g.deck, ...(H.recentJO || [])].slice(0, JO.RECENT);
      H.phase = 'jclue';
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
  abort() { if (H.phase !== 'lobby' && confirm('หยุดเกมนี้แล้วกลับล็อบบี้?')) HA.lobby(); },
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
  H.settings.ins ||= { min: 5 };
  H.settings.jo ||= { rounds: 13 };
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

// Keep ?r=CODE in the address bar (so a refresh/share works) without dropping other params.
function setRoomParam(code) {
  const u = new URL(location.href);
  code ? u.searchParams.set('r', code) : u.searchParams.delete('r');
  history.replaceState(null, '', u);
}

async function createRoom(game) {
  if (!nameOk() || S.busy) return;
  S.busy = 'create'; S.err = ''; render();
  try {
    S.conn = await Net.create(roomCode);
    S.room = S.conn.room;
    S.pid = uid();
    S.isHost = true;
    H = newHost(S.room, GAMES[game] ? game : LS.get('bg_game', 'onuw'), S.name);
    if (!GAMES[game]) S.pick = true;
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
      setRoomParam(code);
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
  Object.assign(S, { conn: null, room: null, pid: null, isHost: false, pub: null, priv: null, pick: false, joinErr: '', err: msg, key: '', round: -1 });
  setRoomParam(null);
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
  return `<main class="wrap home">
    <header class="brand"><img class="logo" src="icons/icon-192.png" alt="" width="96" height="96"><h1>BKK11 Boardgames</h1><p>ทุกคนเปิดเว็บนี้บนมือถือตัวเอง แล้วเข้าห้องเดียวกัน</p></header>
    ${S.err ? `<div class="alert">${esc(S.err)}</div>` : ''}
    <section class="panel"><label for="name">ชื่อของคุณ</label>
      <input id="name" maxlength="16" autocomplete="nickname" placeholder="เช่น ต้น" value="${esc(S.name)}"></section>
    <section class="panel"><h2>เข้าร่วมห้อง</h2>
      <div class="row"><input id="code" class="code-in" maxlength="4" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="ABCD" value="${esc(S.codeIn)}">
      ${btn('join', S.busy === 'join' ? 'กำลังหา…' : 'เข้าห้อง', 'primary', {}, !!S.busy)}</div></section>
    <section class="panel"><h2>สร้างห้องใหม่</h2>
      ${btn('create', S.busy === 'create' ? 'กำลังสร้างห้อง…' : '➕ สร้างห้อง แล้วเลือกเกม', 'primary wide big', {}, !!S.busy)}
      <div class="gstrip">${Object.values(GAMES).map(G => `<span title="${G.n}">${G.e}</span>`).join('')}</div>
      <p class="muted small center">${Object.keys(GAMES).length} เกม · เปลี่ยนเกมได้ตลอดในห้องเดียวกัน</p></section>
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
      <div class="tr">${S.isHost && p.phase !== 'lobby' ? '<button class="ib" data-act="abort" aria-label="หยุดเกม" title="หยุดเกม กลับล็อบบี้">⏹</button>' : ''}<button class="ib" data-act="rules" aria-label="กติกา">?</button><button class="ib out" data-act="leave">ออก</button></div>
    </div></div>
    ${S.online ? '' : '<div class="offline">⚠︎ การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…</div>'}
    <main class="wrap phase-${p.phase} game-${p.game}">${body}</main>
    ${S.rules ? rulesView() : ''}
    ${S.pick && p.phase === 'lobby' && S.isHost ? pickerView() : ''}
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
    lobby, iword: inWordV, iask: inAskV, idisc: inDiscV, iv1: inV1V, iv2: inV2V, itie: inTieV, iend: inEndV,
    sk: skV, skend: skEndV, mind: miV, mlvl: miLvlV, mend: miEndV, cteam: cnTeamV, cn: cnV, cnend: cnV, scout: scV, scend: scEndV,
    jclue: joClueV, jcheck: joCheckV, jguess: joGuessV, jres: joResV, jend: joEndV,
    aroles: avRolesV, ateam: avTeamV, avote: avVoteV, avres: avResV, aquest: avQuestV, aqres: avQResV, aassn: avAssnV, aend: avEndV,
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

const playersTxt = G => `${G.min}–${G.max} คน`;
const fitBadge = (G, n) => (n < G.min ? `<span class="tag bad">ต้องการอีก ${G.min - n} คน</span>` : n > G.max ? `<span class="tag bad">เกิน ${n - G.max} คน</span>` : `<span class="tag ok">✓ เล่นได้ ${n} คน</span>`);

function pickerView() {
  const p = S.pub, n = pl().length;
  const keys = Object.keys(GAMES).filter(k => S.cat === 'all' || GAMES[k].c.includes(S.cat));
  const fit = k => n >= GAMES[k].min && n <= GAMES[k].max;
  keys.sort((a, b) => fit(b) - fit(a));
  return `<div class="modal" data-act="pick"><div class="sheet picker" data-act="noop">
    <div class="sh"><h2>เลือกเกม <span class="muted small">ตอนนี้ ${n} คน</span></h2><button class="ib" data-act="pick">✕</button></div>
    <div class="tabs">${Object.entries(CATS).map(([k, v]) => `<button class="${S.cat === k ? 'on' : ''}" data-act="cat" data-c="${k}">${v}</button>`).join('')}</div>
    <div class="gcards">${keys.map(k => { const G = GAMES[k]; return `<button class="gcard ${k === p.game ? 'on' : ''} ${fit(k) ? '' : 'unfit'}" data-act="hgame" data-g="${k}">
      <span class="gemo">${G.e}</span><b>${G.s}</b><small>${playersTxt(G)} · ~${G.t} นาที</small><span class="gd">${G.d}</span>${fitBadge(G, n)}</button>`; }).join('')}</div>
  </div></div>`;
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
  } else if (p.game === 'ins') {
    if (n < IN.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${IN.MIN} คน`);
    settings = host ? stepper('ins.min', 'เวลาถามหาคำ', p.set.ins.min, ' นาที') : `<p class="muted small">ถามหาคำ ${p.set.ins.min} นาที · ผู้คุมเกมวนไปทีละคน</p>`;
  } else if (p.game === 'mi') {
    if (n < MI.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${MI.MIN} คน`);
    const m = Math.max(MI.MIN, Math.min(MI.MAX, n));
    settings = `<p class="muted small">${MI.levelsFor(m)} ด่าน · เริ่มด้วย ❤️ ${MI.livesFor(m)} ชีวิต และ ⭐ 1 ดาว · ห้ามคุย ห้ามส่งสัญญาณ</p>`;
  } else if (p.game === 'cn') {
    if (n < CN.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${CN.MIN} คน`);
    settings = '<p class="muted small">แบ่ง 2 ทีมหลังกดเริ่ม (สุ่มให้ก่อน แล้วย้ายทีม/เปลี่ยนหัวหน้าได้) · ตาราง 25 คำ</p>';
  } else if (p.game === 'sc') {
    if (n < SC.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${SC.MIN} คน`);
    if (n > SC.MAX) errs.push(`Scout เล่นได้สูงสุด ${SC.MAX} คน`);
    settings = `<p class="muted small">เล่น ${Math.max(SC.MIN, Math.min(SC.MAX, n))} รอบ (เท่าจำนวนผู้เล่น) · คนละ ${SC.handSize(Math.max(SC.MIN, Math.min(SC.MAX, n)))} ใบ</p>`;
  } else if (p.game === 'sk') {
    if (n < SK.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${SK.MIN} คน`);
    settings = `<p class="muted small">ทุกคนมี 🌹 ดอกไม้ 3 + 💀 หัวกะโหลก 1 · ชนะ ${SK.WIN} ครั้งก่อน หรือเหลือรอดคนสุดท้าย${n > 6 ? ' · เกิน 6 คน เกมจะยาวขึ้น' : ''}</p>`;
  } else if (p.game === 'jo') {
    if (n < JO.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${JO.MIN} คน`);
    settings = (host ? stepper('jo.rounds', 'จำนวนการ์ด', p.set.jo.rounds, ' ใบ') : `<p class="muted small">การ์ด ${p.set.jo.rounds} ใบ</p>`)
      + (n === 3 ? '<p class="muted small">เล่น 3 คน: คนใบ้แต่ละคนให้คำใบ้ 2 คำ</p>' : '');
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
    <section class="panel gamesel">
      <h2>เกมที่จะเล่น</h2>
      <div class="ghero"><span class="gemo">${G.e}</span><div><b>${G.n}</b><small>${playersTxt(G)} · ~${G.t} นาที</small><p>${G.d}</p>${fitBadge(G, n)}</div></div>
      ${host ? btn('pick', '🎲 เปลี่ยนเกม', 'ghost wide') : ''}
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
    ? `<button class="secret open ${S.flip ? 'flipin' : ''}" data-act="hide">${inner}<span class="hint">แตะเพื่อซ่อน</span></button>`
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

/* The Mind */
function miHead() {
  const m = S.pub.mi;
  return `<section class="panel board"><div class="jstat"><span>ด่าน <b>${m.level}/${m.max}</b></span><span>${'❤️'.repeat(Math.max(0, m.lives)) || '💔'}</span><span>${'⭐'.repeat(m.stars) || '<span class="muted">ไม่มีดาว</span>'}</span></div></section>`;
}
function miLast() {
  const m = S.pub.mi, L = m.last;
  if (!L) return '';
  const b = L.burned.map(x => `${esc(pn(x.sid))} ${x.card}`).join(', ');
  if (L.star) return `<div class="info">⭐ ใช้ดาว — ทิ้งใบต่ำสุด: ${b}</div>`;
  return L.burned.length ? `<div class="alert">💥 ${esc(pn(L.by))} วาง ${L.card} แต่มีใบต่ำกว่า: ${b} — เสีย 1 ชีวิต</div>` : '';
}
function miV() {
  const m = S.pub.mi, v = S.priv, hand = v.hand || [], holding = hand.length > 0;
  const prop = m.prop
    ? `<section class="panel"><p class="center">⭐ <b>${esc(pn(m.prop.by))}</b> เสนอใช้ดาว (${m.prop.yes.length} คนเห็นด้วย)</p>
        ${holding && !m.prop.yes.includes(me()) ? `<div class="row">${btn('mdecline', 'ไม่เอา', 'ghost')}${btn('magree', '⭐ เห็นด้วย', 'primary')}</div>` : `<div class="row">${btn('mdecline', 'ยกเลิก', 'ghost')}</div>`}</section>`
    : m.stars > 0 && holding ? btn('mprop', '⭐ เสนอใช้ดาว', 'ghost wide') : '';
  return `${miHead()}
    <div class="mtop"><div class="small muted">ใบล่าสุดบนโต๊ะ</div><div class="mcard big" data-n="${m.top ? m.top.card : ''}">${m.top ? m.top.card : '–'}</div>${m.top ? `<div class="small muted">โดย ${esc(pn(m.top.sid))}</div>` : '<div class="small muted">ยังไม่มีใครวาง</div>'}</div>
    ${miLast()}
    ${holding ? `<button class="btn primary wide mplay" data-act="mplay">วาง <b>${hand[0]}</b></button>
      <div class="mhand">${hand.map((c, i) => `<span class="mcard ${i ? '' : 'low'}" data-n="${c}">${c}</span>`).join('')}</div>` : '<p class="center ok-text">✔ คุณวางหมดแล้ว รอเพื่อน</p>'}
    ${prop}
    <section class="panel"><ul class="players">${pl().map(x => `<li><span class="pname">${esc(x.name)}${x.sid === me() ? ' <em>(คุณ)</em>' : ''}</span><span class="skst">🂠 ${m.n[x.sid]}</span></li>`).join('')}</ul>
      <p class="muted small">🤫 ห้ามคุย ห้ามบอกเลข ห้ามส่งสัญญาณ</p></section>`;
}
function miLvlV() {
  const m = S.pub.mi, last = m.level >= m.max, rw = MI.REWARD[m.level];
  return `${miHead()}<div class="banner win"><div class="bt">🎉 ผ่านด่าน ${m.level}!</div>
      <div>${last ? 'ด่านสุดท้ายแล้ว!' : rw === 'star' ? 'ได้ ⭐ เพิ่ม 1 ดวง' : rw === 'life' ? 'ได้ ❤️ เพิ่ม 1 ชีวิต' : 'ไปด่านต่อไป'}</div></div>
    ${miLast()}
    ${isHostView() ? btn('mnext', last ? '🏆 ดูผล' : `▶ ด่าน ${m.level + 1}`, 'primary wide big') : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
}
function miEndV() {
  const m = S.pub.mi, win = m.over === 'win';
  return `<div class="banner ${win ? 'win' : 'lose'}"><div class="bt">${win ? '🏆 ชนะ! ใจตรงกันสุดๆ' : '💔 ชีวิตหมด'}</div>
      <div>${win ? `ผ่านครบ ${m.max} ด่าน` : `ไปได้ถึงด่าน ${m.level} จาก ${m.max}`}</div><div class="small">พลาดทั้งหมด ${m.mistakes} ครั้ง</div></div>
    ${miLast()}
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

/* Codenames */
const CT = CN.TEAM;
function cnTeamV() {
  const c = S.pub.cn, mine = c.team[me()], host = isHostView(), errs = CN.validTeams(pl().map(x => x.sid), c);
  const col = t => `<div class="cteam t-${t}"><h2>${CT[t]}</h2><ul>${pl().filter(x => c.team[x.sid] === t).map(x => `<li>${c.master[t] === x.sid ? '🕶️ ' : ''}${esc(x.name)}${x.sid === me() ? ' <em>(คุณ)</em>' : ''}</li>`).join('') || '<li class="muted">— ว่าง —</li>'}</ul></div>`;
  return `<h1 class="ph">🗝️ แบ่งทีม</h1><p class="center muted small">🕶️ = หัวหน้าสายลับ (เห็นเฉลย เป็นคนใบ้)</p>
    <div class="cteams">${col('r')}${col('b')}</div>
    <div class="row">${btn('cteam', `ย้ายไปทีม${CT[CN.other(mine)]}`, 'ghost', { team: CN.other(mine) })}${btn('cmaster', '🕶️ ฉันเป็นหัวหน้า', c.master[mine] === me() ? 'primary' : 'ghost', {}, c.master[mine] === me())}</div>
    ${errs.length ? `<p class="alert">${esc(errs[0])}</p>` : ''}
    ${host ? `<div class="row">${btn('cshuffle', '🔀 สุ่มทีมใหม่', 'ghost')}${btn('cstart', '▶︎ เริ่มเกม', 'primary', {}, errs.length > 0)}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มเกม…</p>'}`;
}
function cnV() {
  const c = S.pub.cn, v = S.priv, mine = c.team[me()], master = c.master[mine] === me(), over = !!c.winner;
  const key = c.key || v.key, myTurn = !over && c.turn === mine;
  const canGuess = myTurn && !master && !!c.clue;
  const cells = c.words.map((w, i) => {
    const r = c.rev[i], k = key?.[i];
    const cls = r ? `rev k-${r}` : k ? `hint k-${k}` : '';
    return `<button class="ccell ${cls}" ${canGuess && !r ? `data-act="cguess" data-i="${i}"` : 'disabled'}>${r === 'x' || (over && k === 'x') ? '☠️ ' : ''}${esc(w)}</button>`;
  }).join('');
  let panel;
  if (over) panel = `<div class="banner ${c.winner === mine ? 'win' : 'lose'}"><div class="bt">${c.winner === mine ? '🎉 ทีมคุณชนะ!' : '😵 ทีมคุณแพ้'}</div><div>ทีม${CT[c.winner]} ชนะ — ${c.why === 'assassin' ? 'อีกทีมเปิดเจอนักฆ่า ☠️' : 'เปิดคำครบแล้ว'}</div></div>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  else if (!c.clue) panel = myTurn && master
    ? `<section class="panel"><h2>🕶️ ใบ้ให้ทีมคุณ</h2><input id="cw" class="jin" maxlength="20" autocomplete="off" placeholder="คำใบ้ 1 คำ" value="${esc(S.cw || '')}">
        <div class="stepper"><span>เกี่ยวกับกี่คำ (0 = ไม่จำกัด)</span><div class="sctl"><button class="sb" data-act="cnn" data-d="-1">−</button><b>${S.cnN}</b><button class="sb" data-act="cnn" data-d="1">+</button></div></div>
        ${btn('cclue', 'ส่งคำใบ้', 'primary wide')}</section>`
    : `<p class="center">รอหัวหน้าทีม${CT[c.turn]} (${esc(pn(c.master[c.turn]))}) ใบ้…</p>`;
  else panel = `<div class="cclue t-${c.turn}"><span class="small">คำใบ้ทีม${CT[c.turn]}</span><b>${esc(c.clue.word)} · ${c.clue.n === 0 ? '∞' : c.clue.n}</b><span class="small">${c.left > 20 ? 'เดาได้ไม่จำกัด' : `เดาได้อีก ${c.left} ครั้ง`}</span></div>
      ${canGuess ? `<p class="center muted small">แตะคำบนตารางเพื่อเดา</p>${btn('cpass', '✋ จบตา', 'ghost wide')}` : `<p class="center muted small">${myTurn ? 'ลูกทีมกำลังเดา… ห้ามใบ้เพิ่ม 🤐' : `ทีม${CT[c.turn]} กำลังเดา`}</p>`}`;
  return `<section class="panel board"><div class="jstat"><span class="${c.turn === 'r' && !over ? 'cur' : ''}">🔴 เหลือ <b>${c.rem.r}</b></span><span class="${c.turn === 'b' && !over ? 'cur' : ''}">🔵 เหลือ <b>${c.rem.b}</b></span></div>
      <div class="small center">คุณอยู่ทีม${CT[mine]}${master ? ' · 🕶️ หัวหน้าสายลับ' : ''}</div></section>
    ${panel}<div class="cgrid">${cells}</div>
    ${master && !over ? '<p class="muted small center">ขอบสี = เฉลย (เห็นเฉพาะหัวหน้า) · ☠️ ขอบดำ = นักฆ่า</p>' : ''}`;
}

/* Scout */
const scCard = (c, cls = '', attr = '') => `<button class="scard ${cls}" style="--h:${(c[0] - 1) * 36};--h2:${(c[1] - 1) * 36}" ${attr}><b>${c[0]}</b><small>${c[1]}</small></button>`;
function scBoard() {
  const k = S.pub.sc;
  return `<section class="panel"><ul class="players sk">${pl().map(x => `<li><span class="pname">${esc(x.name)}${x.sid === me() ? ' <em>(คุณ)</em>' : ''}</span>
    <span class="skst">🂠${k.n[x.sid]}</span><span class="skst">📥${k.cap[x.sid]}</span><span class="skst">🎟️${k.tok[x.sid]}</span><span class="skst">${k.used[x.sid] ? '' : '⚡'}</span><span class="skst"><b>${k.total[x.sid]}</b></span>
    ${x.sid === k.turn ? '<span class="tag ok">👉 ถึงตา</span>' : !k.started && k.ready.includes(x.sid) ? '<span class="tag ok">พร้อม</span>' : ''}</li>`).join('')}</ul>
    <p class="muted small">🂠 ไพ่ในมือ · 📥 ไพ่ที่เก็บได้ · 🎟️ แต้ม Scout · ⚡ ยังใช้ Scout & Show ได้ · ตัวหนา = คะแนนรวม</p></section>`;
}
function scV() {
  const k = S.pub.sc, hand = S.priv.hand || [], mine = me(), myTurn = k.turn === mine && !k.res;
  const head = `<p class="center skstatus">🎪 รอบ ${k.round}/${k.rounds}${k.started && k.turn ? ` · ตาของ <b>${esc(pn(k.turn))}</b>` : ''}</p>`;
  if (k.res) {
    const r = k.res;
    return `${head}<div class="banner"><div class="bt">จบรอบ ${k.round}</div><div>${r.why === 'empty' ? `${esc(pn(r.ender))} ไพ่หมดมือ` : `ไม่มีใครลงชนะชุดของ ${esc(pn(r.ender))}`}</div></div>
      <section class="panel"><table class="res"><thead><tr><th>ผู้เล่น</th><th>📥</th><th>🎟️</th><th>−มือ</th><th>รอบนี้</th><th>รวม</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr><td>${esc(pn(x.sid))}</td><td class="c">${x.cap}</td><td class="c">${x.tok}</td><td class="c">${x.minus ? '−' + x.minus : '0'}</td><td class="c">${x.pts > 0 ? '+' : ''}${x.pts}</td><td class="c"><b>${x.total}</b></td></tr>`).join('')}</tbody></table></section>
      ${isHostView() ? btn('scnext', k.over ? '🏆 ดูผู้ชนะ' : `▶ รอบ ${k.round + 1}`, 'primary wide big') : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
  }
  if (!k.started) {
    const rd = k.ready.includes(mine);
    return `${head}<section class="panel"><h2>ไพ่ของคุณ <span class="muted small">(ห้ามสลับลำดับ)</span></h2><div class="shand">${hand.map(c => scCard(c, '', 'disabled')).join('')}</div>
      <p class="muted small">เลขใหญ่ = เลขที่ใช้ · เลขเล็ก = อีกด้าน · เลือกได้ครั้งเดียวว่าจะกลับหัวทั้งมือไหม</p>
      ${rd ? '<p class="center ok-text">✔ พร้อมแล้ว รอคนอื่น</p>' : `<div class="row">${btn('scflip', '🔄 กลับหัวทั้งมือ', 'ghost')}${btn('scready', '✔ ใช้แบบนี้', 'primary')}</div>`}</section>${scBoard()}`;
  }
  const act = k.active, m = S.scM;
  const table = `<section class="panel"><h2>บนโต๊ะ ${act ? `<span class="muted small">ของ ${esc(pn(act.by))}</span>` : ''}</h2>
    ${act ? `<div class="shand">${act.cards.map(c => scCard(c, '', 'disabled')).join('')}</div>` : '<p class="muted">ว่าง — ลงชุดอะไรก็ได้</p>'}</section>`;
  let handHtml, actions = '';
  if (myTurn && m) {
    const c0 = m.end === 'L' ? act.cards[0] : act.cards.at(-1), c = m.flip ? [c0[1], c0[0]] : c0;
    if (m.pos == null) {
      const slot = i => `<button class="sslot" data-act="scslot" data-pos="${i}">▼</button>`;
      handHtml = `<div class="shand">${slot(0)}${hand.map((x, i) => scCard(x, '', 'disabled') + slot(i + 1)).join('')}</div>`;
      actions = `<div class="row scrow"><span>ไพ่ที่หยิบ:</span>${scCard(c, 'on', 'disabled')}${btn('scturn', '🔄 กลับหัว', 'ghost small')}${btn('sccancel', 'ยกเลิก', 'ghost small')}</div><p class="ask center">แตะ ▼ ตรงที่จะเสียบไพ่${m.ss ? ' (แล้วเลือกชุดที่จะลง)' : ''}</p>`;
    } else {
      const tmp = [...hand]; tmp.splice(m.pos, 0, c);
      const rest = act.cards.length > 1 ? SC.classify(m.end === 'L' ? act.cards.slice(1) : act.cards.slice(0, -1)) : null;
      const a = S.scSel, ok = a.length && SC.beats(SC.classify(tmp.slice(a[0], a.at(-1) + 1)), rest);
      handHtml = `<div class="shand">${tmp.map((x, i) => scCard(x, `${a.includes(i) ? 'on' : ''} ${i === m.pos ? 'new' : ''}`, `data-act="sccard" data-i="${i}"`)).join('')}</div>`;
      actions = `<p class="ask center">เลือกไพ่ติดกันที่จะลง (ต้องแรงกว่าชุดที่เหลือบนโต๊ะ)</p><div class="row">${btn('sccancel', 'ยกเลิก', 'ghost')}${btn('scss', '⚡ Scout & Show', 'primary', {}, !ok)}</div>`;
    }
  } else {
    const a = S.scSel, sel = a.length ? hand.slice(a[0], a.at(-1) + 1) : [];
    const ok = myTurn && sel.length && SC.beats(SC.classify(sel), act ? SC.classify(act.cards) : null);
    handHtml = `<div class="shand">${hand.map((x, i) => scCard(x, a.includes(i) ? 'on' : '', myTurn ? `data-act="sccard" data-i="${i}"` : 'disabled')).join('')}</div>`;
    if (myTurn) {
      const canScout = act && act.by !== mine;
      const sb = (end, ss) => btn('scpick', `${ss ? '⚡' : '🎟️'} ${end === 'L' ? '◀ ซ้าย' : 'ขวา ▶'} (${(end === 'L' ? act.cards[0] : act.cards.at(-1))[0]})`, 'ghost', { end, ss: ss ? 1 : 0 });
      actions = `${btn('scshow', sel.length ? `🎪 Show ${sel.length} ใบ` : '🎪 Show (เลือกไพ่ติดกันก่อน)', 'primary wide', {}, !ok)}
        ${sel.length && !ok ? `<p class="muted small center">${SC.classify(sel) ? 'ชุดนี้ยังไม่แรงกว่าบนโต๊ะ' : 'ต้องเป็นเลขเรียงกัน หรือเลขเหมือนกัน'}</p>` : ''}
        ${canScout ? `<p class="or center">หรือ Scout — หยิบไพ่จากปลายชุดบนโต๊ะ</p><div class="row">${sb('L', 0)}${act.cards.length > 1 ? sb('R', 0) : ''}</div>
          ${k.used[mine] ? '' : `<p class="or center">หรือ Scout & Show (รอบละครั้ง)</p><div class="row">${sb('L', 1)}${act.cards.length > 1 ? sb('R', 1) : ''}</div>`}` : act ? '' : '<p class="muted small center">โต๊ะว่าง ต้อง Show</p>'}`;
    }
  }
  return `${head}${table}<section class="panel"><h2>ไพ่ของคุณ ${myTurn ? '<span class="tag ok">ตาคุณ</span>' : ''}</h2>${handHtml}${actions}</section>${scBoard()}`;
}
function scEndV() {
  const k = S.pub.sc, w = k.win.includes(me());
  const rows = pl().map(x => ({ x, t: k.total[x.sid] })).sort((a, b) => b.t - a.t);
  return `<div class="banner ${w ? 'win' : 'lose'}"><div class="bt">${w ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>🏆 ${k.win.map(s => esc(pn(s))).join(', ')}</div></div>
    <section class="panel"><h2>คะแนนรวม</h2><ol class="log">${rows.map(r => `<li>${esc(r.x.name)} — <b>${r.t}</b></li>`).join('')}</ol></section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

/* Skull */
const DI = d => (d === 'f' ? '🌹' : '💀');
// A round coaster. kind: 'back' (face down), 'f' (flower), 's' (skull).
const disc = (kind, cls = '', attr = '', tag = 'span') => `<${tag} class="disc d-${kind} ${cls}" ${attr}>${kind === 'back' ? '' : `<i>${DI(kind)}</i>`}</${tag}>`;
const skHue = sid => Math.round((pl().findIndex(x => x.sid === sid) * 360) / Math.max(1, pl().length));

// Every player's mat: face-down stack, flipped discs, discs left, points.
function skBoard() {
  const k = S.pub.sk, mine = me(), flipping = k.ch === mine && !k.res;
  const html = `<div class="mats">${pl().map(x => {
    const q = k.pl[x.sid], out = !q.d, down = q.n - q.fl;
    const ups = k.reveals.filter(r => r.sid === x.sid);
    // Animate a flip only the first time we draw it (re-renders would replay it otherwise).
    const last = k.reveals.length !== S.skRev ? k.reveals.at(-1) : null;
    const can = flipping && x.sid !== mine && down > 0;
    const tag = out ? '<span class="tag bad">ตกรอบ</span>' : x.sid === k.ch ? '<span class="tag ok">🎯 ผู้ท้า</span>' : k.passed.includes(x.sid) ? '<span class="tag">หมอบ</span>' : x.sid === k.turn ? '<span class="tag ok">👉 ถึงตา</span>' : '';
    const stack = `<span class="dstack">${Array.from({ length: down }, (_, i) => disc('back', '', `style="--i:${i}"`)).join('')}${!down && !ups.length ? '<span class="dempty"></span>' : ''}</span>
      ${ups.length ? `<span class="dups">${ups.map(r => disc(r.d, r === last ? 'flipin' : '')).join('')}</span>` : ''}`;
    return `<${can ? 'button' : 'div'} class="mat ${out ? 'out' : ''} ${x.sid === k.turn ? 'turn' : ''} ${k.passed.includes(x.sid) ? 'passed' : ''} ${can ? 'can' : ''}" style="--ph:${skHue(x.sid)}" ${can ? `data-act="skflip" data-sid="${x.sid}"` : ''}>
      <span class="mhead"><b>${esc(x.name)}${x.sid === mine ? ' <em>(คุณ)</em>' : ''}</b><span class="mpts">${'⭐'.repeat(q.pts)}${'☆'.repeat(SK.WIN - q.pts)}</span></span>
      <span class="mtable">${stack}</span>
      <span class="mfoot"><span class="mleft" title="แผ่นที่เหลือทั้งหมด">${Array.from({ length: q.d }, () => '<i></i>').join('')}</span>${tag}${can ? '<span class="tag ok">แตะเพื่อเปิด</span>' : ''}</span>
    </${can ? 'button' : 'div'}>`;
  }).join('')}</div><p class="muted small center">กองกลางแผ่น = แผ่นคว่ำบนโต๊ะ · จุดเล็ก = จำนวนแผ่นที่ยังเหลือ · ⭐ แต้ม</p>`;
  S.skRev = k.reveals.length;
  return html;
}

function skMine(canPlace) {
  const v = S.priv;
  if (!v.hand.f && !v.hand.s) return '<p class="alert center">คุณตกรอบแล้ว — ดูต่อได้ แต่ห้ามบอกใบ้</p>';
  // After a loss is settled, hand shrinks while this round's discs are still on the table.
  const hf = Math.max(0, v.hand.f - v.stack.filter(d => d === 'f').length), hs = Math.max(0, v.hand.s - v.stack.filter(d => d === 's').length);
  const hand = [...Array(hf).fill('f'), ...Array(hs).fill('s')];
  return `<section class="panel myhand" style="--ph:${skHue(me())}"><h2>มือของคุณ <span class="muted small">(อย่าให้ใครเห็น)</span></h2>
    <div class="dhand">${hand.length ? hand.map(d => disc(d, 'lg', canPlace ? `data-act="skplace" data-d="${d}"` : 'disabled', 'button')).join('') : '<span class="muted">ไม่มีแผ่นในมือแล้ว</span>'}</div>
    ${canPlace ? '<p class="ask center">แตะแผ่นที่จะวางคว่ำ</p>' : ''}
    <div class="dmine"><span class="small muted">กองของคุณบนโต๊ะ (ล่าง → บน)</span><span class="drow">${v.stack.length ? v.stack.map(d => disc(d, 'sm')).join('') : '<span class="muted small">— ยังไม่ได้วาง —</span>'}</span></div></section>`;
}

function skV() {
  const k = S.pub.sk, v = S.priv, mine = me(), opening = !k.turn && !k.ch && !k.res;
  let status = '', act = '', canPlace = false;
  if (opening) {
    const placed = Object.values(k.pl).filter(q => q.n).length, need = Object.values(k.pl).filter(q => q.d).length;
    status = `ทุกคนวางแผ่นแรกคว่ำไว้ (${placed}/${need})`;
    canPlace = v.stack.length === 0 && (v.canF || v.canS);
  } else if (k.turn) {
    status = k.bid ? `💰 ประมูลสูงสุด <b>${k.bid.n}</b> โดย ${esc(pn(k.bid.by))} · ตาของ <b>${esc(pn(k.turn))}</b>` : `👉 ตาของ <b>${esc(pn(k.turn))}</b> — วางเพิ่ม หรือเริ่มประมูล`;
    if (k.turn === mine) {
      const min = (k.bid?.n || 0) + 1, max = k.total;
      S.bidN = Math.min(max, Math.max(min, S.bidN ?? min));
      const stepper = min <= max ? `<div class="stepper"><span>${k.bid ? 'เพิ่มเป็น' : 'ประมูล'} (เปิดเจอ 🌹 กี่แผ่น)</span><div class="sctl"><button class="sb" data-act="skn" data-d="-1" ${S.bidN <= min ? 'disabled' : ''}>−</button><b>${S.bidN}</b><button class="sb" data-act="skn" data-d="1" ${S.bidN >= max ? 'disabled' : ''}>+</button></div></div>
        ${btn('skbid', k.bid ? `💰 เพิ่มเป็น ${S.bidN}` : `💰 ประมูล ${S.bidN}`, 'primary wide')}` : '';
      canPlace = !k.bid && (v.canF || v.canS);
      act = k.bid
        ? `<section class="panel"><h2>ตาคุณ</h2>${stepper}${btn('skpass', '🙅 หมอบ', 'ghost wide')}</section>`
        : `<section class="panel"><h2>ตาคุณ</h2><p class="muted small">${canPlace ? 'แตะแผ่นในมือด้านล่างเพื่อวางเพิ่ม หรือเริ่มประมูล' : 'ไม่มีแผ่นในมือแล้ว ต้องประมูล'}</p>${stepper}</section>`;
    }
  } else if (k.ch) {
    const fl = k.reveals.filter(r => r.d === 'f').length;
    status = `🎯 ${esc(pn(k.ch))} ต้องเปิดเจอ 🌹 ให้ได้ <b>${k.bid.n}</b> แผ่น (ตอนนี้ ${fl})`;
    if (k.ch === mine && !k.res) act = '<p class="ask center">แตะกองของคนอื่นเพื่อเปิดแผ่นบนสุด</p>';
    if (k.res?.choose && k.ch === mine) act = `<p class="ask center">💀 เจอกะโหลกตัวเอง — แตะแผ่นที่จะทิ้ง</p><div class="dhand">${v.hand.f ? disc('f', 'lg', 'data-act="sklose" data-d="f"', 'button') : ''}${v.hand.s ? disc('s', 'lg', 'data-act="sklose" data-d="s"', 'button') : ''}</div>`;
    else if (k.res?.choose) act = `<p class="center">${esc(pn(k.ch))} กำลังเลือกแผ่นที่จะทิ้ง…</p>`;
  }
  let res = '';
  if (k.res?.settled) {
    const r = k.res, ch = pn(k.ch);
    res = r.ok
      ? `<div class="banner win"><div class="bt">🎉 ${esc(ch)} สำเร็จ!</div><div>ได้ 1 แต้ม (${k.pl[k.ch].pts}/${SK.WIN})</div></div>`
      : `<div class="banner lose"><div class="bt">💀 เจอหัวกะโหลก!</div><div>${r.owner === k.ch ? `${esc(ch)} เจอกะโหลกของตัวเอง` : `ของ ${esc(pn(r.owner))}`} — ${esc(ch)} เสีย 1 แผ่น${k.pl[k.ch].d ? '' : ' และตกรอบ'}</div>
          ${v.lost ? `<div class="small">แผ่นที่คุณเสีย: ${DI(v.lost)} (คนอื่นไม่รู้)</div>` : ''}</div>`;
    act = isHostView() ? btn('sknext', k.winner ? '🏆 ดูผู้ชนะ' : '▶ รอบต่อไป', 'primary wide big') : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>';
  }
  return `<p class="center skstatus">${status}</p>${res}${skBoard()}${act}${skMine(canPlace)}`;
}

function skEndV() {
  const k = S.pub.sk, w = k.winner === me();
  return `<div class="banner ${w ? 'win' : 'lose'}"><div class="bt">${w ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>🏆 ${esc(pn(k.winner))} ชนะ ${k.pl[k.winner].pts >= SK.WIN ? `(ท้าสำเร็จ ${SK.WIN} ครั้ง)` : '(รอดคนสุดท้าย)'}</div></div>
    ${skBoard()}
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

/* Insider */
const IR = IN.ROLE;
function inCard() {
  const v = S.priv;
  const d = { master: 'ทุกคนรู้ว่าคุณเป็นผู้คุมเกม · ตอบได้แค่ ใช่ / ไม่ใช่ / ไม่รู้', insider: 'แอบรู้คำลับ · ชี้นำให้ทุกคนทายถูกทันเวลา แต่อย่าให้ใครจับได้', common: 'ถามคำถามใช่/ไม่ใช่เพื่อหาคำลับ แล้วช่วยกันจับอินไซเดอร์' }[v.role];
  return `<span class="role t-${v.role === 'insider' ? 'wolf' : 'village'}"><span class="rn">${IR[v.role]}</span>
    ${v.word ? `<span class="small muted">คำลับ</span><span class="rn word">${esc(v.word)}</span>` : ''}<span class="rd">${d}</span></span>`;
}
const inMine = () => secret(inCard(), 'แตะเพื่อดูบทบาทของคุณ');
const inMasterLine = () => `<p class="center">🎓 ผู้คุมเกม: <b>${esc(pn(S.pub.ins.master))}</b>${S.pub.ins.master === me() ? ' (คุณ)' : ''}</p>`;

function inWordV() {
  const p = S.pub, v = S.priv, n = pl().length, rd = p.ready || [];
  return `<h1 class="ph">🔎 รับบทบาท</h1>${inMasterLine()}${inMine()}
    ${v.ready ? '<p class="center ok-text">✔ คุณพร้อมแล้ว</p>' : btn('ready', 'ดูแล้ว พร้อม', 'primary wide big')}
    <section class="panel"><h2>พร้อม ${rd.length}/${n}</h2>${players({ ready: rd })}</section>
    ${isHostView() ? btn('istart', rd.length >= n ? '⏱️ เริ่มจับเวลา' : `⏱️ เริ่มจับเวลา (พร้อม ${rd.length}/${n})`, 'primary wide big') : ''}`;
}

function inAskV() {
  const p = S.pub, master = p.ins.master === me();
  return `<div class="timer big" data-timer></div>${inMasterLine()}
    <p class="center">ถามผู้คุมเกมได้แค่คำถาม <b>ใช่ / ไม่ใช่</b> · หมดเวลาก่อนทายถูก = ทุกคนแพ้</p>
    ${master ? `<section class="panel"><h2>ใครทายถูก? (กดเมื่อมีคนพูดคำลับถูก)</h2>
      <div class="picks">${pl().filter(x => x.sid !== me()).map(x => `<button class="pick" data-act="ifound" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div></section>` : ''}
    ${isHostView() && !master ? `<details class="panel small"><summary>ผู้คุมเกมหลุด? เจ้าของห้องกดแทน</summary>
      <div class="picks">${pl().filter(x => x.sid !== p.ins.master).map(x => `<button class="pick" data-act="hfound" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div></details>` : ''}
    ${inMine()}`;
}

function inDiscV() {
  const p = S.pub;
  return `<div class="banner win"><div class="small">🎉 ${esc(pn(p.ins.guesser))} ทายถูก! คำลับคือ</div><div class="bt">${esc(p.ins.word)}</div></div>
    <div class="timer big" data-timer></div>
    <p class="center">คุยกันว่าใครคือ <b>อินไซเดอร์</b> — ใครชี้นำคำถามเก่งเกินไป?<br><span class="muted small">เวลาคุยเท่ากับเวลาที่ใช้ทายคำ</span></p>
    ${isHostView() ? btn('itovote', '🗳️ ไปโหวตเลย', 'primary wide big') : ''}${inMine()}`;
}

function inV1V() {
  const p = S.pub, v = S.priv, g = pn(p.ins.guesser), voted = p.voted || [];
  return `<h1 class="ph">🗳️ โหวตรอบแรก</h1><p class="center big-t">${esc(g)} คืออินไซเดอร์หรือไม่?</p>
    <div class="row">${btn('iv1', '✅ ใช่', v.v1 === true ? 'primary' : '', { yes: 1 })}${btn('iv1', '❌ ไม่ใช่', v.v1 === false ? 'danger' : '', { yes: 0 })}</div>
    <p class="center muted small">ถ้าเกินครึ่งตอบว่าใช่ จะเปิดเผยทันที · ถ้าไม่ ไปโหวตรอบสอง</p>
    <section class="panel"><h2>โหวตแล้ว ${voted.length}/${pl().length}</h2>${players({ voted })}</section>`;
}

function inV2V() {
  const p = S.pub, v = S.priv, voted = p.voted || [];
  return `<h1 class="ph">🗳️ โหวตรอบสอง</h1><p class="center">ใครคืออินไซเดอร์? (เปลี่ยนใจได้จนกว่าจะครบ)</p>
    <div class="picks">${pl().filter(x => x.sid !== me() && x.sid !== p.ins.master).map(x => `<button class="pick ${v.v2 === x.sid ? 'on' : ''}" data-act="iv2" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div>
    <section class="panel"><h2>โหวตแล้ว ${voted.length}/${pl().length}</h2>${players({ voted })}</section>`;
}

function inTieV() {
  const p = S.pub, master = p.ins.master === me(), host = isHostView();
  const picks = act => `<div class="picks">${p.ins.cand.map(s => `<button class="pick" data-act="${act}" data-sid="${s}">${esc(pn(s))}</button>`).join('')}</div>`;
  return `<h1 class="ph">⚖️ คะแนนเสมอ</h1><p class="center">ผู้คุมเกม (${esc(pn(p.ins.master))}) ตัดสินว่าใครคืออินไซเดอร์</p>
    ${master ? picks('itie') : host ? `<details class="panel small"><summary>ผู้คุมเกมหลุด? เจ้าของห้องกดแทน</summary>${picks('htie')}</details>` : ''}`;
}

function inEndV() {
  const R = S.pub.result, win = R.win[me()];
  const head = R.w === 'none' ? '⏰ หมดเวลา — ทุกคนแพ้' : R.w === 'common' ? '🙂 จับอินไซเดอร์ได้! ผู้คุมเกม + คนทั่วไปชนะ' : '🕵️ อินไซเดอร์รอดตัว — อินไซเดอร์ชนะ';
  const acc = R.accused ? `ถูกกล่าวหา: ${pn(R.accused)} (${R.how === 'v1' ? 'โหวตรอบแรก' : R.how === 'v2' ? 'โหวตรอบสอง' : 'ผู้คุมเกมตัดสิน'})` : '';
  const v2c = {};
  Object.values(R.v2 || {}).forEach(t => (v2c[t] = (v2c[t] || 0) + 1));
  return `<div class="banner ${win ? 'win' : 'lose'}"><div class="bt">${win ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>${head}</div><div class="small">${esc(acc)}</div></div>
    <section class="panel"><h2>เฉลย</h2><p>คำลับ: <b>${esc(R.word)}</b><br>🕵️ อินไซเดอร์: <b>${esc(pn(R.insider))}</b><br>🎓 ผู้คุมเกม: ${esc(pn(R.master))}${R.guesser ? `<br>🎯 คนทายถูก: ${esc(pn(R.guesser))}` : ''}</p></section>
    ${Object.keys(R.v1 || {}).length ? `<section class="panel"><h2>ผลโหวต</h2><ul class="players">${pl().map(x => `<li><span class="pname">${esc(x.name)}</span><span class="small">${x.sid in R.v1 ? (R.v1[x.sid] ? 'รอบแรก ✅' : 'รอบแรก ❌') : ''}${R.v2?.[x.sid] ? ` · เลือก ${esc(pn(R.v2[x.sid]))}` : ''}${v2c[x.sid] ? ` · โดน ${v2c[x.sid]} เสียง` : ''}</span></li>`).join('')}</ul></section>` : ''}
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

/* Just One */
const joHead = () => {
  const j = S.pub.jo;
  return `<section class="panel board"><div class="jstat"><span>การ์ด <b>${Math.min(j.i + 1, j.total)}/${j.total}</b></span><span>✅ <b>${j.score}</b></span><span>🗑️ <b>${j.lost}</b></span></div>
    <div class="small center">🙈 คนทายรอบนี้: <b>${esc(pn(j.guesser))}</b>${j.guesser === me() ? ' (คุณ)' : ''}</div></section>`;
};
const joWord = () => `<div class="banner"><div class="small">คำลับ (คนทายห้ามเห็น)</div><div class="bt">${esc(S.priv.word)}</div></div>`;

function joClueV() {
  const j = S.pub.jo, v = S.priv, k = j.per, need = pl().length - 1;
  if (v.guesser) return `${joHead()}<p class="center big-t">🙈 คุณเป็นคนทาย</p><p class="center">รอคนอื่นให้คำใบ้ (${j.submitted.length}/${need}) · อย่าแอบดูจอคนอื่น</p>
    ${isHostView() && j.submitted.length ? btn('jforce', 'ข้ามคนที่ยังไม่ส่ง', 'ghost wide small') : ''}`;
  S.jc ||= ['', ''];
  const form = v.mine && !S.jedit
    ? `<p class="center ok-text">✔ ส่งแล้ว: ${v.mine.map(esc).join(', ')}</p>${btn('jedit', 'แก้ไขคำใบ้', 'ghost wide small')}`
    : `<section class="panel"><h2>คำใบ้ของคุณ${k > 1 ? ' (2 คำ)' : ''}</h2>
        ${[...Array(k)].map((_, i) => `<input id="jc${i}" class="jin" maxlength="30" autocomplete="off" placeholder="คำใบ้ ${k > 1 ? i + 1 : ''} (1 คำ)" value="${esc(S.jc[i] || '')}">`).join('')}
        <p class="muted small">ห้ามปรึกษากัน · ถ้าซ้ำกับคนอื่นจะถูกลบทั้งคู่ · ห้ามใช้คำลับหรือส่วนของคำลับ</p>
        ${btn('jsend', 'ส่งคำใบ้', 'primary wide')}</section>`;
  return `${joHead()}${joWord()}${form}<p class="center muted small">ส่งแล้ว ${j.submitted.length}/${need}</p>
    ${isHostView() && j.submitted.length ? btn('jforce', 'ข้ามคนที่ยังไม่ส่ง', 'ghost wide small') : ''}`;
}

const JWHY = { dup: 'ซ้ำ', word: 'เหมือนคำลับ', empty: 'ว่าง' };
function joCheckV() {
  const v = S.priv;
  if (v.guesser) return `${joHead()}<p class="center big-t">🙈 คนใบ้กำลังตรวจคำใบ้ซ้ำ…</p><p class="center muted">อย่าแอบดูจอคนอื่นนะ</p>`;
  return `${joHead()}${joWord()}
    <section class="panel"><h2>ตรวจคำใบ้</h2><p class="muted small">ระบบลบคำซ้ำ/คำที่เหมือนคำลับให้แล้ว · แตะเพื่อลบหรือคืนคำ (เช่น คำพ้องความหมาย หรือคำตระกูลเดียวกัน)</p>
      <div class="clues">${(v.review || []).map(x => `<button class="clue ${x.out ? 'out' : ''}" data-act="jstrike" data-id="${esc(x.id)}"><b>${esc(x.text)}</b><small>${esc(pn(x.sid))}${x.auto ? ` · ${JWHY[x.auto]}` : ''}</small></button>`).join('')}</div>
    </section>
    ${btn('jdone', '✔ ตรวจเสร็จ ส่งให้คนทาย', 'primary wide big')}`;
}

function joGuessV() {
  const j = S.pub.jo, v = S.priv;
  const clues = j.shown.length ? `<div class="clues">${j.shown.map(t => `<span class="clue"><b>${esc(t)}</b></span>`).join('')}</div>` : '<p class="center muted">ไม่เหลือคำใบ้เลย 😱</p>';
  return `${joHead()}<section class="panel"><h2>คำใบ้ที่เหลือ</h2>${clues}</section>
    ${v.guesser
      ? `<section class="panel"><h2>คำตอบของคุณ</h2><input id="jg" class="jin" maxlength="40" autocomplete="off" placeholder="พิมพ์คำตอบ" value="${esc(S.jg || '')}">
          <div class="row">${btn('jpass', '⏭️ ผ่าน', 'ghost')}${btn('jguess', 'ตอบ', 'primary')}</div></section>`
      : `<p class="center">รอ ${esc(pn(j.guesser))} ทาย… ห้ามใบ้เพิ่มนะ 🤐</p>`}`;
}

function joResV() {
  const r = S.pub.jo.res, g = r.guess;
  const head = g.res === 'ok' ? '✅ ถูกต้อง! +1' : g.res === 'pass' ? '⏭️ ผ่าน — เสียการ์ดใบนี้' : '❌ ผิด — เสียการ์ดใบนี้และใบถัดไป';
  return `${joHead()}<div class="banner ${g.res === 'ok' ? 'win' : 'lose'}"><div class="small">คำลับ</div><div class="bt">${esc(r.word)}</div>
      <div>${g.text != null ? `ตอบว่า “${esc(g.text)}”` : 'ไม่ได้ตอบ'}</div><div>${head}</div></div>
    <section class="panel"><h2>คำใบ้ทั้งหมด</h2><div class="clues">${r.clues.map(x => `<span class="clue ${x.out ? 'out' : ''}"><b>${esc(x.text)}</b><small>${esc(pn(x.sid))}</small></span>`).join('')}</div></section>
    ${isHostView() ? `${g.res === 'wrong' ? btn('jok', 'นับว่าถูก (สะกดต่าง / ความหมายเดียวกัน)', 'ghost wide small') : ''}${btn('jnext', 'ต่อไป ▶', 'primary wide big')}` : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
}

function joEndV() {
  const j = S.pub.jo;
  return `<div class="banner win"><div class="small">คะแนนของทีม</div><div class="bt">${j.score} / ${j.total}</div><div>${esc(j.rating)}</div></div>
    <section class="panel"><h2>ทุกการ์ด</h2><ol class="log">${j.log.map(l => `<li><b>${esc(l.word)}</b> — ${esc(pn(l.guesser))} ${l.res === 'ok' ? '✅' : l.res === 'pass' ? '⏭️ ผ่าน' : `❌ “${esc(l.guess)}”`}</li>`).join('')}</ol></section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
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
  const body = g === 'mi' ? `
    <p><b>เกมช่วยกัน:</b> ทุกคนได้เลข 1–100 ต้องวางเรียงจากน้อยไปมากให้หมด <b>โดยห้ามคุย ห้ามส่งสัญญาณ</b> ใช้จังหวะและความรู้สึกเท่านั้น</p>
    <ol><li>ด่านที่ 1 ได้คนละ 1 ใบ ด่าน 2 ได้ 2 ใบ ไปเรื่อยๆ</li>
    <li>ไม่มีตาใคร ใครคิดว่าเลขตัวเองต่ำสุดก็กดวางได้เลย (วางใบต่ำสุดของตัวเองเสมอ)</li>
    <li>ถ้าวางแล้วมีคนถือเลขต่ำกว่า = <b>เสีย 1 ชีวิต</b> และใบที่ต่ำกว่าทั้งหมดถูกทิ้ง</li>
    <li><b>⭐ ดาว:</b> เสนอใช้ได้ ถ้าทุกคนที่ยังมีไพ่เห็นด้วย ทุกคนทิ้งใบต่ำสุดของตัวเองแบบเปิด</li>
    <li>ผ่านด่าน 2, 5, 8 ได้ดาวเพิ่ม · ผ่านด่าน 3, 6, 9 ได้ชีวิตเพิ่ม</li></ol>
    <p>ผ่านทุกด่าน = ชนะ · ชีวิตหมด = แพ้</p>` : g === 'cn' ? `
    <p><b>เป้าหมาย:</b> ทีมไหนเปิดคำของตัวเองบนตารางครบก่อนชนะ</p>
    <ol><li>แต่ละทีมมี <b>หัวหน้าสายลับ</b> 1 คน ที่เห็นว่าคำไหนเป็นของทีมไหน</li>
    <li>หัวหน้าใบ้ <b>คำเดียว + ตัวเลข</b> (จำนวนคำที่เกี่ยวข้อง) ห้ามใช้คำบนตารางหรือส่วนของคำนั้น</li>
    <li>ลูกทีมแตะคำเพื่อเดา เดาได้สูงสุด ตัวเลข + 1 ครั้ง (ใบ้เลข 0 = เดาได้ไม่จำกัด) หรือกดจบตา</li>
    <li>เปิดเจอคำทีมตัวเอง = เดาต่อได้ · เจอคำกลางหรือคำอีกทีม = จบตา</li>
    <li><b>☠️ เปิดเจอนักฆ่า = แพ้ทันที</b></li></ol>
    <p class="muted small">ทีมที่เริ่มก่อนมี 9 คำ อีกทีม 8 คำ · คำกลาง 7 · นักฆ่า 1</p>` : g === 'sc' ? `
    <p><b>เป้าหมาย:</b> เก็บแต้มให้มากที่สุดจากการลงชุดไพ่ที่แรงกว่าคนอื่น</p>
    <ol><li>ไพ่ทุกใบมี 2 เลข (บน/ล่าง) <b>ห้ามสลับลำดับไพ่ในมือ</b> เริ่มรอบเลือกได้ครั้งเดียวว่าจะกลับหัวทั้งมือไหม</li>
    <li>ถึงตาคุณ เลือก 1 อย่าง:<br><b>Show</b> — ลงไพ่ที่อยู่<b>ติดกัน</b>ในมือเป็นชุด (เลขเรียง หรือเลขเหมือนกัน) ที่แรงกว่าชุดบนโต๊ะ แล้วเก็บชุดเดิมเป็นแต้ม<br><b>Scout</b> — หยิบไพ่ 1 ใบจากปลายซ้ายหรือขวาของชุดบนโต๊ะ มาเสียบตรงไหนของมือก็ได้ จะกลับหัวก็ได้ เจ้าของชุดได้ 1 แต้ม<br><b>Scout & Show</b> — ทำทั้งสองอย่างในตาเดียว ใช้ได้รอบละครั้ง</li>
    <li>ความแรง: จำนวนใบมากกว่าชนะ → ถ้าเท่ากัน เลขเหมือนชนะเลขเรียง → ถ้ายังเท่า เลขสูงกว่าชนะ</li>
    <li>จบรอบเมื่อมีคนไพ่หมดมือ หรือทุกคนที่เหลือ Scout จนวนกลับมาถึงเจ้าของชุด</li></ol>
    <p>แต้ม = ไพ่ที่เก็บได้ + แต้ม Scout − ไพ่ที่เหลือในมือ (คนที่ทำให้จบรอบไม่โดนหัก) · เล่นจำนวนรอบเท่าจำนวนผู้เล่น</p>` : g === 'sk' ? `
    <p><b>เป้าหมาย:</b> ท้าเปิดแผ่นให้สำเร็จ ${SK.WIN} ครั้ง หรือเป็นคนสุดท้ายที่ยังเหลือแผ่น</p>
    <ol><li>ทุกคนมี 🌹 ดอกไม้ 3 แผ่น + 💀 หัวกะโหลก 1 แผ่น · เริ่มรอบ ทุกคนวางคว่ำคนละ 1 แผ่นพร้อมกัน</li>
    <li>ถึงตาคุณ: <b>วางเพิ่ม</b> 1 แผ่น หรือ <b>เริ่มประมูล</b> ว่าจะเปิดเจอดอกไม้ได้กี่แผ่น (ไม่เกินจำนวนแผ่นบนโต๊ะ)</li>
    <li>เมื่อมีคนประมูลแล้ว ห้ามวางเพิ่ม · แต่ละคนต้อง <b>เพิ่มตัวเลข</b> หรือ <b>หมอบ</b> (หมอบแล้วกลับมาไม่ได้)</li>
    <li>คนที่ประมูลสูงสุดต้องเปิด <b>กองตัวเองให้หมดก่อน</b> แล้วเลือกเปิดแผ่นบนสุดของคนอื่นจนครบ</li>
    <li>เปิดเจอดอกไม้ครบ = ได้ 1 แต้ม · เจอหัวกะโหลก = เสียแผ่น 1 แผ่นแบบสุ่ม (ถ้าเป็นกะโหลกตัวเอง เลือกทิ้งเองได้) · แผ่นหมด = ตกรอบ</li></ol>
    <p class="muted small">คนท้าเป็นคนเริ่มรอบถัดไป ถ้าตกรอบ เจ้าของกะโหลกเป็นคนเริ่มแทน</p>` : g === 'ins' ? `
    <p><b>เป้าหมาย:</b> ช่วยกันทายคำลับให้ได้ภายในเวลา แล้วจับ <b>อินไซเดอร์</b> ที่แอบรู้คำตอบอยู่แล้ว</p>
    <ol><li><b>🎓 ผู้คุมเกม</b> (ทุกคนรู้ว่าใคร) รู้คำลับ ตอบได้แค่ "ใช่ / ไม่ใช่ / ไม่รู้"</li>
    <li><b>🕵️ อินไซเดอร์</b> แอบรู้คำลับ ต้องชี้นำคำถามให้ทุกคนทายถูก แต่ห้ามโดนจับได้</li>
    <li>ทุกคนถามคำถามใช่/ไม่ใช่ได้เรื่อยๆ ใครทายถูก ผู้คุมเกมกด "ทายถูก" · หมดเวลาก่อน = ทุกคนแพ้</li>
    <li>ได้เวลาคุยเท่ากับเวลาที่ใช้ทายคำ แล้วโหวตรอบแรก: "คนที่ทายถูกคืออินไซเดอร์หรือไม่?" ถ้าเกินครึ่งว่าใช่ เปิดเผยเลย</li>
    <li>ถ้าไม่ โหวตรอบสองเลือกคนที่คิดว่าเป็นอินไซเดอร์ (เสมอให้ผู้คุมเกมตัดสิน)</li></ol>
    <p>จับอินไซเดอร์ได้ = ผู้คุมเกมและคนทั่วไปชนะ · จับผิดคน = อินไซเดอร์ชนะ</p>` : g === 'jo' ? `
    <p><b>เกมช่วยกัน:</b> ทุกคนอยู่ทีมเดียวกัน พยายามทายให้ถูกมากที่สุด</p>
    <ol><li>แต่ละรอบมีคนทาย 1 คน (วนไปเรื่อยๆ) คนอื่นเห็นคำลับ</li>
    <li>คนใบ้พิมพ์คำใบ้ <b>คนละ 1 คำ</b> แบบไม่ปรึกษากัน (เล่น 3 คน ได้คนละ 2 คำ)</li>
    <li><b>คำใบ้ที่ซ้ำกันจะถูกลบทั้งหมด</b> รวมถึงคำที่เป็นหรือมีส่วนของคำลับ · คนใบ้ช่วยกันตรวจ แตะเพื่อลบ/คืนคำได้ เช่น คำพ้องที่ระบบจับไม่ได้</li>
    <li>คนทายเห็นเฉพาะคำใบ้ที่เหลือ ทายได้ 1 ครั้ง หรือกดผ่าน</li></ol>
    <p>✅ ถูก = ได้ 1 แต้ม · ⏭️ ผ่าน = เสียการ์ดใบนั้น · ❌ ผิด = เสียการ์ดใบนั้นและใบถัดไป</p>` : g === 'av' ? `
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
    const k = `${p.phase}|${p.round}|${p.step?.[0] ?? ''}|${p.vr ?? ''}|${p.turn ?? ''}|${p.av ? p.av.q + '.' + p.av.nh : ''}|${p.jo ? p.jo.i : ''}|${p.sk ? `${p.sk.round}.${p.sk.bid?.n ?? 0}.${p.sk.turn}` : ''}|${p.sc ? `${p.sc.round}.${p.sc.turn}.${p.sc.active?.cards.length ?? 0}.${p.sc.active?.by ?? ''}` : ''}|${p.cn?.words ? `${p.cn.turn}.${p.cn.clue ? 1 : 0}` : ''}`;
    if (k !== S.key) {
      S.jc = ['', '']; S.jedit = false; S.bidN = null; S.scSel = []; S.scM = null; S.cw = ''; S.cnN = 1;
      S.key = k; S.reveal = false; S.sel = []; S.decoy = null; S.guess = false; S.jg = '';
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
  show: () => { S.reveal = true; S.flip = true; render(); S.flip = false; },
  hide: () => { S.reveal = false; render(); },
  voice: (d, el) => { S.voice = el.checked; LS.set('bg_voice', S.voice); if (S.voice) say('เปิดเสียงบรรยาย'); },
  ready: () => send({ t: 'ready' }),
  sel: d => { toggleSel(d.v); render(); },
  doact: () => { const a = actPayload(S.priv.act); if (a) send({ t: 'act', a }); },
  decoy: d => { S.decoy = +d.i; render(); },
  vote: d => send({ t: 'vote', to: d.sid }),
  pick: () => { S.pick = !S.pick; render(); },
  cat: d => { S.cat = d.c; render(); },
  mplay: () => send({ t: 'mplay', card: S.priv.hand?.[0] }),
  mprop: () => { if (confirm('เสนอใช้ดาว? ทุกคนจะทิ้งใบต่ำสุด')) send({ t: 'mprop' }); },
  magree: () => send({ t: 'magree' }),
  mdecline: () => send({ t: 'mdecline' }),
  cteam: d => send({ t: 'cteam', team: d.team }),
  cmaster: () => send({ t: 'cmaster' }),
  cnn: d => { S.cnN = Math.max(0, Math.min(9, S.cnN + +d.d)); render(); },
  cclue: () => {
    const w = (S.cw || '').trim();
    if (!w) return toast('พิมพ์คำใบ้ก่อน');
    if (/\s/.test(w)) return toast('คำใบ้ต้องเป็นคำเดียว (ห้ามเว้นวรรค)');
    const c = S.pub.cn, nw = norm(w);
    if (c.words.some((x, i) => !c.rev[i] && (norm(x).includes(nw) || nw.includes(norm(x))))) return toast('ห้ามใช้คำบนตาราง หรือส่วนของคำนั้น');
    if (confirm(`ใบ้ “${w}” ${S.cnN}?`)) send({ t: 'cclue', word: w, n: S.cnN });
  },
  cguess: d => { if (confirm(`เลือก “${S.pub.cn.words[+d.i]}” ?`)) send({ t: 'cguess', i: +d.i }); },
  cpass: () => { if (confirm('จบตาของทีม?')) send({ t: 'cpass' }); },
  scflip: () => send({ t: 'scflip' }),
  scready: () => send({ t: 'scready' }),
  sccard: d => {
    const i = +d.i, a = S.scSel;
    if (!a.length) S.scSel = [i];
    else if (i === a[0] - 1) S.scSel = [i, ...a];
    else if (i === a.at(-1) + 1) S.scSel = [...a, i];
    else if (i === a[0] && a.length > 1) S.scSel = a.slice(1);
    else if (i === a.at(-1) && a.length > 1) S.scSel = a.slice(0, -1);
    else S.scSel = a.length === 1 && a[0] === i ? [] : [i];
    render();
  },
  scshow: () => { const a = S.scSel; if (a.length) send({ t: 'scshow', i: a[0], j: a.at(-1) }); },
  scpick: d => { S.scM = { end: d.end, flip: false, ss: d.ss === '1', pos: null }; S.scSel = []; render(); },
  scturn: () => { S.scM.flip = !S.scM.flip; render(); },
  sccancel: () => { S.scM = null; S.scSel = []; render(); },
  scslot: d => {
    const m = S.scM;
    if (!m.ss) return send({ t: 'scscout', end: m.end, pos: +d.pos, flip: m.flip });
    m.pos = +d.pos; S.scSel = []; render();
  },
  scss: () => { const m = S.scM, a = S.scSel; if (m && a.length) send({ t: 'scss', end: m.end, pos: m.pos, flip: m.flip, i: a[0], j: a.at(-1) }); },
  skplace: d => send({ t: 'skplace', d: d.d }),
  skn: d => { S.bidN = (S.bidN ?? 0) + +d.d; render(); },
  skbid: () => { if (confirm(`ประมูล ${S.bidN} แผ่น?`)) send({ t: 'skbid', n: S.bidN }); },
  skpass: () => { if (confirm('หมอบ? (กลับมาประมูลรอบนี้ไม่ได้)')) send({ t: 'skpass' }); },
  skflip: d => send({ t: 'skflip', to: d.sid }),
  sklose: d => { if (confirm(`ทิ้ง ${d.d === 'f' ? '🌹 ดอกไม้' : '💀 หัวกะโหลก'} 1 แผ่น?`)) send({ t: 'sklose', d: d.d }); },
  ifound: d => { if (confirm(`${pn(d.sid)} ทายคำถูกแล้ว?`)) send({ t: 'ifound', by: d.sid }); },
  iv1: d => send({ t: 'iv1', yes: d.yes === '1' }),
  iv2: d => send({ t: 'iv2', to: d.sid }),
  itie: d => { if (confirm(`ตัดสินว่า ${pn(d.sid)} คืออินไซเดอร์?`)) send({ t: 'itie', to: d.sid }); },
  jsend: () => {
    const k = S.pub.jo.per, list = S.jc.slice(0, k).map(x => (x || '').trim());
    if (list.some(x => !x)) return toast(k > 1 ? 'ใส่คำใบ้ให้ครบ 2 คำ' : 'ใส่คำใบ้ก่อน');
    if (list.some(x => /\s/.test(x)) && !confirm('คำใบ้ควรเป็นคำเดียว ส่งเลยไหม?')) return;
    S.jedit = false;
    send({ t: 'jclue', list });
  },
  jedit: () => { S.jedit = true; S.jc = [...(S.priv.mine || ['', ''])]; render(); },
  jstrike: d => send({ t: 'jstrike', id: d.id }),
  jdone: () => { if (confirm('ตรวจครบแล้ว ส่งคำใบ้ให้คนทาย?')) send({ t: 'jdone' }); },
  jguess: () => { const t = (S.jg || '').trim(); if (!t) return toast('พิมพ์คำตอบก่อน'); if (confirm(`ตอบว่า “${t}” ?`)) send({ t: 'jguess', text: t }); },
  jpass: () => { if (confirm('ผ่านข้อนี้? (เสียการ์ดใบนี้)')) send({ t: 'jguess', text: null }); },
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
  if (e.target.id === 'jc0' || e.target.id === 'jc1') { S.jc ||= ['', '']; S.jc[+e.target.id[2]] = e.target.value; }
  if (e.target.id === 'jg') S.jg = e.target.value;
  if (e.target.id === 'cw') S.cw = e.target.value;
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
