import { rint } from './rng.js';

// Guess Who? — 2 players, each has a secret person from the same 24. Ask yes/no questions, then name them.
export const MIN = 2, MAX = 2;
// f: woman · hair: black brown blond red white · len: bald short long · gl: glasses · hat · br: beard/moustache · er: earrings · sh: shirt colour
const P = (n, f, hair, len, gl, hat, br, er, sh, skin) => ({ n, f, hair, len, gl, hat, br, er, sh, skin });
export const PEOPLE = [
  P('Ton', 0, 'black', 'short', 0, 0, 0, 0, 'blue', 1), P('Fon', 1, 'black', 'long', 1, 0, 0, 1, 'red', 2), P('Boss', 0, 'brown', 'short', 0, 1, 1, 0, 'green', 3),
  P('Mint', 1, 'blond', 'long', 0, 0, 0, 1, 'yellow', 0), P('Kong', 0, 'white', 'bald', 1, 0, 1, 0, 'blue', 2), P('Ploy', 1, 'red', 'long', 0, 1, 0, 0, 'green', 1),
  P('Bank', 0, 'red', 'short', 1, 0, 0, 0, 'yellow', 0), P('Nan', 1, 'brown', 'short', 0, 0, 0, 1, 'blue', 3), P('Arm', 0, 'black', 'short', 0, 1, 0, 0, 'red', 2),
  P('Pim', 1, 'white', 'long', 1, 0, 0, 0, 'yellow', 1), P('Golf', 0, 'blond', 'short', 0, 0, 1, 0, 'red', 0), P('Fah', 1, 'black', 'short', 0, 1, 0, 1, 'yellow', 3),
  P('Beam', 0, 'brown', 'bald', 0, 0, 0, 1, 'red', 1), P('May', 1, 'blond', 'short', 1, 1, 0, 0, 'blue', 0), P('Pond', 0, 'black', 'bald', 0, 0, 1, 0, 'green', 3),
  P('Jane', 1, 'red', 'short', 1, 0, 0, 1, 'blue', 2), P('Tum', 0, 'white', 'short', 0, 1, 0, 0, 'yellow', 1), P('Kaew', 1, 'brown', 'long', 0, 0, 0, 0, 'red', 2),
  P('Max', 0, 'blond', 'short', 1, 1, 0, 0, 'green', 0), P('Nok', 1, 'black', 'long', 0, 0, 0, 0, 'green', 1), P('Pete', 0, 'red', 'short', 0, 0, 1, 1, 'blue', 2),
  P('Joy', 1, 'white', 'short', 0, 1, 0, 1, 'red', 3), P('Chai', 0, 'brown', 'short', 1, 0, 1, 0, 'yellow', 2), P('Bee', 1, 'brown', 'long', 1, 1, 0, 0, 'green', 0),
];
// [id, Thai question, test]
export const QUESTIONS = [
  ['f', 'เป็นผู้หญิงไหม?', p => !!p.f], ['gl', 'ใส่แว่นไหม?', p => !!p.gl], ['hat', 'ใส่หมวกไหม?', p => !!p.hat], ['br', 'มีหนวดหรือเคราไหม?', p => !!p.br],
  ['er', 'ใส่ต่างหูไหม?', p => !!p.er], ['bald', 'หัวล้านไหม?', p => p.len === 'bald'], ['long', 'ผมยาวไหม?', p => p.len === 'long'],
  ['black', 'ผมสีดำไหม?', p => p.hair === 'black'], ['brown', 'ผมสีน้ำตาลไหม?', p => p.hair === 'brown'], ['blond', 'ผมสีบลอนด์ไหม?', p => p.hair === 'blond'],
  ['redh', 'ผมสีแดงไหม?', p => p.hair === 'red'], ['white', 'ผมสีขาวไหม?', p => p.hair === 'white'],
  ['sred', 'ใส่เสื้อสีแดงไหม?', p => p.sh === 'red'], ['sblue', 'ใส่เสื้อสีน้ำเงินไหม?', p => p.sh === 'blue'], ['sgreen', 'ใส่เสื้อสีเขียวไหม?', p => p.sh === 'green'], ['syellow', 'ใส่เสื้อสีเหลืองไหม?', p => p.sh === 'yellow'],
];

export function newGame(sids, first = 0) {
  const g = { sids: [...sids], secret: {}, down: {}, turn: sids[first], log: [], winner: null, why: null, n: 0 };
  for (const s of sids) { g.secret[s] = rint(PEOPLE.length); g.down[s] = []; }
  if (g.secret[sids[0]] === g.secret[sids[1]]) g.secret[sids[1]] = (g.secret[sids[1]] + 1 + rint(PEOPLE.length - 1)) % PEOPLE.length;
  return g;
}
export const other = (g, s) => g.sids.find(x => x !== s);
// Ask a question: the app answers for the other player and lays down every face that no longer fits.
export function ask(g, s, qid) {
  const q = QUESTIONS.find(x => x[0] === qid);
  if (g.winner || s !== g.turn || !q) return false;
  const yes = q[2](PEOPLE[g.secret[other(g, s)]]);
  g.down[s] = PEOPLE.map((p, i) => i).filter(i => g.down[s].includes(i) || q[2](PEOPLE[i]) !== yes);
  g.log.push({ by: s, q: qid, yes }); if (g.log.length > 30) g.log.shift();
  g.turn = other(g, s); g.n++;
  return true;
}
export function toggle(g, s, i) { if (g.winner || !(i >= 0 && i < PEOPLE.length)) return false; g.down[s] = g.down[s].includes(i) ? g.down[s].filter(x => x !== i) : [...g.down[s], i]; return true; }   // (no g.n bump: flipping your own board must not void the other player's pending question)
// Name the other player's person: right wins, wrong loses.
export function guess(g, s, i) {
  if (g.winner || s !== g.turn || !(i >= 0 && i < PEOPLE.length)) return false;
  const ok = g.secret[other(g, s)] === i;
  g.winner = ok ? s : other(g, s); g.why = { by: s, i, ok }; g.n++;
  return true;
}
