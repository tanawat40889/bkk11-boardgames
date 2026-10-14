// I'm Stuck in the Lift — everyone secretly writes target floors, then all push the lift at once.
export const MIN = 2, MAX = 8;
export const FLOORS = [0, 5, 10, 15, 20, 25, 30, 35, 40];     // 0 = ground floor "E"
export const DRIVES = [0, 5, 10];
export const STARS = [1, 2];                                  // the two target cards
export const fname = f => (f === 0 ? 'E' : String(f));

export function newGame(sids) {
  const g = { sids: [...sids], lift: 0, dir: 1, cone: 40, round: 1, last: false, tg: {}, drive: {}, pts: {}, phase: 'write', res: null, over: false, winners: [] };
  for (const s of sids) { g.tg[s] = [null, null]; g.pts[s] = 0; }
  return g;
}

export const needs = (g, s) => g.tg[s].map((f, i) => (f == null ? i : -1)).filter(i => i >= 0);
const allWritten = g => g.sids.every(s => !needs(g, s).length);

// Write a floor on target card i (only cards that are blank right now).
export function write(g, s, i, f) {
  if (g.phase !== 'write' || !g.tg[s] || g.tg[s][i] !== null || !FLOORS.includes(f)) return false;
  g.tg[s][i] = f;
  if (allWritten(g)) g.phase = 'drive';
  return true;
}

export function drive(g, s, v) {
  if (g.phase !== 'drive' || !g.sids.includes(s) || s in g.drive || !DRIVES.includes(v)) return false;
  g.drive[s] = v;
  if (g.sids.every(x => x in g.drive)) move(g);
  return true;
}

// Move the lift by the total, bouncing off the top and the bottom.
export function travel(lift, dir, n) {
  for (let k = 0; k < n; k += 5) {
    if (lift + dir * 5 > 40 || lift + dir * 5 < 0) dir = -dir;
    lift += dir * 5;
  }
  if (lift === 40) dir = -1; else if (lift === 0) dir = 1;
  return { lift, dir };
}

function move(g) {
  const total = Object.values(g.drive).reduce((a, b) => a + b, 0), from = g.lift;
  ({ lift: g.lift, dir: g.dir } = travel(g.lift, g.dir, total));
  const f = g.lift, cone = f === g.cone, mult = f === 0 || f === 40 ? 2 : 1, gain = {}, hit = {};
  for (const s of g.sids) {
    const idx = [0, 1].filter(i => g.tg[s][i] === f);
    if (!idx.length) continue;
    hit[s] = idx;
    if (cone) { g.tg[s] = [null, null]; gain[s] = 0; continue; }      // construction site: nothing, rewrite both
    gain[s] = idx.reduce((a, i) => a + STARS[i], 0) * mult;
    g.pts[s] += gain[s];
    for (const i of idx) g.tg[s][i] = null;
  }
  g.res = { from, to: f, total, drives: { ...g.drive }, gain, hit, cone, mult };
  g.phase = 'result';
}

// After the result: cone moves down a floor; when it reaches E, one last round is played.
export function next(g) {
  if (g.phase !== 'result') return false;
  if (g.last) { finish(g); return true; }
  g.cone -= 5;
  if (g.cone <= 0) { g.cone = 0; g.last = true; }
  g.round++; g.drive = {}; g.res = null;
  g.phase = allWritten(g) ? 'drive' : 'write';
  return true;
}

function finish(g) {
  const top = Math.max(...g.sids.map(s => g.pts[s]));
  g.winners = g.sids.filter(s => g.pts[s] === top);     // ties share the win (see note in the rules)
  g.phase = 'end'; g.over = true;
}
