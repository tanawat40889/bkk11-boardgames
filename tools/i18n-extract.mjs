// Finds every piece of Thai text the app can show, the way it will appear on screen:
// one key per run of text between HTML tags, with ${…} written as {} (or treated as a tag when it builds markup).
//   node tools/i18n-extract.mjs            prints keys missing from js/i18n-en.js
//   node tools/i18n-extract.mjs --all      prints every key (JSON)
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const THAI = /[฀-๿]/;
// Content lists are translated by having separate English lists, not by the dictionary.
const SKIP_FILES = new Set(['words.js', 'words-en.js', 'i18n-en.js', 'i18n.js', 'spyfall-en.js', 'undercover-en.js']);
const IGNORE = new Set(['เแโใไ']);   // not shown (a list of Thai leading vowels)
const SKIP_EXPORTS = { 'spyfall.js': ['LOCATIONS'], 'undercover.js': ['PAIRS'] };
// An interpolation that produces markup splits the text, like a tag would.
const MARKUP = new RegExp('<|\\b(' + ["P", "C", "abBoard", "abEvent", "abHearts", "abMats", "abV", "actUI", "art", "av", "avAssnV", "avBoard", "avEndV", "avQResV", "avQuestV", "avResV", "avRoleCard", "avRolesV", "avTeam", "avTeamV", "avVoteV", "bdDie", "bdLog", "bdV", "btn", "camel", "chip", "cnTeamV", "cnV", "ctDie", "ctMemo", "ctV", "cuV", "dayV", "dealV", "deckChips", "decoy", "disc", "fitBadge", "gbadge", "gi", "hnCard", "hnKnow", "hnLog", "hnV", "home", "inAskV", "inCard", "inDiscV", "inEndV", "inMasterLine", "inTieV", "inV1V", "inV2V", "inWordV", "installHint", "joCheckV", "joClueV", "joEndV", "joGuessV", "joResV", "joWord", "knowList", "langPicker", "lfV", "loading", "lobby", "locGrid", "miEndV", "miHead", "miLast", "miLvlV", "miV", "mini", "mystery", "nightV", "odCard", "odMenu", "odV", "pickerView", "playV", "players", "pol", "qrView", "resultV", "revealV", "roleCard", "rrCard", "rrLog", "rrTeam", "rrV", "rulesView", "saLine", "saV", "scBoard", "scCard", "scEndV", "scV", "secret", "settingsView", "setupView", "shBoard", "shLog", "shRole", "shV", "shell", "skBoard", "skEndV", "skMine", "skV", "stepper", "stone", "tbBoard", "tbLog", "tbTile", "tbV", "tcV", "themePicker", "tile", "tryCard", "ucDescV", "ucEndV", "ucInfo", "ucOutList", "ucOutV", "ucVoteV", "ucWordV", "view", "voteV", "who", "wordCard"].join('|') + ')\\(');
const norm = s => s.replace(/\s+/g, ' ').trim();

export function extract() {
  const keys = new Map();   // key -> first place seen
  const add = (s, where) => { const k = norm(s); if (THAI.test(k) && !IGNORE.has(k) && !keys.has(k)) keys.set(k, where); };
  for (const f of readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !SKIP_FILES.has(f))) {
    let src = readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const name of SKIP_EXPORTS[f] || []) {   // blank out big content arrays
      const i = src.indexOf(`export const ${name} = [`);
      if (i >= 0) { let d = 0, j = src.indexOf('[', i); for (; j < src.length; j++) { if (src[j] === '[') d++; else if (src[j] === ']' && !--d) break; } src = src.slice(0, i) + src.slice(j + 1); }
    }
    scanCode(src, 0, src.length, add, f);
  }
  return keys;
}

// Walk JS code, find string literals; recurse into ${} of templates.
function scanCode(s, i, end, add, f) {
  while (i < end) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); if (i < 0) return end; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 2; continue; }
    if (c === "'" || c === '"') { const j = quoted(s, i); text(s.slice(i + 1, j), add, f); i = j + 1; continue; }
    if (c === '`') { i = template(s, i, add, f) + 1; continue; }
    if (c === '/' && /[=(,:!&|?{};\n]\s*$/.test(s.slice(Math.max(0, i - 20), i))) {   // regex literal
      let j = i + 1, cls = false; for (; j < end; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; else if (s[j] === '/' && !cls) break; }
      i = j + 1; continue;
    }
    i++;
  }
  return i;
}
function quoted(s, i) { const q = s[i]; for (let j = i + 1; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === q) return j; } return s.length; }
// Returns index of the closing backtick. Collects text runs.
function template(s, i, add, f) {
  let run = '', inTag = false, attr = '', j = i + 1;
  const flush = () => { if (/(?:title|placeholder|aria-label|alt)="/.test(run)) { attrs(run, add, f); run = run.replace(/[\w-]+="[^"]*"/g, ''); } add(run, f); run = ''; };
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { const n = s[j + 1]; (inTag ? (attr += n) : (run += n)); j++; continue; }
    if (c === '`') break;
    if (c === '$' && s[j + 1] === '{') {
      const k = closeBrace(s, j + 2);
      const expr = s.slice(j + 2, k);
      scanCode(s, j + 2, k, add, f);
      if (inTag) attr += '{}';
      else if (MARKUP.test(expr)) flush(); else run += '{}';
      j = k; continue;
    }
    if (!inTag && c === '<' && /[a-zA-Z/!]/.test(s[j + 1] || '')) { flush(); inTag = true; attr = ''; continue; }
    if (inTag) {
      if (c === '>') { inTag = false; attrs(attr, add, f); continue; }
      attr += c; continue;
    }
    run += c;
  }
  flush();
  return j;
}
function attrs(a, add, f) { for (const m of a.matchAll(/(?:title|placeholder|aria-label|alt)="([^"]*)"/g)) add(m[1], f); }
function closeBrace(s, i) {
  let d = 1;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"') { i = quoted(s, i); continue; }
    if (c === '`') { i = template(s, i, () => {}, '') ; continue; }
    if (c === '{') d++; else if (c === '}' && !--d) return i;
  }
  return i;
}
// Plain quoted strings may hold markup too.
function text(str, add, f) {
  if (!THAI.test(str)) return;
  for (const part of str.split(/<[^>]*>/)) add(part, f);
  for (const m of str.matchAll(/(?:title|placeholder|aria-label|alt)="([^"]*)"/g)) add(m[1], f);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const keys = extract();
  if (process.argv.includes('--all')) { console.log(JSON.stringify([...keys.keys()], null, 1)); process.exit(0); }
  const { EN } = await import(path.join(ROOT, 'js/i18n-en.js')).catch(() => ({ EN: {} }));
  const miss = [...keys].filter(([k]) => !(k in EN));
  for (const [k, f] of miss) console.log(`${f}\t${k}`);
  console.log(`${keys.size} keys, ${miss.length} missing`);
  if (miss.length) process.exitCode = 1;
}
