import { shuffle, rint } from './rng.js';

// Taco Cat Goat Cheese Pizza: flip a card while saying the next word; slap when the card matches the word.
export const MIN = 2, MAX = 8;
export const WORDS = ['taco', 'cat', 'goat', 'cheese', 'pizza'];
export const SPECIAL = ['gorilla', 'narwhal', 'groundhog'];
export const TH = { taco: 'ทาโก้', cat: 'แมว', goat: 'แพะ', cheese: 'ชีส', pizza: 'พิซซ่า', gorilla: 'กอริลลา', narwhal: 'นาร์วาฬ', groundhog: 'กราวด์ฮ็อก' };
export const WINDOW = 4000;   // ms everyone has to slap
const PENALTY = 9000;         // wrong gesture counts as very slow

export function deck() {
  return [...WORDS.flatMap(w => Array(11).fill(w)), ...SPECIAL.flatMap(w => Array(3).fill(w))];
}

export function newGame(sids) {
  const d = shuffle(deck()), hands = {};
  sids.forEach(s => (hands[s] = []));
  d.forEach((c, i) => hands[sids[i % sids.length]].push(c));
  return { sids: [...sids], hands, pile: [], word: 0, turn: rint(sids.length), top: null, slap: null, winner: null, last: null, n: 0 };
}

export const turnSid = g => g.sids[g.turn % g.sids.length];
const setTurn = (g, s) => { g.turn = g.sids.indexOf(s); };

export function flip(g, s, now = 0) {
  if (g.winner || g.slap || turnSid(g) !== s) return false;
  const card = g.hands[s].length ? g.hands[s].shift() : null, said = WORDS[g.word % 5];
  if (card) g.pile.push(card);
  g.word++;
  g.top = { card, said, by: s, n: ++g.n };
  g.last = null;
  if (card && (card === said || SPECIAL.includes(card))) g.slap = { times: {}, t0: now, special: SPECIAL.includes(card) ? card : null };
  else g.turn = (g.turn + 1) % g.sids.length;
  return true;
}

function takePile(g, s, why, extra = {}) {
  g.hands[s].push(...g.pile);
  g.last = { loser: s, took: g.pile.length, why, ...extra };
  g.pile = []; g.slap = null; g.word = 0; g.top = null;
  setTurn(g, s);
}

// ms = the player's own reaction time (measured on their phone, so lag does not matter).
export function slap(g, s, ms, gesture) {
  if (g.winner || !g.sids.includes(s)) return false;
  if (!g.slap) { takePile(g, s, 'false'); return true; }            // slapped when there was nothing to slap
  if (s in g.slap.times) return false;
  ms = Math.max(0, Math.min(WINDOW, +ms || 0));
  g.slap.times[s] = g.slap.special && gesture !== g.slap.special ? PENALTY + ms : ms;
  if (g.sids.every(x => x in g.slap.times)) resolve(g);
  return true;
}

// Called when everyone slapped or the window ran out.
export function resolve(g) {
  if (!g.slap) return false;
  const t = s => (s in g.slap.times ? g.slap.times[s] : Infinity);
  const sorted = [...g.sids].sort((a, b) => t(a) - t(b));
  const first = sorted[0], worst = t(sorted.at(-1));
  const tied = sorted.filter(s => t(s) === worst);
  const loser = tied[rint(tied.length)];
  const times = { ...g.slap.times };
  if (t(first) < Infinity && t(first) < PENALTY && !g.hands[first].length) { g.winner = first; g.last = { first, times, why: 'win' }; g.slap = null; return true; }
  takePile(g, loser, 'slow', { first: t(first) < Infinity ? first : null, times });
  return true;
}
