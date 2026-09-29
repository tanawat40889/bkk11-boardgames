import { rint, shuffle } from './rng.js';
import { WORDS, norm } from './words.js';

export const MIN = 3, MAX = 10, ROUNDS = 13, RECENT = 90;
export const cluesPer = n => (n === 3 ? 2 : 1);

export function newGame(sids, rounds = ROUNDS, recent = []) {
  let pool = WORDS.map((_, i) => i).filter(i => !recent.includes(i));
  if (pool.length < rounds) pool = WORDS.map((_, i) => i);
  const deck = shuffle(pool).slice(0, rounds);
  return { sids: [...sids], deck, i: 0, g0: rint(sids.length), turn: 0, score: 0, lost: 0, clues: {}, manual: {}, guess: null, log: [] };
}

export const guesser = g => g.sids[(g.g0 + g.turn) % g.sids.length];
export const word = g => WORDS[g.deck[g.i]];
export const givers = g => g.sids.filter(s => s !== guesser(g));

export function setClues(g, s, list) {
  const k = cluesPer(g.sids.length);
  if (s === guesser(g) || !Array.isArray(list) || list.length !== k) return false;
  const t = list.map(x => String(x || '').trim().slice(0, 30));
  if (t.some(x => !x)) return false;
  g.clues[s] = t;
  return true;
}
export const allIn = g => givers(g).every(s => g.clues[s]);

// Flat list of clues with automatic strike reasons: 'dup' (same as another clue), 'word' (is/contains/is part of the mystery word).
export function review(g) {
  const w = norm(word(g));
  const items = [];
  for (const s of givers(g)) (g.clues[s] || []).forEach((text, k) => items.push({ id: `${s}:${k}`, sid: s, text, n: norm(text) }));
  const seen = {};
  items.forEach(x => (seen[x.n] = (seen[x.n] || 0) + 1));
  for (const x of items) {
    x.auto = !x.n ? 'empty' : x.n === w || x.n.includes(w) || (x.n.length >= 2 && w.includes(x.n)) ? 'word' : seen[x.n] > 1 ? 'dup' : null;
    x.out = x.id in g.manual ? g.manual[x.id] : !!x.auto;
  }
  return items.map(({ n, ...x }) => x);
}
export const shown = g => review(g).filter(x => !x.out).map(x => x.text);

export const judge = (g, text) => !!norm(text) && norm(text) === norm(word(g));

// text=null -> pass. Returns 'ok' | 'pass' | 'wrong'. Wrong also burns the next card.
export function resolve(g, text) {
  const res = text == null ? 'pass' : judge(g, text) ? 'ok' : 'wrong';
  g.guess = { text, res };
  return res;
}
export function override(g) { if (g.guess?.res === 'wrong') g.guess.res = 'ok'; }

export function advance(g) {
  const res = g.guess.res;
  if (res === 'ok') g.score++;
  g.log.push({ word: word(g), guesser: guesser(g), guess: g.guess.text, res, clues: review(g) });
  g.i++;
  if (res === 'wrong' && g.i < g.deck.length) { g.i++; g.lost++; }
  if (res !== 'ok') g.lost++;
  g.turn++;
  g.clues = {}; g.manual = {}; g.guess = null;
  return g.i >= g.deck.length;
}

export function rating(score, total) {
  const r = score / total;
  if (score === total) return 'สมบูรณ์แบบ! 🏆 ทำได้ครบทุกใบ';
  if (r >= 0.85) return 'เยี่ยมมาก! คนรอบตัวต้องอิจฉา 🤩';
  if (r >= 0.7) return 'เก่งมาก เข้าขากันดี 👏';
  if (r >= 0.5) return 'ไม่เลว ลองอีกรอบได้ดีกว่านี้ 🙂';
  return 'ต้องซ้อมอีกหน่อยนะ 😅';
}
