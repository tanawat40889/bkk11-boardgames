import { shuffle } from './rng.js';

// Coup (Rikki Tahta) — bluff about which characters you hold. Last player with influence wins.
export const MIN = 2, MAX = 6, START = 2, MUST = 10;
export const CARDS = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
// claim = character the action needs · blockBy = characters that block it · any = everyone may block (else only the target)
export const ACTS = {
  income: { cost: 0 },
  aid: { cost: 0, blockBy: ['duke'], any: true },
  coup: { cost: 7, target: true },
  tax: { cost: 0, claim: 'duke' },
  assn: { cost: 3, target: true, claim: 'assassin', blockBy: ['contessa'] },
  steal: { cost: 0, target: true, claim: 'captain', blockBy: ['captain', 'ambassador'] },
  exch: { cost: 0, claim: 'ambassador' },
};

export function newGame(sids, first = 0) {
  const deck = shuffle(CARDS.flatMap(c => [c, c, c])), hand = {}, coins = {};
  for (const s of sids) { hand[s] = [{ c: deck.pop(), up: false }, { c: deck.pop(), up: false }]; coins[s] = START; }
  if (sids.length === 2) coins[sids[first]] = 1;   // 2-player rule: the starting player begins with 1 coin
  return { sids: [...sids], deck, hand, coins, turn: sids[first], phase: 'turn', pend: null, block: null, resp: {}, lose: [], after: null, chal: null, pool: null, n: 0, w: 0, log: [], winner: null };
}

export const alive = (g, s) => !!g.hand[s]?.some(c => !c.up);
export const live = g => g.sids.filter(s => alive(g, s));
export const has = (g, s, c) => g.hand[s].some(x => !x.up && x.c === c);
const log = (g, e) => { g.log.push(e); if (g.log.length > 30) g.log.shift(); };

// Who still has to answer in the current window.
export function responders(g) {
  const p = g.pend;
  if (g.phase === 'chal') return live(g).filter(s => s !== p.actor);
  if (g.phase === 'block') return ACTS[p.act].any ? live(g).filter(s => s !== p.actor) : alive(g, p.t) ? [p.t] : [];
  if (g.phase === 'bchal') return live(g).filter(s => s !== g.block.by);
  return [];
}
export const waiting = g => responders(g).filter(s => !(s in g.resp));

export function declare(g, s, act, t = null) {
  const A = ACTS[act];
  if (g.winner || g.phase !== 'turn' || s !== g.turn || !A) return false;
  if (g.coins[s] >= MUST && act !== 'coup') return false;
  if (A.target && (t === s || !alive(g, t))) return false;
  if (A.cost > g.coins[s]) return false;
  g.coins[s] -= A.cost;
  g.pend = { actor: s, act, t: A.target ? t : null, paid: A.cost };
  g.block = null; g.chal = null; g.resp = {}; g.w++; g.n++;
  log(g, { t: 'act', sid: s, act, to: g.pend.t });
  if (act === 'income') { g.coins[s]++; return endTurn(g), true; }
  if (act === 'coup') { queueLose(g, t); g.after = 'end'; return proceed(g), true; }
  if (A.claim) g.phase = 'chal';
  else startBlock(g);
  return true;
}

// kind: 'pass' | 'chal' | 'block' (with the card claimed for the block)
export function respond(g, s, kind, card) {
  if (!['chal', 'block', 'bchal'].includes(g.phase) || !responders(g).includes(s) || s in g.resp) return false;
  const p = g.pend;
  if (kind === 'pass') {
    g.resp[s] = 'pass'; g.n++;
    if (!waiting(g).length) allPassed(g);
    return true;
  }
  if (kind === 'chal' && g.phase === 'chal') { g.n++; challenge(g, s, p.actor, ACTS[p.act].claim, 'blockstage', 'fail'); return true; }
  if (kind === 'chal' && g.phase === 'bchal') { g.n++; challenge(g, s, g.block.by, g.block.card, 'end', 'resolve'); return true; }
  if (kind === 'block' && g.phase === 'block' && ACTS[p.act].blockBy.includes(card)) {
    g.block = { by: s, card }; g.resp = {}; g.w++; g.phase = 'bchal'; g.n++;
    log(g, { t: 'block', sid: s, card });
    return true;
  }
  return false;
}
// Host override: treat everyone who hasn't answered as passing.
export function passAll(g) {
  const w = waiting(g);
  if (!w.length) return false;
  for (const s of w) g.resp[s] = 'pass';
  g.n++;
  allPassed(g);
  return true;
}
function allPassed(g) {
  if (g.phase === 'chal') startBlock(g);
  else if (g.phase === 'block') resolve(g);
  else if (g.phase === 'bchal') { log(g, { t: 'blocked', sid: g.block.by }); endTurn(g); }
}

function challenge(g, ch, cl, card, okAfter, failAfter) {
  const truth = has(g, cl, card);
  g.chal = { ch, cl, card, truth };
  log(g, { t: 'chal', sid: ch, to: cl, card, truth });
  if (truth) {
    // shows the card, shuffles it back and draws a new one
    const i = g.hand[cl].findIndex(x => !x.up && x.c === card);
    g.deck.push(card); g.deck = shuffle(g.deck);
    g.hand[cl][i] = { c: g.deck.pop(), up: false };
    queueLose(g, ch); g.after = okAfter;
  } else {
    queueLose(g, cl); g.after = failAfter;
    if (failAfter === 'fail' && g.pend.paid) g.coins[g.pend.actor] += g.pend.paid;   // a failed action costs nothing
  }
  proceed(g);
}

function queueLose(g, s) { if (alive(g, s)) g.lose.push(s); }
function proceed(g) {
  g.lose = g.lose.filter(s => alive(g, s));
  if (checkWin(g)) return;
  if (g.lose.length) { g.phase = 'lose'; return; }
  const a = g.after; g.after = null;
  if (a === 'blockstage') startBlock(g);
  else if (a === 'resolve') resolve(g);
  else endTurn(g);
}

export function loseCard(g, s, i) {
  if (g.phase !== 'lose' || g.lose[0] !== s || !g.hand[s][i] || g.hand[s][i].up) return false;
  g.hand[s][i].up = true; g.lose.shift(); g.n++;
  log(g, { t: 'lose', sid: s, c: g.hand[s][i].c, out: !alive(g, s) });
  proceed(g);
  return true;
}

function startBlock(g) {
  const A = ACTS[g.pend.act];
  if (!alive(g, g.pend.actor)) return endTurn(g);
  g.resp = {}; g.w++;
  if (!A.blockBy) return resolve(g);
  g.phase = 'block';
  if (!responders(g).length) resolve(g);
}

function resolve(g) {
  const p = g.pend, s = p.actor;
  if (!alive(g, s)) return endTurn(g);
  if (p.act === 'tax') g.coins[s] += 3;
  else if (p.act === 'aid') g.coins[s] += 2;
  else if (p.act === 'steal') { const k = Math.min(2, g.coins[p.t]); g.coins[p.t] -= k; g.coins[s] += k; p.got = k; }
  else if (p.act === 'assn') { queueLose(g, p.t); g.after = 'end'; return proceed(g); }
  else if (p.act === 'exch') { g.pool = [g.deck.pop(), g.deck.pop()]; g.phase = 'exch'; return; }
  log(g, { t: 'done', sid: s, act: p.act, to: p.t, got: p.got });
  endTurn(g);
}

// Ambassador: choose which cards to keep from your hidden cards + the 2 drawn (keep = indexes into exchPool()).
export const exchPool = (g, s) => [...g.hand[s].filter(x => !x.up).map(x => x.c), ...(g.pool || [])];
export function exchange(g, s, keep) {
  if (g.phase !== 'exch' || s !== g.pend.actor || !Array.isArray(keep)) return false;
  const pool = exchPool(g, s), need = g.hand[s].filter(x => !x.up).length;
  const k = [...new Set(keep.map(Number))];
  if (k.length !== need || k.some(i => !(i >= 0 && i < pool.length))) return false;
  const kept = k.map(i => pool[i]);
  const back = pool.filter((_, i) => !k.includes(i));
  let j = 0;
  g.hand[s] = g.hand[s].map(x => (x.up ? x : { c: kept[j++], up: false }));
  g.deck = shuffle([...g.deck, ...back]); g.pool = null; g.n++;
  log(g, { t: 'done', sid: s, act: 'exch' });
  endTurn(g);
  return true;
}

// Host override when a player has gone quiet: reveal their first face-down card / keep their current cards.
export function forceStep(g) {
  if (g.phase === 'lose') return loseCard(g, g.lose[0], g.hand[g.lose[0]].findIndex(x => !x.up));
  if (g.phase === 'exch') { const n = g.hand[g.pend.actor].filter(x => !x.up).length; return exchange(g, g.pend.actor, [...Array(n).keys()]); }
  return passAll(g);
}

function checkWin(g) {
  const l = live(g);
  if (l.length === 1) { g.winner = l[0]; g.phase = 'over'; g.lose = []; return true; }
  return false;
}
function endTurn(g) {
  if (checkWin(g)) return;
  g.phase = 'turn'; g.resp = {}; g.w++; g.lose = []; g.after = null;
  const i = g.sids.indexOf(g.turn);
  for (let k = 1; k <= g.sids.length; k++) { const s = g.sids[(i + k) % g.sids.length]; if (alive(g, s)) { g.turn = s; break; } }
}
