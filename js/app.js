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
import * as SH from './secrethitler.js';
import * as CU from './camelup.js';
import * as TC from './taco.js';
import * as CZ from './cheese.js';
import * as BD from './bangdice.js';
import * as OD from './order.js';
import * as RR from './roulette.js';
import * as LF from './lift.js';
import * as TB from './toybattle.js';
import * as HN from './hanabi.js';
import * as CP from './coup.js';
import * as IT from './ito.js';
import * as SA from './salem.js';
import * as AB from './abraca.js';
import { norm } from './words.js';
import { rint, shuffle } from './rng.js';
import { lang, setLang, translate, t as T, setNames, setGame } from './i18n.js';
// dialogs bypass the page, so translate them here
const confirm = m => window.confirm(T(m)), prompt = (m, v) => window.prompt(T(m), v);

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

// Colour themes (hue per theme; the shades live in style.css). Kept per device, shared by every room.
const THEMES = { wine: ['ไวน์', 350], violet: ['ม่วง', 250], blue: ['น้ำเงิน', 218], teal: ['ฟ้าเขียว', 186], green: ['เขียว', 150], orange: ['ส้ม', 24], red: ['แดง', 352], pink: ['ชมพู', 322] };
function setTheme(t) {
  if (!THEMES[t]) t = 'wine';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('bg_theme', t); } catch {}
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(document.documentElement).backgroundColor);
}
const curTheme = () => (THEMES[document.documentElement.dataset.theme] ? document.documentElement.dataset.theme : 'wine');
const langPicker = () => `<div class="seg langs notr">${[['th', 'ไทย'], ['en', 'English']].map(([k, n]) => `<button class="${lang === k ? 'on' : ''}" data-act="lang" data-l="${k}">${n}</button>`).join('')}</div>`;
const themePicker = () => `<div class="themes">${Object.entries(THEMES).map(([k, [n, h]]) =>
  `<button class="tsw ${curTheme() === k ? 'on' : ''}" style="--th:${h}" data-act="theme" data-t="${k}" aria-label="ธีมสี${n}" title="${n}"></button>`).join('')}</div>`;

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
  sh: { n: 'Secret Hitler', s: 'Secret Hitler', e: '🏛️', min: SH.MIN, max: SH.MAX, t: 40, c: ['ded'], d: 'เลือกรัฐบาล ออกกฎหมาย หาฟาสซิสต์และฮิตเลอร์ที่แฝงตัว' },
  sa: { n: 'Salem 1692', s: 'Salem 1692', e: '🧙‍♀️', min: SA.MIN, max: SA.MAX, t: 35, c: ['ded', 'card'], d: 'กล่าวหากันจนเจอแม่มด ระวังกลางคืนและการสมคบคิด' },
  ab: { n: 'Abraca…what?', s: 'Abraca…what?', e: '🪄', min: AB.MIN, max: AB.MAX, t: 20, c: ['card'], d: 'เห็นหินคาถาของทุกคนยกเว้นของตัวเอง เดาให้ถูกแล้วร่าย' },
  cu: { n: 'Camel Up', s: 'Camel Up', e: '🐪', min: CU.MIN, max: CU.MAX, t: 25, c: ['card'], d: 'เดิมพันอูฐแข่งที่ขี่ซ้อนกันได้ ทอยเต๋าลุ้นทุกตา' },
  ct: { n: 'Cheese Thief', s: 'Cheese Thief', e: '🧀', min: CZ.MIN, max: CZ.MAX, t: 10, c: ['ded'], d: 'ทอยเต๋าลับว่าจะตื่นตีไหน ใครตื่นมาเห็นอะไรบ้าง? ช่วยกันจับโจรขโมยชีส' },
  bd: { n: 'Bang! The Dice Game', s: 'Bang! Dice', e: '🎲', min: BD.MIN, max: BD.MAX, t: 20, c: ['ded', 'card'], d: 'นายอำเภอ vs โจร ทอยเต๋า 5 ลูก ยิง รักษา หลบธนูอินเดียนแดง บทบาทลับจนกว่าจะตาย' },
  od: { n: 'Order Overload: Cafe', s: 'Order Overload', e: '☕', min: OD.MIN, max: OD.MAX, t: 20, c: ['coop'], d: 'ฟังออร์เดอร์รอบเดียว แล้วช่วยกันจำว่าเมนูไหนอยู่ในมือเพื่อน เรียกผิดตกรอบ' },
  rr: { n: 'World Championship Russian Roulette', s: 'Russian Roulette', e: '🔫', min: RR.MIN, max: RR.MAX, t: 20, c: ['card'], d: 'แชมป์โลกรัสเซียนรูเล็ต เดิมพันว่าจะเหนี่ยวไกกี่ครั้ง แอบโกงซ่อนกระสุนได้ ถ้าไม่โดนจับ' },
  lf: { n: "I'm Stuck in the Lift", s: 'Stuck in the Lift', e: '🛗', min: LF.MIN, max: LF.MAX, t: 20, c: ['card'], d: 'ทุกคนแอบเขียนชั้นที่อยากไป แล้วกดลิฟต์พร้อมกัน ลิฟต์ไปหยุดชั้นของใคร คนนั้นได้แต้ม' },
  tb: { n: 'Toy Battle', s: 'Toy Battle', e: '🧸', min: TB.MIN, max: TB.MAX, t: 20, c: ['card'], d: 'สงครามของเล่น 2 คน วางทหารให้ต่อกับฐาน ล้อมเขตเก็บเหรียญ หรือบุกยึด H.Q. ศัตรู' },
  hn: { n: 'Hanabi', s: 'Hanabi', e: '🎆', min: HN.MIN, max: HN.MAX, t: 25, c: ['coop'], d: 'ช่วยกันจุดพลุ เห็นไพ่ทุกคนยกเว้นของตัวเอง ใบ้กันให้ลงไพ่ถูกลำดับ 1→5' },
  cp: { n: 'Coup', s: 'Coup', e: '👑', min: CP.MIN, max: CP.MAX, t: 15, c: ['card'], d: 'อ้างว่ามีตัวละครที่ไม่มีก็ได้ ใครสงสัยก็ท้า โกหกโดนจับได้เสียอิทธิพล เหลือรอดคนสุดท้ายชนะ' },
  it: { n: 'ito', s: 'ito', e: '🔢', min: IT.MIN, max: IT.MAX, t: 20, c: ['coop', 'word'], d: 'ได้เลขลับ 1–100 แล้วบอกเลขเป็นคำตามหัวข้อ เช่น “สัตว์ที่น่ากลัว” ช่วยกันวางเรียงจากน้อยไปมาก' },
  tc: { n: 'Taco Cat Goat Cheese Pizza', s: 'Taco Cat', e: '🌮', min: TC.MIN, max: TC.MAX, t: 10, c: ['card'], d: 'เปิดไพ่พร้อมพูดคำ ไพ่ตรงกับคำเมื่อไหร่ ตบให้ไว!' },
};
// Icon set: game-icons.net (CC BY 3.0), drawn as a CSS mask so each one can take any colour or gradient.
const gi = (n, cls = '') => `<i class="gi ${cls}" style="-webkit-mask-image:url(icons/g/${n}.svg);mask-image:url(icons/g/${n}.svg)"></i>`;
const GICON = { onuw: 'wolf', spyfall: 'spy', uc: 'masks', av: 'castle', ins: 'magnify', jo: 'bulb', cn: 'key', mi: 'brain', sc: 'juggler', sk: 'skull', sh: 'gavel', sa: 'witchhat', cu: 'camel', tc: 'taco', ab: 'wand', ct: 'cheese', bd: 'bdgat', od: 'odcup', rr: 'rrgun', lf: 'lift', tb: 'toybear', hn: 'fire', cp: 'crown', it: 'bulb' };
const GHUE = { onuw: 345, spyfall: 190, uc: 35, av: 220, ins: 275, jo: 48, cn: 150, mi: 310, sc: 20, sk: 0, sh: 12, sa: 265, cu: 38, tc: 95, ab: 290, ct: 50, bd: 28, od: 25, rr: 0, lf: 205, tb: 10, hn: 330, cp: 45, it: 175 };
const gbadge = (k, cls = '') => `<span class="gemo ${cls}" style="--gh:${GHUE[k]}">${gi(GICON[k])}</span>`;
const RICON = { werewolf: 'wolf', minion: 'minion', mason: 'mason', seer: 'seer', robber: 'robber', troublemaker: 'troublemaker', drunk: 'drunk', insomniac: 'insomniac', villager: 'villager', hunter: 'hunter', tanner: 'tanner' };
const AICON = { merlin: 'merlin', percival: 'percival', servant: 'servant', assassin: 'assassin', morgana: 'morgana', mordred: 'mordred', oberon: 'oberon', minion: 'minion' };
const art = (icon, cls = '') => `<span class="art ${cls}">${gi(icon)}</span>`;
const CATS = { all: 'ทั้งหมด', ded: '🕵️ จับผิด', word: '💬 คำ', card: '🃏 การ์ด/บลัฟ', coop: '🤝 ช่วยกัน' };
const ROLE = WW.ROLES;
const RL = r => `${ROLE[r].e} ${ROLE[r].n}`;
const TEAM = { village: 'ฝ่ายชาวบ้าน', wolf: 'ฝ่ายหมาป่า', tanner: 'ฝ่ายตัวเอง' };
const ONLINE_MS = 25000;
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const S = {
  conn: null, room: null, pid: null, isHost: false, name: LS.get('bg_name', ''), setup: !LS.get('bg_name', ''), codeIn: new URLSearchParams(location.search).get('r')?.toUpperCase() || '',
  pub: null, priv: null, endsAt: 0, online: true, offSince: 0, hostSeen: 0, hostDown: false, sending: false, busy: '', err: '', toast: '', joinErr: '',
  key: '', round: -1, reveal: false, sel: [], decoy: null, guess: false, crossed: new Set(), rules: false, qr: false, pick: false, cat: 'all', scSel: [], scM: null, bdKeep: [], odSel: null, odAb: null, rrN: null, rrC: null, lfI: null, tbI: null, hnI: null, hnTo: null, cpAct: null, cpKeep: [], ih: [], cw: '', cnN: 1,
  voice: LS.get('bg_voice', true),
};
let H = null, lastPub = '', lastTimed = 0, hostTimer = 0, pingTimer = 0, lastHb = 0;
const sentPriv = {};
let sentPub = '';

// Host → players goes through a small queue. Public brokers throttle a connection that publishes more than a few
// messages a second (after that everything arrives late or not at all), so bursts are merged: only the newest
// public state / newest private view per player is sent, at a steady rate the broker accepts.
const OUT_RATE = 4, OUT_BURST = 8;
const outQ = new Map(), want = {};
let outTok = OUT_BURST, outAt = 0, outTimer = 0;
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function hsend(k, v) {
  outQ.set(k, v);   // a topic already waiting keeps its place in line (newest content, oldest position)
  drain();
}
const hdrop = pid => { outQ.delete('p/' + pid); delete want['p/' + pid]; S.conn.send('p/' + pid, null, true); };   // forget a player's private topic
function drain() {
  clearTimeout(outTimer); outTimer = 0;
  if (!S.conn || !S.isHost) return outQ.clear();
  const t = now();
  outTok = Math.min(OUT_BURST, outTok + (t - outAt) * OUT_RATE / 1000); outAt = t;
  while (outQ.size && outTok >= 1) {
    // strictly first-come-first-served per topic: giving the public state priority starved private messages in a busy room
    const k = outQ.keys().next().value, v = outQ.get(k);
    outQ.delete(k); outTok--;
    S.conn.send(k, v, true);
    want[k] = hash(JSON.stringify(v));   // fingerprint of what was really sent, for the heartbeat
  }
  if (outQ.size) outTimer = setTimeout(drain, Math.ceil((1 - outTok) * 1000 / OUT_RATE) + 5);
}

/* ───────────── host engine ───────────── */
const hn = sid => H.players.find(p => p.sid === sid)?.name || '?';
const isOn = p => p.pid === S.pid || now() - p.seen < ONLINE_MS;

function newHost(room, game, name) {
  return {
    room, game, phase: 'lobby', round: 0, endsAt: null, paused: null, g: null, recent: [],
    players: [{ sid: 's' + uid(6), pid: S.pid, name, seen: now() }],
    settings: { onuw: { auto: true, deck: null, night: 15, day: 300 }, spyfall: { spies: 1, min: 8 }, uc: { auto: true, uc: 1, white: 0 }, av: AV.defaults(), ins: { min: 5 }, jo: { rounds: 13 }, ct: { sec: 8 }, od: { sec: 3 }, wl: lang },
  };
}

function deckNow() {
  const s = H.settings.onuw;
  return s.auto || !s.deck ? WW.recommend(Math.max(WW.MIN, Math.min(WW.MAX, H.players.length))) : s.deck;
}

function pubOf() {
  const t = now(), g = H.g;
  const p = {
    v: 1, room: H.room, game: H.game, phase: H.phase, round: H.round, host: H.players[0].sid, wl: H.wl || 'th',
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
    } else if (H.game === 'ab') {
      p.ab = {
        life: g.life, pts: g.pts, n: Object.fromEntries(g.sids.map(x => [x, g.hands[x].length])), board: g.board, pile: g.pile.length, secret: g.secret.length,
        own: Object.fromEntries(g.sids.map(x => [x, g.owned[x].length])), turn: AB.turnSid(g), min: g.min, casts: g.casts, last: g.last, round: g.round, ln: g.log.length,
        res: g.res, over: g.over, winners: g.winners,
      };
    } else if (H.game === 'sh') {
      p.sh = {
        phase: g.phase, lib: g.lib, fas: g.fas, tracker: g.tracker, pres: g.pres, chan: g.chan, nominee: g.nominee, alive: g.alive, lastVote: g.lastVote,
        power: g.power, deck: g.deck.length, discard: g.discard.length, voted: Object.keys(g.votes), elig: g.sids.filter(x => SH.eligible(g, x)), investigated: g.investigated,
        invTarget: g.inv?.target || null, canVeto: SH.canVeto(g), log: g.log.slice(-6), winner: g.winner, why: g.why, roles: g.winner ? g.role : null, ready: g.ready,
      };
    } else if (H.game === 'cu') {
      p.cu = {
        stacks: g.stacks, dice: g.dice, rolled: g.rolled, tiles: g.tiles, bets: g.bets, desert: g.desert, coins: g.coins, turn: CU.turnSid(g), leg: g.leg,
        fw: g.fw.map(b => b.sid), fl: g.fl.map(b => b.sid), ncards: Object.fromEntries(g.sids.map(x => [x, g.cards[x].length])), lastLeg: g.lastLeg, log: g.log.slice(-5), over: g.over, res: g.res, nl: g.log.length,
      };
    } else if (H.game === 'it') {
      p.it = {
        phase: g.phase, level: g.level, lives: g.lives, theme: g.theme, table: g.table, last: g.last, over: g.over, n: g.n,
        hints: Object.fromEntries(g.sids.map(x => [x, g.hand[x].map((_, i) => g.hints[x]?.[i] || '')])), left: Object.fromEntries(g.sids.map(x => [x, g.hand[x].length])),
        hands: g.phase === 'over' ? g.hand : null,
      };
    } else if (H.game === 'cp') {
      p.cp = {
        phase: g.phase, turn: g.turn, coins: g.coins, pend: g.pend, block: g.block, chal: g.chal, n: g.n, winner: g.winner,
        lose: g.lose[0] || null, waiting: CP.waiting(g), w: g.w, deck: g.deck.length, log: g.log.slice(-8), nl: g.log.length,
        cards: Object.fromEntries(g.sids.map(x => [x, g.hand[x].map(c => (c.up || g.winner ? { c: c.c, up: c.up } : { c: null, up: false }))])),
      };
    } else if (H.game === 'hn') {
      p.hn = {
        fw: g.fw, clues: g.clues, fuses: g.fuses, deck: g.deck.length, disc: g.disc.map(c => c.c + c.n), turn: g.turn, left: g.left, n: g.n,
        know: Object.fromEntries(g.sids.map(x => [x, g.hand[x].map(c => ({ id: c.id, k: c.k }))])), last: g.last, log: g.log.slice(-8), nl: g.log.length,
        over: g.over, why: g.why, score: HN.score(g), hands: g.over ? Object.fromEntries(g.sids.map(x => [x, g.hand[x].map(c => c.c + c.n)])) : null,
      };
    } else if (H.game === 'tb') {
      p.tb = {
        stack: g.stack, taken: g.taken, medals: g.medals, turn: g.turn, extra: g.extra, jumbo: g.jumbo, n: g.n, hq: g.hq, seats: g.sids,
        rackN: Object.fromEntries(g.sids.map(x => [x, g.rack[x].length])), resN: Object.fromEntries(g.sids.map(x => [x, g.reserve[x].length])),
        log: g.log.slice(-8), nl: g.log.length, winner: g.winner, why: g.why,
      };
    } else if (H.game === 'lf') {
      p.lf = {
        phase: g.phase, lift: g.lift, dir: g.dir, cone: g.cone, round: g.round, last: g.last, pts: g.pts, res: g.res, winners: g.winners,
        wrote: g.sids.filter(x => !LF.needs(g, x).length), drove: Object.keys(g.drive), tgEnd: g.phase === 'end' ? g.tg : null,
      };
    } else if (H.game === 'rr') {
      const show = ['challenge', 'trigger', 'score', 'end'].includes(g.phase);
      p.rr = {
        phase: g.phase, round: g.round, team: g.team, pts: g.pts, pocketed: Object.keys(g.pocket), locked: Object.keys(g.bid), bids: show ? g.bid : null,
        acc: g.phase === 'bid' || g.phase === 'pocket' ? {} : g.acc, cdone: Object.keys(g.cdone), extra: g.extra, dead: g.dead, pulled: g.pulled, lastPull: g.lastPull, reveal: g.reveal || null,
        res: g.res, nh: Object.fromEntries(g.sids.map(x => [x, g.hand[x].length])), log: g.log.slice(-8), nl: g.log.length, winner: g.winner, over: g.over, k: g.k,
      };
    } else if (H.game === 'od') {
      p.od = {
        phase: g.phase, level: g.level, ri: g.ri, cur: g.phase === 'read' ? g.orders[g.ri] : null, total: g.orders.length, taker: g.sids[g.taker], turn: g.turn,
        n: Object.fromEntries(g.sids.map(x => [x, g.hand[x].length])), lives: g.lives, table: g.table, last: g.last, hints: g.hints, need: OD.need(g.sids.length), done: OD.done(g),
        ab: g.ab, used: g.used, over: g.over, best: g.best, left: g.phase === 'over' || g.phase === 'clear' ? g.hand : null,
      };
    } else if (H.game === 'bd') {
      const shown = x => !!g.winner || x === g.sheriff || !g.alive.includes(x);   // roles are public only for the Sheriff and the dead
      p.bd = {
        life: g.life, max: g.max, arrows: g.arrows, pile: g.pile, alive: g.alive, turn: g.turn, dice: g.dice, rolls: g.rolls, phase: g.phase, need: BD.need(g), todo: g.todo, n: g.n,
        roles: Object.fromEntries(g.sids.filter(shown).map(x => [x, g.role[x]])), tg: g.phase === 'resolve' && BD.need(g) !== 'beer' && BD.need(g) ? BD.targets(g, g.turn, BD.need(g) === 'one' ? 1 : 2) : [],
        log: g.log.slice(-6), nl: g.log.length, winner: g.winner, wsids: g.wsids, mix: BD.SETUP[g.sids.length],
      };
    } else if (H.game === 'ct') {
      const end = g.phase === 'end';
      p.ct = {
        phase: g.phase, hour: g.hour, ready: g.ready, voted: Object.keys(g.votes), nf: CZ.followers(g.sids.length), res: g.res,
        thief: end ? g.thief : null, follower: end ? g.follower : null, die: end ? g.die : null, votes: end ? g.votes : null, peeks: end ? g.peek : null,
      };
    } else if (H.game === 'tc') {
      p.tc = {
        top: g.top, turn: TC.turnSid(g), n: Object.fromEntries(g.sids.map(x => [x, g.hands[x].length])), pile: g.pile.length, next: TC.WORDS[g.word % 5],
        slap: g.slap ? { special: !!g.slap.special, done: Object.keys(g.slap.times) } : null, last: g.last, winner: g.winner,
      };
    } else if (H.game === 'sa') {
      p.sa = {
        phase: g.phase, alive: g.alive, turn: SA.turnSid(g), played: g.played, front: g.front, deck: g.deck.length, reveal: g.reveal, cat: g.cat,
        try: Object.fromEntries(g.sids.map(x => [x, g.tryal[x].map(c => (c.up ? c.t : null))])), hn: Object.fromEntries(g.sids.map(x => [x, g.hand[x].length])),
        log: g.log.slice(-8), nl: g.log.length, last: g.last, cdone: g.confess ? Object.keys(g.confess) : [], winner: g.winner, team: g.winner ? g.witch : null,
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
  const v = { sid, round: H.round, ack: H.players.find(x => x.sid === sid)?.ack }, g = H.g;
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
  } else if (H.game === 'ab') {
    // everyone's stones except your own
    v.see = Object.fromEntries(g.sids.filter(x => x !== sid).map(x => [x, g.hands[x]]));
    v.own = g.owned[sid];
  } else if (H.game === 'sh') {
    v.role = g.role[sid];
    v.known = SH.known(g, sid).map(x => ({ sid: x, h: g.role[x] === 'H' }));
    v.ready = g.ready.includes(sid);
    if ((g.phase === 'pres' && sid === g.pres) || ((g.phase === 'chan' || g.phase === 'veto') && sid === g.chan)) v.hand = g.hand;
    if (g.phase === 'power' && sid === g.pres) { v.peek = g.peek; v.inv = g.inv; }
    if (g.phase === 'vote') v.vote = sid in g.votes ? g.votes[sid] : null;
  } else if (H.game === 'cu') {
    v.cards = g.cards[sid];
  } else if (H.game === 'it') {
    v.hand = g.hand[sid];
  } else if (H.game === 'cp') {
    v.hand = g.hand[sid];
    v.pool = g.phase === 'exch' && g.pend?.actor === sid ? CP.exchPool(g, sid) : null;
  } else if (H.game === 'hn') {
    // everyone else's cards — never your own
    v.others = Object.fromEntries(g.sids.filter(x => x !== sid).map(x => [x, g.hand[x].map(c => ({ id: c.id, c: c.c, n: c.n }))]));
  } else if (H.game === 'tb') {
    v.rack = g.rack[sid];
    v.spots = g.turn === sid && !g.jumbo ? g.rack[sid].map(t => TB.spots(g, sid, t)) : [];
  } else if (H.game === 'lf') {
    v.tg = g.tg[sid]; v.drive = g.drive[sid] ?? null;
  } else if (H.game === 'rr') {
    v.cards = g.hand[sid]; v.pocket = g.pocket[sid] || null; v.bid = g.bid[sid] ?? null; v.peek = g.peek[sid] || null;
    v.gun = { n: g.gun[sid].length, b: g.gun[sid].filter(c => c === 'B').length };
  } else if (H.game === 'od') {
    v.hand = g.phase === 'read' ? [] : g.hand[sid];
  } else if (H.game === 'bd') {
    v.role = g.role[sid];
  } else if (H.game === 'ct') {
    v.ready = g.ready.includes(sid);
    v.role = sid === g.thief ? 'thief' : sid === g.follower && g.phase !== 'pick' ? 'follower' : 'mouse';
    v.die = g.die[sid];
    v.picked = sid === g.thief ? g.follower : null;
    v.awake = CZ.awake(g).includes(sid);
    v.memo = CZ.memo(g, sid);
    v.thief = v.memo?.cheese === 'steal' ? g.thief : null;   // caught in the act by whoever is awake at that hour
    v.canPeek = CZ.canPeek(g, sid);
    v.vote = g.votes[sid] || null;
  } else if (H.game === 'tc') {
    v.n = g.hands[sid].length;
  } else if (H.game === 'sa') {
    v.tryal = g.tryal[sid]; v.hand = g.hand[sid]; v.witch = g.witch[sid];
    v.mates = g.witch[sid] ? g.sids.filter(x => x !== sid && g.witch[x]) : [];
    v.constable = SA.constable(g) === sid;
    v.dk = g.dawn?.[sid] || null; v.nk = g.night?.kill[sid] || null; v.ns = g.night ? g.night.saved : false;
    v.cf = g.confess ? sid in g.confess : false;
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

function broadcast(force) {
  LS.set('bg_host_' + H.room, H);
  const pub = pubOf(), pj = JSON.stringify({ ...pub, left: 0 });
  if (force || pj !== sentPub) { sentPub = pj; hsend('pub', pub); }   // an action that changed nothing is not re-sent
  for (const p of H.players) {
    const v = privOf(p.sid);
    // Host's own private view changed (e.g. flipped hand) -> force a re-render even if the public state is identical.
    if (p.pid === S.pid) { if (JSON.stringify(S.priv) !== JSON.stringify(v)) lastPub = ''; S.priv = v; continue; }
    const j = JSON.stringify(v);
    if (sentPriv[p.pid] !== j) { sentPriv[p.pid] = j; hsend('p/' + p.pid, v); }
  }
  applyPub(pub, true);
}

// Tell one player their last action arrived (their private view carries `ack`).
function ackOnly(p) {
  if (p.pid === S.pid || !H.players.includes(p)) return;
  const v = privOf(p.sid), j = JSON.stringify(v);
  if (sentPriv[p.pid] !== j) { sentPriv[p.pid] = j; hsend('p/' + p.pid, v); }
}

function hostTick() {
  if (!H) return;
  const t = now();
  // heartbeat, so players can tell "the host dropped" apart from "nothing is happening"
  // It also carries a fingerprint of the newest state, so a player who missed an update notices and asks again.
  if (t - lastHb > 3000) {
    lastHb = t;
    S.conn?.send('hb', { t, v: want.pub, p: Object.fromEntries(H.players.filter(p => p.pid !== S.pid && want['p/' + p.pid]).map(p => [p.sid, want['p/' + p.pid]])) });
  }
  if (H.endsAt && t >= H.endsAt) {
    if (H.phase === 'night') return nextNight();
    if (H.phase === 'ct') { CZ.advance(H.g); ctClock(); return broadcast(); }
    if (H.phase === 'od') { OD.readNext(H.g); odClock(); return broadcast(); }
    if (H.phase === 'rr') { RR.pull(H.g); rrClock(); return broadcast(); }
    if (H.phase === 'lf') { LF.next(H.g); lfClock(); return broadcast(); }
    if (H.phase === 'day') return startVote();
    if (H.phase === 'iask') return inEnd(IN.outcome(H.g, null, 'timeout'));
    if (H.phase === 'idisc') { H.phase = 'iv1'; H.endsAt = null; return broadcast(); }
  }
  // Taco Cat: close the slap window even if someone never slaps
  if (H.phase === 'tc' && H.g.slap && t - H.g.slap.t0 > TC.WINDOW + 700) { TC.resolve(H.g); return broadcast(); }
  const on = H.players.map(isOn).join();
  if (on !== H._on || (H.endsAt && H.endsAt > t - 3000 && t - lastTimed > 3000)) {
    H._on = on;
    lastTimed = t;
    broadcast(true);
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

// Cheese Thief: the follower pick and every night hour last exactly the same time.
// Order Overload: orders are shown one at a time, on a clock.
// Russian Roulette: trigger pulls happen together, one every couple of seconds.
// Stuck in the Lift: the result stays up for a few seconds, then the next round starts by itself.
function lfClock() { H.endsAt = H.g.phase === 'result' ? now() + 6000 : null; }
function rrClock() { H.endsAt = H.g.phase === 'trigger' ? now() + 2200 : null; }
function odClock() { H.endsAt = H.g.phase === 'read' ? now() + (H.settings.od?.sec || 3) * 1000 : null; }
function ctClock() { const ph = H.g.phase; H.endsAt = ph === 'pick' || ph === 'night' ? now() + (H.settings.ct?.sec || 8) * 1000 : null; }

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
  if (p) { delete sentPriv[p.pid]; return broadcast(true); }
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
    hdrop(q.pid);
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
  if (m.t === 'sync') {   // this player's screen is behind: send everything again (at most every 1.5 s)
    if (now() - (p.sync || 0) < 1500) return;
    p.sync = now(); delete sentPriv[p.pid];
    return broadcast(true);
  }
  // Players resend an action until it is acknowledged; never apply the same one twice.
  if (m.id) { if (p.ack === m.id) { delete sentPriv[p.pid]; return ackOnly(p); } p.ack = m.id; }   // a repeat means our ack never arrived: send it again
  hostAct(m, p);
  if (m.id) ackOnly(p);
}

function hostAct(m, p) {
  const g = H.g, sid = p.sid;
  switch (m.t) {
    case 'rename': {
      const nm = cleanName(m.name);
      if (!nm || nm === p.name) break;
      let n2 = nm, i = 2;
      while (H.players.some(x => x !== p && x.name.toLowerCase() === n2.toLowerCase())) n2 = `${nm} ${i++}`;
      p.name = n2; broadcast();
      break;
    }
    case 'leave':
      if (H.phase === 'lobby' && p.pid !== S.pid) {
        H.players = H.players.filter(x => x !== p);
        hdrop(p.pid);
        broadcast();
      }
      break;
    case 'ready':
      if ((H.phase === 'deal' || H.phase === 'uword' || H.phase === 'aroles' || (H.phase === 'sh' && g.phase === 'role') || (H.phase === 'ct' && g.phase === 'role')) && !g.ready.includes(sid)) { g.ready.push(sid); broadcast(); }
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
    case 'abcast': case 'abstop': {
      if (H.phase !== 'ab') break;
      if (m.t === 'abcast' ? AB.cast(g, sid, m.n) : AB.stop(g, sid)) broadcast();
      break;
    }
    case 'shnom': case 'shvote': case 'shdisc': case 'shenact': case 'shveto': case 'shvetoans': case 'shpower': {
      if (H.phase !== 'sh') break;
      const ok = m.t === 'shnom' ? SH.nominate(g, sid, m.to) : m.t === 'shvote' ? SH.vote(g, sid, m.ja) : m.t === 'shdisc' ? SH.presDiscard(g, sid, m.i)
        : m.t === 'shenact' ? SH.chanEnact(g, sid, m.i) : m.t === 'shveto' ? SH.askVeto(g, sid) : m.t === 'shvetoans' ? SH.answerVeto(g, sid, m.yes) : SH.usePower(g, sid, m.to);
      if (ok) broadcast();
      break;
    }
    case 'curoll': case 'cubet': case 'cudes': case 'cufin': {
      if (H.phase !== 'cu') break;
      const ok = m.t === 'curoll' ? CU.roll(g, sid) : m.t === 'cubet' ? CU.takeBet(g, sid, m.c) : m.t === 'cudes' ? CU.placeDesert(g, sid, m.sp, m.type) : CU.finalBet(g, sid, m.c, m.kind);
      if (ok) broadcast();
      break;
    }
    case 'ithint': case 'itplay': {
      if (H.phase !== 'it') break;
      // the card the player saw must still be their lowest (their screen may lag behind)
      if (m.t === 'itplay' && g.hand[sid]?.[0] !== m.card) break;
      if (m.t === 'ithint' ? IT.setHint(g, sid, +m.i, m.text) : IT.play(g, sid)) broadcast();
      break;
    }
    case 'cpact': case 'cpresp': case 'cplose': case 'cpexch': {
      // answers in a challenge/block window come from several players at once, so they are matched to the window, not the move
      if (H.phase !== 'cp' || (m.t === 'cpresp' ? m.w !== g.w : m.n !== g.n)) break;
      const ok = m.t === 'cpact' ? CP.declare(g, sid, m.act, m.to) : m.t === 'cpresp' ? CP.respond(g, sid, m.kind, m.card)
        : m.t === 'cplose' ? CP.loseCard(g, sid, +m.i) : CP.exchange(g, sid, m.keep);
      if (ok) broadcast();
      break;
    }
    case 'hnplay': case 'hndisc': case 'hnclue': {
      if (H.phase !== 'hn' || m.n !== g.n) break;   // a tap made on an older screen
      const i = g.hand[sid]?.findIndex(c => c.id === m.cid);   // (m.id is the message id used for acks)
      const ok = m.t === 'hnplay' ? HN.play(g, sid, i) : m.t === 'hndisc' ? HN.discard(g, sid, i) : HN.clue(g, sid, m.to, m.kind, m.v);
      if (ok) broadcast();
      break;
    }
    case 'tbdraw': case 'tbplace': case 'tbjumbo': case 'tbskip': {
      if (H.phase !== 'tb' || m.n !== g.n) break;   // ignore taps made on an older board
      const ok = m.t === 'tbdraw' ? TB.drawAction(g, sid) : m.t === 'tbplace' ? TB.place(g, sid, +m.i, m.b) : m.t === 'tbjumbo' ? TB.jumbo(g, sid, m.b || null) : TB.skip(g, sid);
      if (ok) broadcast();
      break;
    }
    case 'lfwrite': case 'lfdrive': {
      if (H.phase !== 'lf') break;
      const ok = m.t === 'lfwrite' ? LF.write(g, sid, +m.i, +m.f) : LF.drive(g, sid, +m.v);
      if (ok) { lfClock(); broadcast(); }
      break;
    }
    case 'rrpocket': case 'rrbid': case 'rracc': case 'rrready': case 'rrplay': {
      if (H.phase !== 'rr') break;
      const ok = m.t === 'rrpocket' ? RR.pocket(g, sid, m.c) : m.t === 'rrbid' ? RR.bid(g, sid, +m.n) : m.t === 'rracc' ? RR.accuse(g, sid, m.sid)
        : m.t === 'rrready' ? RR.ready(g, sid) : RR.play(g, sid, m.card, m.card === 'change' ? +m.arg : m.arg);
      if (ok) { rrClock(); broadcast(); }
      break;
    }
    case 'odcall': case 'odab': {
      if (H.phase !== 'od') break;
      const ok = m.t === 'odcall' ? OD.call(g, sid, m.item) : OD.useAbility(g, sid, m.kind, m.arg);
      if (ok) broadcast();
      break;
    }
    case 'bdroll': case 'bdstop': case 'bdshoot': case 'bdheal': {
      if (H.phase !== 'bd' || m.n !== g.n) break;   // m.n: ignore a tap that was made on an older screen
      const ok = m.t === 'bdroll' ? BD.roll(g, sid, Array.isArray(m.keep) ? m.keep : []) : m.t === 'bdstop' ? BD.stop(g, sid) : m.t === 'bdshoot' ? BD.shoot(g, sid, m.sid) : BD.heal(g, sid, m.sid);
      if (ok) broadcast();
      break;
    }
    case 'ctpick': case 'ctpeek': case 'ctvote': {
      if (H.phase !== 'ct') break;
      const ok = m.t === 'ctpick' ? CZ.pickFollower(g, sid, m.sid) : m.t === 'ctpeek' ? CZ.peek(g, sid, m.sid) : CZ.vote(g, sid, m.sid);
      if (ok) broadcast();
      break;
    }
    case 'tflip': case 'tslap': {
      if (H.phase !== 'tc') break;
      // a slap that was sent for an older card must not count as a false slap on the next one
      if (m.t === 'tslap' && m.n !== (g.top?.n ?? 0)) break;
      const ok = m.t === 'tflip' ? TC.flip(g, sid, now()) : TC.slap(g, sid, m.ms, m.g);
      if (ok) broadcast();
      break;
    }
    case 'sadawn': case 'sadraw': case 'saplay': case 'saend': case 'sarev': case 'sakill': case 'sasave': case 'saconf': {
      if (H.phase !== 'sa') break;
      const ok = m.t === 'sadawn' ? SA.dawnPick(g, sid, m.to) : m.t === 'sadraw' ? SA.draw(g, sid) : m.t === 'saplay' ? SA.play(g, sid, m.i, m.a, m.b)
        : m.t === 'saend' ? SA.endTurn(g, sid) : m.t === 'sarev' ? SA.revealPick(g, sid, m.i) : m.t === 'sakill' ? SA.nightKill(g, sid, m.to)
        : m.t === 'sasave' ? SA.nightSave(g, sid, m.to) : SA.confess(g, sid, m.i ?? null);
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
        const it = JO.review(g).find(x => x.id === m.cid);   // (m.id is the message id used for acks)
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
      if (H.phase === 'play' && g.spies.includes(sid) && Number.isInteger(m.loc) && SF.locs(H.wl)[m.loc]) endSpy({ by: sid, loc: m.loc });
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
    hdrop(p.pid);
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
    H.g = CN.newGame(g.sids, g, H.recentCN || [], H.wl);
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
  abnext() {
    const g = H.g;
    if (H.phase !== 'ab' || !g.res || g.over) return;
    AB.nextRound(g);
    broadcast();
  },
  shstart() { if (H.phase === 'sh' && SH.start(H.g)) broadcast(); },
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
  wl(d) { if (H.phase === 'lobby' && (d.l === 'th' || d.l === 'en')) { H.settings.wl = d.l; broadcast(); } },
  set(d) {
    const [g, k] = d.k.split('.'), lim = { 'onuw.night': [10, 30, 5], 'onuw.day': [120, 600, 60], 'spyfall.min': [4, 12, 1], 'spyfall.spies': [1, 2, 1], 'uc.uc': [1, 3, 1], 'uc.white': [0, 1, 1], 'ins.min': [3, 8, 1], 'jo.rounds': [5, 13, 1], 'ct.sec': [6, 14, 2], 'od.sec': [2, 5, 1] }[d.k];
    if (g === 'uc' && H.settings.uc.auto) Object.assign(H.settings.uc, ucCounts(), { auto: false });
    const v = H.settings[g][k] + lim[2] * +d.d;
    if (v < lim[0] || v > lim[1]) return;
    H.settings[g][k] = v;
    broadcast();
  },
  start() {
    const sids = H.players.map(p => p.sid), n = sids.length, G = GAMES[H.game];
    if (n < G.min || n > G.max) return toast(`${G.s} ต้องมีผู้เล่น ${G.min}–${G.max} คน`);
    H.wl = H.settings.wl || 'th';   // word-list language is fixed for the whole round
    if (H.game === 'onuw') {
      const deck = deckNow(), e = WW.validate(deck, n);
      if (e.length) return toast(e[0]);
      H.g = WW.newGame(sids, deck);
      H.phase = 'deal';
      H.endsAt = null;
    } else if (H.game === 'ins') {
      H.inm = (H.inm ?? rint(n)) + 1;
      const master = sids[H.inm % n];
      H.g = IN.deal(sids, master, H.recentIN || [], H.wl);
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
    } else if (H.game === 'ab') {
      H.g = AB.newGame(sids); H.phase = 'ab'; H.endsAt = null;
    } else if (H.game === 'sh') {
      H.g = SH.newGame(sids); H.phase = 'sh'; H.endsAt = null;
    } else if (H.game === 'cu') {
      H.g = CU.newGame(sids); H.phase = 'cu'; H.endsAt = null;
    } else if (H.game === 'it') {
      H.g = IT.newGame(sids, H.recentIT || []); H.recentIT = H.g.recent; H.phase = 'it'; H.endsAt = null;
    } else if (H.game === 'cp') {
      H.g = CP.newGame(shuffle(sids)); H.phase = 'cp'; H.endsAt = null;
    } else if (H.game === 'hn') {
      H.g = HN.newGame(shuffle(sids)); H.phase = 'hn'; H.endsAt = null;
    } else if (H.game === 'tb') {
      H.g = TB.newGame(sids, rint(2)); H.phase = 'tb'; H.endsAt = null;
    } else if (H.game === 'lf') {
      H.g = LF.newGame(sids); H.phase = 'lf'; H.endsAt = null;
    } else if (H.game === 'rr') {
      H.g = RR.newGame(sids); H.phase = 'rr'; H.endsAt = null;
    } else if (H.game === 'od') {
      H.g = OD.newGame(sids); H.phase = 'od'; odClock();
    } else if (H.game === 'bd') {
      H.g = BD.newGame(sids); H.phase = 'bd'; H.endsAt = null;
    } else if (H.game === 'ct') {
      H.g = CZ.newGame(sids); H.phase = 'ct'; H.endsAt = null;
    } else if (H.game === 'tc') {
      H.g = TC.newGame(sids); H.phase = 'tc'; H.endsAt = null;
    } else if (H.game === 'sa') {
      H.g = SA.newGame(sids); H.phase = 'sa'; H.endsAt = null;
    } else if (H.game === 'sk') {
      H.g = SK.newGame(sids);
      H.phase = 'sk';
      H.endsAt = null;
    } else if (H.game === 'jo') {
      H.g = JO.newGame(sids, H.settings.jo.rounds, H.recentJO || [], H.wl);
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
      H.g = UC.deal(sids, c.uc, c.white, H.recentUC || [], H.wl);
      H.recentUC = [H.g.pair, ...(H.recentUC || [])].slice(0, UC.RECENT);
      H.phase = 'uword';
      H.endsAt = null;
    } else {
      const d = SF.deal(sids, H.settings.spyfall.spies, H.recent, H.wl);
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
  lfnext() { if (H.phase === 'lf' && LF.next(H.g)) { lfClock(); broadcast(); } },
  rrnext() { if (H.phase === 'rr' && RR.nextRound(H.g)) broadcast(); },
  rrgo() { const g = H.g; if (H.phase === 'rr' && g.phase === 'challenge') { for (const s of RR.players(g)) if (!g.cdone[s]) RR.ready(g, s); rrClock(); broadcast(); } },
  itnext() { if (H.phase === 'it' && IT.nextLevel(H.g)) { H.recentIT = H.g.recent; broadcast(); } },
  ittheme() { if (H.phase === 'it' && IT.newTheme(H.g)) { H.recentIT = H.g.recent; broadcast(); } },
  cppass() { if (H.phase === 'cp' && CP.forceStep(H.g)) broadcast(); },
  odnext() { if (H.phase === 'od' && OD.nextLevel(H.g)) { odClock(); broadcast(); } },
  ctstart() { if (H.phase === 'ct' && CZ.start(H.g)) { ctClock(); broadcast(); } },
  cttovote() { if (H.phase === 'ct' && CZ.toVote(H.g)) broadcast(); },
  ctfinish() { if (H.phase === 'ct' && CZ.finish(H.g)) broadcast(); },
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

// Player → host actions are resent until the host acknowledges them, so a tap is not lost while either side reconnects.
const bootId = uid(6);
let seq = 0, outbox = null, retryTimer = 0;
function flush() {
  if (!outbox || !S.conn) return;
  if (outbox.tries >= 10) { outbox = null; S.sending = false; render(); return toast('ส่งไม่ถึงเจ้าของห้อง ลองกดอีกครั้ง'); }
  if (++outbox.tries === 2) { S.sending = true; render(); }
  S.conn.send('in', outbox.m);
  clearTimeout(retryTimer);
  retryTimer = setTimeout(flush, 1500);
}
function acked(id) {
  if (!outbox || outbox.m.id !== id) return;
  outbox = null;
  clearTimeout(retryTimer);
  if (S.sending) { S.sending = false; render(); }
}
function send(m) {
  m.pid = S.pid;
  if (S.isHost) return hostIn(m);
  m.id = `${bootId}.${++seq}`;
  outbox = { m, tries: 0 };
  flush();
}

function saveSess() {
  const s = { room: S.room, pid: S.pid, name: S.name, host: S.isHost, bi: S.conn?.bi ?? 0 };
  SS.set('bg_sess', s);
  LS.set('bg_last', { ...s, t: now() });
}

// Short blips are normal on phones: only show the "reconnecting" bar when we have been offline for a few seconds.
function setOnline(on) {
  const shown = !S.online && now() - S.offSince >= 3000;
  S.online = on;
  if (on) { if (shown) render(); return; }
  S.offSince = now();
  setTimeout(() => { if (!S.online) render(); }, 3100);
}

function hello() { S.conn?.send('in', { t: 'join', pid: S.pid, name: S.name }); }

function startClient() {
  S.online = true; S.offSince = 0;
  const c = S.conn;
  c.sub('pub', (v, raw) => { S.hostSeen = now(); S.pubH = hash(raw); return !v || v.closed ? leave('เจ้าของห้องปิดห้องแล้ว') : applyPub(v); });
  c.sub('p/' + S.pid, (v, raw) => {
    if (!v) return;
    S.privH = hash(raw);
    if (v.kicked) return leave('คุณถูกเชิญออกจากห้อง');
    if (v.error) { S.joinErr = v.error; S.priv = null; return render(); }
    S.joinErr = '';
    S.priv = v;
    S.hostSeen = now();
    acked(v.ack);
    render();
  });
  c.sub('hb', hb => {
    S.hostSeen = now();
    if (S.hostDown) { S.hostDown = false; render(); }
    // Our copy differs from what the host last sent -> an update got lost on the way: ask for it again.
    const mine = me(), stale = (!S.priv && !S.joinErr) || (hb?.v && hb.v !== S.pubH) || (mine && hb?.p?.[mine] && hb.p[mine] !== S.privH);
    if (stale) { S.resyncs = (S.resyncs || 0) + 1; S.priv ? c.send('in', { t: 'sync', pid: S.pid }) : hello(); }
  });
  c.onStatus = on => { setOnline(on); if (on) { hello(); flush(); } };
  S.hostSeen = now(); S.hostDown = false;
  hello();
  pingTimer = setInterval(() => {
    c.send('in', { t: 'ping', pid: S.pid });
    const down = S.online && now() - S.hostSeen > 13000;
    if (down !== S.hostDown) { S.hostDown = down; render(); }
  }, 4000);
  saveSess();
}

function startHost() {
  S.online = true; S.offSince = 0;   // a fresh connection is up
  H.settings.uc ||= { auto: true, uc: 1, white: 0 };
  H.settings.av ||= AV.defaults();
  H.settings.ins ||= { min: 5 };
  H.settings.ct ||= { sec: 8 };
  H.settings.od ||= { sec: 3 };
  H.settings.wl ||= 'th';
  H.settings.jo ||= { rounds: 13 };
  S.conn.sub('in', hostIn);
  S.conn.onStatus = on => {
    setOnline(on);
    if (on) { for (const k in sentPriv) delete sentPriv[k]; broadcast(true); }
  };
  hostTimer = setInterval(hostTick, 1000);
  saveSess();
  broadcast();
}

function nameOk() {
  S.name = cleanName(S.name);
  if (!S.name) { S.setup = true; render(); return false; }
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
    // Coming back to a room we were in (bi = the broker it lives on): a slow network must not look like "room closed",
    // so look again, waiting longer each time, before giving up.
    let r = null;
    for (let k = 0; k < (bi != null ? 3 : 1) && !r; k++) r = await Net.join(code, bi, 2500 + k * 2500);
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
    c.onStatus = null;
    setTimeout(() => c.end(), 400);
  }
  clearInterval(hostTimer); clearInterval(pingTimer);
  outbox = null; clearTimeout(retryTimer); S.sending = false; S.hostDown = false; S.online = true;
  SS.del('bg_sess'); LS.del('bg_last');
  H = null; lastPub = ''; sentPub = ''; outQ.clear(); clearTimeout(outTimer); outTimer = 0; for (const k in want) delete want[k];
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

// First visit: pick a name and a colour before anything else.
// Home background: every game's badge drifting up slowly and faintly (all motion is CSS; this only spreads them out).
const floaters = () => `<div class="floaters" aria-hidden="true">${Object.keys(GAMES).map((k, i, a) => {
  const t = 22 + ((i * 7) % 15);   // 22–36 s per trip
  return `<span class="fl" style="--x:${(i * 61 + 7) % 96}%;--t:${t}s;--d:${-((i * t) / a.length).toFixed(1)}s;--s:${44 + ((i * 13) % 40)}px;--r:${((i % 5) - 2) * 9}deg;--w:${10 + (i % 4) * 8}px">${gbadge(k)}</span>`;
}).join('')}</div>`;
function setupView() {
  return `${floaters()}<main class="wrap home setup">
    <div class="hcol hl"><header class="brand"><img class="logo" src="icons/icon-192.png" alt="" width="96" height="96"><h1>ยินดีต้อนรับ!</h1><p>ตั้งชื่อและเลือกสีที่ชอบก่อนเริ่มเล่น · เปลี่ยนทีหลังได้ที่ ⚙ ตั้งค่า</p></header></div>
    <div class="hcol hr">
    ${S.err ? `<div class="alert">${esc(S.err)}</div>` : ''}
    <section class="panel"><label for="name">ชื่อของคุณ</label>
      <input id="name" maxlength="16" autocomplete="nickname" placeholder="เช่น ต้น" value="${esc(S.name)}"></section>
    <section class="panel"><h2>ภาษา · Language</h2>${langPicker()}</section>
    <section class="panel"><h2>สีธีม</h2>${themePicker()}</section>
    ${btn('setupdone', 'เริ่มเลย →', 'primary wide big')}</div>
  </main>`;
}
// Invite: room code, QR and share link in one dialog (opened from the header).
function qrView() {
  const link = location.origin + location.pathname + '?r=' + S.pub.room;
  return `<div class="modal mid" data-act="qr"><div class="dialog" data-act="noop">
    <h2>ชวนเพื่อนเข้าห้อง</h2><p>กรอกรหัส หรือสแกน QR</p>
    <div class="roomcode">${S.pub.room}</div>
    <div class="qr" id="qr" data-link="${esc(link)}"></div>
    ${btn('share', '🔗 แชร์ลิงก์', 'primary wide')}${btn('qr', 'ปิด', 'ghost wide')}
  </div></div>`;
}
function settingsView() {
  const inRoom = !!S.conn;
  return `<div class="modal" data-act="settings"><div class="sheet" data-act="noop"><div class="sh"><h2>${gi('gear', 'inl')} ตั้งค่า</h2><button class="ib" data-act="settings">✕</button></div>
    <label for="sname">ชื่อของคุณ</label>
    <div class="row"><input id="sname" maxlength="16" autocomplete="nickname" value="${esc(S.sname ?? S.name)}">${btn('savename', 'บันทึก', 'primary', {}, !cleanName(S.sname ?? S.name) || cleanName(S.sname ?? S.name) === S.name)}</div>
    ${inRoom ? '<p class="muted small">คนอื่นในห้องจะเห็นชื่อใหม่ทันที</p>' : ''}
    <h3>ภาษา · Language</h3>${langPicker()}
    <h3>สีธีม</h3>${themePicker()}
    <p class="muted small">สีธีมเปลี่ยนเฉพาะเครื่องนี้ คนอื่นในห้องเลือกสีของตัวเองได้</p>
  </div></div>`;
}

// "All games": a fan of cards that swings around a pivot below the screen (swipe, arrows or tap a side card).
const fanKeys = () => Object.keys(GAMES).filter(k => (S.hcat || 'all') === 'all' || GAMES[k].c.includes(S.hcat));
const fanOff = (i, cur, n) => { let d = i - cur; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; };
function fanView() {
  const ks = fanKeys(), n = ks.length, cur = ((S.fan || 0) % n + n) % n, k = ks[cur], G = GAMES[k];
  return `<div class="fancats tabs">${Object.entries(CATS).map(([c, l]) => `<button class="${(S.hcat || 'all') === c ? 'on' : ''}" data-act="hcat" data-c="${c}">${l}</button>`).join('')}</div>
    <div class="fan" data-n="${n}">${ks.map((g, i) => { const d = fanOff(i, cur, n), a = Math.abs(d), F = GAMES[g];
      return `<button class="fcard ${a ? '' : 'cur'}" style="--gh:${GHUE[g]};--d:${d};--a:${a};z-index:${20 - a}" data-act="fan" data-i="${i}" ${a > 3 ? 'tabindex="-1" aria-hidden="true"' : ''}>
        <span class="fk">${CATS[F.c[0]]}</span><b class="ft">${F.s}</b><span class="fp">${gi('people', 'inl')}${playersTxt(F)}</span>${gbadge(g)}</button>`; }).join('')}
      <button class="fnav l" data-act="fanmv" data-d="-1" aria-label="ก่อนหน้า">‹</button><button class="fnav r" data-act="fanmv" data-d="1" aria-label="ถัดไป">›</button></div>
    <div class="fancta"><span><b>${G.n}</b><small>${playersTxt(G)} · ~${G.t} นาที · ${cur + 1}/${n}</small></span>${btn('playg', '▶ เล่น', 'primary', { game: k }, !!S.busy)}</div>`;
}
// Move the fan in place so the cards animate (a full re-render would just jump).
function fanMove(to) {
  const fan = document.querySelector('.fan'), n = fanKeys().length;
  S.fan = ((to % n) + n) % n;
  if (!fan) return render();
  fan.querySelectorAll('.fcard').forEach((c, i) => { const d = fanOff(i, S.fan, n), a = Math.abs(d); c.style.setProperty('--d', d); c.style.setProperty('--a', a); c.style.zIndex = 20 - a; c.classList.toggle('cur', !a); });
  const cta = document.querySelector('.fancta'), tmp = document.createElement('div');
  tmp.innerHTML = fanView(); cta.replaceWith(tmp.querySelector('.fancta'));
  if (lang === 'en') translate(document.querySelector('.fancta'));
  lastHtml = null;
}
// swipe on the fan
let fanX = null;
addEventListener('pointerdown', e => { fanX = e.target.closest?.('.fan') ? e.clientX : null; }, true);
addEventListener('pointerup', e => {
  if (fanX == null) return;
  const dx = e.clientX - fanX; fanX = null;
  if (Math.abs(dx) > 40) { S.fanSwiped = now(); fanMove((S.fan || 0) + (dx < 0 ? 1 : -1)); }
}, true);

function home() {
  if (S.setup) return setupView();
  const last = LS.get('bg_last', null);
  const lastOk = last && now() - last.t < 12 * 3600e3;
  const keys = Object.keys(GAMES), day = Math.floor(Date.now() / 864e5);
  const fk = keys[(day + (S.feat || 0)) % keys.length], F = GAMES[fk];
  const rec = [1, 2, 3].map(k => keys[(day + (S.feat || 0) + k * 5) % keys.length]);
  const hr = new Date().getHours(), greet = hr < 12 ? 'สวัสดีตอนเช้า' : hr < 17 ? 'สวัสดีตอนบ่าย' : hr < 20 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนค่ำ';
  return `${floaters()}<main class="wrap home home2">
    <div class="hcol hl">
      <div class="htop"><h1 class="greet">${greet}, <b>${esc(S.name || '')}</b></h1>
        <button class="ib me" data-act="settings" aria-label="ตั้งค่า"><span class="av" style="--ph:${THEMES[curTheme()][1]}">${esc([...(S.name || '?')][0])}</span></button></div>
      ${S.err ? `<div class="alert">${esc(S.err)}</div>` : ''}
      <div class="joinbar">${gi('key', 'inl')}<input id="code" class="code-in" maxlength="4" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="รหัสห้อง เช่น ABCD" value="${esc(S.codeIn)}">
        ${btn('join', S.busy === 'join' ? 'กำลังหา…' : 'เข้าห้อง', 'primary', {}, !!S.busy)}</div>
      ${btn('create', S.busy === 'create' ? 'กำลังสร้างห้อง…' : '➕ สร้างห้องแบบไม่เลือกเกม', 'ghost wide newroom', {}, !!S.busy)}
      <section class="hero" style="--gh:${GHUE[fk]}">
        <div class="hchips"><span class="chip yel">🔥 แนะนำวันนี้</span>${F.c.map(c => `<span class="chip">${CATS[c]}</span>`).join('')}</div>
        <h2>${F.n}</h2><p>${F.d}</p>
        <div class="hmeta"><span class="chip">${gi('people', 'inl')}${playersTxt(F)}</span><span class="chip">${gi('hourglass', 'inl')}~${F.t} นาที</span></div>
        <div class="row hbtns">${btn('playg', '▶ เล่นเกมนี้', 'primary', { game: fk }, !!S.busy)}<button class="ib" data-act="feat" aria-label="เกมอื่น">›</button></div>
        <span class="hart">${gbadge(fk)}</span>
      </section>
      <div class="sechead"><h2>เกมทั้งหมด <span class="muted small">${keys.length} เกม</span></h2></div>
      ${fanView()}
    </div>
    <div class="hcol hr">
      <div class="sechead"><h2>ลองเล่นดูไหม</h2></div>
      <div class="reclist">${rec.map(k => `<button class="rec" data-act="playg" data-game="${k}">${gbadge(k, 'xs')}<span class="rect"><b>${GAMES[k].s}</b><small>${playersTxt(GAMES[k])} · ~${GAMES[k].t} นาที</small></span><i>›</i></button>`).join('')}</div>
      ${installHint()}
    </div>
  </main>
  ${S.settings ? settingsView() : ''}
  ${lastOk && !S.busy && !S.noResume ? `<div class="modal mid" data-act="noresume"><div class="dialog" data-act="noop">
    <div class="dicon">${gi('key')}</div><h2>กลับเข้าห้องเดิมไหม?</h2>
    <p>คุณยังอยู่ในห้อง <b class="droom">${esc(last.room)}</b>${last.host ? ' ในฐานะเจ้าของห้อง' : ''}</p>
    ${btn('resume', '↩︎ กลับเข้าห้อง', 'primary wide big')}${btn('noresume', 'ไม่ใช่ตอนนี้', 'ghost wide')}
  </div></div>` : ''}`;
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
      <div class="tl"><span class="tg">${gbadge(p.game, 'xxs')}${G.s}</span><span class="tc">ห้อง <b>${p.room}</b></span></div>
      <div class="tr">${S.isHost && p.phase !== 'lobby' ? '<button class="ib" data-act="abort" aria-label="หยุดเกม" title="หยุดเกม กลับล็อบบี้">⏹</button>' : ''}<button class="ib" data-act="qr" aria-label="ชวนเพื่อน QR">${gi('qrcode')}</button><button class="ib" data-act="settings" aria-label="ตั้งค่า">${gi('gear')}</button>${p.phase !== 'lobby' ? '<button class="ib" data-act="rules" aria-label="กติกา">?</button>' : ''}<button class="ib out" data-act="leave">ออก</button></div>
    </div></div>
    ${!S.online && now() - S.offSince >= 3000 ? '<div class="offline">⚠︎ การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…</div>' : S.hostDown && !S.isHost ? '<div class="offline host">⏸ เจ้าของห้องหลุดการเชื่อมต่อ — เกมหยุดรอสักครู่</div>' : S.sending ? '<div class="offline send">กำลังส่ง…</div>' : ''}
    <main class="wrap phase-${p.phase} game-${p.game} ${S.enter ? 'enter' : ''}">${body}</main>
    ${S.rules ? rulesView() : ''}
    ${S.settings ? settingsView() : ''}
    ${S.qr ? qrView() : ''}
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
    sk: skV, skend: skEndV, sh: shV, cu: cuV, tc: tcV, ct: ctV, bd: bdV, od: odV, rr: rrV, lf: lfV, tb: tbV, hn: hnV, cp: cpV, it: itV, sa: saV, ab: abV, mind: miV, mlvl: miLvlV, mend: miEndV, cteam: cnTeamV, cn: cnV, cnend: cnV, scout: scV, scend: scEndV,
    jclue: joClueV, jcheck: joCheckV, jguess: joGuessV, jres: joResV, jend: joEndV,
    aroles: avRolesV, ateam: avTeamV, avote: avVoteV, avres: avResV, aquest: avQuestV, aqres: avQResV, aassn: avAssnV, aend: avEndV,
    uword: ucWordV, udesc: ucDescV, uvote: ucVoteV, uout: ucOutV, uend: ucEndV, deal: dealV, night: nightV, day: dayV, vote: voteV, result: resultV, play: playV, reveal: revealV,
  }[p.phase];
  try { return shell(v ? v() : ''); } catch (e) {
    console.error(e);
    return shell('<div class="loading"><div class="spin"></div><p>กำลังรับข้อมูล…</p></div>');
  }
}

// Coloured initial badge — every player keeps the same colour in every game.
const hueOf = sid => Math.round((Math.max(0, pl().findIndex(x => x.sid === sid)) * 360) / Math.max(1, pl().length));
const av = (sid, cls = '') => `<span class="av ${cls}" style="--ph:${hueOf(sid)}">${esc([...(pn(sid) || '?')][0])}</span>`;
const who = sid => `<span class="who">${av(sid, 'sm')}${esc(pn(sid))}</span>`;

function players(opts = {}) {
  const p = S.pub;
  return `<ul class="players">${pl().map(x => `<li class="${x.on ? '' : 'off'}">
      ${av(x.sid)}<span class="pname">${esc(x.name)}${x.sid === me() ? ' <em>(คุณ)</em>' : ''}${x.sid === p.host ? ` ${gi('crown', 'gold')}` : ''}</span>
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
  return `<div class="minis">${WW.UI_ORDER.filter(r => c[r]).map(r => `<span class="mini t-${ROLE[r].t}">${gi(RICON[r])}<b>${ROLE[r].n}</b>${c[r] > 1 ? `<em>×${c[r]}</em>` : ''}</span>`).join('')}</div>`;
}

const playersTxt = G => `${G.min}–${G.max} คน`;
const fitBadge = (G, n) => (n < G.min ? `<span class="tag bad">ต้องการอีก ${G.min - n} คน</span>` : n > G.max ? `<span class="tag bad">เกิน ${n - G.max} คน</span>` : `<span class="tag ok">✓ เล่นได้ ${n} คน</span>`);

function pickerView() {
  const p = S.pub, n = pl().length;
  const keys = Object.keys(GAMES).filter(k => S.cat === 'all' || GAMES[k].c.includes(S.cat));
  return `<div class="modal" data-act="pick"><div class="sheet picker" data-act="noop">
    <div class="sh"><h2>เลือกเกม <span class="muted small">ตอนนี้ ${n} คน</span></h2><button class="ib" data-act="pick">✕</button></div>
    <div class="tabs">${Object.entries(CATS).map(([k, v]) => `<button class="${S.cat === k ? 'on' : ''}" data-act="cat" data-c="${k}">${v}</button>`).join('')}</div>
    <div class="gcards">${keys.map(k => { const G = GAMES[k]; return `<button class="gcard ${k === p.game ? 'on' : ''}" data-act="hgame" data-g="${k}">
      ${gbadge(k)}<b>${G.s}</b><small>${playersTxt(G)} · ~${G.t} นาที</small><span class="gd">${G.d}</span></button>`; }).join('')}</div>
  </div></div>`;
}

// games whose secret words / places come from a word list (the room picks the list's language)
const WORDY = new Set(['spyfall', 'uc', 'ins', 'jo', 'cn', 'it']);
function lobby() {
  const p = S.pub, n = pl().length, host = isHostView(), G = GAMES[p.game];
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
  } else if (p.game === 'ab') {
    if (n < AB.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${AB.MIN} คน`);
    if (n > AB.MAX) errs.push(`Abraca…what? เล่นได้สูงสุด ${AB.MAX} คน`);
    settings = `<p class="muted small">หินคาถา 36 ก้อน (เลข N มี N ก้อน) · คนละ ${AB.HAND} ก้อน ${AB.LIFE} ชีวิต · ใครถึง ${AB.WIN} แต้มก่อนชนะ</p>`;
  } else if (p.game === 'sh') {
    if (n < SH.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${SH.MIN} คน`);
    const st = SH.SETUP[Math.max(SH.MIN, Math.min(SH.MAX, n))];
    settings = `<p class="muted small">เสรีนิยม ${st[0]} · ฟาสซิสต์ ${st[1]} + ฮิตเลอร์ 1 · นโยบาย: เสรีนิยม 6 ใบ ฟาสซิสต์ 11 ใบ</p>`;
  } else if (p.game === 'cu') {
    if (n < CU.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${CU.MIN} คน`);
    if (n > CU.MAX) errs.push(`Camel Up เล่นได้สูงสุด ${CU.MAX} คน`);
    settings = '<p class="muted small">อูฐ 5 ตัว · ลู่ 16 ช่อง · เริ่มคนละ 3 เหรียญ · ใครเหรียญมากสุดตอนอูฐเข้าเส้นชัยชนะ</p>';
  } else if (p.game === 'it') {
    if (n < IT.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${IT.MIN} คน`);
    settings = `<p class="muted small">ช่วยกันทั้งทีม ${IT.LEVELS} ด่าน (ด่าน N ได้คนละ N ใบ) · ${IT.LIVES} ชีวิต · หัวข้อ ${IT.THEMES.length} แบบ</p>`;
  } else if (p.game === 'cp') {
    if (n < CP.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${CP.MIN} คน`);
    if (n > CP.MAX) errs.push(`Coup เล่นได้สูงสุด ${CP.MAX} คน`);
    settings = '<p class="muted small">การ์ด 15 ใบ (5 ตัวละคร × 3) · คนละ 2 ใบ 2 เหรียญ · มีครบ 10 เหรียญต้องรัฐประหาร</p>';
  } else if (p.game === 'hn') {
    if (n < HN.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${HN.MIN} คน`);
    if (n > HN.MAX) errs.push(`Hanabi เล่นได้สูงสุด ${HN.MAX} คน`);
    settings = `<p class="muted small">ไพ่ 50 ใบ 5 สี · ถือคนละ ${HN.handSize(Math.max(2, n))} ใบ · คำใบ้ ${HN.CLUES} · พลาดได้ ${HN.FUSES - 1} ครั้ง · คะแนนเต็ม 25</p>`;
  } else if (p.game === 'tb') {
    if (n !== 2) errs.push('Toy Battle เล่นได้ 2 คนเท่านั้น');
    settings = `<p class="muted small">ทหารของเล่นคนละ 20 ตัว (8 แบบ) · ล้อมเขตเก็บเหรียญให้ครบ ${TB.OBJECTIVE} หรือยึด H.Q. ศัตรู ชนะทันที</p>`;
  } else if (p.game === 'lf') {
    if (n < LF.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${LF.MIN} คน`);
    if (n > LF.MAX) errs.push(`Stuck in the Lift เล่นได้สูงสุด ${LF.MAX} คน`);
    settings = '<p class="muted small">ตึก 9 ชั้น (E–40) · กรวยลงทีละชั้นทุกรอบ ถึงชั้น E เล่นอีกรอบสุดท้าย · ชั้น E และ 40 แต้มคูณ 2</p>';
  } else if (p.game === 'rr') {
    if (n < RR.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${RR.MIN} คน`);
    if (n > RR.MAX) errs.push(`Russian Roulette เล่นได้สูงสุด ${RR.MAX} คน`);
    settings = `<p class="muted small">ทีมละ 4 ชีวิต (ลูกทีม 3 + กัปตัน) · ปืน 7 ใบ: แชะ 6 + ปัง 1 · ถึง ${RR.WIN} แต้มก่อน หรือเหลือรอดทีมสุดท้าย ชนะ</p>`;
  } else if (p.game === 'od') {
    if (n < OD.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${OD.MIN} คน`);
    if (n > OD.MAX) errs.push(`Order Overload เล่นได้สูงสุด ${OD.MAX} คน`);
    const sec = p.set.od?.sec || 3;
    settings = (host ? stepper('od.sec', 'เวลาโชว์ออร์เดอร์ละ', sec, ' วิ') : `<p class="muted small">โชว์ออร์เดอร์ละ ${sec} วินาที</p>`)
      + `<p class="muted small">ช่วยกันทั้งทีม ${OD.LEVELS} ด่าน · ด่าน N แจกคนละ N ใบ · ผ่านด่านเมื่อมี ${OD.need(Math.max(2, Math.min(6, n)))} คนมือหมด</p>`;
  } else if (p.game === 'bd') {
    if (n < BD.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${BD.MIN} คน`);
    if (n > BD.MAX) errs.push(`Bang! Dice เล่นได้สูงสุด ${BD.MAX} คน`);
    const mix = BD.SETUP[n];
    settings = `<p class="muted small">${mix ? `นายอำเภอ 1 · ผู้ช่วย ${mix.split('D').length - 1} · โจร ${mix.split('O').length - 1} · คนทรยศ ${mix.split('R').length - 1} · ` : ''}ทุกคน 8 ชีวิต นายอำเภอ 10 · ยังไม่มีการ์ดตัวละคร</p>`;
  } else if (p.game === 'ct') {
    if (n < CZ.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${CZ.MIN} คน`);
    if (n > CZ.MAX) errs.push(`Cheese Thief เล่นได้สูงสุด ${CZ.MAX} คน`);
    const sec = p.set.ct?.sec || 8;
    settings = (host ? stepper('ct.sec', 'เวลาต่อ 1 ชั่วโมงกลางคืน', sec, ' วิ') : `<p class="muted small">กลางคืนชั่วโมงละ ${sec} วินาที</p>`)
      + `<p class="muted small">โจร 1 คน${n >= 6 ? ' + ลูกสมุน 1 คน (โจรเลือกเอง)' : ' · 6 คนขึ้นไปจะมีลูกสมุน'} · ที่เหลือเป็นหนูขี้เซา</p>`;
  } else if (p.game === 'tc') {
    if (n < TC.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${TC.MIN} คน`);
    if (n > TC.MAX) errs.push(`Taco Cat เล่นได้สูงสุด ${TC.MAX} คน`);
    settings = '<p class="muted small">ไพ่ 64 ใบแจกเท่ากัน · ใครไพ่หมดแล้วตบได้เป็นคนแรก ชนะ · เกมนี้วัดความไว ควรใช้เน็ตที่นิ่ง</p>';
  } else if (p.game === 'sa') {
    if (n < SA.MIN) errs.push(`ต้องมีผู้เล่นอย่างน้อย ${SA.MIN} คน`);
    settings = `<p class="muted small">การ์ดตัวตนคนละ ${n >= 10 ? 3 : n >= 8 ? 4 : 5} ใบ · การ์ดแม่มด ${n <= 5 ? 1 : 2} ใบ · นายอำเภอ 1 ใบ</p>`;
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
      : `<p class="muted small">รอบละ ${p.set.spyfall.min} นาที · สปาย ${spies} คน · ${SF.locs(S.pub.wl).length} สถานที่</p>`;
  }
  return `
    <section class="panel gamesel">
      <div class="ghero">${gbadge(p.game)}<div><b>${G.n}</b><small>${playersTxt(G)} · ~${G.t} นาที</small>${fitBadge(G, n)}</div></div>
      <div class="row">${btn('rules', '📖 วิธีเล่น', 'ghost')}${host ? btn('pick', '🎲 เปลี่ยนเกม', 'ghost') : ''}</div>
      ${WORDY.has(p.game) ? `<div class="gset"><h3>ภาษาของคำในเกม</h3>${host ? `<div class="seg notr">${[['th', 'ไทย'], ['en', 'English']].map(([k, nm]) => `<button class="${(p.set.wl || 'th') === k ? 'on' : ''}" data-act="wl" data-l="${k}">${nm}</button>`).join('')}</div>` : `<p class="muted small">${p.set.wl === 'en' ? 'English' : 'ไทย'}</p>`}</div>` : ''}
      ${settings ? `<div class="gset"><h3>ตั้งค่าเกม</h3>${settings}</div>` : ''}
    </section>
    <section class="panel"><h2>ผู้เล่น <span class="muted">${n}/${G.max}</span></h2>${players({ kick: host })}</section>
    ${host
      ? `${errs.length ? `<p class="alert">${esc(errs[0])}</p>` : ''}${btn('start', `▶︎ เริ่มเกม ${G.s}`, 'primary wide big', {}, errs.length > 0)}
         <p class="muted small center">เจ้าของห้องควรเปิดจอค้างไว้ตลอดเกม (เครื่องนี้เป็นตัวคุมเวลา)</p>`
      : '<p class="muted center">รอเจ้าของห้องเริ่มเกม…</p>'}`;
}

function secret(inner, label) {
  return S.reveal
    ? `<button class="secret open ${S.flip ? 'flipin' : ''}" data-act="hide">${inner}<span class="hint">แตะเพื่อซ่อน</span></button>`
    : `<button class="secret closed" data-act="show"><span class="back">${gi(GICON[S.pub.game])}</span><span class="hint">${label}</span><span class="muted small">อย่าให้คนอื่นเห็นจอ</span></button>`;
}

const roleCard = r => `<span class="role t-${ROLE[r].t}">${art(RICON[r])}<span class="rn">${ROLE[r].n}</span>
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
  const cbtn = i => { const k = 'c:' + i; return `<button class="pick cc ${S.sel.includes(k) ? 'on' : ''}" data-act="sel" data-v="${k}"><i class="cb"></i><small>กลาง ${i + 1}</small></button>`; };
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
    <div class="picks c3">${[0, 1, 2].map(i => `<button class="pick cc ${S.decoy === i ? 'on' : ''}" data-act="decoy" data-i="${i}"><i class="cb"></i><small>การ์ด ${i + 1}</small></button>`).join('')}</div>
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
        <td><span class="swap">${r.init !== r.fin ? `<span class="mini sm t-${ROLE[r.init].t} was">${gi(RICON[r.init])}</span>→` : ''}<span class="mini sm t-${ROLE[r.fin].t}">${gi(RICON[r.fin])}<b>${ROLE[r.fin].n}</b></span></span></td><td class="c"><span class="vcount">${r.votes}</span></td></tr>`).join('')}
      </tbody></table>
      <p class="muted small">กลาง: ${R.center.map((c, i) => `${i + 1}) ${c.init !== c.fin ? `${ROLE[c.init].e}→` : ''}${RL(c.fin)}`).join(' · ')}</p>
    </section>
    <section class="panel"><h2>เกิดอะไรขึ้นตอนกลางคืน</h2>${R.log.length ? `<ol class="log">${R.log.map(l => `<li>${esc(l)}</li>`).join('')}</ol>` : '<p class="muted">ไม่มีใครทำอะไร</p>'}</section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

function locGrid(clickable) {
  return `<div class="locs ${S.guess ? 'guessing' : ''}">${SF.locs(S.pub.wl).map((l, i) => `<button class="loc ${S.crossed.has(i) ? 'x' : ''}" data-act="${clickable}" data-i="${i}"><span>${l.e}</span><b>${esc(l.n)}</b></button>`).join('')}</div>`;
}

function playV() {
  const p = S.pub, v = S.priv, host = isHostView();
  const card = v.spy
    ? `<span class="spy">${art('spy', 'red')}<span class="rn">คุณคือสปาย</span><span class="rd">ฟังคำถามคำตอบ แล้วเดาให้ได้ว่าทุกคนอยู่ที่ไหน · อย่าให้ใครจับได้${p.nspies > 1 ? ' · รอบนี้มีสปาย 2 คน (ไม่รู้ว่าอีกคนคือใคร)' : ''}</span></span>`
    : `<span class="spyloc"><span class="remo">${SF.locs(S.pub.wl)[v.loc].e}</span><span class="rn">${esc(SF.locs(S.pub.wl)[v.loc].n)}</span><span class="team">บทบาท: ${esc(v.role)}</span><span class="rd">ตอบคำถามให้คนอื่นรู้ว่าคุณรู้สถานที่ แต่อย่าชัดจนสปายเดาได้</span></span>`;
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
  const R = S.pub.result, L = SF.locs(S.pub.wl)[R.loc], host = isHostView();
  let verdict = 'หมดเวลา/เฉลยแล้ว — ถ้าโหวตจับสปายได้ ฝ่ายชาวบ้านชนะ ถ้าจับผิดคน สปายชนะ';
  if (R.guess) verdict = R.guess.ok
    ? `🕵️ ${esc(pn(R.guess.by))} เดาว่า “${esc(SF.locs(S.pub.wl)[R.guess.loc].n)}” — ถูกต้อง! สปายชนะ`
    : `🕵️ ${esc(pn(R.guess.by))} เดาว่า “${esc(SF.locs(S.pub.wl)[R.guess.loc].n)}” — ผิด! ฝ่ายชาวบ้านชนะ`;
  return `<div class="banner ${R.guess ? (R.guess.ok ? 'lose' : 'win') : ''}"><div class="remo">${L.e}</div><div class="bt">${esc(L.n)}</div>
      <div>สปาย: <b>${R.spies.map(s => esc(pn(s))).join(', ')}</b></div></div>
    <p class="center">${verdict}</p>
    <section class="panel"><h2>บทบาทของทุกคน</h2><ul class="players">${pl().map(x => `<li><span class="pname">${esc(x.name)}</span><span class="${R.spies.includes(x.sid) ? 'tag bad' : 'muted'}">${R.spies.includes(x.sid) ? '🕵️ สปาย' : esc(R.roles[x.sid] || '')}</span></li>`).join('')}</ul></section>
    ${host ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 รอบใหม่', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

/* The Mind */
function miHead() {
  const m = S.pub.mi;
  return `<section class="panel board"><div class="jstat"><span>ด่าน <b>${m.level}/${m.max}</b></span><span class="hps">${gi('heart', 'hp').repeat(Math.max(0, m.lives)) || '💔'}</span><span>${gi('star', 'gold').repeat(m.stars) || '<span class="muted">ไม่มีดาว</span>'}</span></div></section>`;
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
  const col = t => `<div class="cteam t-${t}"><h2>${CT[t]}</h2><ul>${pl().filter(x => c.team[x.sid] === t).map(x => `<li>${av(x.sid, 'sm')}<span>${esc(x.name)}${x.sid === me() ? ' <em>(คุณ)</em>' : ''}</span>${c.master[t] === x.sid ? '<span class="cm">🕶️</span>' : ''}</li>`).join('') || '<li class="muted">— ว่าง —</li>'}</ul></div>`;
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
    return `<button class="ccell ${cls}" ${canGuess && !r ? `data-act="cguess" data-i="${i}"` : 'disabled'}>${r === 'x' || (over && k === 'x') ? gi('skull', 'inl') : ''}${esc(w)}</button>`;
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
    // a selection left over from an earlier turn may point past the end of a hand that has since shrunk
    if (!myTurn || S.scSel.some(i => i >= hand.length)) S.scSel = [];
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

/* Abraca…what? */
const stone = (n, cls = '') => `<span class="stone ${cls}" style="--h:${AB.SPELLS[n].c}">${gi('ab' + n)}<b>${n}</b></span>`;
const mystery = (cls = '') => `<span class="stone myst ${cls}">${gi('qmark')}</span>`;
const abHearts = n => `<span class="abhp">${[0, 1, 2, 3, 4, 5].map(i => gi('heart', i < n ? 'hp' : 'hp off')).join('')}</span>`;
function abEvent(e) {
  if (!e) return '';
  const sp = AB.SPELLS[e.n], who2 = esc(pn(e.by));
  if (!e.ok) return `<div class="abev fail">${stone(e.n)}<div><b>${who2} ไม่มี "${sp.n}"!</b><span>${e.roll ? `ทอยได้ ${e.roll} — ` : ''}เสีย ${e.lost} ชีวิต</span></div></div>`;
  const parts = [];
  if (e.roll) parts.push(`ทอยได้ ${e.roll}`);
  if (e.hit.length) parts.push(`${e.hit.map(s => esc(pn(s))).join(', ')} เสีย ${e.dmg}`);
  if (e.gain) parts.push(`${who2} ได้ ${e.gain} ชีวิต`);
  if (e.n === 4) parts.push(e.owl ? 'ได้หินลับ 1 ก้อน' : 'หินลับหมดแล้ว');
  return `<div class="abev ok">${stone(e.n)}<div><b>${who2} ร่าย "${sp.n}" สำเร็จ ✨</b><span>${parts.join(' · ')}</span></div></div>`;
}
function abBoard() {
  const a = S.pub.ab;
  return `<section class="abboard"><h2>${gi('sparkle', 'gold')} กระดานคาถา <span class="muted small">กองหิน ${a.pile} · หินลับ ${a.secret}</span></h2>
    <div class="abrows">${Object.keys(AB.SPELLS).map(n => `<div class="abrow">${stone(+n, 'sm')}<span class="pips">${Array.from({ length: +n }, (_, i) => `<i class="${i < a.board[n] ? 'on' : ''}" style="--h:${AB.SPELLS[n].c}"></i>`).join('')}</span></div>`).join('')}</div>
    <p class="muted small">จุดที่สว่าง = หินเลขนั้นที่ถูกร่ายไปแล้ว</p></section>`;
}
function abMats(reveal) {
  const a = S.pub.ab, v = S.priv, mine = me();
  return `<div class="abmats">${pl().map(x => {
    const s = x.sid, hand = reveal ? reveal[s] : s === mine ? null : v.see?.[s];
    const stones = hand ? hand.map(n => stone(n)).join('') : Array.from({ length: a.n[s] }, () => mystery()).join('');
    return `<div class="abmat ${s === a.turn && !a.res ? 'turn' : ''} ${a.life[s] <= 0 ? 'out' : ''}" style="--ph:${hueOf(s)}">
      <span class="mhead"><b>${av(s, 'sm')} ${esc(x.name)}${s === mine ? ' <em>(คุณ)</em>' : ''}</b><span class="abpts">${gi('star', 'gold')} ${a.pts[s]}/${AB.WIN}</span></span>
      ${abHearts(a.life[s])}
      <span class="abstones">${stones || '<span class="muted small">ไม่มีหิน</span>'}</span>
      ${a.own[s] ? `<span class="abown">${gi('ab4')} หินลับ ×${a.own[s]}${s === mine && v.own?.length ? ` <b>(${v.own.join(', ')})</b>` : ''}</span>` : ''}
    </div>`;
  }).join('')}</div>`;
}
function abV() {
  const a = S.pub.ab, mine = me(), my = a.turn === mine && !a.res;
  if (a.res) {
    const r = a.res, why = r.why === 'empty' ? `${esc(pn(r.actor))} ร่ายหินหมดมือ!` : r.why === 'kill' ? `${r.dead.map(s => esc(pn(s))).join(', ')} ชีวิตหมด` : `${esc(pn(r.actor))} ร่ายพลาดจนชีวิตหมด`;
    const win = a.over && a.winners.includes(mine);
    return `${a.over ? `<div class="banner ${win ? 'win' : 'lose'}"><div class="bt">${win ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>🏆 ${a.winners.map(s => esc(pn(s))).join(', ')} ถึง ${AB.WIN} แต้ม</div></div>` : `<div class="banner"><div class="bt">จบรอบ ${a.round}</div><div>${why}</div></div>`}
      ${abEvent(a.last)}
      <section class="panel"><h2>แต้มรอบนี้</h2><table class="res"><tbody>${pl().map(x => `<tr class="${r.dead.includes(x.sid) ? '' : 'w'}"><td>${r.dead.includes(x.sid) ? '☠ ' : ''}${esc(x.name)}</td><td class="c">+${r.rows[x.sid]}</td><td class="c"><b>${a.pts[x.sid]}</b> / ${AB.WIN}</td></tr>`).join('')}</tbody></table></section>
      <h2 class="center">เฉลยหินของทุกคน</h2>${abMats(r.hands)}
      <p class="center small muted">หินลับที่เหลือ: ${r.secret.map(n => stone(n, 'sm')).join(' ') || '—'}</p>
      ${isHostView() ? (a.over ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : btn('abnext', `▶ รอบ ${a.round + 1}`, 'primary wide big')) : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
  }
  const spells = my ? `<section class="panel abcast"><h2>${gi('wand', 'gold')} ตาคุณ — ร่ายคาถาที่คิดว่าตัวเองมี</h2>
      ${a.casts ? `<p class="muted small">ร่ายต่อได้เฉพาะเลข ${a.min} ขึ้นไป หรือกดหยุดเพื่อเติมหิน</p>` : ''}
      <div class="spells">${Object.entries(AB.SPELLS).map(([n, sp]) => `<button class="spell" style="--h:${sp.c}" data-act="abcast" data-n="${n}" ${+n < a.min ? 'disabled' : ''}>${stone(+n)}<span><b>${sp.n}</b><small>${sp.d}</small></span></button>`).join('')}</div>
      ${btn('abstop', '✋ หยุด แล้วเติมหิน', 'ghost wide', {}, !a.casts)}</section>`
    : `<p class="center skstatus">${gi('wand', 'gold')} ตาของ <b>${esc(pn(a.turn))}</b>${a.casts ? ` · ร่ายไปแล้ว ${a.casts} (ต่อได้ตั้งแต่เลข ${a.min})` : ''}</p>`;
  return `<p class="center muted small">รอบ ${a.round} · ถึง ${AB.WIN} แต้มชนะ</p>${abEvent(a.last)}${spells}${abMats()}${abBoard()}`;
}

/* Secret Hitler */
const SHR = { L: ['เสรีนิยม', 'dove', 'village', 'ออกกฎหมายเสรีนิยมให้ครบ 5 ใบ หรือประหารฮิตเลอร์ให้ได้'], F: ['ฟาสซิสต์', 'eagle', 'wolf', 'ออกกฎหมายฟาสซิสต์ 6 ใบ หรือดันฮิตเลอร์เป็นนายกฯ หลังมีกฎหมายฟาสซิสต์ 3 ใบ'], H: ['ฮิตเลอร์', 'mordred', 'wolf', 'แฝงตัวให้เนียนเหมือนเสรีนิยม ถ้าได้เป็นนายกฯ หลังมีกฎหมายฟาสซิสต์ 3 ใบ ฝ่ายคุณชนะ'] };
const SHPW = { peek: 'ดูนโยบาย 3 ใบบนสุด', investigate: 'ตรวจฝ่ายของผู้เล่น', special: 'เลือกประธานคนถัดไป', kill: 'ประหาร', invshow: 'ผลการตรวจสอบ' };
const SHPI = { peek: 'eye', investigate: 'magnify', special: 'crown', kill: 'knife' };
const pol = (p, attr = 'disabled') => `<button class="pol p-${p}" ${attr}>${gi(p === 'L' ? 'dove' : 'eagle')}<b>${p === 'L' ? 'เสรีนิยม' : 'ฟาสซิสต์'}</b></button>`;
function shRole() {
  const v = S.priv, r = SHR[v.role];
  return `<span class="role t-${r[2]}">${art(r[1])}<span class="rn">${r[0]}</span><span class="team">${v.role === 'L' ? 'ฝ่ายเสรีนิยม' : 'ฝ่ายฟาสซิสต์'}</span><span class="rd">${r[3]}</span>
    ${v.known?.length ? `<span class="info">พวกเดียวกัน: ${v.known.map(k => `${esc(pn(k.sid))}${k.h ? ' (ฮิตเลอร์)' : ''}`).join(', ')}</span>` : v.role === 'H' ? '<span class="info">คุณไม่รู้ว่าใครเป็นฟาสซิสต์ แต่พวกเขารู้ว่าคุณคือใคร</span>' : ''}</span>`;
}
function shBoard() {
  const h = S.pub.sh, pw = SH.powers(pl().length);
  const lib = [0, 1, 2, 3, 4].map(i => `<span class="slot l ${i < h.lib ? 'on' : ''}">${i < h.lib ? gi('dove') : i === 4 ? gi('trophy') : ''}</span>`).join('');
  const fas = [0, 1, 2, 3, 4, 5].map(i => `<span class="slot f ${i < h.fas ? 'on' : ''}">${i < h.fas ? gi('eagle') : i === 5 ? gi('skull') : pw[i] ? gi(SHPI[pw[i]]) : ''}</span>`).join('');
  return `<section class="panel board shb"><div class="track">${lib}</div><div class="track">${fas}</div>
    <div class="rej">เลือกตั้งล้มเหลว ${[0, 1, 2].map(i => `<span class="rd2 ${i < h.tracker ? 'on' : ''}"></span>`).join('')} <span class="muted small">(3 = ออกใบบนสุด)</span></div>
    <div class="small muted">กองจั่ว ${h.deck} · กองทิ้ง ${h.discard}${h.fas >= 3 && !h.winner ? ' · <b class="warn">ฮิตเลอร์เป็นนายกฯ = ฟาสซิสต์ชนะ</b>' : ''}</div>
    <div class="shgov">${who(h.pres)}<span class="muted small">ประธาน</span>${h.chan || h.nominee ? `${who(h.chan || h.nominee)}<span class="muted small">นายกฯ${h.chan ? '' : ' (เสนอ)'}</span>` : ''}</div></section>`;
}
const shMine = () => secret(shRole(), 'แตะเพื่อดูบทบาทของคุณ');
function shLog() {
  const h = S.pub.sh, L = h.lastVote;
  const line = e => e.t === 'policy' ? `${e.p === 'L' ? 'ออกกฎหมายเสรีนิยม 🕊️' : 'ออกกฎหมายฟาสซิสต์ 🦅'}${e.gov ? ` (ประธาน ${esc(pn(e.pres))} · นายกฯ ${esc(pn(e.chan))})` : ' (เลือกตั้งล้มเหลว 3 ครั้ง)'}`
    : e.t === 'vote' ? `เลือกตั้ง ${esc(pn(e.pres))} + ${esc(pn(e.chan))}: ${e.ok ? 'ผ่าน' : 'ไม่ผ่าน'}` : e.t === 'kill' ? `ประธาน ${esc(pn(e.pres))} ประหาร ${esc(pn(e.target))}`
    : e.t === 'investigate' ? `ประธาน ${esc(pn(e.pres))} ตรวจฝ่ายของ ${esc(pn(e.target))}` : e.t === 'special' ? `ประธาน ${esc(pn(e.pres))} เลือก ${esc(pn(e.target))} เป็นประธานคนถัดไป` : `วีโต้ — ทิ้งนโยบายทั้งคู่`;
  return `${L ? `<section class="panel"><h2>โหวตล่าสุด: ${esc(pn(L.pres))} + ${esc(pn(L.chan))} — ${L.ok ? 'ผ่าน' : 'ไม่ผ่าน'}</h2><div class="chips">${Object.entries(L.votes).map(([s, v]) => `<span class="who">${av(s, 'sm')}${esc(pn(s))} <b class="${v ? 'ok-text' : 'warn'}">${v ? '✔' : '✘'}</b></span>`).join('')}</div></section>` : ''}
    ${h.log.length ? `<section class="panel"><h2>เหตุการณ์ล่าสุด</h2><ol class="log">${h.log.map(e => `<li>${line(e)}</li>`).join('')}</ol></section>` : ''}`;
}
function shV() {
  const h = S.pub.sh, v = S.priv, mine = me(), pres = h.pres === mine, chan = h.chan === mine, alive = h.alive.includes(mine), n = pl().length;
  if (h.phase === 'role') {
    const rd = h.ready || [];
    return `<h1 class="ph">ดูบทบาทของคุณ</h1>${shMine()}${v.ready ? '<p class="center ok-text">✔ คุณพร้อมแล้ว</p>' : btn('ready', 'ดูแล้ว พร้อม', 'primary wide big')}
      <section class="panel"><h2>พร้อม ${rd.length}/${n}</h2>${players({ ready: rd })}</section>
      ${isHostView() ? btn('shstart', rd.length >= n ? '▶︎ เริ่มเลือกตั้ง' : `▶︎ เริ่มเลือกตั้ง (พร้อม ${rd.length}/${n})`, 'primary wide big') : ''}`;
  }
  if (h.winner) {
    const win = (v.role === 'L') === (h.winner === 'L');
    const why = { policies: h.winner === 'L' ? 'ออกกฎหมายเสรีนิยมครบ 5 ใบ' : 'ออกกฎหมายฟาสซิสต์ครบ 6 ใบ', 'hitler-chancellor': 'ฮิตเลอร์ได้เป็นนายกรัฐมนตรี', 'hitler-killed': 'ฮิตเลอร์ถูกประหาร' }[h.why];
    return `<div class="banner ${win ? 'win' : 'lose'}"><div class="bt">${win ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>${h.winner === 'L' ? 'ฝ่ายเสรีนิยมชนะ' : 'ฝ่ายฟาสซิสต์ชนะ'}</div><div class="small">${why}</div></div>${shBoard()}
      <section class="panel"><h2>บทบาทของทุกคน</h2><table class="res"><tbody>${pl().map(x => `<tr class="${(h.roles[x.sid] === 'L') === (h.winner === 'L') ? 'w' : ''}"><td>${h.alive.includes(x.sid) ? '' : '☠ '}${esc(x.name)}</td><td>${gi(SHR[h.roles[x.sid]][1])} ${SHR[h.roles[x.sid]][0]}</td></tr>`).join('')}</tbody></table></section>
      ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  }
  const pick = (act, list) => `<div class="picks">${list.map(s => `<button class="pick" data-act="${act}" data-sid="${s}">${esc(pn(s))}</button>`).join('')}</div>`;
  let body = '';
  if (h.phase === 'nom') body = pres ? `<p class="ask center">คุณเป็นประธานาธิบดี — เสนอชื่อนายกรัฐมนตรี</p>${pick('shnom', h.elig)}` : `<p class="center big-t">${esc(pn(h.pres))} กำลังเลือกนายกรัฐมนตรี</p>`;
  else if (h.phase === 'vote') body = `<p class="center big-t">รับรัฐบาลนี้ไหม?</p>
      ${alive ? `<div class="vtoks"><button class="vtok yes ${v.vote === true ? 'on' : ''}" data-act="shvote" data-ja="1"><i>✔</i>Ja! รับ</button><button class="vtok no ${v.vote === false ? 'on' : ''}" data-act="shvote" data-ja="0"><i>✘</i>Nein ไม่รับ</button></div>` : ''}
      <p class="center muted small">โหวตแล้ว ${h.voted.length}/${h.alive.length} · เปิดผลพร้อมกันเมื่อครบ</p>`;
  else if (h.phase === 'pres') body = pres ? `<p class="ask center">เลือก<b>ทิ้ง</b> 1 ใบ — อีก 2 ใบส่งให้นายกฯ</p><div class="pols">${(v.hand || []).map((p, i) => pol(p, `data-act="shdisc" data-i="${i}"`)).join('')}</div>` : `<p class="center big-t">ประธาน ${esc(pn(h.pres))} กำลังเลือกนโยบาย</p><p class="center muted">🤐 ห้ามบอกว่าได้ใบอะไร</p>`;
  else if (h.phase === 'chan') body = chan ? `<p class="ask center">เลือก<b>ออกกฎหมาย</b> 1 ใบ</p><div class="pols">${(v.hand || []).map((p, i) => pol(p, `data-act="shenact" data-i="${i}"`)).join('')}</div>${h.canVeto ? btn('shveto', '✋ ขอวีโต้ (ทิ้งทั้งคู่)', 'ghost wide') : ''}` : `<p class="center big-t">นายกฯ ${esc(pn(h.chan))} กำลังเลือกกฎหมาย</p>`;
  else if (h.phase === 'veto') body = pres ? `<p class="ask center">นายกฯ ${esc(pn(h.chan))} ขอวีโต้ — เห็นด้วยไหม?</p><div class="row">${btn('shvetoans', 'ไม่ ต้องออกกฎหมาย', 'ghost', { yes: 0 })}${btn('shvetoans', '✔ เห็นด้วย ทิ้งทั้งคู่', 'primary', { yes: 1 })}</div>` : `<p class="center big-t">นายกฯ ขอวีโต้ รอประธานตัดสิน</p>`;
  else if (h.phase === 'power') {
    const head = `<div class="banner lose"><div class="small">อำนาจประธานาธิบดี</div><div class="bt">${gi(SHPI[h.power] || 'magnify')} ${SHPW[h.power]}</div></div>`;
    const others = h.alive.filter(s => s !== h.pres);
    if (!pres) body = `${head}<p class="center">${esc(pn(h.pres))} กำลังใช้อำนาจ${h.invTarget ? ` — ตรวจ ${esc(pn(h.invTarget))} แล้ว` : ''}</p>`;
    else if (h.power === 'peek') body = `${head}<p class="ask center">3 ใบบนสุดของกอง (ซ้าย = ใบบนสุด)</p><div class="pols">${(v.peek || []).map(p => pol(p)).join('')}</div>${btn('shpower', 'รับทราบ', 'primary wide')}`;
    else if (h.power === 'invshow') body = !v.inv ? head : `${head}<p class="center big-t">${esc(pn(v.inv.target))} อยู่ฝ่าย</p><div class="pols">${pol(v.inv.party)}</div><p class="muted small center">จะบอกความจริงหรือโกหกคนอื่นก็ได้</p>${btn('shpower', 'รับทราบ', 'primary wide')}`;
    else body = `${head}<p class="ask center">เลือกผู้เล่น</p>${pick('shpower', h.power === 'investigate' ? others.filter(s => !h.investigated.includes(s)) : others)}`;
  }
  return `${shBoard()}${alive ? '' : '<p class="alert center">คุณถูกประหารแล้ว — ดูต่อได้ แต่ห้ามบอกใบ้</p>'}${body}${shLog()}${shMine()}`;
}

/* Camel Up */
const camel = (c, cls = '') => `<span class="camel c-${c} ${cls}">${gi('camel')}</span>`;
function cuV() {
  const k = S.pub.cu, v = S.priv, mine = me(), my = k.turn === mine && !k.over;
  const cell = i => {
    const st = k.stacks[i] || [], d = k.desert[i], can = my && S.cuD && CU.canDesert(k, mine, i);
    return `<${can ? 'button' : 'div'} class="cell ${can ? 'can' : ''} ${i > CU.FINISH ? 'fin' : ''}" ${can ? `data-act="cucell" data-sp="${i}"` : ''}><small>${i > CU.FINISH ? '🏁' : i}</small>
      ${d ? `<span class="dz ${d.type > 0 ? 'oa' : 'mi'}">${gi(d.type > 0 ? 'palm' : 'mirage')}${d.type > 0 ? '+1' : '−1'}</span>` : ''}<span class="cstack">${[...st].reverse().map(c => camel(c)).join('')}</span></${can ? 'button' : 'div'}>`;
  };
  const track = `<div class="ctrack">${Array.from({ length: CU.FINISH + 1 }, (_, i) => cell(i + 1)).join('')}</div>`;
  const dice = `<div class="cdice">${CU.COLORS.map(c => { const r = k.rolled.find(x => x.c === c); return `<span class="die c-${c} ${r ? '' : 'un'}">${r ? r.v : '?'}</span>`; }).join('')}<span class="muted small">รอบที่ ${k.leg} · เต๋าที่ออกแล้ว</span></div>`;
  if (k.over) {
    const R = k.res, rows = pl().map(x => ({ x, c: k.coins[x.sid] })).sort((a, b) => b.c - a.c);
    return `<div class="banner ${R.winners.includes(mine) ? 'win' : 'lose'}"><div class="bt">${R.winners.includes(mine) ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>🏆 ${R.winners.map(s => esc(pn(s))).join(', ')}</div>
      <div class="small">แชมป์ ${camel(R.winner, 'sm')} · ที่โหล่ ${camel(R.loser, 'sm')}</div></div>${track}
      <section class="panel"><h2>เหรียญ</h2><ol class="log">${rows.map(r => `<li>${esc(r.x.name)} — <b>${r.c}</b> เหรียญ</li>`).join('')}</ol></section>
      <section class="panel"><h2>ทายทั้งเกม</h2><p class="small">แชมป์: ${R.w.map(b => `${esc(pn(b.sid))} ${camel(b.c, 'sm')} ${b.v > 0 ? '+' : ''}${b.v}`).join(' · ') || '—'}</p><p class="small">ที่โหล่: ${R.l.map(b => `${esc(pn(b.sid))} ${camel(b.c, 'sm')} ${b.v > 0 ? '+' : ''}${b.v}`).join(' · ') || '—'}</p></section>
      ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  }
  const tiles = `<div class="ltiles">${CU.COLORS.map(c => `<button class="ltile c-${c}" data-act="cubet" data-c="${c}" ${my && k.tiles[c].length ? '' : 'disabled'}>${gi('camel')}<b>${k.tiles[c][0] ?? '–'}</b></button>`).join('')}</div>`;
  const acts = my ? `<section class="panel"><h2>ตาคุณ — เลือก 1 อย่าง</h2>
      ${btn('curoll', `${gi('dice')} ทอยเต๋า (+1 เหรียญ)`, 'primary wide')}
      <p class="or">หรือ หยิบป้ายเดิมพันรอบนี้</p>${tiles}
      <p class="or">หรือ วางแผ่นทะเลทราย</p><div class="row">${btn('cumode', `${gi('palm')} โอเอซิส +1`, S.cuD === 1 ? 'primary' : 'ghost', { t: 1 })}${btn('cumode', `${gi('mirage')} มิราจ −1`, S.cuD === -1 ? 'primary' : 'ghost', { t: -1 })}</div>
      ${S.cuD ? '<p class="ask center">แตะช่องบนลู่ที่มีกรอบสีทอง</p>' : ''}
      ${v.cards?.length ? `<p class="or">หรือ ทายผลทั้งเกม (การ์ดคว่ำ)</p><div class="row">${btn('cufmode', '🏆 ทายแชมป์', S.cuF === 'w' ? 'primary' : 'ghost', { k: 'w' })}${btn('cufmode', '🐢 ทายที่โหล่', S.cuF === 'l' ? 'primary' : 'ghost', { k: 'l' })}</div>
        ${S.cuF ? `<div class="ltiles">${v.cards.map(c => `<button class="ltile c-${c}" data-act="cufin" data-c="${c}">${gi('camel')}</button>`).join('')}</div>` : ''}` : ''}</section>`
    : `<p class="center skstatus">ตาของ <b>${esc(pn(k.turn))}</b></p><section class="panel"><h2>ป้ายเดิมพันรอบนี้ที่เหลือ</h2>${tiles}</section>`;
  const L = k.lastLeg;
  return `${track}${dice}${acts}
    <section class="panel"><ul class="players sk">${pl().map(x => `<li>${av(x.sid, 'sm')}<span class="pname">${esc(x.name)}${x.sid === mine ? ' <em>(คุณ)</em>' : ''}</span>
      <span class="skst">${k.bets[x.sid].map(b => `<span class="mtile c-${b.c}">${b.v}</span>`).join('')}</span><span class="skst">${gi('coins', 'gold')} <b>${k.coins[x.sid]}</b></span>${x.sid === k.turn ? '<span class="tag ok">👉</span>' : ''}</li>`).join('')}</ul>
      <p class="muted small">ทายแชมป์แล้ว ${k.fw.length} ใบ · ทายที่โหล่แล้ว ${k.fl.length} ใบ</p></section>
    ${L ? `<section class="panel"><h2>ผลรอบที่ ${L.leg}</h2><p class="small">ที่ 1 ${camel(L.first, 'sm')} · ที่ 2 ${camel(L.second, 'sm')} — ${pl().map(x => `${esc(x.name)} ${L.rows[x.sid] > 0 ? '+' : ''}${L.rows[x.sid]}`).join(' · ')}</p></section>` : ''}`;
}

/* Taco Cat Goat Cheese Pizza */
function tcV() {
  const t = S.pub.tc, mine = me(), top = t.top;
  if (top && S.tcN !== top.n) { S.tcN = top.n; S.tcT = performance.now(); }       // start this player's reaction clock
  const card = !top ? `<div class="tcard back">${gi('taco')}</div>` : top.card ? `<div class="tcard k-${top.card}">${gi(top.card)}<b>${TC.TH[top.card]}</b></div>` : '<div class="tcard none">ไม่มีไพ่<br>(พูดอย่างเดียว)</div>';
  const slapped = t.slap?.done.includes(mine);
  const L = t.last;
  const last = L ? (L.why === 'false' ? `<div class="alert center">${esc(pn(L.loser))} ตบผิดจังหวะ! เก็บ ${L.took} ใบ</div>`
    : L.why === 'slow' ? `<div class="info center">${L.first ? `<span>⚡ ${esc(pn(L.first))} ไวสุด ·</span> ` : ''}<span>${esc(pn(L.loser))} ช้าสุด เก็บ ${L.took} ใบ</span></div>` : '') : '';
  if (t.winner) return `<div class="banner ${t.winner === mine ? 'win' : 'lose'}"><div class="bt">${t.winner === mine ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>🏆 ${esc(pn(t.winner))} ไพ่หมดและตบไวที่สุด</div></div>
    <section class="panel"><ul class="players">${pl().map(x => `<li>${av(x.sid)}<span class="pname">${esc(x.name)}</span><span class="skst">🂠 ${t.n[x.sid]}</span></li>`).join('')}</ul></section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  return `<div class="tctable">${top ? `<div class="said">“${TC.TH[top.said]}”<small>${esc(pn(top.by))} พูด</small></div>` : '<div class="said dim">เริ่มที่ “ทาโก้”</div>'}${card}<div class="muted small">กองกลาง ${t.pile} ใบ</div></div>
    ${last}
    ${t.slap ? `<p class="center big-t">${slapped ? '✔ ตบแล้ว!' : 'ตบ!!!'}</p>` : `<p class="center skstatus">ตาของ <b>${esc(pn(t.turn))}</b> · คำถัดไป: <b>${TC.TH[t.next]}</b></p>`}
    ${t.turn === mine && !t.slap ? btn('tflip', '🃏 เปิดไพ่', 'primary wide big') : ''}
    <button class="tcslap ${t.slap ? 'live' : ''}" data-act="tslap" ${slapped ? 'disabled' : ''}>${gi('hand')}<b>ตบ!</b></button>
    <div class="gest">${TC.SPECIAL.map(g => `<button class="gbtn" data-act="tslap" data-g="${g}" ${slapped ? 'disabled' : ''}>${gi(g)}<small>${TC.TH[g]}</small></button>`).join('')}</div>
    <p class="muted small center">ไพ่ตรงกับคำ = กด "ตบ!" · ไพ่พิเศษ = กดปุ่มสัตว์ตัวนั้น · ตบผิดจังหวะต้องเก็บกอง</p>
    <section class="panel"><ul class="players sk">${pl().map(x => `<li>${av(x.sid, 'sm')}<span class="pname">${esc(x.name)}${x.sid === mine ? ' <em>(คุณ)</em>' : ''}</span><span class="skst">🂠 <b>${t.n[x.sid]}</b></span>${x.sid === t.turn ? '<span class="tag ok">👉</span>' : ''}${t.slap?.done.includes(x.sid) ? '<span class="tag ok">ตบแล้ว</span>' : ''}</li>`).join('')}</ul></section>`;
}

/* Salem 1692 */
const SAT = { N: ['ไม่ใช่แม่มด', 'villager'], W: ['แม่มด', 'witchhat'], C: ['นายอำเภอ', 'shield'] };
const SAI = { acc: 'point', evi: 'scroll', wit: 'eye', alibi: 'shield', stocks: 'stocks', scape: 'goat', arson: 'fire', curse: 'curse', rob: 'robhand', asylum: 'church', piety: 'dove', match: 'ring', cat: 'blackcat' };
const tryCard = (t, cls = '', attr = '') => `<${attr ? 'button' : 'span'} class="try ${t ? 't-' + t : 'down'} ${cls}" ${attr} ${attr ? 'aria-label="การ์ดตัวตน"' : ''}>${t ? gi(SAT[t][1]) : ''}</${attr ? 'button' : 'span'}>`;
function saLine(e) {
  const C = SA.CARDS;
  return e.t === 'play' ? `${esc(pn(e.sid))} เล่น <b>${C[e.card].n}</b> ใส่ ${esc(pn(e.a))}${e.b ? ` → ${esc(pn(e.b))}` : ''}` : e.t === 'draw' ? `${esc(pn(e.sid))} จั่ว 2 ใบ` : e.t === 'flip' ? `เปิดการ์ดของ ${esc(pn(e.sid))}: <b>${SAT[e.card][0]}</b>`
    : e.t === 'dead' ? `☠ ${esc(pn(e.sid))} ตาย (${{ witch: 'เป็นแม่มด', tryal: 'การ์ดถูกเปิดหมด', night: 'ถูกฆ่าตอนกลางคืน', match: 'ตายตามคู่แม่สื่อ' }[e.why]})` : e.t === 'skip' ? `${esc(pn(e.sid))} ติดขื่อคา ข้ามตา`
    : e.t === 'cat' ? `🐈‍⬛ แมวดำอยู่กับ ${esc(pn(e.sid))}` : e.t === 'consp' ? '🕯️ สมคบคิด! ทุกคนได้การ์ดตัวตนใหม่ 1 ใบ — เช็กการ์ดตัวเอง' : e.t === 'night' && !e.target ? '🌙 กลางคืนมาถึง'
    : e.t === 'night' ? (e.safe ? `🌅 ${esc(pn(e.target))} ถูกหมายหัวแต่รอด (${{ constable: 'นายอำเภอคุ้มครอง', asylum: 'อยู่ในที่ลี้ภัย', confess: 'สารภาพ', gone: 'ตายไปก่อนแล้ว' }[e.safe]})` : `🌅 ${esc(pn(e.target))} ถูกแม่มดฆ่า`) : '';
}
function saV() {
  const k = S.pub.sa, v = S.priv, mine = me(), alive = k.alive.includes(mine), my = k.phase === 'turn' && k.turn === mine;
  const sel = my ? S.saSel : null, selId = sel ? v.hand[sel.i] : null;
  // which player mats can be tapped right now, and what the tap does
  let act = null, okFor = () => false, hint = '';
  if (sel && selId) { act = 'satarget'; okFor = s => (sel.a ? s !== sel.a && k.alive.includes(s) : SA.canTarget(k, mine, selId, s)); hint = SA.CARDS[selId].t === 2 ? (sel.a ? `ย้ายจาก ${esc(pn(sel.a))} ไปให้ใคร?` : 'เลือกคนต้นทาง') : `เลือกเป้าหมายของ "${SA.CARDS[selId].n}"`; }
  else if (k.phase === 'dawn' && alive) { act = v.witch && !v.dk ? 'sadawn' : 'sadecoy'; okFor = s => k.alive.includes(s); hint = v.witch ? (v.dk ? `คุณเลือก ${esc(pn(v.dk))} แล้ว รอแม่มดคนอื่น` : '🐈‍⬛ แม่มด: เลือกคนที่จะได้แมวดำ') : 'แม่มดกำลังเลือกคนรับแมวดำ — แตะชื่อใครก็ได้เพื่อพรางตัว'; }
  else if (k.phase === 'night' && alive) {
    if (v.witch && !v.nk) { act = 'sakill'; okFor = s => s !== mine && k.alive.includes(s); hint = '🗡️ แม่มด: เลือกคนที่จะฆ่าคืนนี้'; }
    else if (v.constable && !v.ns) { act = 'sasave'; okFor = s => s !== mine && k.alive.includes(s); hint = '🛡️ นายอำเภอ: เลือกคนที่จะคุ้มครองคืนนี้'; }
    else { act = 'sadecoy'; okFor = s => k.alive.includes(s); hint = '🌙 กลางคืน… แตะชื่อใครก็ได้เพื่อพรางตัว'; }
  }
  const mats = `<div class="smats">${pl().map(x => {
    const s = x.sid, dead = !k.alive.includes(s), f = k.front[s], pts = f.red.reduce((a, b) => a + b, 0), can = act && !dead && okFor(s);
    const tag = can ? 'button' : 'div';
    return `<${tag} class="smat ${dead ? 'out' : ''} ${s === k.turn && k.phase === 'turn' ? 'turn' : ''} ${can ? 'can' : ''} ${S.saDecoy === s && act === 'sadecoy' ? 'pk' : ''}" ${can ? `data-act="${act}" data-sid="${s}"` : ''}>
      <span class="mhead"><b>${av(s, 'sm')} ${esc(x.name)}${s === mine ? ' <em>(คุณ)</em>' : ''}</b><span class="skst">🂠${k.hn[s]}</span></span>
      <span class="trys">${k.try[s].map(t => tryCard(t)).join('')}</span>
      <span class="mfoot"><span class="acc ${pts >= 5 ? 'hot' : ''}">${gi('point')} ${pts}/${SA.LIMIT}</span>${f.blue.map(b => `<span class="bl" title="${SA.CARDS[b].n}">${gi(SAI[b])}</span>`).join('')}${f.stocks ? `<span class="bl st">${gi('stocks')}</span>` : ''}${dead ? '<span class="tag bad">ตาย</span>' : ''}</span></${tag}>`;
  }).join('')}</div>`;
  const myCards = `<span class="role"><span class="rn">${v.witch ? '🧙‍♀️ คุณอยู่ฝ่ายแม่มด' : '🏘️ คุณเป็นชาวเมือง'}</span><span class="trys big">${v.tryal.map(c => `<span class="tryw">${tryCard(c.t, c.up ? 'shown' : '')}<small>${SAT[c.t][0]}${c.up ? ' (เปิดแล้ว)' : ''}</small></span>`).join('')}</span>
    ${v.mates.length ? `<span class="info">แม่มดด้วยกัน: ${v.mates.map(s => esc(pn(s))).join(', ')}</span>` : ''}<span class="rd">${v.witch ? 'กำจัดชาวเมืองให้หมด อย่าให้การ์ดแม่มดถูกเปิด' : 'หาและเปิดการ์ดแม่มดให้ครบทุกใบ'}</span></span>`;
  if (k.winner) return `<div class="banner ${(k.winner === 'W') === !!v.witch ? 'win' : 'lose'}"><div class="bt">${(k.winner === 'W') === !!v.witch ? '🎉 คุณชนะ!' : '😵 คุณแพ้'}</div><div>${k.winner === 'T' ? '🏘️ ชาวเมืองชนะ — เปิดการ์ดแม่มดครบแล้ว' : '🧙‍♀️ แม่มดชนะ — ชาวเมืองตายหมด'}</div></div>
    <section class="panel"><h2>ใครเป็นใคร</h2><table class="res"><tbody>${pl().map(x => `<tr><td>${k.alive.includes(x.sid) ? '' : '☠ '}${esc(x.name)}</td><td>${k.team[x.sid] ? `${gi('witchhat')} แม่มด` : 'ชาวเมือง'}</td></tr>`).join('')}</tbody></table></section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  let status = '', panel = '';
  if (k.phase === 'turn') status = my ? '👉 ตาคุณ' : `ตาของ <b>${esc(pn(k.turn))}</b>`;
  else if (k.phase === 'reveal') {
    status = `⚖️ ${esc(pn(k.reveal.target))} ถูกกล่าวหาครบ ${SA.LIMIT} แต้ม`;
    panel = k.reveal.by === mine ? `<section class="panel"><h2>เลือกเปิดการ์ดของ ${esc(pn(k.reveal.target))} 1 ใบ</h2><div class="trys big">${k.try[k.reveal.target].map((t, i) => (t ? tryCard(t) : tryCard(null, '', `data-act="sarev" data-i="${i}"`))).join('')}</div></section>` : `<p class="center">${esc(pn(k.reveal.by))} กำลังเลือกการ์ดที่จะเปิด…</p>`;
  } else if (k.phase === 'dawn') status = '🌄 รุ่งอรุณ — ทุกคนหลับตา';
  else if (k.phase === 'night') status = '🌙 กลางคืน — ทุกคนหลับตา';
  else if (k.phase === 'confess') {
    status = `🕯️ ใกล้รุ่ง — จะสารภาพไหม? (${k.cdone.length}/${k.alive.length})`;
    panel = !alive ? '' : v.cf ? '<p class="center ok-text">✔ ตัดสินใจแล้ว รอคนอื่น</p>' : `<section class="panel"><h2>สารภาพเพื่อรอดคืนนี้?</h2><p class="muted small">เลือกเปิดการ์ดตัวเอง 1 ใบ แล้วแม่มดจะฆ่าคุณคืนนี้ไม่ได้ (ถ้าเปิดการ์ดแม่มด คุณตาย)</p>
      <div class="trys big">${v.tryal.map((c, i) => (c.up ? '' : `<span class="tryw">${tryCard(c.t, '', `data-act="saconf" data-i="${i}"`)}<small>${SAT[c.t][0]}</small></span>`)).join('')}</div>${btn('saconf', 'ไม่สารภาพ', 'ghost wide')}</section>`;
  }
  const hand = alive ? `<section class="panel"><h2>การ์ดในมือ ${my ? '<span class="tag ok">ตาคุณ</span>' : ''}</h2>
      <div class="hcards">${v.hand.map((id, i) => `<button class="hcard k-${SA.CARDS[id].k} ${sel?.i === i ? 'on' : ''}" data-act="sacard" data-i="${i}" ${my ? '' : 'disabled'}>${gi(SAI[id])}<b>${SA.CARDS[id].n}</b><small>${SA.CARDS[id].d}</small></button>`).join('') || '<span class="muted">ไม่มีการ์ด</span>'}</div>
      ${my ? `<div class="row">${btn('sadraw', '🂠 จั่ว 2 ใบ (จบตา)', 'ghost', {}, k.played > 0)}${btn('saend', 'จบตา', 'primary', {}, k.played === 0)}</div><p class="muted small">แตะการ์ดแล้วแตะผู้เล่นเป้าหมาย · เล่นได้หลายใบ หรือจั่ว 2 ใบแทน</p>` : ''}</section>` : '<p class="alert center">คุณตายแล้ว — ดูต่อได้ แต่ห้ามบอกใบ้</p>';
  return `<p class="center skstatus">${status}</p>${hint ? `<p class="ask center">${hint}</p>` : ''}${mats}${panel}${hand}
    ${secret(myCards, 'แตะเพื่อดูการ์ดตัวตนของคุณ')}
    <section class="panel"><h2>เหตุการณ์ล่าสุด <span class="muted small">กองจั่ว ${k.deck}</span></h2><ol class="log">${k.log.map(e => `<li>${saLine(e)}</li>`).join('')}</ol></section>`;
}

/* Skull */
const DI = d => (d === 'f' ? '🌹' : '💀');
// A round coaster. kind: 'back' (face down), 'f' (flower), 's' (skull).
const disc = (kind, cls = '', attr = '', tag = 'span') => `<${tag} class="disc d-${kind} ${cls}" ${attr}>${kind === 'back' ? '' : gi(kind === 'f' ? 'rose' : 'skull')}</${tag}>`;
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
      <span class="mhead"><b>${esc(x.name)}${x.sid === mine ? ' <em>(คุณ)</em>' : ''}</b><span class="mpts">${gi('star', 'gold').repeat(q.pts)}${gi('star', 'dim').repeat(SK.WIN - q.pts)}</span></span>
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
  return `<span class="role t-${v.role === 'insider' ? 'wolf' : 'village'}">${art({ master: 'master', insider: 'spy', common: 'people' }[v.role])}<span class="rn">${IR[v.role]}</span>
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
    <div class="vtoks"><button class="vtok yes ${v.v1 === true ? 'on' : ''}" data-act="iv1" data-yes="1"><i>✔</i>ใช่</button><button class="vtok no ${v.v1 === false ? 'on' : ''}" data-act="iv1" data-yes="0"><i>✘</i>ไม่ใช่</button></div>
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
  return `<span class="role t-${t}">${art(AICON[v.role])}<span class="rn">${R.n}</span><span class="team">${R.t === 'good' ? 'ฝ่ายดี' : 'ฝ่ายร้าย'}</span><span class="rd">${R.d}</span>
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
const avTeam = t => `<div class="chips team">${t.map(who).join('')}</div>`;

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
    <div class="vtoks"><button class="vtok yes ${v.vote === true ? 'on' : ''}" data-act="avote" data-ok="1"><i>✔</i>อนุมัติ</button><button class="vtok no ${v.vote === false ? 'on' : ''}" data-act="avote" data-ok="0"><i>✘</i>ไม่อนุมัติ</button></div>
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
    <section class="panel"><h2>ใครโหวตอะไร</h2><ul class="players">${pl().map(x => `<li>${av(x.sid)}<span class="pname">${esc(x.name)}</span><span class="vmark ${h.votes[x.sid] ? 'yes' : 'no'}">${h.votes[x.sid] ? '✔' : '✘'}</span></li>`).join('')}</ul></section>
    ${isHostView() ? btn('anext', 'ต่อไป ▶', 'primary wide big') : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
}

function avQuestV() {
  const a = S.pub.av, v = S.priv, onTeam = a.team.includes(me()), evil = AV.ROLES[v.role].t === 'evil';
  let body = `<p class="center">ทีมกำลังทำภารกิจ… (${S.pub.played}/${a.team.length})</p>`;
  if (onTeam) body = v.played
    ? `<p class="center ok-text">✔ ส่งการ์ดแล้ว รอคนอื่น (${S.pub.played}/${a.team.length})</p>`
    : `<p class="ask center">เลือกการ์ดภารกิจ (ไม่มีใครรู้ว่าใครส่งอะไร)</p>
       <div class="qpick"><button class="qcard ok" data-act="acard" data-ok="1">${gi('trophy')}<b>สำเร็จ</b></button>${evil ? `<button class="qcard bad" data-act="acard" data-ok="0">${gi('fail')}<b>ล้มเหลว</b></button>` : ''}</div>
       ${evil ? '' : '<p class="muted small center">ฝ่ายดีส่งได้แค่ ✅ เท่านั้น</p>'}`;
  return `${avBoard()}<h1 class="ph">⚔️ ภารกิจที่ ${a.q + 1}</h1>${avTeam(a.team)}${body}${avMine()}`;
}

function avQResV() {
  const a = S.pub.av, Q = a.quests[a.q - 1];
  const cards = [...Array(Q.size - Q.fails).fill(`<span class="qcard sm ok">${gi('trophy')}</span>`), ...Array(Q.fails).fill(`<span class="qcard sm bad">${gi('fail')}</span>`)];
  return `${avBoard()}
    <div class="banner ${Q.res === 'S' ? 'win' : 'lose'}"><div class="small">ภารกิจที่ ${a.q}</div><div class="bt">${Q.res === 'S' ? '✅ สำเร็จ' : '❌ ล้มเหลว'}</div>
      <div class="qcards">${cards.join('')}</div><div class="small">มีการ์ด ❌ ${Q.fails} ใบ${Q.need > 1 ? ' (ภารกิจนี้ต้อง ❌ 2 ใบถึงล้ม)' : ''}</div></div>
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
    ? `<span class="role">${art('tophat')}<span class="rn">Mr. White</span><span class="team">คุณไม่มีคำ</span><span class="rd">ฟังคนอื่นแล้วบรรยายให้เนียน ถ้าถูกโหวตออก ได้ทายคำของพลเมือง — ทายถูกชนะทันที</span></span>`
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
    <section class="panel"><h2>ลำดับการพูด</h2><ol class="order">${p.order.map(s => `<li${s === me() ? ' class="me"' : ''}>${av(s, 'sm')}${esc(pn(s))}${s === me() ? ' <em>(คุณ)</em>' : ''}</li>`).join('')}</ol></section>
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

// ── ito ──
function itV() {
  const t = S.pub.it, v = S.priv, mine = me(), en = S.pub.wl === 'en', th = IT.THEMES[t.theme];
  const theme = `<section class="panel ittheme"><small>หัวข้อ</small><b class="notr">${esc(en ? th[1] : th[0])}</b><span class="itscale"><span>1 = น้อยสุด</span><span>100 = มากสุด</span></span>
    ${isHostView() && t.phase === 'talk' && !t.table.length ? btn('ittheme', '🔀 เปลี่ยนหัวข้อ', 'ghost small') : ''}</section>`;
  const head = `<p class="center skstatus">ด่าน <b>${t.level}</b>/${IT.LEVELS} · ${'❤️'.repeat(t.lives)}${'🖤'.repeat(IT.LIVES - t.lives)}</p>`;
  const table = `<section class="panel"><h2>บนโต๊ะ (เรียงน้อย → มาก)</h2>${t.table.length ? `<div class="ittable">${t.table.map(x => `<div class="itc ${x.ok ? '' : 'bad'}"><b>${x.c}</b><small>${esc(pn(x.sid))}</small>${x.hint ? `<em class="notr">${esc(x.hint)}</em>` : ''}</div>`).join('')}</div>` : '<p class="muted">ยังไม่มีใครวาง</p>'}</section>`;
  const hints = `<section class="panel"><h2>คำใบ้ของทุกคน</h2><ul class="ithints">${pl().map(x => `<li>${av(x.sid, 'sm')}<b>${esc(x.name)}</b><span>${t.left[x.sid] ? t.hints[x.sid].map(h => `<span class="ith notr">${h ? esc(h) : '…'}</span>`).join('') : '<span class="muted small">วางหมดแล้ว ✔</span>'}</span></li>`).join('')}</ul></section>`;
  const last = t.last ? `<p class="center itlast ${t.last.miss.length ? 'bad' : 'ok'}">${esc(pn(t.last.sid))} วาง <b>${t.last.c}</b> — ${t.last.miss.length ? `<span>พลาด! เสีย ${t.last.miss.length} ชีวิต</span> <span class="notr">(${t.last.miss.map(m => `${esc(pn(m.sid))}: ${m.c}`).join(', ')})</span>` : 'ถูกต้อง ✔'}</p>` : '';
  if (t.phase === 'over' || t.phase === 'clear') {
    const win = t.phase === 'clear' || t.over === 'win';
    return `${head}<div class="banner ${win ? 'win' : 'lose'}"><div class="bt">${t.phase === 'clear' ? `ผ่านด่าน ${t.level}!` : t.over === 'win' ? `ผ่านครบ ${IT.LEVELS} ด่าน! ใจตรงกันสุดๆ` : 'ชีวิตหมด'}</div></div>${last}${theme}${table}
      ${isHostView() ? (t.phase === 'clear' ? btn('itnext', `▶ ด่าน ${t.level + 1} (หัวข้อใหม่)`, 'primary wide big') : `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>`) : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
  }
  const mineP = v.hand?.length ? `<section class="panel itmine"><h2>เลขของคุณ <span class="muted small">(ห้ามบอกเลข! บอกเป็นคำตามหัวข้อ)</span></h2>
      ${v.hand.map((c, i) => `<div class="itrow"><span class="itn">${c}</span><input id="ih${i}" maxlength="40" placeholder="คำใบ้ เช่น ${en ? 'a tiger' : 'เสือ'}" value="${esc(S.ih[i] ?? t.hints[mine]?.[i] ?? '')}">${btn('ithint', 'ส่ง', 'ghost small', { i })}</div>`).join('')}
      ${btn('itplay', `🃏 วางเลข ${v.hand[0]}`, 'primary wide big')}<p class="muted small center">คุยกันได้ เรียงลำดับกันเอง แล้วใครคิดว่าเลขตัวเองต่ำสุดก็วางได้เลย</p></section>`
    : '<section class="panel center"><p>✔ วางหมดแล้ว รอเพื่อน</p></section>';
  return `${head}${last}${theme}${mineP}${hints}${table}`;
}

// ── Coup ──
const CPC = { duke: ['ดยุก', 'crown', 'เก็บภาษี +3 · บล็อกรับเงินช่วยเหลือ'], assassin: ['นักฆ่า', 'assassin', 'จ่าย 3 ลอบสังหาร'], captain: ['กัปตัน', 'robhand', 'ขโมย 2 เหรียญ · บล็อกการขโมย'],
  ambassador: ['ทูต', 'swap', 'แลกการ์ดกับกอง · บล็อกการขโมย'], contessa: ['เคานท์เตส', 'ring', 'บล็อกการลอบสังหาร'] };
const CPA = { income: 'รายได้ +1', aid: 'เงินช่วยเหลือ +2', coup: 'รัฐประหาร (7)', tax: 'เก็บภาษี +3', assn: 'ลอบสังหาร (3)', steal: 'ขโมย 2', exch: 'แลกการ์ด' };
const cpCard = (c, cls = '', attr = '') => `<${attr ? 'button' : 'span'} class="cpc ${c ? 'k-' + c : 'back'} ${cls}" ${attr}>${c ? `${gi(CPC[c][1])}<b>${CPC[c][0]}</b>` : gi('crown')}</${attr ? 'button' : 'span'}>`;
function cpLog(e) {
  const P = s => `<b>${esc(pn(s))}</b>`, C = c => `<b>${CPC[c][0]}</b>`;
  return e.t === 'act' ? `${P(e.sid)} ${CPA[e.act]}${e.to ? ` → ${P(e.to)}` : ''}` : e.t === 'block' ? `${P(e.sid)} บล็อกด้วย ${C(e.card)}`
    : e.t === 'chal' ? `${P(e.sid)} ท้า ${P(e.to)} ว่าไม่มี ${C(e.card)} — ${e.truth ? 'มีจริง! คนท้าเสียอิทธิพล' : 'โกหก! โดนจับได้'}`
    : e.t === 'lose' ? `${P(e.sid)} เปิดทิ้ง ${C(e.c)}${e.out ? ' — ตกรอบ' : ''}` : e.t === 'blocked' ? `การกระทำถูกบล็อก` : e.t === 'done' ? `${P(e.sid)} ${CPA[e.act]} สำเร็จ` : '';
}
function cpV() {
  const c = S.pub.cp, v = S.priv, mine = me(), alive = v.hand.some(x => !x.up), my = c.turn === mine && c.phase === 'turn';
  const others = pl().filter(x => x.sid !== mine && c.cards[x.sid].some(k => !k.up));
  const board = `<div class="cpboard">${pl().map(x => {
    const out = !c.cards[x.sid].some(k => !k.up && !k.c) && !c.cards[x.sid].some(k => !k.up);
    return `<div class="cpp ${x.sid === c.turn && !c.winner ? 'turn' : ''} ${out ? 'out' : ''}" style="--ph:${hueOf(x.sid)}">
      <span class="cpn">${av(x.sid, 'sm')}<b>${esc(x.name)}${x.sid === mine ? ' <em>(คุณ)</em>' : ''}</b><span class="cpcoin">${gi('coins', 'gold inl')}${c.coins[x.sid]}</span></span>
      <span class="cpinf">${c.cards[x.sid].map(k => cpCard(k.up || c.winner ? k.c : null, `sm ${k.up ? 'dead' : ''}`)).join('')}</span></div>`; }).join('')}</div>`;
  const mineP = `<section class="panel"><h2>การ์ดของคุณ <span class="muted small">(ห้ามให้ใครเห็น)</span></h2><div class="cphand">${v.hand.map(k => cpCard(k.c, k.up ? 'dead' : '')).join('')}</div>${alive ? '' : '<p class="muted small">คุณตกรอบแล้ว — ดูต่อได้</p>'}</section>`;
  const logP = `<section class="panel"><h2>เหตุการณ์</h2><ol class="log">${[...c.log].reverse().map(e => `<li>${cpLog(e)}</li>`).join('') || '<li class="muted">ยังไม่มี</li>'}</ol></section>`;
  const cheat = `<section class="panel"><h2>ตัวละคร (อย่างละ 3 ใบ)</h2><ul class="cpcheat">${CP.CARDS.map(k => `<li>${cpCard(k, 'xs')}<span><b>${CPC[k][0]}</b> ${CPC[k][2]}</span></li>`).join('')}</ul></section>`;
  if (c.winner) return `<div class="banner ${c.winner === mine ? 'win' : 'lose'}"><div class="bt">${c.winner === mine ? 'คุณชนะ!' : `${esc(pn(c.winner))} ชนะ`}</div><div>เหลือรอดคนสุดท้าย</div></div>${board}${logP}
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  const p = c.pend, claim = p && CP.ACTS[p.act].claim;
  let act = '';
  if (c.phase === 'turn') {
    if (my) {
      const must = c.coins[mine] >= CP.MUST;
      act = `<section class="panel cpact"><h2>👉 ตาคุณ — เลือกการกระทำ</h2>${must ? '<p class="ask">มี 10 เหรียญขึ้นไป ต้องรัฐประหาร!</p>' : ''}
        <div class="cpacts">${Object.keys(CP.ACTS).map(a => { const A = CP.ACTS[a], ok = A.cost <= c.coins[mine] && (!must || a === 'coup');
          return `<button class="cpa ${S.cpAct === a ? 'on' : ''}" data-act="cpact" data-a="${a}" ${ok ? '' : 'disabled'}><b>${CPA[a]}</b><small>${A.claim ? `อ้าง ${CPC[A.claim][0]}` : a === 'coup' ? 'กันไม่ได้' : a === 'aid' ? 'ดยุกบล็อกได้' : 'ปลอดภัย'}</small></button>`; }).join('')}</div>
        ${S.cpAct ? `<p class="small muted">${CPA[S.cpAct]} — เลือกเป้าหมาย</p><div class="picks">${others.map(x => `<button class="pick" data-act="cpto" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div>` : ''}</section>`;
    } else act = `<p class="muted center">รอ ${esc(pn(c.turn))} เลือกการกระทำ…</p>`;
  } else {
    const what = `<b>${esc(pn(p.actor))}</b> ${CPA[p.act]}${p.t ? ` → <b>${esc(pn(p.t))}</b>` : ''}${claim ? ` <span class="muted">(อ้างว่ามี ${CPC[claim][0]})</span>` : ''}`;
    const wait = c.waiting.includes(mine), host = isHostView() && c.waiting.length ? btn('cppass', '⏭ ถือว่าที่เหลือผ่าน', 'ghost wide') : '';
    if (c.phase === 'chal') act = `<section class="panel cpwin"><p>${what}</p>${wait ? `<p class="ask">เชื่อไหม?</p><div class="row">${btn('cpresp', '🫵 ท้า! (โกหก)', 'primary', { k: 'chal' })}${btn('cpresp', 'เชื่อ ผ่าน', 'ghost', { k: 'pass' })}</div>` : `<p class="muted small">รอคนอื่นตัดสินใจ (${c.waiting.length})</p>`}${host}</section>`;
    else if (c.phase === 'block') act = `<section class="panel cpwin"><p>${what}</p>${wait ? `<p class="ask">จะบล็อกไหม?</p><div class="row">${CP.ACTS[p.act].blockBy.map(k => btn('cpresp', `🛡️ บล็อกด้วย${CPC[k][0]}`, 'primary', { k: 'block', c: k })).join('')}${btn('cpresp', 'ไม่บล็อก', 'ghost', { k: 'pass' })}</div>` : `<p class="muted small">รอการบล็อก (${c.waiting.length})</p>`}${host}</section>`;
    else if (c.phase === 'bchal') act = `<section class="panel cpwin"><p>${what}</p><p><b>${esc(pn(c.block.by))}</b> บล็อกด้วย <b>${CPC[c.block.card][0]}</b></p>${wait ? `<div class="row">${btn('cpresp', '🫵 ท้าการบล็อก', 'primary', { k: 'chal' })}${btn('cpresp', 'เชื่อ ผ่าน', 'ghost', { k: 'pass' })}</div>` : `<p class="muted small">รอคนอื่นตัดสินใจ (${c.waiting.length})</p>`}${host}</section>`;
    else if (c.phase === 'lose') act = c.lose === mine
      ? `<section class="panel cpwin"><h2>💔 คุณเสียอิทธิพล — เลือกการ์ดที่จะเปิดทิ้ง</h2><div class="cphand">${v.hand.map((k, i) => (k.up ? cpCard(k.c, 'dead') : cpCard(k.c, '', `data-act="cplose" data-i="${i}"`))).join('')}</div></section>`
      : `<p class="muted center">รอ ${esc(pn(c.lose))} เลือกการ์ดที่จะเปิดทิ้ง…</p>${isHostView() ? btn('cppass', '⏭ เปิดใบแรกให้แทน (ถ้าเขาหลุด)', 'ghost wide') : ''}`;
    else if (c.phase === 'exch') {
      const need = v.hand.filter(k => !k.up).length;
      act = v.pool ? `<section class="panel cpwin"><h2>🔄 เลือกเก็บ ${need} ใบ</h2><div class="cphand">${v.pool.map((k, i) => cpCard(k, S.cpKeep.includes(i) ? 'on' : '', `data-act="cpkeep" data-i="${i}"`)).join('')}</div>${btn('cpexch', `✔ เก็บใบที่เลือก (${S.cpKeep.length}/${need})`, 'primary wide', {}, S.cpKeep.length !== need)}</section>`
        : `<p class="muted center">รอ ${esc(pn(p.actor))} แลกการ์ด…</p>${isHostView() ? btn('cppass', '⏭ เก็บการ์ดเดิมให้แทน (ถ้าเขาหลุด)', 'ghost wide') : ''}`;
    }
  }
  if (c.chal && c.phase !== 'turn') act = `<p class="center cpres ${c.chal.truth ? 'ok' : 'bad'}">${esc(pn(c.chal.ch))} ท้า ${esc(pn(c.chal.cl))} — ${c.chal.truth ? `มี${CPC[c.chal.card][0]}จริง!` : 'โกหก!'}</p>` + act;
  return `${act}${board}${mineP}${cheat}${logP}`;
}

// ── Hanabi ──
const hnCard = (c, n, cls = '', attr = '') => `<${attr ? 'button' : 'span'} class="hnc ${c ? 'c-' + c : 'unk'} ${cls}" ${attr}><b>${n ?? '?'}</b>${c ? '' : '<i></i>'}</${attr ? 'button' : 'span'}>`;
const hnKnow = k => { const t = []; if (k.c) t.push(HN.CNAME[k.c]); if (k.n) t.push(k.n);
  const no = [...k.nc.map(c => HN.CNAME[c]), ...k.nn]; return `<small class="hnk">${t.join(' ') || ''}${no.length ? `<s>ไม่ใช่ ${no.join(',')}</s>` : ''}</small>`; };
function hnLog(e) {
  const P = s => `<b>${esc(pn(s))}</b>`, C = (c, n) => `<span class="hnt c-${c}">${HN.CNAME[c]} ${n}</span>`;
  return e.t === 'play' ? `${P(e.sid)} ลง ${C(e.c, e.num)} ${e.ok ? '✔' : '💥 ผิด!'}` : e.t === 'disc' ? `${P(e.sid)} ทิ้ง ${C(e.c, e.num)} (+คำใบ้)`
    : `${P(e.sid)} บอก ${P(e.to)}: ${e.k} ใบเป็น${e.kind === 'c' ? `สี${HN.CNAME[e.v]}` : `เลข ${e.v}`}`;
}
function hnV() {
  const h = S.pub.hn, v = S.priv, mine = me(), my = h.turn === mine && !h.over;
  const fw = `<div class="hnfw">${HN.COLORS.map(c => `<div class="hnst c-${c}"><b>${h.fw[c] || '–'}</b><small>${HN.CNAME[c]}</small></div>`).join('')}</div>`;
  const tok = `<div class="hntok"><span title="คำใบ้">💡 <b>${h.clues}</b>/${HN.CLUES}</span><span title="พลาดได้อีก">💣 ${'●'.repeat(HN.FUSES - h.fuses)}${'○'.repeat(h.fuses)}</span><span>กอง <b>${h.deck}</b></span><span>คะแนน <b>${h.score}</b>/25</span></div>`;
  const recent = id => h.last && h.last.ids.includes(id) ? 'clued' : '';
  const others = pl().filter(x => x.sid !== mine && v.others?.[x.sid]).map(x => {
    const cards = v.others[x.sid], kn = h.know[x.sid], sel = S.hnTo === x.sid;
    let clueBar = '';
    if (sel) {
      const cs = HN.COLORS.filter(c => cards.some(k => k.c === c)), ns = [1, 2, 3, 4, 5].filter(n => cards.some(k => k.n === n));
      clueBar = `<div class="hnclue">${cs.map(c => `<button class="hnb c-${c}" data-act="hnclue" data-kind="c" data-v="${c}">${HN.CNAME[c]}</button>`).join('')}${ns.map(n => `<button class="hnb num" data-act="hnclue" data-kind="n" data-v="${n}">${n}</button>`).join('')}</div>`;
    }
    return `<section class="panel hnp ${x.sid === h.turn ? 'turn' : ''} ${sel ? 'sel' : ''}">
      <${my && h.clues > 0 ? `button class="hnwho" data-act="hnto" data-sid="${x.sid}"` : 'div class="hnwho"'}>${av(x.sid, 'sm')}<b>${esc(x.name)}</b>${my && h.clues > 0 ? `<span class="muted small">${sel ? 'เลือกคำใบ้ ↓' : 'แตะเพื่อใบ้'}</span>` : ''}</${my && h.clues > 0 ? 'button' : 'div'}>
      <div class="hnhand">${cards.map((c, i) => `<span class="hnslot">${hnCard(c.c, c.n, recent(c.id))}${hnKnow(kn[i].k)}</span>`).join('')}</div>${clueBar}</section>`;
  }).join('');
  const myKnow = h.know[mine] || [];
  const myHand = `<section class="panel hnmine"><h2>ไพ่ของคุณ <span class="muted small">(มองไม่เห็น — ดูจากคำใบ้)</span></h2>
    <div class="hnhand">${myKnow.map(x => `<span class="hnslot">${hnCard(x.k.c, x.k.n, `${S.hnI === x.id ? 'on' : ''} ${recent(x.id)}`, h.over ? '' : `data-act="hnsel" data-id="${x.id}"`)}${hnKnow({ ...x.k, c: null, n: null })}</span>`).join('')}</div>
    ${my && S.hnI != null ? `<div class="row">${btn('hnplay', '🎆 ลงไพ่ใบนี้', 'primary')}${btn('hndisc', '🗑️ ทิ้ง (+คำใบ้)', 'ghost', {}, h.clues >= HN.CLUES)}</div>` : ''}</section>`;
  const disc = h.disc.length ? `<section class="panel"><h2>ทิ้งแล้ว ${h.disc.length}</h2><div class="hndisc">${[...h.disc].sort().map(x => hnCard(x[0], +x.slice(1), 'sm')).join('')}</div></section>` : '';
  const logP = `<section class="panel"><h2>เหตุการณ์</h2><ol class="log">${[...h.log].reverse().map(e => `<li>${hnLog(e)}</li>`).join('') || '<li class="muted">ยังไม่มี</li>'}</ol></section>`;
  if (h.over) {
    const sc = h.why === 'boom' ? 0 : h.score;
    const msg = sc === 25 ? 'ตำนาน! พลุสมบูรณ์แบบ' : sc >= 21 ? 'ยอดเยี่ยม' : sc >= 16 ? 'ดีมาก' : sc >= 11 ? 'พอใช้' : sc >= 6 ? 'ยังไหว' : 'แป้ก…';
    return `<div class="banner ${sc >= 16 ? 'win' : 'lose'}"><div class="bt">${h.why === 'boom' ? '💥 พลุระเบิด! (พลาด 3 ครั้ง)' : `${sc} คะแนน`}</div><div>${h.why === 'boom' ? 'คะแนน 0' : msg}</div></div>
      ${fw}${tok}<section class="panel"><h2>ไพ่ในมือตอนจบ</h2>${pl().map(x => `<p class="small"><b>${esc(x.name)}</b> ${(h.hands[x.sid] || []).map(c => hnCard(c[0], +c.slice(1), 'sm')).join(' ')}</p>`).join('')}</section>${logP}
      ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  }
  const help = my ? `<p class="ask center">👉 ตาคุณ — แตะไพ่ตัวเองเพื่อลง/ทิ้ง${h.clues ? ' หรือแตะชื่อเพื่อนเพื่อใบ้' : ' (คำใบ้หมด ต้องลงหรือทิ้ง)'}</p>`
    : `<p class="muted center">รอ ${esc(pn(h.turn))}…${h.left !== null ? ` · ไพ่หมดกอง เหลืออีก ${h.left} ตา` : ''}</p>`;
  return `${fw}${tok}${help}${myHand}${others}${disc}${logP}`;
}

// ── Toy Battle ──
const TBI = { kwak: 'K', skully: '1', capn: '2', jumbo: '3', hook: '4', xb42: '5', star: '6', roxy: '7' };
const tbTile = (t, cls = '', attr = '') => `<button class="tbt ${cls}" ${attr || 'disabled'}><b>${TB.TROOPS[t].s ?? '?'}</b><span>${TB.TROOPS[t].n}</span><small>${TB.TROOPS[t].d}</small></button>`;
function tbBoard(t, mine, hl) {
  const U = 100, P = (x, y) => [x * U + 60, y * U + 60], seat = sid => t.seats.indexOf(sid);
  const pos = Object.fromEntries([...TB.BASES, ...TB.HQ].map(b => [b.id, P(b.x, b.y)]));
  const lines = TB.EDGES.map(([a, b]) => `<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}"/>`).join('');
  const regs = TB.REGIONS.map(R => { const [x, y] = P(R.x, R.y), by = t.taken[R.id];
    return `<g class="tbreg ${by ? 's' + seat(by) : ''}"><circle cx="${x}" cy="${y}" r="20"/><text x="${x}" y="${y + 7}">${by ? '✓' : R.m}</text></g>`; }).join('');
  const base = b => { const [x, y] = pos[b.id], st = t.stack[b.id], tp = st.at(-1), can = hl.includes(b.id);
    return `<g class="tbbase ${can ? 'can' : ''}" ${can ? `data-act="tbbase" data-b="${b.id}" role="button" aria-label="ฐานแถว ${b.y + 1} ช่อง ${b.x}${tp ? ` (${TB.TROOPS[tp.t].n})` : ' (ว่าง)'}"` : ''}><circle class="ring" cx="${x}" cy="${y}" r="43"/>
      ${tp ? `<circle class="tok s${seat(tp.o)}" cx="${x}" cy="${y}" r="35"/><text class="tkn" x="${x}" y="${y + 10}">${TBI[tp.t]}</text>${st.length > 1 ? `<text class="tkh" x="${x + 26}" y="${y - 22}">${st.length}</text>` : ''}` : ''}</g>`; };
  const hq = (h, i) => { const [x, y] = pos[h.id], can = hl.includes(h.id);
    return `<g class="tbbase hq ${can ? 'can' : ''}" ${can ? `data-act="tbbase" data-b="${h.id}" role="button" aria-label="H.Q. ศัตรู"` : ''}><rect class="hqr s${i}" x="${x - 40}" y="${y - 40}" width="80" height="80" rx="16"/><text class="tkn" x="${x}" y="${y + 9}">HQ</text></g>`; };
  return `<svg class="tbsvg" viewBox="5 5 710 310">${lines}${regs}${TB.BASES.map(base).join('')}${TB.HQ.map(hq).join('')}</svg>`;
}
function tbLog(e) {
  const P = s => `<b>${esc(pn(s))}</b>`;
  return e.t === 'draw' ? `${P(e.sid)} จั่ว` : e.t === 'place' ? `${P(e.sid)} วาง <b>${TB.TROOPS[e.type].n}</b>${e.b.startsWith('hq') ? ' บน H.Q. ศัตรู!' : ''}`
    : e.t === 'medal' ? `🏅 ${P(e.sid)} ล้อมเขตได้ ${e.m} เหรียญ` : e.t === 'jumbo' ? `${P(e.sid)} ใช้ Jumbo เอาของเล่นศัตรูออก` : e.t === 'xb' ? `${P(e.sid)} ใช้ XB-42 ทิ้ง <b>${TB.TROOPS[e.lost].n}</b> จากชั้นวางศัตรู` : '';
}
function tbV() {
  const t = S.pub.tb, v = S.priv, mine = me(), opp = t.seats.find(x => x !== mine), my = t.turn === mine && !t.winner, si = t.seats.indexOf(mine);
  const hl = !my ? [] : t.jumbo ? t.jumbo : S.tbI != null && v.spots[S.tbI] ? v.spots[S.tbI] : [];
  const side = x => `<div class="tbside s${t.seats.indexOf(x)} ${t.turn === x && !t.winner ? 'turn' : ''}">${av(x, 'sm')}<b>${esc(pn(x))}${x === mine ? ' (คุณ)' : ''}</b>
      <span>🏅 ${t.medals[x]}/${TB.OBJECTIVE}</span><span>ชั้นวาง ${t.rackN[x]}</span><span>กอง ${t.resN[x]}</span></div>`;
  const logP = `<section class="panel"><h2>เหตุการณ์</h2><ul class="bdlog">${[...t.log].reverse().map(e => `<li>${tbLog(e)}</li>`).join('') || '<li class="muted">ยังไม่มี</li>'}</ul></section>`;
  if (t.winner) {
    return `<div class="banner ${t.winner === mine ? 'win' : 'lose'}"><div class="bt">${t.winner === mine ? 'คุณชนะ!' : `${esc(pn(t.winner))} ชนะ`}</div>
      <div>${t.why === 'hq' ? 'ยึด H.Q. ศัตรูได้' : t.why === 'medals' ? `เก็บเหรียญครบ ${TB.OBJECTIVE}` : 'อีกฝ่ายไม่มีอะไรให้ทำแล้ว นับเหรียญ'}</div></div>
      <div class="tbsides">${side(t.seats[0])}${side(t.seats[1])}</div>${tbBoard(t, mine, [])}${logP}
      ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  }
  let help = '';
  if (my) help = t.jumbo ? `<p class="ask center">Jumbo: แตะของเล่นศัตรูที่อยู่ติดกันเพื่อเอาออก ${btn('tbskip', 'ไม่เอาออก', 'ghost small')}</p>`
    : t.extra ? `<p class="ask center">Cap'N: วางได้อีก 1 ตัว ${btn('tbskip', 'ข้าม', 'ghost small')}</p>`
    : S.tbI != null ? `<p class="ask center">${hl.length ? 'แตะฐานที่เรืองแสงเพื่อวาง' : 'ตัวนี้วางที่ไหนไม่ได้ตอนนี้'}</p>` : '<p class="ask center">👉 ตาคุณ — เลือกของเล่นแล้วแตะฐาน หรือจั่ว 2 ตัว</p>';
  else help = `<p class="muted center">รอ ${esc(pn(t.turn))}…</p>`;
  return `<div class="tbsides">${side(t.seats[0])}${side(t.seats[1])}</div>${help}
    <section class="panel tbwrap">${tbBoard(t, mine, hl)}<p class="muted small center">คุณคือฝั่ง${si === 0 ? 'น้ำเงิน (ซ้าย)' : 'แดง (ขวา)'} · ตัวเลข = พลัง · K = Kwak · เลขมุมขวา = จำนวนชั้นที่ซ้อน</p></section>
    <section class="panel myhand"><h2>ชั้นวางของคุณ ${v.rack.length}/${TB.RACK}</h2>
      <div class="tbrack s${si}">${v.rack.map((x, i) => tbTile(x, `${S.tbI === i ? 'on' : ''} ${my && !t.jumbo && v.spots[i]?.length ? '' : 'dim'}`, my && !t.jumbo ? `data-act="tbsel" data-i="${i}"` : '')).join('') || '<p class="muted">ว่าง</p>'}</div>
      ${my && !t.jumbo && !t.extra ? btn('tbdraw', '🎴 จั่ว 2 ตัว', 'ghost wide', {}, t.resN[mine] === 0 || v.rack.length >= TB.RACK) : ''}</section>
    ${logP}`;
}

// ── I'm Stuck in the Lift ──
const lfStars = i => '★'.repeat(LF.STARS[i]);
function lfV() {
  const L = S.pub.lf, v = S.priv, mine = me(), n = pl().length, f = LF.fname;
  const building = `<div class="lfb">${[...LF.FLOORS].reverse().map(fl => {
    const my = [0, 1].filter(i => v.tg[i] === fl), here = L.lift === fl;
    return `<div class="lff ${here ? 'here' : ''} ${L.cone === fl ? 'cone' : ''} ${fl === 0 || fl === 40 ? 'x2' : ''}">
      <span class="lfn">${f(fl)}${fl === 0 || fl === 40 ? '<small>×2</small>' : ''}</span>
      <span class="lfshaft">${here ? `<span class="lfcar">${gi('lift')}<b>${L.dir > 0 ? '▲' : '▼'}</b></span>` : ''}</span>
      <span class="lfmark">${L.cone === fl ? `<span class="lfcone">${gi('cone')}</span>` : ''}${my.map(i => `<span class="lftag s${i}">${lfStars(i)}</span>`).join('')}</span>
    </div>`; }).join('')}</div>`;
  const score = `<div class="lfpts">${[...pl()].sort((a, b) => L.pts[b.sid] - L.pts[a.sid]).map(x => `<span class="${L.winners.includes(x.sid) ? 'won' : ''}">${av(x.sid, 'sm')}${esc(x.name)} <b>${L.pts[x.sid]}</b></span>`).join('')}</div>`;
  const head = `<p class="center skstatus">รอบ <b>${L.round}</b>${L.last ? ' (รอบสุดท้าย!)' : ''} · กรวยอยู่ชั้น <b>${f(L.cone)}</b></p>`;
  if (L.phase === 'end') {
    const win = L.winners.includes(mine);
    return `<div class="banner ${win ? 'win' : 'lose'}"><div class="bt">${L.winners.length > 1 ? 'เสมอ! ชนะร่วมกัน' : `🏆 ${esc(pn(L.winners[0]))} ชนะ!`}</div><div>${L.winners.map(s => esc(pn(s))).join(', ')} · ${L.pts[L.winners[0]]} แต้ม</div></div>
      ${score}${building}
      ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  }
  let act = '';
  const need = [0, 1].filter(i => v.tg[i] == null);
  if (L.phase === 'write') {
    if (!need.length) act = `<section class="panel center"><p>✔ เขียนชั้นแล้ว รอคนอื่น… (${L.wrote.length}/${n})</p></section>`;
    else {
      const i = need.includes(S.lfI) ? S.lfI : need[0];
      act = `<section class="panel"><h2>เขียนชั้นเป้าหมาย (ลับ)</h2>
        <div class="row">${need.map(k => `<button class="lfcard s${k} ${k === i ? 'on' : ''}" data-act="lfcard" data-i="${k}"><b>${lfStars(k)}</b><small>${LF.STARS[k]} แต้ม</small></button>`).join('')}</div>
        <p class="small muted">การ์ด ${lfStars(i)} ไปชั้นไหน? (เขียนชั้นเดียวกันทั้ง 2 ใบก็ได้)</p>
        <div class="lfpick">${LF.FLOORS.map(fl => `<button class="pick ${fl === L.cone ? 'warn' : ''}" data-act="lfwrite" data-i="${i}" data-f="${fl}">${f(fl)}${fl === 0 || fl === 40 ? ' ×2' : ''}${fl === L.cone ? ' 🚧' : ''}</button>`).join('')}</div></section>`;
    }
  } else if (L.phase === 'drive') {
    act = v.drive != null ? `<section class="panel center"><p>✔ กดปุ่ม <b>${v.drive}</b> แล้ว รอคนอื่น… (${L.drove.length}/${n})</p></section>`
      : `<section class="panel"><h2>กดลิฟต์ (ลับ) — ทุกคนรวมกันแล้วลิฟต์วิ่งเท่านั้นชั้น</h2>
        <div class="lfdrives">${LF.DRIVES.map(d => `<button class="lfdrv" data-act="lfdrive" data-v="${d}"><b>${d}</b><small>${d / 5} ชั้น</small></button>`).join('')}</div>
        <p class="small muted center">ลิฟต์วิ่งไปทาง ${L.dir > 0 ? 'ขึ้น ▲' : 'ลง ▼'} ชนชั้นบนสุด/ล่างสุดแล้วกลับทาง · หยุดชั้นกรวย 🚧 ใครเขียนชั้นนั้นไม่ได้แต้มและต้องเขียนใหม่ทั้ง 2 ใบ</p></section>`;
  } else if (L.phase === 'result') {
    const r = L.res;
    act = `<section class="panel lfres"><h2>ลิฟต์วิ่ง ${r.total / 5} ชั้น: ${f(r.from)} → <b>${f(r.to)}</b>${r.cone ? ' 🚧' : ''}</h2>
      <p class="small muted">${pl().map(x => `${esc(x.name)} ${r.drives[x.sid]}`).join(' · ')}</p>
      ${Object.keys(r.hit).length ? Object.keys(r.hit).map(s => `<p>${esc(pn(s))} ${r.cone ? '🚧 เจอกรวย ไม่ได้แต้ม' : `<b class="ok-text">+${r.gain[s]}</b>${r.mult > 1 ? ' (×2)' : ''}`}</p>`).join('') : '<p class="muted">ไม่มีใครได้แต้มรอบนี้</p>'}
      <div class="timer" data-timer></div></section>`;
  }
  return `${head}${act}${building}${score}`;
}

// ── World Championship Russian Roulette ──
const rrCard = (c, cls = '') => `<span class="rrc ${c === 'B' ? 'bang' : 'click'} ${cls}">${c === 'B' ? '<b>ปัง!</b>' : '<b>แชะ</b>'}</span>`;
const rrTeam = sid => `<span class="rrteam">${Array.from({ length: RR.TEAM }, (_, i) => `<span class="${i < S.pub.rr.team[sid] ? 'up' : 'down'} ${i === RR.TEAM - 1 ? 'cap' : ''}">${i === RR.TEAM - 1 ? gi('crown') : gi('people')}</span>`).join('')}</span>`;
function rrLog(e) {
  const P = s => `<b>${esc(pn(s))}</b>`;
  return e.t === 'dead' ? `💀 ${P(e.sid)} เสีย${e.captain ? 'กัปตัน — ตกรอบทั้งทีม' : 'ลูกทีม 1 คน'} (${e.why === 'caught' ? 'โดนจับได้ว่าโกง' : 'โดนกระสุน'})`
    : e.t === 'accuse' ? `${e.by.map(P).join(', ')} กล่าวหา ${P(e.to)} — ${e.cheat ? '<b class="bad-text">โกงจริง!</b>' : 'บริสุทธิ์ คนกล่าวหาได้กระสุนเพิ่มในปืน'}`
    : e.t === 'card' ? `${P(e.sid)} ใช้การ์ด <b>${RR.CARDS[e.card].n}</b>${e.to ? ` ใส่ ${P(e.to)}` : ''}${e.bid != null ? ` → เดิมพัน ${e.bid}` : ''}` : '';
}
function rrV() {
  const r = S.pub.rr, v = S.priv, mine = me(), alive = r.team[mine] > 0, ps = pl().filter(x => r.team[x.sid] > 0);
  const status = x => r.phase === 'pocket' ? (r.pocketed.includes(x.sid) ? '✔ เก็บแล้ว' : 'กำลังเลือก…') : r.phase === 'bid' ? (r.locked.includes(x.sid) ? '✔ ล็อกแล้ว' : 'กำลังคิด…')
    : r.dead[x.sid] ? '<b class="bad-text">ตายรอบนี้</b>' : r.bids ? `เดิมพัน <b>${r.bids[x.sid]}</b>${r.extra[x.sid] ? ` <span class="bad-text">+${r.extra[x.sid]}</span>` : ''}${r.phase === 'trigger' || r.phase === 'score' ? ` · ยิงแล้ว ${r.pulled[x.sid] || 0}` : ''}` : '';
  const lp = r.lastPull?.cards || {};
  const board = `<div class="rrboard">${pl().map(x => `<div class="rrp ${r.team[x.sid] ? '' : 'gone'} ${r.dead[x.sid] ? 'died' : ''}" style="--ph:${hueOf(x.sid)}">
      <span class="rrn">${av(x.sid, 'sm')}<b>${esc(x.name)}${x.sid === mine ? ' <em>(คุณ)</em>' : ''}</b><span class="rrpts">${r.pts[x.sid]}</span></span>
      ${rrTeam(x.sid)}<span class="rrs">${r.team[x.sid] ? status(x) : 'ตกรอบแล้ว'}</span>
      ${r.phase === 'trigger' && lp[x.sid] ? rrCard(lp[x.sid], 'flipin') : ''}${r.acc[x.sid] ? `<span class="rracc">🫵 กล่าวหา ${esc(pn(r.acc[x.sid]))}</span>` : ''}
      ${r.reveal?.[x.sid] ? `<span class="rracc">ในกระเป๋า: ${rrCard(r.reveal[x.sid], 'sm')}</span>` : ''}</div>`).join('')}</div>`;
  const myCards = v.cards?.length ? `<section class="panel"><h2>การ์ดแอ็กชันของคุณ</h2><div class="rrcards">${v.cards.map(c => `<button class="rrac ${S.rrC === c ? 'on' : ''}" data-act="rrcard" data-c="${c}" ${RR.CARDS[c].when === r.phase && alive ? '' : 'disabled'}><b>${RR.CARDS[c].n}</b><small>${RR.CARDS[c].d}</small></button>`).join('')}</div>
      ${S.rrC === 'bang' ? `<p class="small muted">ยิงใคร?</p><div class="picks">${ps.filter(x => !r.dead[x.sid]).map(x => `<button class="pick" data-act="rrarg" data-arg="${x.sid}">${esc(x.name)}</button>`).join('')}</div>`
        : S.rrC === 'change' ? `<p class="small muted">เดิมพันใหม่</p><div class="picks c3">${[0, 1, 2, 3, 4, 5].map(n => `<button class="pick" data-act="rrarg" data-arg="${n}">${n}</button>`).join('')}</div>` : ''}</section>` : '';
  const gun = alive ? `<p class="center small muted">${gi('rrcyl', 'inl')} ปืนของคุณ: ${v.gun.n} ใบ (ปัง ${v.gun.b} ใบ)${v.pocket ? ` · ในกระเป๋า: ${v.pocket === 'B' ? 'ปัง! (โกงอยู่ 🤫)' : 'แชะ'}` : ''}</p>` : '';
  const logP = `<section class="panel"><h2>เหตุการณ์</h2><ul class="bdlog">${[...r.log].reverse().filter(e => e.t !== 'bids').map(e => `<li>${rrLog(e)}</li>`).join('') || '<li class="muted">ยังไม่มี</li>'}</ul></section>`;
  const head = `<p class="center skstatus">รอบที่ <b>${r.round}</b> · ถึง ${RR.WIN} แต้มชนะ</p>`;
  if (r.phase === 'end') {
    return `<div class="banner ${r.winner === mine ? 'win' : 'lose'}"><div class="bt">${r.winner ? `🏆 ${esc(pn(r.winner))} แชมป์โลก!` : 'ไม่มีใครรอด — ไม่มีแชมป์'}</div></div>${board}${logP}
      ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  }
  let main = '';
  // (an eliminated host still runs the round: the score screen with its button must stay)
  if (!alive && r.phase !== 'score') main = '<section class="panel center"><p>ทีมคุณตกรอบแล้ว ดูต่อได้</p></section>';
  else if (r.phase === 'pocket') main = v.pocket ? '<section class="panel center"><p>✔ เก็บการ์ดเข้ากระเป๋าแล้ว รอคนอื่น…</p></section>'
    : `<section class="panel"><h2>1. เก็บการ์ด 1 ใบเข้ากระเป๋า</h2><p class="small muted">เก็บ "แชะ" = เล่นซื่อ · เก็บ "ปัง!" = โกง ปืนจะไม่มีกระสุน แต่ถ้าโดนจับ ลูกทีมตาย</p>
      <div class="row rrpick"><button class="rrbig click" data-act="rrpocket" data-c="C"><b>แชะ</b><small>เล่นซื่อ</small></button>${v.gun.b ? '<button class="rrbig bang" data-act="rrpocket" data-c="B"><b>ปัง!</b><small>โกง 🤫</small></button>' : ''}</div></section>`;
  else if (r.phase === 'bid') main = v.bid != null ? `<section class="panel center"><p>✔ ล็อกเดิมพัน <b>${v.bid}</b> แล้ว รอคนอื่น…</p></section>`
    : `<section class="panel"><h2>2. เดิมพัน — จะเหนี่ยวไกกี่ครั้ง?</h2><p class="small muted">รอดได้แต้ม = เดิมพัน + 1 · ตายไม่ได้อะไร</p>
      ${v.peek ? `<p class="small">แอบส่อง 3 ใบบนสุด: ${v.peek.map(c => rrCard(c, 'sm')).join(' ')}</p>` : ''}
      <div class="picks c3">${[0, 1, 2, 3, 4, 5].map(n => `<button class="pick ${S.rrN === n ? 'on' : ''}" data-act="rrn" data-n="${n}">${n}</button>`).join('')}</div>
      ${btn('rrbid', S.rrN != null ? `🔒 ล็อกเดิมพัน ${S.rrN}` : 'เลือกตัวเลขก่อน', 'primary wide', {}, S.rrN == null)}</section>`;
  else if (r.phase === 'challenge') {
    const done = r.cdone.includes(mine);
    main = `<section class="panel"><h2>3. จับโกง!</h2><p class="small muted">สงสัยใครซ่อนกระสุนไว้ในกระเป๋า? กล่าวหาได้ 1 คน · ถูก = เขาเสียลูกทีม คุณได้การ์ด 3 ใบ · ผิด = คุณได้กระสุนเพิ่มในปืน</p>
      ${done ? '<p class="center ok-text">✔ พร้อมแล้ว รอคนอื่น</p>' : `${r.acc[mine] ? '' : `<div class="picks">${ps.filter(x => x.sid !== mine).map(x => `<button class="pick" data-act="rracc" data-sid="${x.sid}">🫵 ${esc(x.name)}</button>`).join('')}</div>`}
        ${btn('rrready', r.acc[mine] ? '✔ ไปต่อ' : '✔ ไม่กล่าวหาใคร ไปต่อ', 'primary wide')}`}
      <p class="small muted center">พร้อม ${r.cdone.length}/${ps.length}</p>${isHostView() ? btn('rrgo', '⏭ ไปเหนี่ยวไกเลย', 'ghost wide') : ''}</section>`;
  } else if (r.phase === 'trigger') main = `<section class="panel center rrtrig"><h2>4. เหนี่ยวไก!</h2><div class="rrcount">${r.k ? `นัดที่ ${r.k}` : 'เตรียม… 3 2 1'}</div><div class="timer" data-timer></div></section>`;
  else if (r.phase === 'score') main = `<section class="panel"><h2>5. นับแต้ม</h2>${ps.concat(pl().filter(x => !r.team[x.sid] && r.dead[x.sid])).map(x => `<p>${esc(x.name)}: ${r.dead[x.sid] ? '💀 ไม่ได้แต้ม' : `<b>+${r.res.gain[x.sid]}</b>`}</p>`).join('')}
      ${isHostView() ? btn('rrnext', '▶ รอบต่อไป', 'primary wide big') : '<p class="muted center">รอเจ้าของห้องเริ่มรอบต่อไป…</p>'}</section>`;
  return `${head}${main}${gun}${board}${myCards}${logP}`;
}

// ── Order Overload: Cafe ──
const odCard = (id, cls = '', attr = '') => { const m = OD.MENU[id]; return `<${attr ? 'button' : 'div'} class="ocard t-${m.t || 'X'} ${cls}" ${attr}>${gi(m.t ? 'odcup' : 'cheese')}<b>${OD.MENU[id].n}</b>${m.t ? `<small>${OD.TEMP[m.t]}</small>` : ''}</${attr ? 'button' : 'div'}>`; };
function odMenu(sel, can) {
  const cell = id => OD.MENU[id] ? `<button class="omi t-${OD.MENU[id].t || 'X'} ${sel === id ? 'on' : ''}" data-act="odsel" data-i="${id}" ${can ? '' : 'disabled'}>${OD.MENU[id].n}</button>` : '<span></span>';
  return `<div class="omenu"><span></span><b>ร้อน</b><b>เย็น</b><b>ปั่น</b>
    ${OD.BASES.map(([k, n]) => `<span class="omb">${n}</span>${['H', 'I', 'F'].map(t => cell(`${k}.${t}`)).join('')}`).join('')}</div>
    <div class="omo">${OD.OTHER.map(([k]) => cell(k)).join('')}</div>`;
}
function odV() {
  const o = S.pub.od, v = S.priv, mine = me(), n = pl().length, my = o.turn === mine && o.phase === 'play';
  const head = `<p class="center skstatus">ด่าน <b>${o.level}</b>/${OD.LEVELS} · มือหมดแล้ว <b>${o.done}</b>/${o.need} คน</p>`;
  if (o.phase === 'read') return `${head}<h1 class="ph">${gi('mic', 'inl')} ฟังออร์เดอร์!</h1>
    <p class="center muted small">ออร์เดอร์ ${o.ri + 1} จาก ${o.total} · จำให้ดี จะโชว์แค่ครั้งเดียว</p>
    <div class="oread">${odCard(o.cur, 'big')}</div><div class="timer" data-timer></div>
    <p class="center muted small">ทุกใบจะถูกสับแล้วแจกคนละ ${o.level} ใบ — คุณจะเห็นแค่ของตัวเอง</p>`;
  const pls = `<div class="opls">${pl().map(x => `<div class="opl ${x.sid === o.turn ? 'turn' : ''} ${o.lives[x.sid] ? '' : 'out'}" style="--ph:${hueOf(x.sid)}">
      ${av(x.sid, 'sm')}<b>${esc(x.name)}${x.sid === mine ? ' <em>(คุณ)</em>' : ''}</b>
      <span class="ost">${gi('cards', 'inl')}${o.n[x.sid]} ${Array.from({ length: OD.lives0(n) }, (_, i) => `<span class="osm ${i < o.lives[x.sid] ? '' : 'off'}">${i < o.lives[x.sid] ? '☺' : '☹'}</span>`).join('')}</span></div>`).join('')}</div>`;
  const last = o.last ? `<p class="center olast ${o.last.hit ? 'ok' : 'bad'}">${esc(pn(o.last.by))} เรียก <b>${OD.MENU[o.last.item].n}</b> — ${o.last.hit ? `${esc(pn(o.last.hit))} เสิร์ฟแล้ว ✔` : 'ไม่มีใครมี ✘ หน้ายิ้มคว่ำ'}</p>` : '';
  const hints = o.hints.length ? `<section class="panel"><h2>คำใบ้</h2>${o.hints.map(h => `<p class="small">${esc(pn(h.to))} มีออร์เดอร์ที่ขึ้นต้นด้วย <b class="och notr">${esc(lang === 'en' && h.id ? T(OD.MENU[h.id].n)[0] : h.ch)}</b></p>`).join('')}</section>` : '';
  const table = o.table.length ? `<section class="panel"><h2>เสิร์ฟแล้ว ${o.table.length} ใบ</h2><div class="otable">${o.table.map(t => odCard(t.item, 'sm')).join('')}</div></section>` : '';
  if (o.phase === 'clear' || o.phase === 'over') {
    const win = o.phase === 'clear' || o.over === 'win';
    return `<div class="banner ${win ? 'win' : 'lose'}"><div class="bt">${o.phase === 'clear' ? `ผ่านด่าน ${o.level}!` : o.over === 'win' ? `ผ่านครบ ${OD.LEVELS} ด่าน!` : `จบที่ด่าน ${o.level}`}</div>
      <div>${o.phase === 'over' && o.over === 'lose' ? `ผ่านได้สูงสุด ${o.best} ด่าน` : 'ร้านไม่ล่ม เก่งมาก'}</div></div>${last}
      <section class="panel"><h2>ออร์เดอร์ที่ยังค้างในมือ</h2>${pl().map(x => `<p class="small"><b>${esc(x.name)}</b>: ${o.left[x.sid].length ? o.left[x.sid].map(i => OD.MENU[i].n).join(', ') : '— ว่าง'}</p>`).join('')}</section>
      ${isHostView() ? (o.phase === 'clear' ? btn('odnext', `▶ ด่าน ${o.level + 1}`, 'primary wide big') : `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>`) : '<p class="muted center">รอเจ้าของห้องไปต่อ…</p>'}`;
  }
  const abLeft = S.priv && o.ab[mine] ? o.ab[mine].filter(k => !o.used[mine].includes(k)) : [];
  let abArea = '';
  if (abLeft.length) {
    abArea = `<section class="panel"><h2>การ์ดพิเศษ (ใช้ได้ครั้งเดียว)</h2><div class="row">${abLeft.map(k => btn('odab', k === 'drop' ? '🗑️ ทิ้งออร์เดอร์' : '🔤 ขอคำใบ้', S.odAb === k ? 'primary' : 'ghost', { k })).join('')}</div>
      ${S.odAb === 'drop' ? `<p class="small muted">แตะใบที่จะทิ้ง</p><div class="ohand">${v.hand.map((id, i) => odCard(id, '', v.hand.length > 1 ? `data-act="oduse" data-arg="${i}"` : 'disabled')).join('')}</div>`
        : S.odAb === 'hint' ? `<p class="small muted">ขอคำใบ้จากใคร?</p><div class="picks">${pl().filter(x => x.sid !== mine && o.n[x.sid]).map(x => `<button class="pick" data-act="oduse" data-arg="${x.sid}">${esc(x.name)}</button>`).join('')}</div>` : ''}</section>`;
  }
  return `${head}${last}${pls}
    <section class="panel"><h2>มือของคุณ <span class="muted small">(ห้ามบอกคนอื่น)</span></h2><div class="ohand">${v.hand.length ? v.hand.map(id => odCard(id)).join('') : '<p class="muted">ว่างแล้ว ✔</p>'}</div></section>
    <section class="panel"><h2>${my ? '👉 ตาคุณ — เรียกออร์เดอร์ที่อยู่ในมือ<u>คนอื่น</u>' : o.lives[mine] ? `รอ ${esc(pn(o.turn))} เรียกออร์เดอร์…` : 'หน้ายิ้มคว่ำแล้ว เรียกไม่ได้ (แต่ใช้การ์ดพิเศษได้)'}</h2>
      ${odMenu(my ? S.odSel : null, my)}${my ? btn('odcall', S.odSel ? `📣 เรียก "${OD.MENU[S.odSel].n}"` : 'เลือกเมนูก่อน', 'primary wide big', {}, !S.odSel) : ''}</section>
    ${abArea}${hints}${table}`;
}

// ── Bang! The Dice Game ──
const BD_ROLE = { S: ['นายอำเภอ', 'star', 'กำจัดโจรและคนทรยศให้หมด'], D: ['ผู้ช่วยนายอำเภอ', 'shield', 'ปกป้องนายอำเภอ กำจัดโจรและคนทรยศ'], O: ['โจร', 'skull', 'ฆ่านายอำเภอ'], R: ['คนทรยศ', 'masks', 'เป็นคนสุดท้ายที่รอด (นายอำเภอต้องตายเป็นคนสุดท้าย)'] };
const BD_FACE = { arrow: ['bdarrow', 'ธนู'], dyn: ['bddyn', 'ระเบิด'], one: ['target', 'ยิงระยะ 1'], two: ['target', 'ยิงระยะ 2'], beer: ['bdbeer', 'เบียร์'], gat: ['bdgat', 'แกตลิง'] };
const bdDie = (f, cls = '', attr = '') => `<button class="bdie f-${f} ${cls}" ${attr || 'disabled'} title="${BD_FACE[f][1]}">${gi(BD_FACE[f][0])}${f === 'one' ? '<b>1</b>' : f === 'two' ? '<b>2</b>' : ''}</button>`;
function bdLog(e) {
  const P = s => `<b>${esc(pn(s))}</b>`;
  return e.t === 'roll' ? `${P(e.sid)} ทอยครั้งที่ ${e.k}` : e.t === 'shot' ? `${P(e.sid)} ยิง ${P(e.to)} (ระยะ ${e.d})` : e.t === 'beer' ? (e.sid === e.to ? `${P(e.sid)} ดื่มเบียร์ +1` : `${P(e.sid)} ให้เบียร์ ${P(e.to)} +1`)
    : e.t === 'boom' ? `💥 ระเบิดใส่ ${P(e.sid)} −1` : e.t === 'gatling' ? `${P(e.sid)} ยิงแกตลิง! ทุกคน −1` : e.t === 'indians' ? '🏹 อินเดียนแดงบุก! เสียชีวิตเท่าจำนวนธนูที่ถือ'
    : e.t === 'dead' ? `☠️ ${P(e.sid)} ตาย — เป็น<b>${BD_ROLE[e.role][0]}</b>` : '';
}
function bdV() {
  const b = S.pub.bd, v = S.priv, mine = me(), my = b.turn === mine && !b.winner, R = BD_ROLE[v.role];
  const targets = my && b.need ? (b.need === 'beer' ? b.alive : b.tg) : [];
  const mats = `<div class="bdmats">${pl().map(x => {
    const dead = !b.alive.includes(x.sid), r = b.roles[x.sid], can = targets.includes(x.sid);
    return `<${can ? 'button' : 'div'} class="bdmat ${dead ? 'dead' : ''} ${x.sid === b.turn && !b.winner ? 'turn' : ''} ${can ? 'can' : ''} ${b.wsids.includes(x.sid) ? 'won' : ''}" style="--ph:${hueOf(x.sid)}" ${can ? `data-act="bdtarget" data-sid="${x.sid}"` : ''}>
      <span class="bdname">${av(x.sid, 'sm')}<b>${esc(x.name)}${x.sid === mine ? ' <em>(คุณ)</em>' : ''}</b></span>
      <span class="bdrole">${r ? `${gi(BD_ROLE[r][1], r === 'S' ? 'gold inl' : 'inl')}${BD_ROLE[r][0]}` : `${gi('qmark', 'dim inl')}ยังไม่เปิดเผย`}</span>
      <span class="bdstat">${dead ? `${gi('skull', 'inl')} ตายแล้ว` : `<span class="bdlife">${gi('heart', 'hp')}<b>${b.life[x.sid]}</b><small>/${b.max[x.sid]}</small></span><span class="bdarr">${gi('bdarrow', 'inl')}<b>${b.arrows[x.sid]}</b></span>`}</span>
    </${can ? 'button' : 'div'}>`; }).join('')}</div>`;
  const roleLine = `<section class="panel bdmine"><span>${gi(R[1], v.role === 'S' ? 'gold inl' : 'inl')}คุณคือ <b>${R[0]}</b></span><small class="muted">${R[2]}</small></section>`;
  if (b.winner) {
    const iWin = b.wsids.includes(mine);
    return `<div class="banner ${iWin ? 'win' : 'lose'}"><div class="bt">${b.winner === 'S' ? 'ฝ่ายกฎหมายชนะ!' : b.winner === 'O' ? 'โจรชนะ!' : 'คนทรยศชนะ!'}</div><div>${b.wsids.map(s => esc(pn(s))).join(', ')}</div></div>
      ${mats}<section class="panel"><h2>เหตุการณ์ล่าสุด</h2><ul class="bdlog">${b.log.map(e => `<li>${bdLog(e)}</li>`).join('')}</ul></section>
      ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
  }
  const rolling = b.phase === 'roll', left = BD.ROLLS - b.rolls, keep = S.bdKeep;
  const dice = b.dice ? `<div class="bdice">${b.dice.map((f, i) => bdDie(f, `${my && rolling && keep.includes(i) ? 'keep' : ''} ${f === 'dyn' ? 'lock' : ''}`, my && rolling && f !== 'dyn' ? `data-act="bdsel" data-i="${i}"` : '')).join('')}</div>` : `<div class="bdice empty">${gi('dice')}</div>`;
  let act = '';
  if (my && rolling) {
    const re = b.dice ? b.dice.filter((f, i) => f !== 'dyn' && !keep.includes(i)).length : 0;
    act = !b.dice ? btn('bdroll', '🎲 ทอยเต๋า', 'primary wide big')
      : `<p class="muted small center">แตะลูกที่จะ<b>เก็บไว้</b> · ระเบิดทอยใหม่ไม่ได้ · ธนูต้องหยิบทันทีทุกครั้งที่ทอยได้</p>
         <div class="row">${btn('bdstop', '✔ พอแล้ว ใช้เต๋า', 'ghost')}${btn('bdroll', `🎲 ทอยใหม่ ${re} ลูก (เหลือ ${left})`, 'primary', {}, !re)}</div>`;
  } else if (my && b.need) {
    const k = b.need, nleft = b.todo[k];
    act = `<p class="ask center">${k === 'beer' ? `🍺 เบียร์ ${nleft} แก้ว — แตะคนที่จะรักษา (รวมตัวเองได้)` : `🎯 ยิงระยะ ${k === 'one' ? 1 : 2} อีก ${nleft} นัด — แตะเป้าที่มีกรอบสว่าง`}</p>`;
  } else if (!my) act = `<p class="muted center">${rolling ? `รอ ${esc(pn(b.turn))} ทอยเต๋า…` : `รอ ${esc(pn(b.turn))} เลือกเป้า…`}</p>`;
  return `<p class="center skstatus">ตาของ <b>${esc(pn(b.turn))}</b>${my ? ' (คุณ)' : ''} · กองธนู ${gi('bdarrow', 'inl')}<b>${b.pile}</b></p>
    <section class="panel bdtable">${dice}${act}</section>${mats}${roleLine}
    <section class="panel"><h2>เหตุการณ์ล่าสุด</h2><ul class="bdlog">${[...b.log].reverse().map(e => `<li>${bdLog(e)}</li>`).join('')}</ul></section>`;
}

// ── Cheese Thief ──
const ctDie = (n, cls = '') => `<span class="cdie ${cls}">${n}</span>`;
const CT_ROLE = { thief: ['โจรขโมยชีส', 'robber', 'ขโมยชีสตอนที่คุณตื่น แล้วอย่าให้โดนโหวตจับ'], follower: ['ลูกสมุนของโจร', 'minion', 'คุณชนะพร้อมโจร ช่วยปั่นให้คนอื่นโหวตผิด (คุณไม่รู้ว่าโจรคือใคร)'], mouse: ['หนูขี้เซา', 'moon', 'ช่วยกันหาว่าใครขโมยชีส แล้วโหวตจับให้ถูก'] };
function ctMemo(v) {
  const m = v.memo;
  if (!m) return `<p class="muted">คุณจะตื่นตอน <b>ตี ${v.die}</b></p>`;
  const cheese = m.cheese === 'here' ? `${gi('cheese', 'gold inl')} ชีส<b>ยังอยู่</b>` : m.cheese === 'gone' ? `${gi('cheese', 'dim inl')} ชีส<b>หายไปแล้ว</b>`
    : v.role === 'thief' ? `${gi('robber', 'inl')} <b>คุณขโมยชีส</b>ตอนนี้` : `${gi('robber', 'inl')} เห็น <b>${esc(pn(v.thief))}</b> กำลังขโมยชีส!`;
  return `<ul class="ctmemo"><li>${gi('eye', 'inl')} ตื่นตอน <b>ตี ${m.h}</b></li>
    <li>${gi('people', 'inl')} ${m.with.length ? `ตื่นพร้อมกับ ${m.with.map(s => `<b>${esc(pn(s))}</b>`).join(', ')}` : 'ตื่น<b>คนเดียว</b>'}</li>
    <li>${cheese}</li>${m.peek ? `<li>${gi('dice', 'inl')} แอบดูเต๋าของ <b>${esc(pn(m.peek.t))}</b> ได้เลข <b>${m.peek.d}</b></li>` : ''}</ul>`;
}
function ctV() {
  const c = S.pub.ct, v = S.priv, mine = me(), n = pl().length, others = pl().filter(x => x.sid !== mine);
  const R = CT_ROLE[v.role] || CT_ROLE.mouse;
  const mineCard = () => secret(`<span class="role t-${v.role === 'mouse' ? 'village' : 'wolf'}">${art(R[1])}<span class="rn">${R[0]}</span><span class="rd">${R[2]}</span></span>
    <span class="ctdrow">ลูกเต๋าของคุณ ${ctDie(v.die, 'big')}<small>ตื่นตอนตี ${v.die}</small></span>`, 'แตะเพื่อดูบทบาทและลูกเต๋า');
  if (c.phase === 'role') {
    const rd = c.ready || [];
    return `<h1 class="ph">ดูบทบาทและลูกเต๋า</h1>${mineCard()}${v.ready ? '<p class="center ok-text">✔ คุณพร้อมแล้ว</p>' : btn('ready', 'ดูแล้ว พร้อม', 'primary wide big')}
      <section class="panel"><h2>พร้อม ${rd.length}/${n}</h2>${players({ ready: rd })}</section>
      ${isHostView() ? btn('ctstart', rd.length >= n ? '🌙 เริ่มกลางคืน' : `🌙 เริ่มกลางคืน (พร้อม ${rd.length}/${n})`, 'primary wide big') : ''}`;
  }
  if (c.phase === 'pick') {
    return `<h1 class="ph">${gi('moon', 'inl')} ค่ำแล้ว…</h1><div class="timer big" data-timer></div>
      ${v.role === 'thief' ? `<section class="panel"><h2>เลือกลูกสมุน 1 คน</h2><p class="muted small">เขาจะรู้ว่าตัวเองเป็นลูกสมุน แต่ไม่รู้ว่าคุณคือโจร · ไม่เลือกจะสุ่มให้</p>
        <div class="picks">${others.map(x => `<button class="pick ${v.picked === x.sid ? 'on' : ''}" data-act="ctpick" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div></section>`
        : '<section class="panel center"><p>ทุกคนกำลังเข้านอน</p><p class="muted small">เก็บจอไว้ให้ดี อย่าให้ใครเห็น</p></section>'}`;
  }
  if (c.phase === 'night') {
    const hours = `<div class="cthours">${Array.from({ length: CZ.HOURS }, (_, i) => `<span class="${i + 1 < c.hour ? 'past' : i + 1 === c.hour ? 'now' : ''}">${i + 1}</span>`).join('')}</div>`;
    const body = v.awake
      ? `<section class="panel ctawake"><h2>${gi('eye', 'inl')} คุณตื่น!</h2>${ctMemo(v)}
          ${v.canPeek ? `<p class="ask">ตื่นคนเดียว — แอบดูเต๋าได้ 1 คน</p><div class="picks">${others.map(x => `<button class="pick" data-act="ctpeek" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div>` : ''}</section>`
      : `<section class="panel center ctsleep"><div class="zzz">${gi('moon')}</div><p>คุณหลับอยู่</p>${v.memo ? '' : `<p class="muted small">จะตื่นตอนตี ${v.die}</p>`}</section>${v.memo ? `<section class="panel"><h2>สิ่งที่คุณเห็น</h2>${ctMemo(v)}</section>` : ''}`;
    return `<h1 class="ph">${gi('moon', 'inl')} ตี ${c.hour}</h1>${hours}<div class="timer big" data-timer></div>${body}`;
  }
  if (c.phase === 'day' || c.phase === 'vote') {
    const mem = `<section class="panel"><h2>สิ่งที่คุณรู้ <span class="muted small">(${R[0]} · เต๋า ${v.die})</span></h2>${ctMemo(v)}</section>`;
    if (c.phase === 'day') return `<h1 class="ph">${gi('sun', 'inl')} เช้าแล้ว ชีสหาย!</h1>
      <p class="center muted">คุยกันว่าใครตื่นตีไหน เห็นอะไร — จะพูดจริงหรือโกหกก็ได้</p>${mem}
      ${isHostView() ? btn('cttovote', '🗳️ เริ่มโหวต', 'primary wide big') : '<p class="muted center">รอเจ้าของห้องเปิดโหวต…</p>'}`;
    const voted = c.voted || [];
    return `<h1 class="ph">🗳️ ใครขโมยชีส?</h1><p class="center muted small">เปลี่ยนใจได้จนกว่าจะครบทุกคน</p>
      <div class="picks">${others.map(x => `<button class="pick ${v.vote === x.sid ? 'on' : ''}" data-act="ctvote" data-sid="${x.sid}">${esc(x.name)}</button>`).join('')}</div>
      <p class="center">${v.vote ? `คุณโหวต <b>${esc(pn(v.vote))}</b>` : 'ยังไม่ได้โหวต'}</p>${mem}
      <section class="panel"><h2>โหวตแล้ว ${voted.length}/${n}</h2>${players({ voted })}</section>
      ${isHostView() ? btn('ctfinish', 'สรุปผลเลย', 'ghost wide') : ''}`;
  }
  const r = c.res, win = r.winner === 'mice', iWin = (v.role === 'mouse') === win;
  return `<div class="banner ${iWin ? 'win' : 'lose'}"><div class="bt">${win ? 'จับโจรได้! หนูขี้เซาชนะ' : 'โจรรอดไปได้! โจรชนะ'}</div>
      <div>${gi('robber', 'inl')} โจรคือ <b>${esc(pn(c.thief))}</b>${c.follower ? ` · ลูกสมุน <b>${esc(pn(c.follower))}</b>` : ''}</div></div>
    <section class="panel"><table class="res"><thead><tr><th>ผู้เล่น</th><th>เต๋า</th><th>โหวต</th><th>ได้</th></tr></thead><tbody>
      ${pl().map(x => `<tr><td>${esc(x.name)}${x.sid === c.thief ? ` ${gi('robber', 'inl')}` : x.sid === c.follower ? ` ${gi('minion', 'inl')}` : ''}</td><td class="c">${ctDie(c.die[x.sid])}</td>
        <td>${c.votes[x.sid] ? esc(pn(c.votes[x.sid])) : '–'}</td><td class="c"><b>${r.tally[x.sid] || 0}</b></td></tr>`).join('')}</tbody></table>
      ${Object.keys(c.peeks).length ? `<p class="muted small">แอบดูเต๋า: ${Object.entries(c.peeks).map(([s, k]) => `${esc(pn(s))} → ${esc(pn(k.t))}`).join(' · ')}</p>` : ''}</section>
    ${isHostView() ? `<div class="row">${btn('lobby', 'กลับล็อบบี้', 'ghost')}${btn('again', '🔁 เล่นอีกรอบ', 'primary')}</div>` : '<p class="muted center">รอเจ้าของห้องเริ่มรอบใหม่…</p>'}`;
}

function rulesView() {
  const g = S.pub.game;
  const body = g === 'it' ? `
    <p><b>เป้าหมาย:</b> ช่วยกันทั้งทีม วางเลขทุกใบเรียงจากน้อยไปมาก ผ่านให้ครบ ${IT.LEVELS} ด่าน</p>
    <ol><li>ทุกคนได้เลขลับ 1–100 (ด่าน N ได้คนละ N ใบ) และมีหัวข้อ 1 อัน เช่น "สัตว์ที่น่ากลัว"</li>
    <li><b>ห้ามบอกเลข</b> — ให้บอกเป็นสิ่งที่เข้ากับหัวข้อแทน เลขมาก = มาก เช่น เลข 95 อาจบอกว่า "ฉลาม" เลข 10 อาจบอกว่า "กระต่าย" พิมพ์คำใบ้ลงในแอปให้ทุกคนเห็นได้</li>
    <li>คุยกัน ถามกัน เรียงลำดับกันเอง แล้วใครคิดว่าเลขตัวเองต่ำสุดก็กดวาง (แอปวางใบต่ำสุดของคุณเสมอ)</li>
    <li>ถ้ามีคนยังถือเลขที่ต่ำกว่าใบที่เพิ่งวาง = พลาด เสีย 1 ชีวิตต่อใบ และใบนั้นถูกเปิดลงโต๊ะ</li>
    <li>วางครบทุกใบ = ผ่านด่าน (ด่านใหม่ได้หัวข้อใหม่) · ชีวิตหมด ${IT.LIVES} ดวง = แพ้</li></ol>
    <p class="muted small">หัวข้อแสดงตาม "ภาษาของคำในเกม" ที่เจ้าของห้องเลือก</p>` : g === 'cp' ? `
    <p><b>เป้าหมาย:</b> เป็นคนสุดท้ายที่ยังมีอิทธิพล (การ์ดคว่ำ) เหลืออยู่</p>
    <ol><li>การ์ด 15 ใบ: ดยุก นักฆ่า กัปตัน ทูต เคานท์เตส อย่างละ 3 · ทุกคนได้การ์ดคว่ำ 2 ใบ (= อิทธิพล 2) และ 2 เหรียญ (เล่น 2 คน คนเริ่มได้ 1 เหรียญ)</li>
    <li>ถึงตาคุณ เลือก 1 การกระทำ: <b>รายได้</b> +1 · <b>เงินช่วยเหลือ</b> +2 (ดยุกบล็อกได้) · <b>รัฐประหาร</b> จ่าย 7 ให้คนหนึ่งเสียอิทธิพล (บล็อกไม่ได้ · มี 10 เหรียญต้องทำ)</li>
    <li>หรืออ้างตัวละคร (จะมีจริงหรือไม่ก็ได้): <b>ดยุก</b> เก็บภาษี +3 · <b>นักฆ่า</b> จ่าย 3 ลอบสังหาร (เคานท์เตสบล็อกได้) · <b>กัปตัน</b> ขโมย 2 เหรียญ (กัปตัน/ทูตบล็อกได้) · <b>ทูต</b> จั่ว 2 ใบแล้วเลือกเก็บ</li>
    <li><b>ท้า:</b> ใครก็ท้าการอ้างหรือการบล็อกได้ · ถ้าโกหกจริง คนอ้างเสียอิทธิพลและการกระทำล้มเหลว (เงินคืน) · ถ้ามีจริง คนท้าเสียอิทธิพล และคนอ้างเอาการ์ดใบนั้นสับคืนกองแล้วจั่วใหม่</li>
    <li>เสียอิทธิพล = เลือกเปิดการ์ด 1 ใบ · เปิดครบ 2 ใบ = ตกรอบ</li></ol>` : g === 'hn' ? `
    <p><b>เป้าหมาย:</b> ช่วยกันจุดพลุ 5 สี แต่ละสีเรียง 1→5 คะแนนเต็ม 25</p>
    <ol><li>ไพ่ 50 ใบ: 5 สี แต่ละสีมีเลข 1 ×3, 2 ×2, 3 ×2, 4 ×2, 5 ×1 · 2–3 คนถือคนละ 5 ใบ, 4–5 คนถือ 4 ใบ</li>
    <li><b>คุณเห็นไพ่ทุกคน ยกเว้นของตัวเอง</b></li>
    <li>ถึงตาคุณ เลือก 1 อย่าง:
      <br>• <b>ใบ้</b> (ใช้ 💡 1): บอกเพื่อน 1 คนว่าไพ่ใบไหนบ้างเป็นสีหนึ่ง หรือเลขหนึ่ง (ต้องชี้อย่างน้อย 1 ใบ แอปบอกทุกใบที่ตรงให้อัตโนมัติ)
      <br>• <b>ทิ้ง</b> 1 ใบ: ได้ 💡 คืน 1 (ทิ้งไม่ได้ถ้า 💡 เต็ม 8)
      <br>• <b>ลง</b> 1 ใบ: ถ้าเป็นเลขถัดไปของสีนั้น พลุต่อได้ · ถ้าไม่ใช่ เสีย 💣 1 และทิ้งไพ่</li>
    <li>ลงหรือทิ้งแล้วจั่วใบใหม่ (เข้ามือซ้ายสุด) · ลงเลข 5 สำเร็จได้ 💡 คืน 1</li>
    <li>💣 พลาดครบ 3 ครั้ง = พลุระเบิด คะแนน 0 · ไพ่หมดกอง ทุกคนได้เล่นอีก 1 ตาแล้วจบ · ทำครบ 25 จบทันที</li>
    <li>ห้ามบอกไพ่เพื่อนนอกจากใช้คำใบ้</li></ol>` : g === 'tb' ? `
    <p><b>เป้าหมาย:</b> ยึด H.Q. ศัตรู หรือเก็บเหรียญให้ครบ ${TB.OBJECTIVE} ก่อน</p>
    <ol><li>ทหารของเล่นคนละ 24 ตัว คัดออก 4 ตัวแบบไม่ดู เหลือ 20 ในกอง · คนเริ่มจั่ว 3 อีกคนจั่ว 4 · ชั้นวางเก็บได้สูงสุด ${TB.RACK}</li>
    <li>ถึงตาคุณ เลือก 1 อย่าง: <b>จั่ว 2 ตัว</b> หรือ <b>วางของเล่น 1 ตัว</b> แล้วใช้ความสามารถของมัน</li>
    <li>วางได้บน: ฐานว่าง, ฐานที่ของเล่นเราอยู่บนสุด, ของเล่นศัตรูที่พลัง<b>น้อยกว่า</b>, หรือ H.Q. ศัตรู (ห้ามวางบน H.Q. ตัวเอง) · ซ้อนได้ไม่จำกัด นับเฉพาะตัวบนสุด</li>
    <li>ฐานที่วางต้อง<b>ต่อกับ H.Q. ของเรา</b> ผ่านฐานที่เรายึดอยู่ (ฐานว่าง/ฐานศัตรูทำให้ขาด)</li>
    <li>ยึดฐานครบทุกมุมรอบเขตไหน ได้เหรียญในเขตนั้น (เก็บไว้ตลอดแม้เสียฐานทีหลัง)</li>
    <li>ยึด H.Q. ศัตรูได้ = ชนะทันที · เหรียญครบเป้า = ชนะทันที · ถ้าถึงตาแล้วจั่วไม่ได้และวางไม่ได้ เกมจบ นับเหรียญ (เสมอ = คนที่ทำต่อไม่ได้แพ้)</li></ol>
    <p><b>ของเล่น (อย่างละ 3):</b> ${Object.values(TB.TROOPS).map(x => `<b>${x.n}</b> ${x.s ?? '–'}: ${x.d}`).join(' · ')}</p>
    <p class="muted small">แผนที่ในแอปออกแบบขึ้นเอง (กระดาน 5×3 ฐาน, 8 เขต, เหรียญรวม 12) เพราะไม่มีแผนที่จริง · ยังไม่มีฐานพิเศษ</p>` : g === 'lf' ? `
    <p><b>เป้าหมาย:</b> ได้แต้มมากที่สุดเมื่อจบเกม</p>
    <ol><li>ทุกคนมีการ์ดเป้าหมาย 2 ใบ (★ = 1 แต้ม, ★★ = 2 แต้ม) แอบเขียนชั้นที่อยากให้ลิฟต์ไปหยุด (E, 5, 10 … 40) จะเขียนชั้นเดียวกันทั้ง 2 ใบก็ได้</li>
    <li>ทุกรอบทุกคนแอบเลือกปุ่ม 0, 5 หรือ 10 แล้วเปิดพร้อมกัน — ลิฟต์วิ่งตามผลรวม (5 = 1 ชั้น) ไปทางลูกศร</li>
    <li>ถึงชั้นบนสุด (40) หรือล่างสุด (E) ลิฟต์กลับทางแล้ววิ่งต่อจนครบ</li>
    <li>ลิฟต์หยุดชั้นที่คุณเขียน = ได้แต้มตามดาว (ชั้น E และ 40 คูณ 2) แล้วเขียนชั้นใหม่บนการ์ดใบนั้น</li>
    <li><b>กรวยก่อสร้าง 🚧:</b> ถ้าลิฟต์หยุดชั้นที่มีกรวยและคุณเขียนชั้นนั้น ไม่ได้แต้ม และต้องเขียนใหม่ทั้ง 2 ใบ</li>
    <li>จบรอบ กรวยเลื่อนลง 1 ชั้น (เริ่มที่ 40) · กรวยถึงชั้น E = เล่นอีกรอบสุดท้าย แล้วนับแต้ม</li></ol>
    <p class="muted small">คะแนนเท่ากัน: ในแอปให้ชนะร่วมกัน (กติกาจริงตัดสินด้วยว่าใครเขียนชั้นที่ลิฟต์จะไปถึงก่อน)</p>` : g === 'rr' ? `
    <p><b>เป้าหมาย:</b> เป็นคนแรกที่ได้ ${RR.WIN} แต้ม (และนำคนอื่น) หรือเป็นทีมสุดท้ายที่เหลือรอด</p>
    <p>ทุกคนมีทีม 4 คน (ลูกทีม 3 + กัปตัน) และ "ปืน" เป็นการ์ด 7 ใบ: <b>แชะ</b> 6 ใบ + <b>ปัง!</b> 1 ใบ · ทุกช่วงเล่นพร้อมกัน</p>
    <ol><li><b>เก็บเข้ากระเป๋า:</b> เลือกการ์ด 1 ใบเก็บไว้ — ถ้าเก็บ "ปัง!" คือโกง ปืนคุณจะไม่มีกระสุน</li>
    <li><b>หมุนลูกโม่:</b> ปืนทุกคนถูกสับอัตโนมัติ</li>
    <li><b>เดิมพัน 0–5:</b> จะเหนี่ยวไกกี่ครั้ง เปิดพร้อมกัน</li>
    <li><b>จับโกง:</b> กล่าวหาได้ 1 คน · ถ้าเขาโกงจริง ลูกทีมเขาตาย คนกล่าวหาได้การ์ด 3 ใบ · ถ้าไม่ได้โกง เขาได้การ์ด 1 ใบต่อคนกล่าวหา และคนกล่าวหาต้องเปลี่ยน "แชะ" 1 ใบเป็น "ปัง!" (อยู่จนกว่าจะมีคนในทีมตาย)</li>
    <li><b>เหนี่ยวไก:</b> ทุกคนเปิดการ์ดบนสุดพร้อมกันทีละนัด จนครบเดิมพัน · เจอ "ปัง!" = ลูกทีมตาย จบรอบของคุณ</li>
    <li><b>นับแต้ม:</b> รอดได้ เดิมพัน + 1 แต้ม · ใครเสียคนในรอบนี้ไม่ได้แต้ม</li></ol>
    <p>ตาย 1 คน: ได้การ์ดแอ็กชัน 1 ใบ และปืนรีเซ็ตเป็น ปัง 1 + แชะ 6 · กัปตันตาย = ตกรอบ</p>
    <p><b>การ์ดแอ็กชัน:</b> ${Object.values(RR.CARDS).map(c => `<b>${c.n}</b> — ${c.d}`).join(' · ')}</p>
    <p class="muted small">กล่องจริงมีการ์ดแอ็กชันหลายแบบกว่านี้ — ในแอปมี 4 แบบที่ดัดแปลงจากชื่อการ์ดที่ยืนยันได้</p>` : g === 'od' ? `
    <p><b>เป้าหมาย:</b> ช่วยกันทั้งทีม เคลียร์ออร์เดอร์ให้ผ่าน ${OD.LEVELS} ด่าน</p>
    <ol><li>ต้นด่าน ออร์เดอร์จะโชว์ทีละใบบนจอทุกคน <b>ครั้งเดียว</b> (ด่าน N มี N × จำนวนคน ใบ) แล้วสับแจกคนละ N ใบ</li>
    <li>คุณเห็นแค่มือตัวเอง — ที่เหลือต้องจำว่าเคยได้ยินอะไร</li>
    <li>ถึงตาคุณ เรียกเมนูที่คิดว่าอยู่ในมือ<b>คนอื่น</b> · ถ้ามี คนแรกถัดจากคุณที่มีจะเสิร์ฟ (คว่ำลงโต๊ะ)</li>
    <li>ถ้าไม่มีใครมี หน้ายิ้มของคุณคว่ำ และเรียกไม่ได้อีกในด่านนี้ (เล่น 2 คน มีคนละ 2 หน้ายิ้ม)</li>
    <li>ผ่านด่านเมื่อมีคนมือหมดครบ: 2 คน → 1 คน · 3–4 คน → 2 คน · 5–6 คน → 3 คน · ถ้าหน้ายิ้มคว่ำหมดทุกคน = แพ้</li>
    <li>การ์ดพิเศษใช้ได้ครั้งเดียวทั้งเกม: <b>ทิ้งออร์เดอร์</b> 1 ใบจากมือ (ห้ามทิ้งใบสุดท้าย) หรือ <b>ขอคำใบ้</b> ให้เพื่อนบอกพยัญชนะตัวแรกของออร์เดอร์ 1 ใบ</li>
    <li>ห้ามบอกว่าในมือมีอะไร</li></ol>
    <p class="muted small">เมนูเป็นคาเฟ่ไทยที่ตั้งขึ้นเอง · ใส่การ์ดพิเศษเฉพาะ 2 แบบที่ยืนยันได้จากกติกาต้นฉบับ</p>` : g === 'bd' ? `
    <p><b>เป้าหมาย:</b> นายอำเภอและผู้ช่วยต้องกำจัดโจรกับคนทรยศให้หมด · โจรต้องฆ่านายอำเภอ · คนทรยศต้องเหลือรอดคนสุดท้าย</p>
    <ol><li>เห็นบทบาทเฉพาะของนายอำเภอ คนอื่นลับจนกว่าจะตาย · ทุกคน 8 ชีวิต นายอำเภอ 10 · นายอำเภอเริ่มก่อน</li>
    <li>ตาคุณ: ทอยเต๋า 5 ลูก ทอยใหม่ได้อีก 2 ครั้ง เลือกเก็บลูกไหนก็ได้</li>
    <li><b>ธนู</b> หยิบธนูจากกองทันทีทุกครั้งที่ทอยได้ · ธนูหมดกอง = อินเดียนแดงบุก ทุกคนเสียชีวิตเท่าจำนวนธนูที่ถือ แล้วคืนธนูทั้งหมด</li>
    <li><b>ระเบิด</b> ทอยใหม่ไม่ได้ · ครบ 3 ลูก เสีย 1 ชีวิตและหยุดทอยทันที</li>
    <li><b>ยิงระยะ 1 / 2</b> ยิงคนที่นั่งห่างพอดี 1 หรือ 2 ที่ ซ้ายหรือขวาก็ได้ (นับเฉพาะคนที่ยังอยู่) · เหลือ 3 คนหรือน้อยกว่า ระยะ 2 ใช้เป็นระยะ 1</li>
    <li><b>เบียร์</b> ให้ใครก็ได้ +1 ชีวิต ไม่เกินค่าเริ่มต้น</li>
    <li><b>แกตลิง</b> ครบ 3 ลูก คนอื่นทุกคนเสีย 1 ชีวิต และคุณทิ้งธนูทั้งหมด</li>
    <li>ใช้เต๋าตามลำดับ: ยิงระยะ 1 → ยิงระยะ 2 → เบียร์ → แกตลิง</li>
    <li>นายอำเภอตาย: ถ้าเหลือคนทรยศคนเดียว คนทรยศชนะ ไม่งั้นโจรชนะ</li></ol>
    <p class="muted small">เวอร์ชันนี้ยังไม่มีการ์ดตัวละคร (ความสามารถพิเศษ)</p>` : g === 'ct' ? `
    <p><b>เป้าหมาย:</b> หนูขี้เซาต้องโหวตจับโจรขโมยชีสให้ได้ · โจร (และลูกสมุน) ต้องรอด</p>
    <ol><li>ทุกคนได้บทบาทลับ และ<b>ลูกเต๋าลับ 1–6</b> = ชั่วโมงที่คุณจะตื่นกลางดึก</li>
    <li>6 คนขึ้นไป: ก่อนนอน โจรเลือก<b>ลูกสมุน</b> 1 คน (ลูกสมุนชนะพร้อมโจร แต่ไม่รู้ว่าโจรคือใคร)</li>
    <li>กลางคืนนับตี 1 ถึงตี 6 ทีละชั่วโมง ถึงเลขของใคร คนนั้นตื่น และเห็นว่า<b>ใครตื่นพร้อมกัน</b></li>
    <li><b>โจรขโมยชีสตอนชั่วโมงที่ตัวเองตื่น</b> — คนที่ตื่นชั่วโมงเดียวกันเห็นคาตา · คนที่ตื่นก่อนเห็นชีสยังอยู่ · คนที่ตื่นทีหลังเห็นชีสหายแล้ว</li>
    <li>ถ้าตื่น<b>คนเดียว</b> แอบดูลูกเต๋าของคนอื่นได้ 1 คน</li>
    <li>เช้า: คุยกัน (โกหกได้) แล้วโหวตพร้อมกัน คนละ 1 เสียง ห้ามโหวตตัวเอง</li>
    <li>โจรได้คะแนนโหวตมากที่สุด (เสมอที่หนึ่งก็นับ) = หนูขี้เซาชนะ · ไม่งั้นโจรชนะ</li></ol>` : g === 'ab' ? `
    <p><b>เป้าหมาย:</b> เก็บให้ได้ ${AB.WIN} แต้มก่อนใคร</p>
    <ol><li>ทุกคนมีหินคาถา ${AB.HAND} ก้อน <b>คุณเห็นหินของทุกคน ยกเว้นของตัวเอง</b></li>
    <li>หินเลข 1 มี 1 ก้อน เลข 2 มี 2 ก้อน … เลข 8 มี 8 ก้อน · กระดานคาถาบอกว่าแต่ละเลขถูกร่ายไปแล้วกี่ก้อน</li>
    <li>ถึงตาคุณ: ประกาศเลขคาถาที่คิดว่าตัวเองมี — ถ้ามี คาถาทำงาน และร่ายต่อได้ด้วย<b>เลขเท่าเดิมหรือสูงกว่า</b> หรือจะหยุดก็ได้</li>
    <li>ถ้าไม่มี: เสีย 1 ชีวิตและจบตา (ร่ายเลข 1 พลาด เสียตามเต๋า)</li>
    <li>จบตาเติมหินให้ครบ ${AB.HAND}</li>
    <li><b>จบรอบ</b> เมื่อมีคนชีวิตหมด หรือมีคนร่ายหินหมดมือ: คนที่ทำให้จบได้ 3 แต้ม คนที่รอดได้ 1 แต้ม คนตายได้ 0 · หินลับจากนกฮูก +1 แต้มต่อก้อน</li></ol>
    <ul class="rl">${Object.entries(AB.SPELLS).map(([n, sp]) => `<li>${stone(+n, 'sm')} <b>${sp.n}</b> — ${sp.d}</li>`).join('')}</ul>
    <p class="muted small">"ซ้าย" คือคนถัดไปในลำดับตา · "ขวา" คือคนก่อนหน้า</p>` : g === 'sh' ? `
    <p><b>เป้าหมาย:</b> เสรีนิยมต้องออกกฎหมายเสรีนิยม 5 ใบ หรือประหารฮิตเลอร์ · ฟาสซิสต์ต้องออกกฎหมายฟาสซิสต์ 6 ใบ หรือให้ฮิตเลอร์ได้เป็นนายกฯ หลังมีกฎหมายฟาสซิสต์ 3 ใบ</p>
    <ol><li><b>ประธานาธิบดี</b> (วนไปทีละคน) เสนอชื่อ<b>นายกรัฐมนตรี</b> — ประธานและนายกฯ ชุดล่าสุดเป็นนายกฯ ซ้ำไม่ได้</li>
    <li>ทุกคนโหวต ✔/✘ พร้อมกัน ต้องได้เสียงเกินครึ่ง · ไม่ผ่าน 3 ครั้งติด กฎหมายใบบนสุดถูกออกทันที</li>
    <li>ประธานจั่ว 3 ใบ ทิ้ง 1 ส่ง 2 ใบให้นายกฯ · นายกฯ ทิ้ง 1 ออกกฎหมาย 1 — <b>ห้ามบอกว่าได้ใบอะไร แต่โกหกได้</b></li>
    <li>กฎหมายฟาสซิสต์บางใบให้อำนาจประธาน: ดูไพ่ 3 ใบบนสุด / ตรวจฝ่าย / เลือกประธานคนถัดไป / ประหาร</li>
    <li>หลังมีกฎหมายฟาสซิสต์ 5 ใบ นายกฯ ขอ<b>วีโต้</b>ได้ ถ้าประธานเห็นด้วย ทิ้งทั้ง 2 ใบ</li></ol>
    <p class="muted small">ฟาสซิสต์รู้จักกัน · ฮิตเลอร์รู้จักพวกเฉพาะเกม 5–6 คน · ตรวจฝ่ายแล้วฮิตเลอร์แสดงเป็นฟาสซิสต์<br>Secret Hitler โดย Goat, Wolf, & Cabbage — CC BY-NC-SA 4.0 (ห้ามใช้เชิงพาณิชย์)</p>` : g === 'cu' ? `
    <p><b>เป้าหมาย:</b> มีเหรียญมากที่สุดตอนอูฐตัวแรกเข้าเส้นชัย</p>
    <ol><li>ถึงตาคุณ เลือกทำ <b>1 อย่าง</b>:<br>🎲 <b>ทอยเต๋า</b> — สุ่มสีที่ยังไม่ออกในรอบนี้ เดิน 1–3 ช่อง ได้ 1 เหรียญ<br>🎫 <b>หยิบป้ายเดิมพันรอบ</b> ของอูฐตัวหนึ่ง (5 → 3 → 2)<br>🌴 <b>วางแผ่นทะเลทราย</b> โอเอซิส (+1 ช่อง) หรือมิราจ (−1 ช่อง ไปอยู่ใต้กอง) ได้ 1 เหรียญทุกครั้งที่มีอูฐมาเหยียบ<br>🏆 <b>ทายแชมป์ / ที่โหล่</b> ของทั้งเกม ด้วยการ์ดอูฐของคุณ</li>
    <li>อูฐที่อยู่ช่องเดียวกันจะ<b>ขี่ซ้อนกัน</b> ตัวบนเดินไปพร้อมตัวล่าง และตัวบนถือว่านำ</li>
    <li>ทอยครบ 5 ลูก = จบรอบ: ป้ายของอูฐที่ 1 ได้ตามเลข ที่ 2 ได้ 1 เหรียญ ตัวอื่นเสีย 1</li>
    <li>จบเกม: ทายแชมป์/ที่โหล่ถูก ได้ 8, 5, 3, 2, 1 ตามลำดับที่ทาย · ทายผิดเสีย 1</li></ol>` : g === 'tc' ? `
    <p><b>เป้าหมาย:</b> ทิ้งไพ่ให้หมดมือ แล้วเป็นคนแรกที่ตบถูกจังหวะ</p>
    <ol><li>ผลัดกันเปิดไพ่ 1 ใบ พร้อมพูดคำตามลำดับ: <b>ทาโก้ → แมว → แพะ → ชีส → พิซซ่า</b> วนไปเรื่อยๆ</li>
    <li>ถ้า<b>ไพ่ที่เปิดตรงกับคำที่พูด</b> ทุกคนต้องกดปุ่มตบ คนที่ช้าที่สุด (หรือไม่ตบ) เก็บกองทั้งหมด</li>
    <li><b>ไพ่พิเศษ</b> (กอริลลา / นาร์วาฬ / กราวด์ฮ็อก): ต้องกดปุ่มท่าของสัตว์ตัวนั้นแทนปุ่มตบ กดผิดท่าถือว่าช้าสุด</li>
    <li>ตบตอนที่ไม่ควรตบ = เก็บกองทั้งหมด</li>
    <li>ไพ่หมดมือแล้วยังต้องพูดคำและตบต่อ ถ้าตบได้เป็นคนแรก = ชนะ</li></ol>
    <p class="muted small">แอปจับเวลาปฏิกิริยาที่เครื่องของแต่ละคน เน็ตช้าจึงไม่เสียเปรียบ</p>` : g === 'sa' ? `
    <p><b>เป้าหมาย:</b> ชาวเมืองต้องเปิดการ์ด<b>แม่มด</b>ให้ครบทุกใบ · แม่มดต้องกำจัดชาวเมืองให้หมด</p>
    <ol><li>ทุกคนมีการ์ดตัวตนคว่ำอยู่หลายใบ ใครมีการ์ดแม่มดคือฝ่ายแม่มด (เคยมีแล้วก็เป็นตลอดไป)</li>
    <li>ถึงตาคุณ: <b>จั่ว 2 ใบ</b> หรือ <b>เล่นการ์ดกี่ใบก็ได้</b> แล้วจบตา</li>
    <li><b>การ์ดแดง</b> กล่าวหา (1 / 3 / 7 แต้ม): ใครโดนครบ 7 แต้ม คนที่เล่นใบสุดท้ายเลือกเปิดการ์ดตัวตนของเขา 1 ใบ</li>
    <li>เปิดเจอแม่มด หรือถูกเปิดครบทุกใบ = ตาย</li>
    <li><b>กลางคืน</b> (เมื่อจั่วเจอ): แม่มดเลือกฆ่า 1 คน · นายอำเภอเลือกคุ้มครอง 1 คน · จากนั้นทุกคนเลือก "สารภาพ" (เปิดการ์ดตัวเอง 1 ใบ) เพื่อรอดคืนนี้ได้</li>
    <li><b>สมคบคิด</b> (เมื่อจั่วเจอ): คนถือแมวดำต้องเปิดการ์ด 1 ใบ แล้วทุกคนหยิบการ์ดคว่ำ 1 ใบจากคนถัดไป — คุณอาจกลายเป็นแม่มด!</li></ol>
    <ul class="rl">${Object.entries(SA.CARDS).filter(([, c]) => c.k !== 'black').map(([, c]) => `<li><b>${c.n}</b> — ${c.d}</li>`).join('')}</ul>
    <p class="muted small">ฉบับในแอป: สมคบคิดและการ์ดที่แมวดำ/คำสาปเลือก ระบบสุ่มให้</p>` : g === 'mi' ? `
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
    <p class="muted small">คู่คำ ${UC.pairs(S.pub.wl).length} คู่ · ไม่วนซ้ำภายใน ${UC.RECENT} รอบ</p>` : g === 'onuw' ? `
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
  return `<div class="modal" data-act="rules"><div class="sheet" data-act="noop"><div class="sh"><h2>กติกา ${GAMES[g].s}</h2><button class="ib" data-act="rules">✕</button></div>${body}
    <p class="muted small diag">การเชื่อมต่อ: เซิร์ฟเวอร์ ${S.conn ? S.conn.bi + 1 : '-'} · หลุด ${S.conn?.drops ?? 0} ครั้งใน ${S.conn?.since ? Math.round((Date.now() - S.conn.since) / 60000) : 0} นาที${S.conn?.lastErr ? ` · ล่าสุด: ${esc(S.conn.lastErr)}` : ''}${S.isHost ? ' · คุณเป็นเจ้าของห้อง' : ''}</p>
    <p class="muted small">ไอคอน: <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (Lorc, Delapouite, Skoll — CC BY 3.0) · ไอคอนแอป: Font Awesome Free (CC BY 4.0)</p></div></div>`;
}

/* ───────────── render & events ───────────── */
// Replacing the DOM while a finger is down swallows that tap, so wait for the finger to lift.
let pressing = false, renderPending = false, lastHtml = null, pressTimer = 0;
// Computer / iPad in landscape: secondary panels (players, logs, scores) move into a side column next to the game.
const WIDE = matchMedia('(min-width: 960px) and (min-aspect-ratio: 5/4)');
const SIDE = [':scope > section.panel:has(.players)', ':scope > section.panel:has(ol.log)', ':scope > section.panel:has(.bdlog)', ':scope > .lfpts',
  ':scope > section.panel:has(.otable)', ':scope > section.panel.bdmine'].join(', ');
function sideLayout() {
  const m = app.querySelector('main.wrap');
  if (!m || !WIDE.matches) return;
  const side = new Set(m.querySelectorAll(SIDE));
  if (!side.size || side.size === m.children.length) return;
  const col = document.createElement('div'), aside = document.createElement('aside');
  col.className = 'col1'; aside.className = 'side';
  for (const el of [...m.children]) (side.has(el) ? aside : col).appendChild(el);
  m.append(col, aside);
  m.classList.add('two');
}
WIDE.addEventListener?.('change', () => { lastHtml = null; render(); });
// Connection + state snapshot for the test bots (test/e2e.html) and for debugging from the console.
window.__bg = () => ({ resyncs: S.resyncs || 0, pubH: S.pubH, privH: S.privH, want: S.isHost ? { ...want } : undefined, sending: S.sending, out: outbox && { t: outbox.m?.t, tries: outbox.tries }, priv: S.priv, queued: outQ.size, host: S.isHost, online: S.online, hostDown: S.hostDown, broker: S.conn?.bi, drops: S.conn?.drops, err: S.conn?.lastErr, phase: S.pub?.phase, pub: S.pub?.[S.pub?.game], out: outbox && { t: outbox.m?.t ?? outbox.t, tries: outbox.tries }, priv: S.priv && { ack: S.priv.ack, round: S.priv.round }, pressing, renderPending });
const pressEnd = () => {
  if (!pressing) return;
  pressing = false;
  clearTimeout(pressTimer);
  if (renderPending) setTimeout(() => { if (!pressing && renderPending) render(); }, 80);   // after the click has fired
};
addEventListener('pointerdown', () => { pressing = true; clearTimeout(pressTimer); pressTimer = setTimeout(pressEnd, 1500); }, true);
addEventListener('pointerup', pressEnd, true);
addEventListener('pointercancel', pressEnd, true);

function render() {
  if (pressing) { renderPending = true; return; }
  renderPending = false;
  const p = S.pub;
  if (p) {
    const k = `${p.phase}|${p.round}|${p.step?.[0] ?? ''}|${p.vr ?? ''}|${p.turn ?? ''}|${p.av ? p.av.q + '.' + p.av.nh : ''}|${p.jo ? p.jo.i : ''}|${p.sk ? `${p.sk.round}.${p.sk.bid?.n ?? 0}.${p.sk.turn}` : ''}|${p.sc ? `${p.sc.round}.${p.sc.turn}.${p.sc.active?.cards.length ?? 0}.${p.sc.active?.by ?? ''}` : ''}|${p.cn?.words ? `${p.cn.turn}.${p.cn.clue ? 1 : 0}` : ''}|${p.sh ? `${p.sh.phase}.${p.sh.pres}.${p.sh.power}` : ''}|${p.cu ? `${p.cu.turn}.${p.cu.nl}` : ''}|${p.sa ? `${p.sa.phase}.${p.sa.turn}.${p.sa.nl}` : ''}|${p.ab ? `${p.ab.round}.${p.ab.ln}` : ''}`;
    if (k !== S.key) {
      S.jc = ['', '']; S.jedit = false; S.bidN = null; S.cuD = 0; S.cuF = null; S.saSel = null; S.saDecoy = null; S.scSel = []; S.scM = null; S.cw = ''; S.cnN = 1; S.bdKeep = []; S.odSel = null; S.odAb = null; S.rrN = null; S.rrC = null; S.lfI = null; S.tbI = null; S.hnI = null; S.hnTo = null; S.cpAct = null; S.cpKeep = []; S.ih = [];
      S.enter = true;   // new screen: play the entrance animation once
      S.key = k; S.reveal = false; S.sel = []; S.decoy = null; S.guess = false; S.jg = '';
      if (p.round !== S.round) { S.round = p.round; S.crossed = new Set(); }
    }
  }
  const focus = document.activeElement?.id, pos = focus && document.activeElement.selectionStart;
  const html = view();
  if (html === lastHtml) return tickTimers();   // nothing visible changed: keep the DOM (and any tap in progress) intact
  lastHtml = html;
  app.innerHTML = html;
  sideLayout();
  if (lang === 'en') { setNames(pl().map(x => x.name).concat(S.name || [])); setGame(S.pub?.game); translate(app); }
  if (S.enter) { S.enter = false; lastHtml = html.replace(' enter">', ' ">'); }
  if (focus) { const el = document.getElementById(focus); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
  // Player buttons get that player's coloured badge.
  app.querySelectorAll('.pick[data-sid], .pick[data-v^="p:"]').forEach(b => b.insertAdjacentHTML('afterbegin', av(b.dataset.sid || b.dataset.v.slice(2), 'sm')));
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
  els.forEach(e => { e.textContent = t || (p.phase === 'play' ? T('หมดเวลา') : ''); e.classList.toggle('low', !!low); });
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
  playg: d => createRoom(d.game),
  feat: () => { S.feat = (S.feat || 0) + 1; render(); },
  fan: d => { if (now() - (S.fanSwiped || 0) < 400) return; const i = +d.i; if (i === (S.fan || 0) % fanKeys().length) return createRoom(fanKeys()[i]); fanMove(i); },
  fanmv: d => fanMove((S.fan || 0) + +d.d),
  hcat: d => { S.hcat = d.c; S.fan = 0; render(); },
  join: () => joinRoom(S.codeIn),
  resume: () => { const l = LS.get('bg_last', null); if (l) resume(l); },
  rejoin: () => { S.joinErr = ''; render(); hello(); },
  leave: () => { if (confirm(S.isHost ? 'ออกและปิดห้องนี้? ทุกคนจะหลุดจากห้อง' : 'ออกจากห้อง?')) leave(); },
  rules: () => { S.rules = !S.rules; render(); },
  noop: () => {},
  lang: d => { setLang(d.l); lastHtml = null; render(); },
  setupdone: () => { const n = cleanName(S.name); if (!n) { S.err = 'ใส่ชื่อของคุณก่อน'; render(); document.getElementById('name')?.focus(); return; } S.name = n; LS.set('bg_name', n); S.setup = false; S.err = ''; render(); },
  settings: () => { S.settings = !S.settings; S.sname = null; render(); },
  savename: () => {
    const n = cleanName(S.sname ?? ''); if (!n) return;
    S.name = n; LS.set('bg_name', n); S.sname = null;
    if (S.conn) send({ t: 'rename', name: n });
    toast('บันทึกชื่อแล้ว'); render();
  },
  theme: d => { setTheme(d.t); render(); },
  noresume: () => { S.noResume = true; render(); },
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
  scshow: () => { const a = S.scSel; if (a.length) { send({ t: 'scshow', i: a[0], j: a.at(-1) }); S.scSel = []; } },
  scpick: d => { S.scM = { end: d.end, flip: false, ss: d.ss === '1', pos: null }; S.scSel = []; render(); },
  scturn: () => { S.scM.flip = !S.scM.flip; render(); },
  sccancel: () => { S.scM = null; S.scSel = []; render(); },
  scslot: d => {
    const m = S.scM;
    if (!m.ss) return send({ t: 'scscout', end: m.end, pos: +d.pos, flip: m.flip });
    m.pos = +d.pos; S.scSel = []; render();
  },
  scss: () => { const m = S.scM, a = S.scSel; if (m && a.length) send({ t: 'scss', end: m.end, pos: m.pos, flip: m.flip, i: a[0], j: a.at(-1) }); },
  abcast: d => { if (confirm(`ร่าย ${d.n} · ${AB.SPELLS[d.n].n}?`)) send({ t: 'abcast', n: +d.n }); },
  abstop: () => send({ t: 'abstop' }),
  shnom: d => { if (confirm(`เสนอ ${pn(d.sid)} เป็นนายกรัฐมนตรี?`)) send({ t: 'shnom', to: d.sid }); },
  shvote: d => send({ t: 'shvote', ja: d.ja === '1' }),
  shdisc: d => { if (confirm('ทิ้งใบนี้? (อีก 2 ใบจะส่งให้นายกฯ)')) send({ t: 'shdisc', i: +d.i }); },
  shenact: d => { if (confirm('ออกกฎหมายใบนี้?')) send({ t: 'shenact', i: +d.i }); },
  shveto: () => { if (confirm('ขอวีโต้? (ทิ้งทั้ง 2 ใบ ถ้าประธานเห็นด้วย)')) send({ t: 'shveto' }); },
  shvetoans: d => send({ t: 'shvetoans', yes: d.yes === '1' }),
  shpower: d => { if (!d.sid || confirm(`${SHPW[S.pub.sh.power]}: ${pn(d.sid)} ?`)) send({ t: 'shpower', to: d.sid || null }); },
  curoll: () => send({ t: 'curoll' }),
  cubet: d => send({ t: 'cubet', c: d.c }),
  cumode: d => { S.cuD = S.cuD === +d.t ? 0 : +d.t; S.cuF = null; render(); },
  cucell: d => { if (S.cuD) send({ t: 'cudes', sp: +d.sp, type: S.cuD }); },
  cufmode: d => { S.cuF = S.cuF === d.k ? null : d.k; S.cuD = 0; render(); },
  cufin: d => { if (S.cuF && confirm(`ทายว่าอูฐ${CU.NAME[d.c]}จะ${S.cuF === 'w' ? 'ชนะ' : 'เข้าเป็นตัวสุดท้าย'}?`)) send({ t: 'cufin', c: d.c, kind: S.cuF }); },
  ithint: d => { const i = +d.i, t = (S.ih[i] ?? '').trim(); if (t) send({ t: 'ithint', i, text: t }); },
  itplay: () => { const h = S.priv.hand; if (h?.length && confirm(`วางเลข ${h[0]} ?`)) { send({ t: 'itplay', card: h[0] }); S.ih = []; } },
  cpact: d => { const A = CP.ACTS[d.a]; if (A.target) { S.cpAct = S.cpAct === d.a ? null : d.a; return render(); } send({ t: 'cpact', n: S.pub.cp.n, act: d.a }); S.cpAct = null; },
  cpto: d => { if (S.cpAct) send({ t: 'cpact', n: S.pub.cp.n, act: S.cpAct, to: d.sid }); S.cpAct = null; },
  cpresp: d => send({ t: 'cpresp', w: S.pub.cp.w, kind: d.k, card: d.c || null }),
  cplose: d => send({ t: 'cplose', n: S.pub.cp.n, i: +d.i }),
  cpkeep: d => { const i = +d.i; S.cpKeep = S.cpKeep.includes(i) ? S.cpKeep.filter(x => x !== i) : [...S.cpKeep, i]; render(); },
  cpexch: () => { send({ t: 'cpexch', n: S.pub.cp.n, keep: S.cpKeep }); S.cpKeep = []; },
  hnsel: d => { S.hnI = S.hnI === +d.id ? null : +d.id; S.hnTo = null; render(); },
  hnto: d => { S.hnTo = S.hnTo === d.sid ? null : d.sid; S.hnI = null; render(); },
  hnplay: () => { if (S.hnI != null) send({ t: 'hnplay', n: S.pub.hn.n, cid: S.hnI }); S.hnI = null; },
  hndisc: () => { if (S.hnI != null) send({ t: 'hndisc', n: S.pub.hn.n, cid: S.hnI }); S.hnI = null; },
  hnclue: d => { if (S.hnTo) send({ t: 'hnclue', n: S.pub.hn.n, to: S.hnTo, kind: d.kind, v: d.v }); S.hnTo = null; },
  tbsel: d => { S.tbI = S.tbI === +d.i ? null : +d.i; render(); },
  tbdraw: () => { send({ t: 'tbdraw', n: S.pub.tb.n }); S.tbI = null; },
  tbbase: d => {
    const t = S.pub.tb;
    if (t.jumbo) return send({ t: 'tbjumbo', n: t.n, b: d.b });
    if (S.tbI == null) return;
    send({ t: 'tbplace', n: t.n, i: S.tbI, b: d.b }); S.tbI = null;
  },
  tbskip: () => { const t = S.pub.tb; send(t.jumbo ? { t: 'tbjumbo', n: t.n, b: '' } : { t: 'tbskip', n: t.n }); },
  lfcard: d => { S.lfI = +d.i; render(); },
  lfwrite: d => { send({ t: 'lfwrite', i: S.lfI ?? +d.i, f: +d.f }); S.lfI = null; },
  lfdrive: d => send({ t: 'lfdrive', v: +d.v }),
  rrpocket: d => send({ t: 'rrpocket', c: d.c }),
  rrn: d => { S.rrN = +d.n; render(); },
  rrbid: () => { if (S.rrN != null) send({ t: 'rrbid', n: S.rrN }); },
  rracc: d => { if (confirm(`กล่าวหา ${pn(d.sid)} ว่าโกงซ่อนกระสุน?`)) send({ t: 'rracc', sid: d.sid }); },
  rrready: () => send({ t: 'rrready' }),
  rrcard: d => { S.rrC = S.rrC === d.c ? null : d.c; if (S.rrC === 'peek' || S.rrC === 'air') { send({ t: 'rrplay', card: S.rrC }); S.rrC = null; } render(); },
  rrarg: d => { send({ t: 'rrplay', card: S.rrC, arg: d.arg }); S.rrC = null; render(); },
  odsel: d => { S.odSel = S.odSel === d.i ? null : d.i; render(); },
  odcall: () => { if (S.odSel) send({ t: 'odcall', item: S.odSel }); S.odSel = null; },
  odab: d => { S.odAb = S.odAb === d.k ? null : d.k; render(); },
  oduse: d => { send({ t: 'odab', kind: S.odAb, arg: d.arg }); S.odAb = null; },
  bdsel: d => { const i = +d.i; S.bdKeep = S.bdKeep.includes(i) ? S.bdKeep.filter(x => x !== i) : [...S.bdKeep, i]; render(); },
  bdroll: () => { send({ t: 'bdroll', n: S.pub.bd.n, keep: S.bdKeep }); S.bdKeep = []; },
  bdstop: () => { send({ t: 'bdstop', n: S.pub.bd.n }); S.bdKeep = []; },
  bdtarget: d => send({ t: S.pub.bd.need === 'beer' ? 'bdheal' : 'bdshoot', n: S.pub.bd.n, sid: d.sid }),
  ctpick: d => send({ t: 'ctpick', sid: d.sid }),
  ctpeek: d => send({ t: 'ctpeek', sid: d.sid }),
  ctvote: d => send({ t: 'ctvote', sid: d.sid }),
  tflip: () => send({ t: 'tflip' }),
  tslap: d => {
    const t = S.pub.tc, n = t.top?.n ?? 0;
    if (S.tcDone === n && t.slap) return;
    S.tcDone = n;
    send({ t: 'tslap', n, ms: Math.round(performance.now() - (S.tcT || performance.now())), g: d.g || null });
  },
  sacard: d => { S.saSel = S.saSel?.i === +d.i ? null : { i: +d.i, a: null }; render(); },
  satarget: d => {
    const sel = S.saSel, id = sel && S.priv.hand[sel.i];
    if (!id) return;                                   // the card was already played (double tap)
    const two = SA.CARDS[id].t === 2;
    if (two && !sel.a) { sel.a = d.sid; return render(); }
    S.saSel = null;
    send(two ? { t: 'saplay', i: sel.i, a: sel.a, b: d.sid } : { t: 'saplay', i: sel.i, a: d.sid });
    render();
  },
  sadraw: () => send({ t: 'sadraw' }),
  saend: () => send({ t: 'saend' }),
  sarev: d => send({ t: 'sarev', i: +d.i }),
  sadawn: d => { if (confirm(`ให้แมวดำกับ ${pn(d.sid)} ?`)) send({ t: 'sadawn', to: d.sid }); },
  sakill: d => { if (confirm(`ฆ่า ${pn(d.sid)} คืนนี้?`)) send({ t: 'sakill', to: d.sid }); },
  sasave: d => { if (confirm(`คุ้มครอง ${pn(d.sid)} คืนนี้?`)) send({ t: 'sasave', to: d.sid }); },
  sadecoy: d => { S.saDecoy = d.sid; render(); },
  saconf: d => { if (d.i == null || confirm('สารภาพ: เปิดการ์ดใบนี้ให้ทุกคนเห็น?')) send({ t: 'saconf', i: d.i == null ? null : +d.i }); },
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
  jstrike: d => send({ t: 'jstrike', cid: d.id }),
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
      if (confirm(`เดาว่าเป็น “${SF.locs(S.pub.wl)[i].n}” ? (จบรอบทันที)`)) send({ t: 'guess', loc: i });
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
  if (/^ih\d$/.test(e.target.id)) S.ih[+e.target.id.slice(2)] = e.target.value;
  if (e.target.id === 'sname') { S.sname = e.target.value; const b = document.querySelector('[data-act=savename]'); if (b) b.disabled = !cleanName(S.sname) || cleanName(S.sname) === S.name; }
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
