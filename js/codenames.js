import { shuffle, rint } from './rng.js';
import { WORDS, norm } from './words.js';

// Codenames: two teams, each spymaster gives one-word clues for their team's words on a 5x5 grid.
export const MIN = 4, MAX = 10, RECENT = 150;
const width = w => [...w.normalize('NFC')].filter(c => !/\p{M}/u.test(c)).length;
// Short words only so they fit a 5-column phone grid.
export const POOL = WORDS.map((w, i) => i).filter(i => width(WORDS[i]) <= 8 && !WORDS[i].includes(' '));
export const other = t => (t === 'r' ? 'b' : 'r');
export const TEAM = { r: '🔴 แดง', b: '🔵 น้ำเงิน' };

export function autoTeams(sids) {
  const o = shuffle(sids), half = Math.ceil(o.length / 2), team = {};
  o.forEach((s, i) => (team[s] = i < half ? 'r' : 'b'));
  return { team, master: { r: o[0], b: o[half] } };
}

export function validTeams(sids, t) {
  const e = [];
  for (const c of ['r', 'b']) {
    const m = sids.filter(s => t.team[s] === c);
    if (m.length < 2) e.push(`ทีม${TEAM[c]} ต้องมีอย่างน้อย 2 คน`);
    else if (!m.includes(t.master[c])) e.push(`ทีม${TEAM[c]} ยังไม่มีหัวหน้าสายลับ`);
  }
  return e;
}

export function newGame(sids, t, recent = []) {
  let pool = POOL.filter(i => !recent.includes(i));
  if (pool.length < 25) pool = [...POOL];
  const idx = shuffle(pool).slice(0, 25);
  const first = rint(2) ? 'r' : 'b';
  const key = shuffle([...Array(9).fill(first), ...Array(8).fill(other(first)), ...Array(7).fill('n'), 'x']);
  return { sids: [...sids], team: { ...t.team }, master: { ...t.master }, idx, words: idx.map(i => WORDS[i]), key, rev: Array(25).fill(null), first, turn: first, clue: null, left: 0, log: [], winner: null, why: null };
}

export const remain = (g, c) => g.key.filter((k, i) => k === c && !g.rev[i]).length;
export const isMaster = (g, s) => g.master.r === s || g.master.b === s;

export function giveClue(g, s, word, n) {
  word = String(word || '').trim().slice(0, 20);
  if (g.winner || g.clue || s !== g.master[g.turn] || !word || !Number.isInteger(n) || n < 0 || n > 9) return false;
  const w = norm(word);
  if (g.words.some((x, i) => !g.rev[i] && (norm(x) === w || norm(x).includes(w) || w.includes(norm(x))))) return false;
  g.clue = { word, n };
  g.left = n === 0 ? 99 : n + 1;
  g.log.push({ t: 'clue', team: g.turn, word, n });
  return true;
}

function endTurn(g) { g.turn = other(g.turn); g.clue = null; g.left = 0; }

export function guess(g, s, i) {
  if (g.winner || !g.clue || g.team[s] !== g.turn || isMaster(g, s) || !Number.isInteger(i) || i < 0 || i > 24 || g.rev[i]) return null;
  const k = (g.rev[i] = g.key[i]), me = g.turn;
  g.log.push({ t: 'guess', team: me, sid: s, i, k });
  if (k === 'x') { g.winner = other(me); g.why = 'assassin'; }
  else if (k === me) {
    g.left--;
    if (!remain(g, me)) { g.winner = me; g.why = 'all'; }
    else if (g.left <= 0) endTurn(g);
  } else {
    if (k !== 'n' && !remain(g, k)) { g.winner = k; g.why = 'all'; }
    else endTurn(g);
  }
  return k;
}

export function pass(g, s) {
  if (g.winner || !g.clue || g.team[s] !== g.turn || isMaster(g, s)) return false;
  g.log.push({ t: 'pass', team: g.turn, sid: s });
  endTurn(g);
  return true;
}
