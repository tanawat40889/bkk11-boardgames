import { shuffle, rint } from './rng.js';

// No Thanks!: cards 3–35, 9 removed unseen. On your turn pay 1 chip to pass the card on, or take it with every chip on it.
// Runs of consecutive cards only count their lowest card. Each chip is −1. Lowest score wins.
export const MIN = 2, MAX = 7, LO = 3, HI = 35, REMOVE = 9;
export const chipsFor = n => (n >= 7 ? 7 : n === 6 ? 9 : 11);

export function newGame(sids) {
  const deck = shuffle(Array.from({ length: HI - LO + 1 }, (_, i) => LO + i)).slice(REMOVE);
  const c = chipsFor(sids.length);
  return {
    sids: [...sids], deck, card: deck.pop(), pot: 0, turn: rint(sids.length),
    chips: Object.fromEntries(sids.map(s => [s, c])), cards: Object.fromEntries(sids.map(s => [s, []])),
    log: [], over: false, res: null, n: 0,
  };
}

export const cur = g => g.sids[g.turn];

// sorted cards split into runs of consecutive numbers
export function runs(cards) {
  const out = [];
  for (const c of [...cards].sort((a, b) => a - b)) {
    const r = out.at(-1);
    if (r && c === r.at(-1) + 1) r.push(c); else out.push([c]);
  }
  return out;
}
export const cardPts = cards => runs(cards).reduce((t, r) => t + r[0], 0);
export const score = (g, s) => cardPts(g.cards[s]) - g.chips[s];

export function pass(g, s) {
  if (g.over || s !== cur(g) || g.chips[s] < 1) return false;
  g.chips[s]--;
  g.pot++;
  g.log.push({ t: 'pass', s, c: g.card });
  g.turn = (g.turn + 1) % g.sids.length;
  g.n++;
  return true;
}

export function take(g, s) {
  if (g.over || s !== cur(g)) return false;
  g.cards[s].push(g.card);
  g.chips[s] += g.pot;
  g.log.push({ t: 'take', s, c: g.card, pot: g.pot });
  g.pot = 0;
  g.n++;
  if (g.deck.length) g.card = g.deck.pop();   // the taker turns the next card and plays again
  else finish(g);
  return true;
}

function finish(g) {
  g.card = null;
  g.over = true;
  const rows = g.sids.map(s => ({ s, cards: cardPts(g.cards[s]), chips: g.chips[s], total: score(g, s) })).sort((a, b) => a.total - b.total);
  const best = rows[0].total;
  g.res = { rows, win: rows.filter(r => r.total === best).map(r => r.s) };
}
