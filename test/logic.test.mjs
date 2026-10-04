import assert from 'node:assert/strict';
import * as SF from '../js/spyfall.js';
import * as WW from '../js/onuw.js';
import * as UC from '../js/undercover.js';
import * as AV from '../js/avalon.js';
import * as IN from '../js/insider.js';
import * as JO from '../js/justone.js';
import { WORDS } from '../js/words.js';
import * as SK from '../js/skull.js';
import * as MI from '../js/mind.js';
import * as CN from '../js/codenames.js';
import * as SC from '../js/scout.js';
import * as SH from '../js/secrethitler.js';
import * as CU from '../js/camelup.js';
import * as TC from '../js/taco.js';
import * as SA from '../js/salem.js';
import { rint } from '../js/rng.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('✓', name); };
const sids = n => Array.from({ length: n }, (_, i) => 's' + i);

t('spyfall data: 10 unique roles per location, unique location names', () => {
  const names = new Set();
  for (const l of SF.LOCATIONS) {
    assert.equal(l.r.length, 10, l.n);
    assert.equal(new Set(l.r).size, 10, 'dup role in ' + l.n);
    names.add(l.n);
  }
  assert.equal(names.size, SF.LOCATIONS.length);
});

t('spyfall deal: exact spies, unique roles, everyone assigned, 3..10 players', () => {
  for (let n = SF.MIN; n <= SF.MAX; n++)
    for (const spies of [1, 2]) for (let k = 0; k < 2000; k++) {
      const p = sids(n), d = SF.deal(p, spies);
      const want = Math.min(spies, SF.maxSpies(n));
      assert.equal(d.spies.length, want);
      const roled = Object.keys(d.roles);
      assert.equal(roled.length + d.spies.length, n);
      assert.equal(new Set(Object.values(d.roles)).size, roled.length, 'duplicate role');
      for (const r of Object.values(d.roles)) assert.ok(SF.LOCATIONS[d.loc].r.includes(r), 'role not from location');
      assert.ok(p.includes(d.first));
      assert.ok(d.spies.every(s => !(s in d.roles)));
    }
});

t('spyfall: spy seat & location roughly uniform', () => {
  const N = 60000, n = 6, seat = Array(n).fill(0), loc = Array(SF.LOCATIONS.length).fill(0);
  for (let k = 0; k < N; k++) { const d = SF.deal(sids(n), 1); seat[+d.spies[0].slice(1)]++; loc[d.loc]++; }
  for (const c of seat) assert.ok(Math.abs(c / N - 1 / n) < 0.01, 'spy seat bias ' + seat);
  const e = N / SF.LOCATIONS.length;
  for (const c of loc) assert.ok(Math.abs(c - e) / e < 0.12, 'location bias ' + loc);
});

t('spyfall: no location repeats within RECENT rounds', () => {
  let recent = [];
  for (let k = 0; k < 5000; k++) {
    const d = SF.deal(sids(5), 1, recent);
    assert.ok(!recent.includes(d.loc));
    recent = [d.loc, ...recent].slice(0, SF.RECENT);
  }
});

t('onuw recommend decks valid for 3..10', () => {
  for (let n = WW.MIN; n <= WW.MAX; n++) assert.deepEqual(WW.validate(WW.recommend(n), n), [], 'n=' + n);
});

t('onuw deal: every card used exactly once, role seat uniform', () => {
  const n = 5, deck = WW.recommend(n), N = 40000, wolfSeat = Array(n + 3).fill(0);
  for (let k = 0; k < N; k++) {
    const g = WW.newGame(sids(n), deck);
    const all = [...Object.values(g.init), ...g.center].sort();
    assert.deepEqual(all, [...deck].sort());
    Object.entries(g.init).forEach(([s, r]) => r === 'seer' && wolfSeat[+s.slice(1)]++);
    g.center.forEach((r, i) => r === 'seer' && wolfSeat[n + i]++);
  }
  for (const c of wolfSeat) assert.ok(Math.abs(c / N - 1 / (n + 3)) < 0.01, 'bias ' + wolfSeat);
});

// Build a game with fixed cards
function fixed(init, center) {
  const s = Object.keys(init);
  const g = WW.newGame(s, [...Object.values(init), ...center]);
  g.init = { ...init }; g.cur = { ...init }; g.center = [...center]; g.centerInit = [...center];
  return g;
}
const goto = (g, r) => { g.pi = g.phases.indexOf(r); assert.ok(g.pi >= 0, r); };

t('onuw night actions', () => {
  const g = fixed({ a: 'werewolf', b: 'seer', c: 'robber', d: 'troublemaker', e: 'drunk', f: 'insomniac' }, ['villager', 'minion', 'tanner']);
  goto(g, 'werewolf');
  assert.equal(WW.actionKind(g, 'werewolf', 'a'), 'peek');
  assert.equal(WW.act(g, 'a', { c: 2 }).cards[0].card, 'tanner');
  assert.equal(WW.act(g, 'a', { c: 1 }), null, 'only once');
  goto(g, 'seer');
  assert.equal(WW.act(g, 'b', { p: 'b' }), null, 'no self');
  assert.equal(WW.act(g, 'b', { cs: [1, 1] }), null);
  assert.equal(WW.act(g, 'b', { p: 'a' }).cards[0].card, 'werewolf');
  goto(g, 'robber');
  assert.equal(WW.act(g, 'a', { p: 'b' }), null, 'wrong role');
  assert.equal(WW.act(g, 'c', { p: 'a' }).card, 'werewolf');
  assert.equal(g.cur.a, 'robber');
  goto(g, 'troublemaker');
  WW.act(g, 'd', { ps: ['c', 'f'] });
  assert.equal(g.cur.f, 'werewolf'); assert.equal(g.cur.c, 'insomniac');
  goto(g, 'drunk');
  WW.endPhase(g);
  assert.ok(g.acted.e, 'drunk auto');
  assert.equal(g.cur.e === 'drunk', false);
  goto(g, 'insomniac');
  assert.deepEqual(WW.phaseInfo(g, 'insomniac', 'f'), { k: 'self', card: 'werewolf' });
  // robber acts based on INITIAL card: 'a' is now robber but can't rob
  goto(g, 'robber'); g.acted = {};
  assert.equal(WW.act(g, 'a', { p: 'b' }), null);
});

t('onuw lone vs pair wolves, minion, masons info', () => {
  const g = fixed({ a: 'werewolf', b: 'werewolf', c: 'minion', d: 'mason' }, ['mason', 'seer', 'villager']);
  assert.equal(WW.actionKind(g, 'werewolf', 'a'), null);
  assert.deepEqual(WW.phaseInfo(g, 'werewolf', 'a').others, ['b']);
  assert.deepEqual(WW.phaseInfo(g, 'minion', 'c').wolves, ['a', 'b']);
  assert.deepEqual(WW.phaseInfo(g, 'mason', 'd').others, []);
});

const R = (init, votes, center = ['villager', 'villager', 'villager']) => WW.resolve(fixed(init, center), votes);

t('onuw: werewolf dies -> village wins', () => {
  const r = R({ a: 'werewolf', b: 'seer', c: 'villager' }, { a: 'b', b: 'a', c: 'a' });
  assert.deepEqual(r.dead, ['a']); assert.ok(r.village && !r.wolf);
  assert.deepEqual(r.win, { a: false, b: true, c: true });
});
t('onuw: villager dies -> wolves win (minion too)', () => {
  const r = R({ a: 'werewolf', b: 'seer', c: 'villager', d: 'minion' }, { a: 'b', b: 'c', c: 'b', d: 'b' });
  assert.deepEqual(r.dead, ['b']); assert.ok(!r.village && r.wolf);
  assert.ok(r.win.a && r.win.d && !r.win.b);
});
t('onuw: all get 1 vote -> nobody dies', () => {
  const r = R({ a: 'werewolf', b: 'seer', c: 'villager' }, { a: 'b', b: 'c', c: 'a' });
  assert.deepEqual(r.dead, []); assert.ok(r.wolf && !r.village);
});
t('onuw: no wolves among players, nobody dies -> village wins', () => {
  const r = R({ a: 'seer', b: 'robber', c: 'villager' }, { a: 'b', b: 'c', c: 'a' }, ['werewolf', 'werewolf', 'drunk']);
  assert.ok(r.village && !r.wolf && r.noWolves);
});
t('onuw: no wolves, someone dies -> everyone (village) loses', () => {
  const r = R({ a: 'seer', b: 'robber', c: 'villager' }, { a: 'b', b: 'a', c: 'b' }, ['werewolf', 'werewolf', 'drunk']);
  assert.ok(!r.village && !r.wolf);
});
t('onuw: no wolves, minion present, other dies -> minion wins', () => {
  const r = R({ a: 'seer', b: 'minion', c: 'villager', d: 'robber' }, { a: 'c', b: 'c', c: 'a', d: 'a' }, ['werewolf', 'werewolf', 'drunk']);
  assert.ok(r.wolf && !r.village && r.win.b);
});
t('onuw: no wolves, only minion dies -> village wins', () => {
  const r = R({ a: 'seer', b: 'minion', c: 'villager' }, { a: 'b', b: 'a', c: 'b' }, ['werewolf', 'werewolf', 'drunk']);
  assert.ok(r.village && !r.wolf);
});
t('onuw: tanner dies -> tanner wins, wolves lose', () => {
  const r = R({ a: 'werewolf', b: 'tanner', c: 'villager' }, { a: 'b', b: 'c', c: 'b' });
  assert.ok(r.tanner && !r.wolf && !r.village && r.win.b && !r.win.a);
});
t('onuw: tanner + werewolf die -> tanner and village win', () => {
  const r = R({ a: 'werewolf', b: 'tanner', c: 'villager', d: 'seer' }, { a: 'b', b: 'a', c: 'a', d: 'b' });
  assert.deepEqual(r.dead.sort(), ['a', 'b']); assert.ok(r.village && r.win.b && r.win.c);
});
t('onuw: hunter takes his target down', () => {
  const r = R({ a: 'werewolf', b: 'hunter', c: 'villager', d: 'seer' }, { a: 'b', b: 'a', c: 'b', d: 'c' });
  assert.deepEqual(r.dead, ['b', 'a']); assert.ok(r.village);
});
t('onuw: self-votes ignored', () => {
  const r = R({ a: 'werewolf', b: 'seer', c: 'villager' }, { a: 'a', b: 'a', c: 'a' });
  assert.equal(r.cnt.a, 2);
});
t('onuw: win uses FINAL card (robbed wolf)', () => {
  const g = fixed({ a: 'werewolf', b: 'robber', c: 'villager' }, ['villager', 'seer', 'drunk']);
  goto(g, 'robber'); WW.act(g, 'b', { p: 'a' });
  const r = WW.resolve(g, { a: 'b', b: 'c', c: 'b' }); // b (now wolf) dies
  assert.ok(r.village && r.win.a && !r.win.b);
});


t('undercover pairs: distinct words, no duplicate words across pairs', () => {
  const seen = new Set();
  for (const [a, b] of UC.PAIRS) {
    assert.notEqual(a, b);
    for (const w of [a, b]) { assert.ok(!seen.has(w), 'dup word ' + w); seen.add(w); }
  }
  assert.ok(UC.PAIRS.length > UC.RECENT);
});

t('undercover recommend valid 4..10', () => {
  for (let n = UC.MIN; n <= UC.MAX; n++) { const r = UC.recommend(n); assert.deepEqual(UC.validate(n, r.uc, r.white), [], 'n=' + n); }
  assert.ok(UC.validate(5, 2, 1).length);
});

t('undercover deal: exact role counts, words differ, white has no word, seat uniform', () => {
  const N = 30000, n = 6, ucSeat = Array(n).fill(0), flip = [0, 0];
  for (let k = 0; k < N; k++) {
    const g = UC.deal(sids(n), 1, 1);
    const rs = Object.values(g.role);
    assert.equal(rs.filter(r => r === 'uc').length, 1);
    assert.equal(rs.filter(r => r === 'white').length, 1);
    assert.notEqual(g.words.civ, g.words.uc);
    for (const s of g.sids) g.role[s] === 'white' ? assert.equal(UC.wordOf(g, s), null) : assert.ok(UC.wordOf(g, s));
    g.sids.forEach((s, i) => g.role[s] === 'uc' && ucSeat[i]++);
    flip[UC.PAIRS[g.pair][0] === g.words.civ ? 0 : 1]++;
  }
  for (const c of ucSeat) assert.ok(Math.abs(c / N - 1 / n) < 0.01, 'seat bias ' + ucSeat);
  assert.ok(Math.abs(flip[0] / N - 0.5) < 0.02, 'flip bias');
});

t('undercover: no pair repeats within RECENT rounds', () => {
  let recent = [];
  for (let k = 0; k < 3000; k++) {
    const g = UC.deal(sids(5), 1, 0, recent);
    assert.ok(!recent.includes(g.pair));
    recent = [g.pair, ...recent].slice(0, UC.RECENT);
  }
});

t('undercover: white never speaks first', () => {
  for (let k = 0; k < 3000; k++) { const g = UC.deal(sids(5), 1, 1); assert.notEqual(g.role[UC.speakOrder(g)[0]], 'white'); }
});

function ucFixed(roles) {
  const g = UC.deal(Object.keys(roles), 1, 0);
  g.role = { ...roles };
  g.words = { civ: 'กาแฟ', uc: 'ชาไทย' };
  return g;
}

t('undercover tally, ties, dead voters ignored', () => {
  const g = ucFixed({ a: 'civ', b: 'civ', c: 'uc', d: 'civ' });
  g.votes = { a: 'c', b: 'c', c: 'a', d: 'a' };
  assert.deepEqual(UC.tally(g).top, ['a', 'c']);
  g.cand = ['a', 'c']; g.votes = { a: 'c', b: 'c', c: 'a', d: 'c' };
  assert.deepEqual(UC.tally(g).top, ['c']);
  UC.eliminate(g, 'd'); g.cand = null; g.votes = { d: 'a', a: 'c', b: 'c', c: 'b' };
  assert.equal(UC.tally(g).cnt.a, 0);
});

t('undercover win conditions', () => {
  let g = ucFixed({ a: 'civ', b: 'civ', c: 'uc', d: 'civ' });
  UC.eliminate(g, 'c'); assert.equal(UC.winner(g), 'civ');
  assert.deepEqual(UC.winners(g, 'civ'), { a: true, b: true, c: false, d: true });
  g = ucFixed({ a: 'civ', b: 'civ', c: 'uc', d: 'civ' });
  UC.eliminate(g, 'a'); assert.equal(UC.winner(g), null);
  UC.eliminate(g, 'b'); assert.equal(UC.winner(g), 'inf');
  g = ucFixed({ a: 'civ', b: 'civ', c: 'uc', d: 'white', e: 'civ', f: 'civ' });
  UC.eliminate(g, 'd'); assert.equal(UC.winner(g), null);
  assert.equal(UC.winners(g, 'inf').d, false, 'eliminated white loses with inf');
  assert.equal(UC.winners(g, 'white').d, true);
  assert.ok(UC.guessOk(g, ' กาแฟ ')); assert.ok(!UC.guessOk(g, 'ชาไทย')); assert.ok(!UC.guessOk(g, ''));
});

t('avalon: tables consistent', () => {
  for (let n = AV.MIN; n <= AV.MAX; n++) {
    const [g, e] = AV.TEAMS[n];
    assert.equal(g + e, n);
    assert.equal(AV.QUESTS[n].length, 5);
    assert.ok(AV.QUESTS[n].every(x => x <= n));
  }
  assert.equal(AV.failsNeeded(7, 3), 2); assert.equal(AV.failsNeeded(6, 3), 1); assert.equal(AV.failsNeeded(10, 2), 1);
});

t('avalon: validate', () => {
  for (let n = AV.MIN; n <= AV.MAX; n++) assert.deepEqual(AV.validate(n, AV.defaults()), [], 'n=' + n);
  assert.ok(AV.validate(5, { ...AV.defaults(), mordred: true }).length, '3 evil specials with 2 evil');
  assert.deepEqual(AV.validate(7, { ...AV.defaults(), mordred: true }), []);
  assert.ok(AV.validate(6, { ...AV.defaults(), merlin: false }).length, 'percival needs merlin');
});

t('avalon: deal exact team counts & specials, uniform seat', () => {
  const N = 30000, n = 7, cfg = { ...AV.defaults(), mordred: true }, merlinSeat = Array(n).fill(0);
  for (let k = 0; k < N; k++) {
    const g = AV.deal(sids(n), cfg), rs = Object.values(g.role);
    assert.equal(rs.filter(r => AV.team(r) === 'evil').length, 3);
    for (const r of ['merlin', 'percival', 'assassin', 'morgana', 'mordred']) assert.equal(rs.filter(x => x === r).length, 1, r);
    assert.ok(g.leader >= 0 && g.leader < n);
    g.sids.forEach((s, i) => g.role[s] === 'merlin' && merlinSeat[i]++);
  }
  for (const c of merlinSeat) assert.ok(Math.abs(c / N - 1 / n) < 0.01, 'bias ' + merlinSeat);
});

function avFixed(roles, cfg = AV.defaults()) {
  const g = AV.deal(Object.keys(roles), cfg);
  g.role = { ...roles }; g.leader = 0;
  return g;
}

t('avalon: knowledge', () => {
  const g = avFixed({ a: 'merlin', b: 'percival', c: 'servant', d: 'servant', e: 'assassin', f: 'morgana', g: 'mordred', h: 'oberon', i: 'servant', j: 'servant' },
    { merlin: true, percival: true, morgana: true, mordred: true, oberon: true });
  assert.deepEqual(AV.knowledge(g, 'a').sids.sort(), ['e', 'f', 'h'], 'merlin sees evil minus mordred, incl oberon');
  assert.deepEqual(AV.knowledge(g, 'b').sids.sort(), ['a', 'f'], 'percival sees merlin+morgana');
  assert.deepEqual(AV.knowledge(g, 'e').sids.sort(), ['f', 'g'], 'evil sees evil minus oberon');
  assert.deepEqual(AV.knowledge(g, 'h').sids, [], 'oberon sees none');
  assert.deepEqual(AV.knowledge(g, 'c').sids, []);
});

t('avalon: propose/vote/quest/assassin flow', () => {
  const g = avFixed({ a: 'merlin', b: 'percival', c: 'servant', d: 'assassin', e: 'morgana' });
  assert.equal(AV.propose(g, 'b', ['a', 'b']), false, 'not leader');
  assert.equal(AV.propose(g, 'a', ['a']), false, 'wrong size');
  assert.equal(AV.propose(g, 'a', ['a', 'a']), false, 'dup');
  assert.ok(AV.propose(g, 'a', ['a', 'd']));
  Object.assign(g.votes, { a: true, b: true, c: false, d: true, e: false });
  assert.equal(AV.afterVote(g), true);
  assert.ok(AV.play(g, 'a', false)); assert.equal(g.cards.a, true, 'good forced success');
  assert.equal(AV.play(g, 'c', true), false, 'not on team');
  AV.play(g, 'd', false);
  assert.equal(AV.afterQuest(g), 'F');
  assert.equal(g.q, 1); assert.equal(AV.leaderSid(g), 'b');
  // tie vote = reject
  AV.propose(g, 'b', ['a', 'b', 'c']);
  Object.assign(g.votes, { a: true, b: true, c: false, d: false, e: false });
  assert.equal(AV.afterVote(g), false); assert.equal(g.rejects, 1); assert.equal(AV.leaderSid(g), 'c');
  g.quests[1].res = 'S'; g.quests[2].res = 'S'; g.quests[3].res = 'S';
  assert.equal(AV.status(g), 'assassin');
  assert.equal(AV.assassinate(g, 'e', 'a'), null, 'only assassin');
  assert.equal(AV.assassinate(g, 'd', 'b').w, 'good');
  assert.equal(AV.assassinate(g, 'd', 'a').w, 'evil');
});

t('avalon: 5 rejects / 3 fails -> evil; 2-fail quest', () => {
  const g = avFixed({ a: 'merlin', b: 'percival', c: 'servant', d: 'assassin', e: 'morgana' });
  g.rejects = 5; assert.equal(AV.status(g).w, 'evil');
  g.rejects = 0; g.quests.slice(0, 3).forEach(q => (q.res = 'F')); assert.equal(AV.status(g).why, 'quests');
  const h = avFixed({ a: 'merlin', b: 'percival', c: 'servant', d: 'servant', e: 'assassin', f: 'morgana', g: 'minion' });
  h.q = 3; h.team = ['a', 'b', 'c', 'e'];
  AV.play(h, 'a', 1); AV.play(h, 'b', 1); AV.play(h, 'c', 1); AV.play(h, 'e', 0);
  assert.equal(AV.afterQuest(h), 'S', '1 fail not enough on quest 4 with 7p');
  const noM = avFixed({ a: 'servant', b: 'servant', c: 'servant', d: 'minion', e: 'minion' }, { merlin: false });
  noM.quests.slice(0, 3).forEach(q => (q.res = 'S')); assert.equal(AV.status(noM).w, 'good');
});

t('words: unique, enough for no-repeat windows', () => {
  assert.equal(new Set(WORDS).size, WORDS.length, 'duplicate word');
  assert.ok(WORDS.length > IN.RECENT && WORDS.length > JO.RECENT + JO.ROUNDS);
});

t('insider: deal roles distinct, insider uniform among non-masters', () => {
  const N = 30000, n = 6, cnt = Array(n).fill(0);
  for (let k = 0; k < N; k++) {
    const g = IN.deal(sids(n), 's0');
    assert.notEqual(g.insider, g.master);
    assert.equal(g.word, WORDS[g.wi]);
    cnt[+g.insider.slice(1)]++;
  }
  assert.equal(cnt[0], 0);
  for (const c of cnt.slice(1)) assert.ok(Math.abs(c / N - 1 / (n - 1)) < 0.012, 'bias ' + cnt);
});

t('insider: no word repeats within RECENT', () => {
  let recent = [];
  for (let k = 0; k < 2000; k++) { const g = IN.deal(sids(5), 's0', recent); assert.ok(!recent.includes(g.wi)); recent = [g.wi, ...recent].slice(0, IN.RECENT); }
});

t('insider: votes and outcomes', () => {
  const g = IN.deal(['m', 'a', 'b', 'c', 'd'], 'm');
  g.insider = 'b'; g.guesser = 'a';
  g.v1 = { m: true, a: false, b: true, c: true, d: false };
  assert.equal(IN.v1Yes(g), true);
  g.v1 = { m: true, a: false, b: true, c: false, d: false };
  assert.equal(IN.v1Yes(g), false);
  assert.equal(IN.canAccuse(g, 'a', 'm'), false, 'cannot accuse master');
  assert.equal(IN.canAccuse(g, 'a', 'a'), false, 'no self');
  g.v2 = { m: 'b', a: 'b', b: 'c', c: 'b', d: 'c' };
  assert.deepEqual(IN.v2Top(g).top, ['b']);
  g.v2 = { m: 'b', a: 'c', b: 'c', c: 'b', d: 'a' };
  assert.deepEqual(IN.v2Top(g).top.sort(), ['b', 'c']);
  let r = IN.outcome(g, 'b', 'v2'); assert.equal(r.w, 'common');
  assert.deepEqual(IN.winners(g, r), { m: true, a: true, b: false, c: true, d: true });
  r = IN.outcome(g, 'a', 'v1'); assert.equal(r.w, 'insider'); assert.equal(IN.winners(g, r).b, true);
  r = IN.outcome(g, null, 'timeout'); assert.ok(Object.values(IN.winners(g, r)).every(x => !x));
});

t('justone: deck, guesser rotation, 3p gives 2 clues', () => {
  const g = JO.newGame(sids(4), 13);
  assert.equal(new Set(g.deck).size, 13);
  const first = JO.guesser(g); g.turn = 4; assert.equal(JO.guesser(g), first);
  assert.equal(JO.cluesPer(3), 2); assert.equal(JO.cluesPer(4), 1);
  const h = JO.newGame(sids(3), 5);
  const giver = JO.givers(h)[0];
  assert.equal(JO.setClues(h, giver, ['a']), false);
  assert.ok(JO.setClues(h, giver, ['a', 'b']));
  assert.equal(JO.setClues(h, JO.guesser(h), ['x', 'y']), false, 'guesser cannot clue');
});

function joFixed(w, n = 5) {
  const g = JO.newGame(sids(n), 5);
  g.deck[0] = WORDS.indexOf(w);
  g.g0 = 0; g.turn = 0; // guesser s0
  return g;
}

t('justone: auto strike duplicates & word-related, manual override', () => {
  const g = joFixed('ดอกทานตะวัน');
  JO.setClues(g, 's1', ['สีเหลือง']);
  JO.setClues(g, 's2', ['สี เหลือง']);
  JO.setClues(g, 's3', ['ทานตะวัน']);
  JO.setClues(g, 's4', ['แดด']);
  const r = Object.fromEntries(JO.review(g).map(x => [x.sid, x.auto]));
  assert.deepEqual(r, { s1: 'dup', s2: 'dup', s3: 'word', s4: null });
  assert.deepEqual(JO.shown(g), ['แดด']);
  g.manual['s4:0'] = true; assert.deepEqual(JO.shown(g), []);
  g.manual['s3:0'] = false; assert.deepEqual(JO.shown(g), ['ทานตะวัน']);
});

t('justone: scoring — ok, pass, wrong burns next card', () => {
  const g = joFixed('ช้าง');
  assert.equal(JO.resolve(g, ' ช้าง '), 'ok'); JO.advance(g);
  assert.equal(g.score, 1); assert.equal(g.i, 1); assert.equal(JO.guesser(g), 's1');
  JO.resolve(g, null); JO.advance(g); assert.equal(g.i, 2); assert.equal(g.lost, 1);
  JO.resolve(g, 'ผิดแน่นอน'); JO.override(g); assert.equal(g.guess.res, 'ok'); g.guess.res = 'wrong';
  JO.advance(g); assert.equal(g.i, 4); assert.equal(g.lost, 3);
  JO.resolve(g, 'ผิด'); assert.equal(JO.advance(g), true, 'deck exhausted');
  assert.equal(g.score + g.lost, 5);
});

function skGame(n = 3) {
  const g = SK.newGame(sids(n));
  SK.startRound(g, 's0');
  return g;
}
const place = (g, ds) => Object.entries(ds).forEach(([s, d]) => assert.ok(SK.placeInit(g, s, d), s));

t('skull: setup & starter uniform', () => {
  const g = SK.newGame(sids(4));
  assert.deepEqual(g.hand.s0, { f: 3, s: 1 });
  const c = Array(4).fill(0), N = 20000;
  for (let k = 0; k < N; k++) c[+SK.newGame(sids(4)).starter.slice(1)]++;
  for (const x of c) assert.ok(Math.abs(x / N - 0.25) < 0.015, 'bias ' + c);
});

t('skull: opening placement then turn order', () => {
  const g = skGame();
  assert.equal(SK.add(g, 's0', 'f'), false, 'no turns before everyone placed');
  place(g, { s0: 'f', s1: 's' });
  assert.equal(g.turn, null);
  assert.equal(SK.placeInit(g, 's1', 'f'), false, 'only one opening disc');
  place(g, { s2: 'f' });
  assert.equal(g.turn, 's0');
  assert.equal(SK.add(g, 's1', 'f'), false, 'not your turn');
  assert.ok(SK.add(g, 's0', 's'));
  assert.equal(SK.add(g, 's1', 's'), false, 'only one skull');
  assert.ok(SK.add(g, 's1', 'f'));
  assert.equal(g.turn, 's2');
});

t('skull: bidding, passing, cap and auto-challenge', () => {
  const g = skGame();
  place(g, { s0: 'f', s1: 'f', s2: 'f' });
  assert.equal(SK.bid(g, 's0', 4), false, 'bid > table');
  assert.ok(SK.bid(g, 's0', 1));
  assert.equal(SK.add(g, 's1', 'f'), false, 'no adding once bidding started');
  assert.equal(SK.bid(g, 's1', 1), false, 'must raise');
  assert.ok(SK.pass(g, 's1'));
  assert.equal(g.turn, 's2');
  assert.ok(SK.bid(g, 's2', 2));
  assert.equal(g.turn, 's0', 'passed s1 skipped');
  assert.ok(SK.pass(g, 's0'));
  assert.equal(g.ch, 's2');
  const h = skGame();
  place(h, { s0: 'f', s1: 'f', s2: 'f' });
  SK.bid(h, 's0', 3);
  assert.equal(h.ch, 's0', 'max bid challenges immediately');
});

t('skull: flip own stack first, success scores', () => {
  const g = skGame();
  place(g, { s0: 'f', s1: 'f', s2: 'f' });
  SK.add(g, 's0', 'f');
  SK.bid(g, 's1', 3); SK.pass(g, 's2'); SK.pass(g, 's0');
  assert.equal(g.ch, 's1');
  assert.deepEqual(g.reveals, [{ sid: 's1', d: 'f' }], 'own stack auto-revealed');
  assert.equal(SK.flip(g, 's1', 's1'), false, 'own already done');
  assert.ok(SK.flip(g, 's1', 's0'));
  assert.equal(g.res, null);
  assert.ok(SK.flip(g, 's1', 's2'));
  assert.equal(g.res.ok, true);
  assert.equal(SK.flip(g, 's1', 's0'), false, 'done');
  SK.settle(g); assert.equal(g.pts.s1, 1); assert.equal(g.winner, null);
  assert.equal(SK.nextStarter(g), 's1');
});

t('skull: flips top disc first; other skull -> random loss; own skull -> choice', () => {
  const g = skGame();
  place(g, { s0: 's', s1: 'f', s2: 'f' });
  SK.add(g, 's0', 'f'); // s0 stack: [s, f] top = f
  SK.bid(g, 's1', 3); SK.pass(g, 's2'); SK.pass(g, 's0');
  SK.flip(g, 's1', 's0'); assert.equal(g.reveals.at(-1).d, 'f', 'top first');
  SK.flip(g, 's1', 's0'); assert.deepEqual(g.res, { ok: false, owner: 's0' });
  assert.equal(SK.needsChoice(g), false);
  SK.settle(g); assert.equal(SK.discs(g, 's1'), 3); assert.ok(['f', 's'].includes(g.res.lost));
  assert.equal(SK.nextStarter(g), 's1');

  const h = skGame();
  place(h, { s0: 's', s1: 'f', s2: 'f' });
  SK.bid(h, 's0', 3);
  assert.deepEqual(h.res, { ok: false, owner: 's0' });
  assert.ok(SK.needsChoice(h));
  assert.equal(SK.settle(h, 'x'), false);
  assert.ok(SK.settle(h, 's')); assert.deepEqual(h.hand.s0, { f: 3, s: 0 });
});

t('skull: random loss is roughly proportional', () => {
  let s = 0; const N = 20000;
  for (let k = 0; k < N; k++) {
    const g = skGame(); place(g, { s0: 'f', s1: 's', s2: 'f' });
    SK.bid(g, 's0', 3); SK.flip(g, 's0', 's1'); SK.settle(g); if (g.res.lost === 's') s++;
  }
  assert.ok(Math.abs(s / N - 0.25) < 0.015, 'skull loss rate ' + s / N);
});

t('skull: 2 points wins; elimination; last standing wins; starter rules', () => {
  const g = skGame();
  g.pts.s1 = 1;
  place(g, { s0: 'f', s1: 'f', s2: 'f' }); SK.bid(g, 's0', 1); SK.pass(g, 's1'); SK.pass(g, 's2');
  SK.settle(g); assert.equal(g.pts.s0, 1);
  g.pts.s0 = 1; SK.startRound(g, 's0'); place(g, { s0: 'f', s1: 'f', s2: 'f' }); SK.bid(g, 's0', 3); SK.flip(g, 's0', 's1'); SK.flip(g, 's0', 's2');
  SK.settle(g); assert.equal(g.winner, 's0');

  const h = skGame();
  h.hand.s1 = { f: 0, s: 1 };
  place(h, { s0: 's', s1: 's', s2: 'f' }); SK.bid(h, 's0', 1); SK.pass(h, 's1'); SK.pass(h, 's2');
  // s0 own skull
  SK.settle(h, 's');
  h.hand.s0 = { f: 0, s: 0 }; // simulate elimination by own skull
  assert.equal(SK.nextStarter(h), 's1', 'next living player');
  SK.startRound(h, 's1');
  assert.ok(!('s0' in h.stacks), 'eliminated player skipped');
  place(h, { s1: 's', s2: 'f' });
  SK.bid(h, 's1', 2); // s1 own skull, loses last disc
  SK.settle(h, 's');
  assert.equal(h.winner, 's2', 'last player standing');
});

t('mind: deal sizes, unique cards, sorted; level/life tables', () => {
  for (let n = MI.MIN; n <= MI.MAX; n++) {
    const g = MI.newGame(sids(n));
    assert.equal(g.level, 1); assert.equal(g.lives, Math.min(n, 4)); assert.equal(g.stars, 1);
    while (g.level < g.max) { for (const s of g.sids) g.hands[s] = []; MI.nextLevel(g); }
    const all = g.sids.flatMap(s => g.hands[s]);
    assert.equal(all.length, n * g.max); assert.equal(new Set(all).size, all.length);
    for (const s of g.sids) assert.deepEqual(g.hands[s], [...g.hands[s]].sort((a, b) => a - b));
  }
  assert.equal(MI.levelsFor(2), 12); assert.equal(MI.levelsFor(3), 10); assert.equal(MI.levelsFor(4), 8);
});

t('mind: correct play, mistake burns lower cards & costs a life, lose at 0', () => {
  const g = MI.newGame(['a', 'b', 'c']);
  g.hands = { a: [5, 40], b: [10, 20], c: [30] };
  assert.deepEqual(MI.play(g, 'a').burned, []);
  assert.equal(g.lives, 3);
  const e = MI.play(g, 'c');
  assert.deepEqual(e.burned, [{ sid: 'b', card: 10 }, { sid: 'b', card: 20 }]);
  assert.equal(g.lives, 2); assert.deepEqual(g.hands.b, []);
  assert.equal(MI.play(g, 'b'), null, 'empty hand');
  MI.play(g, 'a'); assert.ok(MI.cleared(g));
  const h = MI.newGame(['a', 'b']); h.lives = 1; h.hands = { a: [50], b: [3] };
  MI.play(h, 'a'); assert.equal(h.over, 'lose');
});

t('mind: shuriken needs everyone holding cards; rewards; win', () => {
  const g = MI.newGame(['a', 'b', 'c']);
  g.hands = { a: [5, 40], b: [10], c: [] };
  assert.ok(MI.propose(g, 'a')); assert.equal(g.stars, 1);
  assert.equal(MI.propose(g, 'b'), false, 'one proposal at a time');
  assert.ok(MI.agree(g, 'b'));
  assert.equal(g.stars, 0); assert.deepEqual(g.hands, { a: [40], b: [], c: [] }); assert.equal(g.prop, null);
  assert.equal(MI.propose(g, 'a'), false, 'no stars left');
  MI.play(g, 'a');
  g.level = 2; assert.equal(MI.nextLevel(g), 'star'); assert.equal(g.stars, 1); assert.equal(g.level, 3);
  for (const s of g.sids) g.hands[s] = [];
  assert.equal(MI.nextLevel(g), 'life'); assert.equal(g.lives, 4);
  for (const s of g.sids) g.hands[s] = [];
  g.level = g.max; MI.nextLevel(g); assert.equal(g.over, 'win');
  const d = MI.newGame(['a', 'b']); d.hands = { a: [1], b: [2] }; MI.propose(d, 'a'); MI.decline(d, 'b'); assert.equal(d.prop, null); assert.equal(d.stars, 1);
});

t('codenames: pool, teams, key distribution', () => {
  assert.ok(CN.POOL.length > CN.RECENT + 25, 'pool ' + CN.POOL.length);
  for (let n = 4; n <= 10; n++) {
    const t0 = CN.autoTeams(sids(n));
    assert.deepEqual(CN.validTeams(sids(n), t0), []);
    const g = CN.newGame(sids(n), t0);
    assert.equal(new Set(g.words).size, 25);
    const c = k => g.key.filter(x => x === k).length;
    assert.equal(c(g.first), 9); assert.equal(c(CN.other(g.first)), 8); assert.equal(c('n'), 7); assert.equal(c('x'), 1);
    assert.equal(g.turn, g.first);
  }
  assert.ok(CN.validTeams(['a', 'b', 'c', 'd'], { team: { a: 'r', b: 'r', c: 'r', d: 'b' }, master: { r: 'a', b: 'd' } }).length);
  assert.ok(CN.validTeams(['a', 'b', 'c', 'd'], { team: { a: 'r', b: 'r', c: 'b', d: 'b' }, master: { r: 'a', b: 'a' } }).length);
});

function cnFixed() {
  const g = CN.newGame(['a', 'b', 'c', 'd'], { team: { a: 'r', b: 'r', c: 'b', d: 'b' }, master: { r: 'a', b: 'c' } });
  g.first = g.turn = 'r';
  g.key = [...Array(9).fill('r'), ...Array(8).fill('b'), ...Array(7).fill('n'), 'x'];
  return g;
}
t('codenames: clue rules, guessing, turn changes', () => {
  const g = cnFixed();
  assert.equal(CN.guess(g, 'b', 0), null, 'no clue yet');
  assert.equal(CN.giveClue(g, 'b', 'ทดสอบ', 2), false, 'only spymaster');
  assert.equal(CN.giveClue(g, 'a', g.words[3], 2), false, 'cannot use a board word');
  assert.ok(CN.giveClue(g, 'a', 'ทดสอบคำใบ้', 1));
  assert.equal(CN.guess(g, 'a', 0), null, 'spymaster cannot guess');
  assert.equal(CN.guess(g, 'd', 0), null, 'other team cannot guess');
  assert.equal(CN.guess(g, 'b', 0), 'r'); assert.equal(g.turn, 'r');
  assert.equal(CN.guess(g, 'b', 0), null, 'already revealed');
  assert.equal(CN.guess(g, 'b', 1), 'r'); assert.equal(g.turn, 'b', 'n+1 guesses then turn ends');
  CN.giveClue(g, 'c', 'ใบ้สอง', 3);
  assert.equal(CN.guess(g, 'd', 20), 'n'); assert.equal(g.turn, 'r', 'neutral ends turn');
  CN.giveClue(g, 'a', 'ใบ้สาม', 2);
  assert.equal(CN.guess(g, 'b', 9), 'b'); assert.equal(g.turn, 'b', 'opponent word ends turn');
  CN.giveClue(g, 'c', 'ใบ้สี่', 1); assert.ok(CN.pass(g, 'd')); assert.equal(g.turn, 'r');
});
t('codenames: assassin, finishing all words, giving the opponent their last word', () => {
  let g = cnFixed(); CN.giveClue(g, 'a', 'ใบ้', 1); CN.guess(g, 'b', 24);
  assert.equal(g.winner, 'b'); assert.equal(g.why, 'assassin');
  g = cnFixed(); for (let i = 0; i < 8; i++) g.rev[i] = 'r';
  CN.giveClue(g, 'a', 'ใบ้', 1); CN.guess(g, 'b', 8); assert.equal(g.winner, 'r');
  g = cnFixed(); for (let i = 9; i < 16; i++) g.rev[i] = 'b';
  CN.giveClue(g, 'a', 'ใบ้', 1); CN.guess(g, 'b', 16); assert.equal(g.winner, 'b', 'revealing their last word hands them the win');
  g = cnFixed(); CN.giveClue(g, 'a', 'ไม่จำกัด', 0);
  for (let i = 0; i < 5; i++) CN.guess(g, 'b', i); assert.equal(g.turn, 'r', '0 = unlimited guesses');
});

t('scout: deck sizes and hand sizes', () => {
  assert.equal(SC.deck(3).length, 36); assert.equal(SC.deck(4).length, 44); assert.equal(SC.deck(5).length, 45);
  for (const n of [3, 4, 5]) {
    const g = SC.newGame(sids(n));
    const all = g.sids.flatMap(s => g.hands[s]);
    assert.equal(all.length, n * SC.handSize(n));
    assert.equal(new Set(all.map(c => [...c].sort((a, b) => a - b).join('-'))).size, all.length, 'no duplicate cards');
    assert.equal(g.rounds, n);
  }
});

t('scout: classify & strength order', () => {
  const C = v => SC.classify(v.map(x => [x, 0]));
  assert.equal(C([3, 5]), null); assert.equal(C([3, 4, 6]), null); assert.equal(C([1, 2, 1]), null);
  assert.ok(C([5, 4, 3])); assert.ok(C([7, 7, 7]));
  assert.ok(SC.beats(C([1, 2]), C([9])), 'more cards wins');
  assert.ok(SC.beats(C([2, 2]), C([8, 9])), 'match beats run of same size');
  assert.ok(SC.beats(C([4, 5]), C([3, 4])), 'higher run wins');
  assert.ok(!SC.beats(C([3, 4]), C([4, 3])), 'equal does not beat');
  assert.ok(SC.beats(C([6]), C([5]))); assert.ok(!SC.beats(C([5]), C([5])));
  assert.ok(SC.beats(C([1]), null));
});

function scFixed(hands) {
  const g = SC.newGame(Object.keys(hands));
  g.hands = JSON.parse(JSON.stringify(hands)); g.ready = [...g.sids]; g.turn = g.sids[0]; g.round = 1;
  return g;
}
t('scout: flip reverses order & swaps numbers; no play before everyone is ready', () => {
  const g = SC.newGame(sids(3));
  const s = g.turn, h = JSON.stringify(g.hands[s]);
  assert.equal(SC.show(g, s, 0, 0), false, 'not ready');
  SC.flipHand(g, s);
  assert.deepEqual(g.hands[s], JSON.parse(h).map(([a, b]) => [b, a]).reverse());
  SC.setReady(g, s); assert.equal(SC.flipHand(g, s), false, 'locked after ready');
});

t('scout: show captures, scout gives token, insert/flip, turn order', () => {
  const g = scFixed({ a: [[3, 9], [4, 8], [7, 1]], b: [[5, 2], [5, 6], [9, 9]], c: [[1, 2], [8, 3]] });
  assert.equal(SC.show(g, 'b', 0, 1), false, 'not your turn');
  assert.equal(SC.show(g, 'a', 0, 2), false, 'not a legal set');
  assert.equal(SC.scout(g, 'a', 'L', 0, false), false, 'nothing to scout');
  assert.ok(SC.show(g, 'a', 0, 1)); assert.equal(g.turn, 'b'); assert.deepEqual(g.hands.a, [[7, 1]]);
  assert.equal(SC.show(g, 'b', 2, 2), false, 'single cannot beat a pair');
  assert.ok(SC.show(g, 'b', 0, 1), 'pair of 5s beats run 3-4'); assert.equal(g.cap.b, 2);
  assert.ok(SC.scout(g, 'c', 'R', 1, true));
  assert.deepEqual(g.hands.c, [[1, 2], [6, 5], [8, 3]]); assert.equal(g.tok.b, 1);
  assert.deepEqual(g.active.cards, [[5, 2]]); assert.equal(g.turn, 'a');
  assert.ok(SC.show(g, 'a', 0, 0), '7 beats single 5 and empties the hand');
  assert.equal(g.res.why, 'empty'); assert.equal(g.res.ender, 'a');
  const r = Object.fromEntries(g.res.rows.map(x => [x.sid, x.pts]));
  assert.deepEqual(r, { a: 1, b: 2 + 1 - 1, c: -3 });
});

t('scout: round ends when everyone else scouts; owner pays no hand penalty', () => {
  const g = scFixed({ a: [[9, 1], [9, 2], [2, 3]], b: [[1, 5], [3, 6]], c: [[2, 7], [4, 8]] });
  SC.show(g, 'a', 0, 1);
  assert.ok(SC.scout(g, 'b', 'L', 0, false));
  assert.equal(g.res, null);
  assert.ok(SC.scout(g, 'c', 'L', 2, false));
  assert.equal(g.res.why, 'unbeaten'); assert.equal(g.res.ender, 'a');
  const r = Object.fromEntries(g.res.rows.map(x => [x.sid, x.pts]));
  assert.deepEqual(r, { a: 2, b: -3, c: -3 });
});

t('scout: scout & show is atomic and once per round', () => {
  const g = scFixed({ a: [[6, 1], [6, 2], [1, 3]], b: [[7, 5], [2, 6], [9, 4]], c: [[2, 7], [4, 8], [5, 5]] });
  SC.show(g, 'a', 0, 1);
  const before = JSON.stringify([g.hands.b, g.active, g.tok]);
  assert.equal(SC.scoutShow(g, 'b', 'L', 0, false, 2, 3), false, 'resulting show too weak -> nothing changes');
  assert.equal(JSON.stringify([g.hands.b, g.active, g.tok]), before);
  assert.ok(SC.scoutShow(g, 'b', 'L', 1, false, 0, 1), 'insert 6 next to 7 -> run 7-6 beats the remaining single 6');
  assert.equal(g.usedSS.b, true); assert.equal(g.tok.a, 1); assert.equal(g.active.by, 'b'); assert.equal(g.cap.b, 1);
  assert.equal(g.turn, 'c');
  SC.scout(g, 'c', 'L', 0, false); SC.scout(g, 'a', 'L', 0, false);
  assert.equal(g.res.why, 'unbeaten', 'everyone else scouted -> round ends even if the set is used up');
  assert.equal(g.res.ender, 'b');
  const h = scFixed({ a: [[6, 1], [1, 3]], b: [[7, 5], [2, 6]], c: [[2, 7], [4, 8]] });
  SC.show(h, 'a', 0, 0); SC.scout(h, 'b', 'L', 0, false);
  assert.equal(h.active, null); assert.equal(h.turn, 'c');
  assert.equal(SC.scout(h, 'c', 'L', 0, false), false, 'nothing on the table: must show');
  h.usedSS.c = true; assert.equal(SC.scoutShow(h, 'c', 'L', 0, false, 0, 0), false, 'already used / nothing to scout');
  assert.ok(SC.show(h, 'c', 0, 0));
});

t('scout: rounds accumulate and game ends after n rounds', () => {
  const g = SC.newGame(sids(3));
  for (let r = 1; r <= 3; r++) {
    assert.equal(g.round, r);
    g.sids.forEach(s => SC.setReady(g, s));
    const s = g.turn;
    g.hands[s] = [[5, 1]];
    assert.ok(SC.show(g, s, 0, 0));
    assert.ok(g.res);
    if (r < 3) { assert.equal(g.over, false); SC.nextRound(g); }
  }
  assert.equal(g.over, true); assert.ok(SC.winners(g).length >= 1);
});

const any = a => a[rint(a.length)];

t('secret hitler: role counts, knowledge', () => {
  for (let n = SH.MIN; n <= SH.MAX; n++) {
    const g = SH.newGame(sids(n)), r = Object.values(g.role), [l, f] = SH.SETUP[n];
    assert.equal(r.filter(x => x === 'L').length, l); assert.equal(r.filter(x => x === 'F').length, f); assert.equal(r.filter(x => x === 'H').length, 1);
    assert.equal(g.deck.length, 17);
    const h = g.sids.find(s => g.role[s] === 'H'), fa = g.sids.filter(s => g.role[s] === 'F');
    assert.equal(SH.known(g, h).length, n <= 6 ? f : 0, 'Hitler knows fascists only at 5-6 players');
    assert.deepEqual(SH.known(g, fa[0]).sort(), [...fa.slice(1), h].sort());
    assert.deepEqual(SH.known(g, g.sids.find(s => g.role[s] === 'L')), []);
  }
});

function shFixed(n = 7) {
  const g = SH.newGame(sids(n));
  g.sids.forEach((s, i) => (g.role[s] = i === 0 ? 'H' : i <= SH.SETUP[n][1] ? 'F' : 'L'));
  g.pres = 's1'; SH.start(g);
  return g;
}
const elect = (g, chan, ok = true) => { assert.ok(SH.nominate(g, g.pres, chan), 'nominate ' + chan); g.alive.forEach(s => SH.vote(g, s, ok)); };

t('secret hitler: election, term limits, legislative session', () => {
  const g = shFixed();
  assert.equal(SH.nominate(g, 's2', 's3'), false, 'only the president nominates');
  assert.equal(SH.nominate(g, 's1', 's1'), false);
  g.deck = ['L', 'F', 'F', ...g.deck.slice(3)];
  elect(g, 's3');
  assert.equal(g.phase, 'pres'); assert.equal(g.hand.length, 3);
  assert.equal(SH.presDiscard(g, 's3', 0), false);
  SH.presDiscard(g, 's1', 1); assert.equal(g.phase, 'chan');
  SH.chanEnact(g, 's3', 0);
  assert.equal(g.lib, 1); assert.equal(g.phase, 'nom'); assert.equal(g.pres, 's2');
  assert.equal(SH.eligible(g, 's3'), false, 'last chancellor is term-limited');
  assert.equal(SH.eligible(g, 's1'), false, 'last president is term-limited with >5 alive');
  assert.equal(g.discard.length, 2);
});

t('secret hitler: 3 failed elections -> top policy enacted, no power, limits cleared', () => {
  const g = shFixed();
  g.deck = ['F', ...g.deck.slice(1)];
  for (let k = 0; k < 3; k++) elect(g, g.alive.find(s => SH.eligible(g, s)), false);
  assert.equal(g.fas, 1); assert.equal(g.tracker, 0); assert.equal(g.phase, 'nom'); assert.equal(g.lastChan, null);
});

t('secret hitler: powers, hitler chancellor, hitler killed, veto, special election', () => {
  let g = shFixed(9);
  g.deck = ['F', 'F', 'F', ...g.deck.slice(3)];
  elect(g, 's5'); SH.presDiscard(g, g.pres, 0); SH.chanEnact(g, 's5', 0);
  assert.equal(g.power, 'investigate');
  assert.ok(SH.usePower(g, 's1', 's0')); assert.deepEqual(g.inv, { target: 's0', party: 'F' }, 'Hitler shows as fascist');
  assert.equal(g.power, 'invshow'); SH.usePower(g, 's1'); assert.equal(g.phase, 'nom');
  g = shFixed(7); g.fas = 3;
  elect(g, 's0'); assert.equal(g.winner, 'F'); assert.equal(g.why, 'hitler-chancellor');
  g = shFixed(7); g.fas = 3; g.deck = ['F', 'F', 'F', ...g.deck.slice(3)];
  elect(g, 's5'); SH.presDiscard(g, 's1', 0); SH.chanEnact(g, 's5', 0);
  assert.equal(g.power, 'kill'); SH.usePower(g, 's1', 's0'); assert.equal(g.winner, 'L'); assert.equal(g.why, 'hitler-killed');
  g = shFixed(7); g.fas = 2; g.deck = ['F', 'F', 'F', ...g.deck.slice(3)];
  elect(g, 's5'); SH.presDiscard(g, 's1', 0); SH.chanEnact(g, 's5', 0);
  assert.equal(g.power, 'special'); SH.usePower(g, 's1', 's4');
  assert.equal(g.pres, 's4'); elect(g, 's6', false); assert.equal(g.pres, 's2', 'order returns to the player after the original president');
  g = shFixed(7); g.fas = 5; elect(g, 's5'); SH.presDiscard(g, 's1', 0);
  assert.ok(SH.askVeto(g, 's5')); assert.equal(SH.answerVeto(g, 's5', true), false);
  SH.answerVeto(g, 's1', false); assert.equal(g.phase, 'chan'); assert.equal(SH.askVeto(g, 's5'), false, 'veto only once');
  g = shFixed(7); g.fas = 5; elect(g, 's5'); SH.presDiscard(g, 's1', 0); SH.askVeto(g, 's5'); SH.answerVeto(g, 's1', true);
  assert.equal(g.tracker, 1); assert.equal(g.phase, 'nom'); assert.equal(g.hand.length, 0);
});

t('secret hitler: 300 random games always finish with a winner and consistent state', () => {
  for (let k = 0; k < 300; k++) {
    const g = SH.newGame(sids(SH.MIN + (k % 6)));
    SH.start(g);
    let steps = 0;
    while (!g.winner) {
      assert.ok(++steps < 2000, 'stuck in ' + g.phase);
      assert.equal(g.deck.length + g.discard.length + g.hand.length + g.lib + g.fas, 17, 'policy cards conserved');
      if (g.phase === 'nom') assert.ok(SH.nominate(g, g.pres, any(g.alive.filter(s => SH.eligible(g, s)))));
      else if (g.phase === 'vote') g.alive.forEach(s => SH.vote(g, s, rint(3) > 0));
      else if (g.phase === 'pres') assert.ok(SH.presDiscard(g, g.pres, rint(g.hand.length)));
      else if (g.phase === 'chan') { if (SH.canVeto(g) && rint(2)) SH.askVeto(g, g.chan); else assert.ok(SH.chanEnact(g, g.chan, rint(g.hand.length))); }
      else if (g.phase === 'veto') assert.ok(SH.answerVeto(g, g.pres, !!rint(2)));
      else if (g.phase === 'power') {
        const c = g.alive.filter(s => s !== g.pres && (g.power !== 'investigate' || !g.investigated.includes(s)));
        assert.ok(SH.usePower(g, g.pres, any(c)), 'power ' + g.power);
      }
    }
    assert.ok(['L', 'F'].includes(g.winner));
  }
});

function cuFixed(stacks, n = 3) {
  const g = CU.newGame(sids(n));
  g.stacks = JSON.parse(JSON.stringify(stacks)); g.turn = 0;
  return g;
}
t('camel up: setup, order, stacking moves', () => {
  const g0 = CU.newGame(sids(4));
  assert.equal(Object.values(g0.stacks).flat().length, 5);
  assert.ok(Object.keys(g0.stacks).every(k => +k >= 1 && +k <= 3));
  const g = cuFixed({ 1: ['b', 'g', 'o'], 3: ['y'], 5: ['w'] });
  assert.deepEqual(CU.order(g), ['w', 'y', 'o', 'g', 'b']);
  CU.move(g, 'g', 2);
  assert.deepEqual(g.stacks, { 1: ['b'], 3: ['y', 'g', 'o'], 5: ['w'] }, 'camels on top ride along and land on top');
  assert.deepEqual(CU.order(g), ['w', 'o', 'g', 'y', 'b']);
});
t('camel up: oasis, mirage (goes underneath), owner is paid', () => {
  let g = cuFixed({ 1: ['b'], 3: ['y'] });
  g.stacks[2] = ['g', 'o', 'w'];
  g.desert[4] = { sid: 's1', type: 1 };
  CU.move(g, 'y', 1); assert.deepEqual(g.stacks[5], ['y']); assert.equal(g.coins.s1, 4);
  g = cuFixed({ 1: ['b'], 3: ['y'], 2: ['g', 'o', 'w'] });
  g.desert[4] = { sid: 's2', type: -1 };
  CU.move(g, 'g', 2);
  assert.deepEqual(g.stacks[3], ['g', 'o', 'w', 'y'], 'mirage: the moving stack slides under the camels already there');
  assert.equal(g.coins.s2, 4);
});
t('camel up: turn actions, desert rules, leg scoring', () => {
  const g = cuFixed({ 1: ['b', 'g'], 2: ['o'], 3: ['y', 'w'] });
  assert.equal(CU.takeBet(g, 's1', 'w'), false, 'not your turn');
  assert.ok(CU.takeBet(g, 's0', 'w')); assert.deepEqual(g.bets.s0, [{ c: 'w', v: 5 }]); assert.deepEqual(g.tiles.w, [3, 2]);
  assert.equal(CU.placeDesert(g, 's1', 3, 1), false, 'camels there');
  assert.equal(CU.placeDesert(g, 's1', 1, 1), false, 'not on space 1');
  assert.ok(CU.placeDesert(g, 's1', 6, 1));
  assert.equal(CU.placeDesert(g, 's2', 7, -1), false, 'next to another tile');
  assert.ok(CU.takeBet(g, 's2', 'y'));
  assert.ok(CU.takeBet(g, 's0', 'b'));
  assert.ok(CU.placeDesert(g, 's1', 8, -1), 'moving your own tile'); assert.equal(g.desert[6], undefined);
  // roll the remaining dice so nothing overtakes: w first, y second
  g.turn = 0; g.dice = ['b']; CU.roll(g, 's0', () => 0, () => 1);
  assert.equal(g.leg, 2); assert.equal(g.lastLeg.first, 'w'); assert.equal(g.lastLeg.second, 'y');
  assert.equal(g.coins.s0, 3 + 5 - 1 + 1, 'w bet +5, b bet -1, +1 for rolling');
  assert.equal(g.coins.s2, 3 + 1, 'second place pays 1');
  assert.deepEqual(g.tiles.w, [5, 3, 2]); assert.deepEqual(g.desert, {}); assert.equal(g.dice.length, 5);
});
t('camel up: finish line, final bets pay 8/5/… or -1', () => {
  const g = cuFixed({ 15: ['b'], 2: ['g'], 3: ['o'], 4: ['y'], 5: ['w'] });
  assert.ok(CU.finalBet(g, 's0', 'b', 'w')); assert.ok(CU.finalBet(g, 's1', 'b', 'w')); assert.ok(CU.finalBet(g, 's2', 'g', 'w'));
  assert.equal(CU.finalBet(g, 's0', 'b', 'l'), false, 'card already used');
  assert.ok(CU.finalBet(g, 's0', 'g', 'l'));
  g.turn = 1; g.dice = ['b']; CU.roll(g, 's1', () => 0, () => 3);
  assert.ok(g.over); assert.equal(g.res.winner, 'b'); assert.equal(g.res.loser, 'g');
  assert.equal(g.coins.s0, 3 + 8 + 8); assert.equal(g.coins.s1, 3 + 5 + 1); assert.equal(g.coins.s2, 3 - 1);
  assert.deepEqual(g.res.winners, ['s0']);
});
t('camel up: 300 random games finish, 5 camels always on the board, coins never negative', () => {
  for (let k = 0; k < 300; k++) {
    const g = CU.newGame(sids(CU.MIN + (k % 7)));
    let steps = 0;
    while (!g.over) {
      assert.ok(++steps < 3000, 'stuck');
      const s = CU.turnSid(g), r = rint(10);
      let ok = false;
      if (r < 2) ok = CU.takeBet(g, s, any(CU.COLORS));
      else if (r < 3) ok = CU.placeDesert(g, s, 2 + rint(15), rint(2) ? 1 : -1);
      else if (r < 4 && g.cards[s].length) ok = CU.finalBet(g, s, any(g.cards[s]), rint(2) ? 'w' : 'l');
      if (!ok) assert.ok(CU.roll(g, s));
      assert.equal(Object.values(g.stacks).flat().sort().join(''), 'bgowy');
      assert.ok(Object.values(g.coins).every(c => c >= 0));
    }
    assert.ok(g.res.winners.length >= 1);
  }
});

t('taco: deck & deal', () => {
  assert.equal(TC.deck().length, 64);
  const g = TC.newGame(sids(5));
  assert.equal(Object.values(g.hands).flat().length, 64);
  const sizes = Object.values(g.hands).map(h => h.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
});
t('taco: flipping, matches, slowest takes the pile, false slap', () => {
  const g = TC.newGame(['a', 'b', 'c']); g.turn = 0;
  g.hands = { a: ['cat', 'goat'], b: ['cat', 'x'], c: ['pizza'] };
  assert.equal(TC.flip(g, 'b'), false, 'not your turn');
  TC.flip(g, 'a'); assert.equal(g.top.said, 'taco'); assert.equal(g.slap, null); assert.equal(TC.turnSid(g), 'b');
  TC.flip(g, 'b'); assert.equal(g.top.said, 'cat'); assert.ok(g.slap, 'cat on "cat" is a match');
  assert.equal(TC.flip(g, 'c'), false, 'no flipping during a slap');
  TC.slap(g, 'a', 300); TC.slap(g, 'c', 900); assert.equal(TC.slap(g, 'a', 100), false, 'one slap each');
  TC.slap(g, 'b', 500);
  assert.equal(g.last.loser, 'c'); assert.equal(g.hands.c.length, 3); assert.equal(g.pile.length, 0); assert.equal(TC.turnSid(g), 'c'); assert.equal(g.word, 0);
  TC.slap(g, 'a', 100);
  assert.equal(g.last.why, 'false'); assert.equal(TC.turnSid(g), 'a');
});
t('taco: special cards need the right gesture; timeout; winning', () => {
  let g = TC.newGame(['a', 'b', 'c']); g.turn = 0; g.hands = { a: ['gorilla', 'x'], b: ['x'], c: ['x'] };
  TC.flip(g, 'a'); assert.equal(g.slap.special, 'gorilla');
  TC.slap(g, 'a', 200, 'narwhal'); TC.slap(g, 'b', 800, 'gorilla'); TC.slap(g, 'c', 900, 'gorilla');
  assert.equal(g.last.loser, 'a', 'wrong gesture is the slowest');
  g = TC.newGame(['a', 'b', 'c']); g.turn = 0; g.hands = { a: ['taco'], b: ['x'], c: ['x'] };
  TC.flip(g, 'a'); TC.slap(g, 'b', 400); TC.resolve(g);
  assert.ok(['a', 'c'].includes(g.last.loser), 'someone who never slapped takes the pile');
  g = TC.newGame(['a', 'b', 'c']); g.turn = 0; g.hands = { a: ['taco'], b: ['x'], c: ['x'] };
  TC.flip(g, 'a'); TC.slap(g, 'a', 200); TC.slap(g, 'b', 400); TC.slap(g, 'c', 600);
  assert.equal(g.winner, 'a', 'out of cards and first to slap = win');
  g = TC.newGame(['a', 'b']); g.turn = 0; g.hands = { a: [], b: ['x', 'y'] };
  assert.ok(TC.flip(g, 'a'), 'a player with no cards still takes a (card-less) turn'); assert.equal(g.top.card, null); assert.equal(TC.turnSid(g), 'b');
});
t('taco: 200 random games finish and never lose a card', () => {
  for (let k = 0; k < 200; k++) {
    const g = TC.newGame(sids(TC.MIN + (k % 7)));
    let steps = 0;
    while (!g.winner) {
      assert.ok(++steps < 60000, 'stuck');
      if (g.slap) { g.sids.forEach(s => rint(8) && TC.slap(g, s, rint(3000), rint(4) ? g.slap?.special : 'x')); if (g.slap) TC.resolve(g); }
      else if (!rint(40)) TC.slap(g, any(g.sids), 100);
      else assert.ok(TC.flip(g, TC.turnSid(g)));
      assert.equal(Object.values(g.hands).flat().length + g.pile.length, 64);
    }
  }
});

t('salem: setup', () => {
  for (let n = SA.MIN; n <= SA.MAX; n++) {
    const g = SA.newGame(sids(n)), all = Object.values(g.tryal).flat();
    assert.equal(all.filter(x => x.t === 'W').length, n <= 5 ? 1 : 2); assert.equal(all.filter(x => x.t === 'C').length, 1);
    assert.ok(g.sids.every(s => g.hand[s].length === 3 && g.tryal[s].length === g.tryal[g.sids[0]].length));
    assert.equal(g.deck.at(-1), 'night'); assert.ok(g.deck.includes('consp'));
    assert.equal(g.deck.length + n * 3, 58);
    assert.equal(g.phase, 'dawn');
  }
});
function saFixed() {
  const g = SA.newGame(['a', 'b', 'c', 'd']);
  const T = (...x) => x.map(t => ({ t, up: false }));
  g.tryal = { a: T('W', 'N', 'N'), b: T('C', 'N', 'N'), c: T('N', 'N', 'N'), d: T('N', 'N', 'N') };
  g.witch = { a: true, b: false, c: false, d: false };
  g.hand = { a: [], b: [], c: [], d: [] }; g.deck = Array(40).fill('acc'); g.discard = [];
  g.turn = 0; g.phase = 'turn'; g.cat = 'd'; g.front.d.blue = ['cat'];
  return g;
}
t('salem: dawn gives out the black cat', () => {
  const g = SA.newGame(sids(6));
  const w = SA.witches(g);
  assert.equal(SA.dawnPick(g, g.sids.find(s => !g.witch[s]), 's0'), false, 'only witches');
  w.forEach(x => SA.dawnPick(g, x, 's0'));
  assert.equal(g.cat, 's0'); assert.ok(g.front.s0.blue.includes('cat')); assert.equal(g.phase, 'turn');
});
t('salem: draw or play; accusations reach 7 -> reveal; witch revealed dies; town wins', () => {
  const g = saFixed();
  assert.equal(SA.endTurn(g, 'a'), false, 'must play something first');
  assert.ok(SA.draw(g, 'a')); assert.equal(g.hand.a.length, 2); assert.equal(SA.turnSid(g), 'b');
  g.hand.b = ['wit', 'acc', 'piety'];
  assert.equal(SA.play(g, 'b', 0, 'b'), false, 'cannot accuse yourself');
  assert.ok(SA.play(g, 'b', 1, 'c')); assert.equal(SA.points(g, 'c'), 1);
  assert.equal(SA.draw(g, 'b'), false, 'no drawing after playing');
  assert.ok(SA.play(g, 'b', 1, 'c'), 'piety on c'); assert.equal(SA.points(g, 'c'), 0, 'piety clears accusations');
  assert.equal(SA.canTarget(g, 'b', 'acc', 'c'), false);
  assert.ok(SA.play(g, 'b', 0, 'a')); assert.equal(g.phase, 'reveal');
  assert.equal(SA.revealPick(g, 'c', 0), false);
  assert.ok(SA.revealPick(g, 'b', 0));
  assert.ok(!g.alive.includes('a')); assert.equal(g.winner, 'T');
});
t('salem: green cards', () => {
  const g = saFixed(); g.turn = 1;
  g.hand.b = ['stocks', 'arson', 'rob', 'scape', 'alibi', 'curse']; g.hand.c = ['acc', 'acc']; g.hand.d = ['evi'];
  g.front.c.red = [3, 1, 1, 1];
  SA.play(g, 'b', 0, 'c'); assert.equal(g.front.c.stocks, 1);
  SA.play(g, 'b', 0, 'd'); assert.deepEqual(g.hand.d, []);
  SA.play(g, 'b', 0, 'c', 'd'); assert.deepEqual(g.hand.d, ['acc', 'acc']); assert.deepEqual(g.hand.c, []);
  SA.play(g, 'b', 1, 'c'); assert.deepEqual(g.front.c.red, [1], 'alibi removes the 3 biggest');
  SA.play(g, 'b', 0, 'c', 'a'); assert.equal(SA.points(g, 'a'), 1); assert.equal(g.front.a.stocks, 1); assert.equal(SA.points(g, 'c'), 0);
  SA.play(g, 'b', 0, 'd'); assert.deepEqual(g.front.d.blue, []); assert.equal(g.cat, null, 'curse removed the cat');
  SA.endTurn(g, 'b'); assert.equal(SA.turnSid(g), 'c');
  SA.draw(g, 'c'); SA.draw(g, 'd'); assert.equal(SA.turnSid(g), 'b', 'a sits in the stocks and is skipped');
});
t('salem: night — constable, asylum, confession, kill; witches win', () => {
  let g = saFixed(); g.deck = ['night', 'acc']; SA.draw(g, 'a');
  assert.equal(g.phase, 'night'); assert.equal(g.hand.a.length, 1);
  assert.equal(SA.nightKill(g, 'b', 'c'), false, 'only witches kill');
  SA.nightKill(g, 'a', 'c'); assert.equal(g.phase, 'night', 'waits for the constable');
  SA.nightSave(g, 'b', 'c'); assert.equal(g.phase, 'confess');
  g.alive.forEach(s => SA.confess(g, s, null));
  assert.ok(g.alive.includes('c')); assert.equal(g.last.safe, 'constable'); assert.equal(g.phase, 'turn'); assert.equal(SA.turnSid(g), 'b');
  g = saFixed(); g.deck = ['night', 'acc']; SA.draw(g, 'a'); SA.nightKill(g, 'a', 'c'); SA.nightSave(g, 'b', 'd');
  SA.confess(g, 'a', null); SA.confess(g, 'b', null); SA.confess(g, 'c', 1); SA.confess(g, 'd', null);
  assert.ok(g.alive.includes('c')); assert.equal(g.last.safe, 'confess'); assert.equal(g.tryal.c[1].up, true);
  g = saFixed(); g.deck = ['night', 'acc']; SA.draw(g, 'a'); SA.nightKill(g, 'a', 'c'); SA.nightSave(g, 'b', 'd');
  g.alive.forEach(s => SA.confess(g, s, null));
  assert.ok(!g.alive.includes('c')); assert.ok(g.tryal.c.every(x => x.up));
  g = saFixed(); g.alive = ['a', 'c']; g.tryal.b.forEach(x => (x.up = true)); g.deck = ['night', 'acc']; SA.draw(g, 'a'); SA.nightKill(g, 'a', 'c');
  assert.equal(g.phase, 'confess', 'no constable alive'); g.alive.forEach(s => SA.confess(g, s, null));
  assert.equal(g.winner, 'W');
});
t('salem: conspiracy passes cards and spreads witchcraft; matchmakers die together', () => {
  let g = saFixed(); g.deck = ['consp', 'acc']; SA.draw(g, 'a');
  assert.equal(g.tryal.d.filter(x => x.up).length >= 1 || !g.alive.includes('d'), true, 'black cat holder reveals a card');
  const all = Object.values(g.tryal).flat();
  assert.equal(all.length, 12); assert.equal(all.filter(x => x.t === 'W').length, 1);
  assert.ok(g.witch.a, 'once a witch, always a witch');
  const holder = g.sids.find(s => g.tryal[s].some(x => x.t === 'W')); assert.ok(g.witch[holder]);
  g = saFixed(); g.front.b.blue = ['match']; g.front.c.blue = ['match']; g.turn = 3;
  g.hand.d = ['wit']; SA.play(g, 'd', 0, 'b'); SA.revealPick(g, 'd', 1); SA.endTurn(g, 'd');
  g.hand.a = ['wit']; SA.play(g, 'a', 0, 'b'); SA.revealPick(g, 'a', 0);
  g.turn = 3; g.played = 0; g.phase = 'turn'; g.hand.d = ['wit']; SA.play(g, 'd', 0, 'b'); SA.revealPick(g, 'd', 2);
  assert.ok(!g.alive.includes('b')); assert.ok(!g.alive.includes('c'), 'the other matchmaker dies too');
});
t('salem: 200 random games finish with a winner; card totals stay consistent', () => {
  for (let k = 0; k < 200; k++) {
    const n = SA.MIN + (k % 7), g = SA.newGame(sids(n));
    const tryals = Object.values(g.tryal).flat().length;
    let steps = 0;
    while (!g.winner) {
      assert.ok(++steps < 20000, 'stuck in ' + g.phase);
      if (g.phase === 'dawn') SA.witches(g).forEach(w => SA.dawnPick(g, w, any(g.alive)));
      else if (g.phase === 'turn') {
        const s = SA.turnSid(g);
        assert.ok(g.alive.includes(s), 'turn belongs to a dead player');
        if (g.played && rint(2)) { assert.ok(SA.endTurn(g, s)); continue; }
        if (g.hand[s].length && rint(3)) {
          const i = rint(g.hand[s].length), a = any(g.alive), b = any(g.alive);
          if (!SA.play(g, s, i, a, b) && !g.played) assert.ok(SA.draw(g, s));
        } else if (!g.played) assert.ok(SA.draw(g, s)); else assert.ok(SA.endTurn(g, s));
      } else if (g.phase === 'reveal') {
        const idx = g.tryal[g.reveal.target].map((x, i) => (x.up ? -1 : i)).filter(i => i >= 0);
        assert.ok(SA.revealPick(g, g.reveal.by, any(idx)));
      } else if (g.phase === 'night') {
        SA.witches(g).forEach(w => SA.nightKill(g, w, any(g.alive.filter(x => x !== w))));
        const c = SA.constable(g); if (c && g.phase === 'night') SA.nightSave(g, c, any(g.alive.filter(x => x !== c)));
      } else if (g.phase === 'confess') {
        [...g.alive].forEach(s => { if (g.phase !== 'confess' || !g.alive.includes(s)) return; const idx = g.tryal[s].map((x, i) => (x.up ? -1 : i)).filter(i => i >= 0); SA.confess(g, s, rint(5) ? null : any(idx)); });
      }
      assert.equal(Object.values(g.tryal).flat().length, tryals);
    }
    assert.ok(['T', 'W'].includes(g.winner));
  }
});

console.log(`\n${pass} tests passed`);
