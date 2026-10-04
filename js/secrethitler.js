import { shuffle, rint } from './rng.js';

// Secret Hitler (rules © Goat, Wolf & Cabbage, CC BY-NC-SA 4.0). Liberals vs. hidden fascists and Hitler.
export const MIN = 5, MAX = 10;
export const SETUP = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] }; // [liberals, fascists besides Hitler]
// Presidential power unlocked by the Nth fascist policy.
export const powers = n => (n <= 6 ? [null, null, 'peek', 'kill', 'kill'] : n <= 8 ? [null, 'investigate', 'special', 'kill', 'kill'] : ['investigate', 'investigate', 'special', 'kill', 'kill']);
export const LIB_WIN = 5, FAS_WIN = 6;

export function newGame(sids) {
  const n = sids.length, [l, f] = SETUP[n];
  const cards = shuffle([...Array(l).fill('L'), ...Array(f).fill('F'), 'H']), role = {};
  sids.forEach((s, i) => (role[s] = cards[i]));
  return {
    sids: [...sids], role, alive: [...sids], deck: shuffle([...Array(6).fill('L'), ...Array(11).fill('F')]), discard: [],
    lib: 0, fas: 0, tracker: 0, pres: sids[rint(n)], ret: null, chan: null, nominee: null, lastPres: null, lastChan: null,
    votes: {}, lastVote: null, hand: [], phase: 'role', power: null, peek: null, inv: null, investigated: [], vetoRefused: false,
    log: [], winner: null, why: null, ready: [],
  };
}

export const party = (g, s) => (g.role[s] === 'L' ? 'L' : 'F');
// Fascists know each other and Hitler; Hitler only knows the fascists in 5–6 player games.
export function known(g, s) {
  const r = g.role[s];
  if (r === 'L') return [];
  if (r === 'H' && g.sids.length > 6) return [];
  return g.sids.filter(x => x !== s && g.role[x] !== 'L');
}

const nextAlive = (g, s) => {
  const i = g.sids.indexOf(s);
  for (let k = 1; k <= g.sids.length; k++) { const t = g.sids[(i + k) % g.sids.length]; if (g.alive.includes(t)) return t; }
  return s;
};
export const eligible = (g, s) => g.alive.includes(s) && s !== g.pres && s !== g.lastChan && (g.alive.length <= 5 || s !== g.lastPres);

function win(g, w, why) { g.winner = w; g.why = why; g.phase = 'end'; }
function refill(g) { if (g.deck.length < 3) { g.deck = shuffle([...g.deck, ...g.discard]); g.discard = []; } }

function nextRound(g) {
  if (g.winner) return;
  if (g.ret) { g.pres = g.ret; g.ret = null; } else g.pres = nextAlive(g, g.pres);
  g.chan = null; g.nominee = null; g.votes = {}; g.hand = []; g.power = null; g.peek = null; g.inv = null; g.vetoRefused = false;
  g.phase = 'nom';
}

function enact(g, p, gov) {
  g.log.push({ t: 'policy', p, gov, pres: gov ? g.pres : null, chan: gov ? g.chan : null });
  if (p === 'L') { if (++g.lib >= LIB_WIN) return win(g, 'L', 'policies'); }
  else if (++g.fas >= FAS_WIN) return win(g, 'F', 'policies');
  refill(g);
  if (gov) { g.lastPres = g.pres; g.lastChan = g.chan; }
  const pw = gov && p === 'F' ? powers(g.sids.length)[g.fas - 1] : null;
  if (!pw) return nextRound(g);
  g.power = pw; g.phase = 'power';
  if (pw === 'peek') g.peek = g.deck.slice(0, 3);
}

function chaos(g) {
  refill(g);
  const p = g.deck.shift();
  g.tracker = 0; g.lastPres = null; g.lastChan = null;
  enact(g, p, false);
}

export function start(g) { if (g.phase !== 'role') return false; g.phase = 'nom'; return true; }

export function nominate(g, s, t) {
  if (g.phase !== 'nom' || s !== g.pres || !eligible(g, t)) return false;
  g.nominee = t; g.votes = {}; g.phase = 'vote';
  return true;
}

export function vote(g, s, ja) {
  if (g.phase !== 'vote' || !g.alive.includes(s)) return false;
  g.votes[s] = !!ja;
  if (!g.alive.every(x => x in g.votes)) return true;
  const yes = g.alive.filter(x => g.votes[x]).length, ok = yes * 2 > g.alive.length;
  g.lastVote = { votes: { ...g.votes }, ok, pres: g.pres, chan: g.nominee };
  g.log.push({ t: 'vote', ok, pres: g.pres, chan: g.nominee });
  if (ok) {
    g.chan = g.nominee;
    if (g.fas >= 3 && g.role[g.chan] === 'H') return win(g, 'F', 'hitler-chancellor'), true;
    g.tracker = 0;
    refill(g);
    g.hand = g.deck.splice(0, 3);
    g.phase = 'pres';
  } else if (++g.tracker >= 3) { chaos(g); }
  else nextRound(g);
  return true;
}

export function presDiscard(g, s, i) {
  if (g.phase !== 'pres' || s !== g.pres || !(i in g.hand)) return false;
  g.discard.push(g.hand.splice(i, 1)[0]);
  g.phase = 'chan';
  return true;
}

export function chanEnact(g, s, i) {
  if (g.phase !== 'chan' || s !== g.chan || !(i in g.hand)) return false;
  const p = g.hand.splice(i, 1)[0];
  g.discard.push(...g.hand); g.hand = [];
  enact(g, p, true);
  return true;
}

export const canVeto = g => g.phase === 'chan' && g.fas >= 5 && !g.vetoRefused;
export function askVeto(g, s) {
  if (!canVeto(g) || s !== g.chan) return false;
  g.phase = 'veto';
  return true;
}
export function answerVeto(g, s, yes) {
  if (g.phase !== 'veto' || s !== g.pres) return false;
  if (!yes) { g.vetoRefused = true; g.phase = 'chan'; return true; }
  g.discard.push(...g.hand); g.hand = [];
  g.lastPres = g.pres; g.lastChan = g.chan;
  g.log.push({ t: 'veto', pres: g.pres, chan: g.chan });
  refill(g);
  if (++g.tracker >= 3) chaos(g); else nextRound(g);
  return true;
}

// Presidential powers. `t` is the chosen player (not needed for peek / closing the investigation result).
export function usePower(g, s, t) {
  if (g.phase !== 'power' || s !== g.pres) return false;
  const ok = x => g.alive.includes(x) && x !== s;
  switch (g.power) {
    case 'peek': case 'invshow': nextRound(g); return true;
    case 'investigate':
      if (!ok(t) || g.investigated.includes(t)) return false;
      g.investigated.push(t);
      g.inv = { target: t, party: party(g, t) };
      g.log.push({ t: 'investigate', pres: s, target: t });
      g.power = 'invshow';
      return true;
    case 'special':
      if (!ok(t)) return false;
      g.log.push({ t: 'special', pres: s, target: t });
      {
        // after the special president's turn, play returns to whoever was next in the normal order
        const ret = nextAlive(g, s);
        nextRound(g);
        g.pres = t; g.ret = ret;
      }
      return true;
    case 'kill':
      if (!ok(t)) return false;
      g.alive = g.alive.filter(x => x !== t);
      g.log.push({ t: 'kill', pres: s, target: t });
      if (g.role[t] === 'H') return win(g, 'L', 'hitler-killed'), true;
      nextRound(g);
      return true;
  }
  return false;
}
