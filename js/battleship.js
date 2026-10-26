import { rint } from './rng.js';

// Battleship — 2 players, 10×10 seas. Hide your fleet, then take turns firing at the other sea.
export const MIN = 2, MAX = 2, N = 10;
export const FLEET = [['carrier', 5], ['battleship', 4], ['cruiser', 3], ['sub', 3], ['destroyer', 2]];

// Ships may not touch each other, even at the corners (keeps the hunt fair).
export function randomFleet() {
  for (;;) {
    const taken = new Set(), ships = [];
    let ok = true;
    for (const [id, len] of FLEET) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const h = rint(2) === 0, r = rint(h ? N : N - len + 1), c = rint(h ? N - len + 1 : N);
        const cells = Array.from({ length: len }, (_, i) => (h ? [r, c + i] : [r + i, c]));
        if (cells.some(([y, x]) => [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => taken.has(`${y + dy},${x + dx}`))))) continue;
        cells.forEach(([y, x]) => taken.add(`${y},${x}`));
        ships.push({ id, cells: cells.map(([y, x]) => y * N + x) });
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}

export function newGame(sids, first = 0) {
  const g = { sids: [...sids], fleet: {}, shots: {}, ready: [], phase: 'place', turn: sids[first], last: null, winner: null, n: 0 };
  for (const s of sids) { g.fleet[s] = randomFleet(); g.shots[s] = {}; }   // shots[s][cell] = 'h' | 'm' — what s fired at the other sea
  return g;
}
export const other = (g, s) => g.sids.find(x => x !== s);
export function reroll(g, s) { if (g.phase !== 'place' || g.ready.includes(s)) return false; g.fleet[s] = randomFleet(); g.n++; return true; }
export function ready(g, s) {
  if (g.phase !== 'place' || g.ready.includes(s) || !g.sids.includes(s)) return false;
  g.ready.push(s); g.n++;
  if (g.ready.length === g.sids.length) g.phase = 'play';
  return true;
}
export const sunk = (g, owner) => g.fleet[owner].filter(sh => sh.cells.every(c => g.shots[other(g, owner)][c] === 'h')).map(sh => sh.id);

export function fire(g, s, cell) {
  if (g.phase !== 'play' || s !== g.turn || !(cell >= 0 && cell < N * N) || g.shots[s][cell]) return false;
  const o = other(g, s), ship = g.fleet[o].find(sh => sh.cells.includes(cell));
  g.shots[s][cell] = ship ? 'h' : 'm';
  const sank = ship && ship.cells.every(c => g.shots[s][c] === 'h') ? ship.id : null;
  g.last = { by: s, cell, hit: !!ship, sank };
  g.n++;
  if (sunk(g, o).length === FLEET.length) { g.winner = s; g.phase = 'over'; return true; }
  if (!ship) g.turn = o;   // a hit earns another shot
  return true;
}
