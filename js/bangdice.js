import { shuffle, rint } from './rng.js';

// Bang! The Dice Game — base rules, without the character cards (everyone starts on 8 life, the Sheriff on 10).
export const MIN = 4, MAX = 8;
export const FACES = ['arrow', 'dyn', 'one', 'two', 'beer', 'gat'];
export const ARROWS = 9, LIFE = 8, DICE = 5, ROLLS = 3;
// S = sheriff, D = deputy, O = outlaw, R = renegade
export const SETUP = { 4: 'SROO', 5: 'SROOD', 6: 'SROOOD', 7: 'SROOODD', 8: 'SRROOODD' };

export function newGame(sids) {
  const n = sids.length, cards = shuffle(SETUP[n].split('')), role = {}, life = {}, max = {}, arrows = {};
  sids.forEach((s, i) => { role[s] = cards[i]; max[s] = life[s] = LIFE + (cards[i] === 'S' ? 2 : 0); arrows[s] = 0; });
  const sheriff = sids.find(s => role[s] === 'S');
  return { sids: [...sids], role, life, max, arrows, pile: ARROWS, alive: [...sids], sheriff, turn: sheriff, dice: null, rolls: 0, phase: 'roll', todo: null, n: 0, log: [], winner: null, wsids: [] };
}

const log = (g, e) => { g.log.push(e); if (g.log.length > 30) g.log.shift(); };
export const count = (g, f) => (g.dice || []).filter(d => d === f).length;

// Players standing exactly d seats away (either direction) among the living. With 3 or fewer alive, a "2" works like a "1".
export function targets(g, s, d) {
  const a = g.alive, n = a.length, i = a.indexOf(s);
  if (i < 0 || n < 2) return [];
  if (n <= 3) d = 1;
  return [...new Set([a[(i + d) % n], a[(i - d + n * 2) % n]])].filter(x => x !== s);
}

function checkWin(g) {
  if (g.winner) return true;
  const a = g.alive, sheriffAlive = a.includes(g.sheriff);
  if (!sheriffAlive) {
    if (a.length === 1 && g.role[a[0]] === 'R') { g.winner = 'R'; g.wsids = [a[0]]; }
    else { g.winner = 'O'; g.wsids = g.sids.filter(s => g.role[s] === 'O'); }
  } else if (!a.some(s => g.role[s] === 'O' || g.role[s] === 'R')) {
    g.winner = 'S'; g.wsids = g.sids.filter(s => g.role[s] === 'S' || g.role[s] === 'D');
  }
  if (g.winner) { g.phase = 'end'; g.todo = null; }
  return !!g.winner;
}

// Apply damage to several players at once (Indians, Gatling), then bury the dead and check who won.
function hurt(g, dmg, why, by = null) {
  const dead = [];
  for (const [s, n] of Object.entries(dmg)) {
    if (!n || !g.alive.includes(s)) continue;
    g.life[s] = Math.max(0, g.life[s] - n);
    if (!g.life[s]) dead.push(s);
  }
  for (const s of dead) {
    g.alive = g.alive.filter(x => x !== s);
    g.pile += g.arrows[s]; g.arrows[s] = 0;
    log(g, { t: 'dead', sid: s, role: g.role[s], why, by });
  }
  return checkWin(g);
}

function indians(g) {
  const dmg = {};
  for (const s of g.alive) dmg[s] = g.arrows[s];
  log(g, { t: 'indians', dmg: { ...dmg } });
  for (const s of g.alive) g.arrows[s] = 0;
  g.pile = ARROWS;
  hurt(g, dmg, 'indians');
}

function nextTurn(g) {
  if (g.winner) return;
  const i = g.sids.indexOf(g.turn);
  for (let k = 1; k <= g.sids.length; k++) { const t = g.sids[(i + k) % g.sids.length]; if (g.alive.includes(t)) { g.turn = t; break; } }
  g.dice = null; g.rolls = 0; g.phase = 'roll'; g.todo = null;
}

// Move on to the next thing the dice still owe: 1s, then 2s, then beers, then the Gatling.
function step(g) {
  if (g.winner) return;
  const s = g.turn, t = g.todo;
  if (!g.alive.includes(s)) return nextTurn(g);
  if (t.one > 0 || t.two > 0 || t.beer > 0) return;
  if (t.gat) {
    t.gat = false;
    const dmg = {};
    for (const x of g.alive) if (x !== s) dmg[x] = 1;
    g.pile += g.arrows[s]; g.arrows[s] = 0;
    log(g, { t: 'gatling', sid: s });
    if (hurt(g, dmg, 'gatling', s)) return;
  }
  nextTurn(g);
}

function toResolve(g) {
  g.phase = 'resolve';
  g.todo = { one: count(g, 'one'), two: count(g, 'two'), beer: count(g, 'beer'), gat: count(g, 'gat') >= 3 };
  step(g);
}

// `keep` = indexes of the dice that stay on the table (ignored on the first roll). `rnd` lets tests fix the outcome.
export function roll(g, s, keep = [], rnd = () => FACES[rint(6)]) {
  if (g.phase !== 'roll' || s !== g.turn || g.rolls >= ROLLS) return false;
  let fresh;
  if (!g.dice) { g.dice = Array.from({ length: DICE }, rnd); fresh = g.dice.map((_, i) => i); }
  else {
    fresh = g.dice.map((_, i) => i).filter(i => !keep.includes(i) && g.dice[i] !== 'dyn');   // dynamite can never be re-rolled
    if (!fresh.length) return false;
    for (const i of fresh) g.dice[i] = rnd();
  }
  g.rolls++; g.n++;
  log(g, { t: 'roll', sid: s, dice: [...g.dice], k: g.rolls });
  // arrows are taken at once, one at a time; taking the last one brings the Indians
  for (const i of fresh) {
    if (g.dice[i] !== 'arrow') continue;
    g.pile--; g.arrows[s]++;
    if (g.pile <= 0) indians(g);
    if (g.winner) return true;
    if (!g.alive.includes(s)) { nextTurn(g); return true; }
  }
  if (count(g, 'dyn') >= 3) {
    log(g, { t: 'boom', sid: s });
    if (hurt(g, { [s]: 1 }, 'dynamite')) return true;
    if (!g.alive.includes(s)) { nextTurn(g); return true; }
    toResolve(g);
    return true;
  }
  if (g.rolls >= ROLLS || g.dice.every(d => d === 'dyn')) toResolve(g);
  return true;
}

export function stop(g, s) {
  if (g.phase !== 'roll' || s !== g.turn || !g.dice) return false;
  g.n++;
  toResolve(g);
  return true;
}

// What the current player must do next while resolving: 'one' | 'two' | 'beer' | null
export const need = g => (g.phase !== 'resolve' || !g.todo ? null : g.todo.one > 0 ? 'one' : g.todo.two > 0 ? 'two' : g.todo.beer > 0 ? 'beer' : null);

export function shoot(g, s, t) {
  const k = need(g);
  if (s !== g.turn || (k !== 'one' && k !== 'two') || !targets(g, s, k === 'one' ? 1 : 2).includes(t)) return false;
  g.todo[k]--; g.n++;
  log(g, { t: 'shot', sid: s, to: t, d: k === 'one' ? 1 : 2 });
  if (!hurt(g, { [t]: 1 }, 'shot', s)) step(g);
  return true;
}

export function heal(g, s, t) {
  if (s !== g.turn || need(g) !== 'beer' || !g.alive.includes(t)) return false;
  g.todo.beer--; g.n++;
  if (g.life[t] < g.max[t]) g.life[t]++;
  log(g, { t: 'beer', sid: s, to: t });
  step(g);
  return true;
}
