import { shuffle, rint } from './rng.js';

// ito (Arclight) — co-op. Everyone holds secret numbers 1–100. A theme turns numbers into ideas ("100 = the scariest
// animal") and players describe their number in theme words only, then play every card in ascending order.
export const MIN = 2, MAX = 10, LIVES = 3, LEVELS = 3;
// [Thai, English] — 1 is the least, 100 the most
export const THEMES = [
  ['สัตว์ที่น่ากลัว', 'Scary animals'], ['อาหารที่อร่อย', 'Delicious food'], ['ของที่อยากได้เป็นของขวัญ', 'Gifts you would love to get'],
  ['สิ่งที่หนัก', 'Heavy things'], ['ความแรงของกลิ่น', 'Strong smells'], ['สถานที่ที่อยากไปเที่ยว', 'Places you want to visit'],
  ['ของที่แพง', 'Expensive things'], ['ความเผ็ด', 'Spicy things'], ['สิ่งที่ใหญ่', 'Big things'], ['ความเร็ว', 'Fast things'],
  ['ความน่ารัก', 'Cute things'], ['ความน่าเบื่อ', 'Boring things'], ['อาชีพที่ได้เงินเยอะ', 'Well-paid jobs'], ['ความดัง (เสียง)', 'Loud things'],
  ['ความหวาน', 'Sweet things'], ['สิ่งที่อันตราย', 'Dangerous things'], ['ความร้อน', 'Hot things'], ['ความเย็น', 'Cold things'],
  ['ซูเปอร์ฮีโร่ที่เก่ง', 'Powerful superheroes'], ['ความยากของวิชาเรียน', 'Hard school subjects'], ['ความสะอาด', 'Clean things'],
  ['ของที่ขาดไม่ได้ในชีวิต', 'Things you can\'t live without'], ['ความอายุยืน', 'Things that last long'], ['ความนิยม', 'Popular things'],
  ['เรื่องที่น่าอาย', 'Embarrassing moments'], ['ความแข็ง', 'Hard (solid) things'], ['ความสูง', 'Tall things'], ['ความน่าตื่นเต้น', 'Exciting things'],
  ['ของกินที่ไม่ชอบ', 'Food you dislike'], ['ความยากของกีฬา', 'Hard sports'], ['การ์ตูนที่ดัง', 'Famous cartoons'], ['ของเล่นที่สนุก', 'Fun toys'],
  ['ความเหนื่อย', 'Tiring activities'], ['ความเสี่ยง', 'Risky things'], ['ความแปลก', 'Weird things'], ['ความหรูหรา', 'Luxurious things'],
  ['สัตว์เลี้ยงที่อยากเลี้ยง', 'Pets you\'d want'], ['ความเก่าแก่', 'Old things'], ['ความเศร้า', 'Sad things'], ['ความสุข', 'Happy moments'],
  ['ของที่ต้องพกติดตัว', 'Things you always carry'], ['ความอันตรายของอากาศ', 'Wild weather'], ['เครื่องดื่มที่ชอบ', 'Favourite drinks'],
  ['ความยาว', 'Long things'], ['ความเล็ก', 'Tiny things'], ['ความเท่', 'Cool things'], ['ความน่ารำคาญ', 'Annoying things'], ['ความเหม็น', 'Smelly things'],
  ['ทักษะที่อยากมี', 'Skills you wish you had'], ['ความยากในการทำอาหาร', 'Hard dishes to cook'], ['ความแพงของรถ', 'Expensive vehicles'],
  ['ของที่ทำให้ง่วง', 'Things that make you sleepy'], ['ความน่ากลัวของผี', 'Scary ghosts'], ['ความแข็งแรง', 'Strong things'],
  ['ความเงียบ', 'Quiet things'], ['ของที่คนไทยชอบ', 'Things Thai people love'], ['ความวุ่นวาย', 'Chaotic places'], ['ความโรแมนติก', 'Romantic things'],
  ['ความสำคัญในชีวิต', 'Important things in life'], ['สิ่งที่ทำให้เครียด', 'Stressful things'],
];
export const handFor = lv => lv;   // level N: N cards each

export function newGame(sids, recent = []) {
  const g = { sids: [...sids], level: 0, lives: LIVES, hand: {}, hints: {}, table: [], last: null, theme: 0, recent: [...recent], phase: 'talk', over: null, n: 0 };
  deal(g, 1);
  return g;
}
function pickTheme(g) {
  let pool = THEMES.map((_, i) => i).filter(i => !g.recent.includes(i));
  if (!pool.length) pool = THEMES.map((_, i) => i);
  g.theme = pool[rint(pool.length)];
  g.recent = [g.theme, ...g.recent].slice(0, 30);
}
function deal(g, lv) {
  const deck = shuffle([...Array(100).keys()].map(i => i + 1));
  g.level = lv; g.phase = 'talk'; g.table = []; g.last = null; g.hints = {};
  for (const s of g.sids) g.hand[s] = deck.splice(0, handFor(lv)).sort((a, b) => a - b);
  pickTheme(g);
}

export const left = g => g.sids.reduce((a, s) => a + g.hand[s].length, 0);
export function newTheme(g) { if (g.phase !== 'talk' || g.table.length) return false; pickTheme(g); g.hints = {}; g.n++; return true; }
// One short hint per card (the lowest card's hint first).
export function setHint(g, s, i, text) {
  if (g.phase !== 'talk' || !(i >= 0 && i < g.hand[s].length)) return false;
  (g.hints[s] ||= [])[i] = String(text || '').trim().slice(0, 40);
  g.n++;
  return true;
}
// Play your lowest card. Every lower card still in a hand is a mistake: it is revealed and costs a life.
export function play(g, s) {
  if (g.phase !== 'talk' || !g.hand[s]?.length) return false;
  const c = g.hand[s].shift(), hint = g.hints[s]?.shift() || '';
  const miss = [];
  for (const x of g.sids) while (g.hand[x].length && g.hand[x][0] < c) { miss.push({ sid: x, c: g.hand[x].shift() }); g.hints[x]?.shift(); }
  g.table.push({ sid: s, c, hint, ok: !miss.length });
  for (const m of miss) g.table.push({ sid: m.sid, c: m.c, hint: '', ok: false, miss: true });
  g.table.sort((a, b) => a.c - b.c);
  g.lives -= miss.length; g.last = { sid: s, c, miss }; g.n++;
  if (g.lives <= 0) { g.lives = 0; g.phase = 'over'; g.over = 'lose'; }
  else if (!left(g)) { g.phase = g.level >= LEVELS ? 'over' : 'clear'; if (g.phase === 'over') g.over = 'win'; }
  return true;
}
export function nextLevel(g) { if (g.phase !== 'clear') return false; deal(g, g.level + 1); g.n++; return true; }
