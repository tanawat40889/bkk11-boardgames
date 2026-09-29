import assert from 'node:assert/strict';
import * as SF from '../js/spyfall.js';
import * as WW from '../js/onuw.js';
import * as UC from '../js/undercover.js';
import * as AV from '../js/avalon.js';
import * as IN from '../js/insider.js';
import * as JO from '../js/justone.js';
import { WORDS } from '../js/words.js';
import * as SK from '../js/skull.js';

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

console.log(`\n${pass} tests passed`);
