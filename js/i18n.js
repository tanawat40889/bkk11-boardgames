// English UI: the app renders Thai; when English is on, every Thai text node (and title/placeholder/aria-label)
// is swapped for its entry in i18n-en.js after each render. Keys come from tools/i18n-extract.mjs — one per run of
// text between tags, with {} where an interpolated value goes (English may reorder them as {1} {2} …).
import { EN, EN_GAME } from './i18n-en.js';

const THAI = /[฀-๿]/;
const KEY = 'bg_lang';
export let lang = (() => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'th'; } catch { return 'th'; } })();
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'th';
  try { localStorage.setItem(KEY, lang); } catch {}
  document.documentElement.lang = lang;
}
if (typeof document !== 'undefined') document.documentElement.lang = lang;

const norm = s => s.replace(/\s+/g, ' ').trim();
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYS = Object.keys(EN).filter(k => k.includes('{}')).sort((a, b) => b.length - a.length);
// strict: exactly as written · loose: a value may be empty and take its neighbouring space with it
const strict = k => k.split('{}').map(reEsc).join('(.+?)');
const loose = k => {
  const p = k.split('{}');
  let r = '';
  for (let i = 0; i < p.length - 1; i++) {
    const L = p[i], R = p[i + 1];
    if (L.endsWith(' ') && R.startsWith(' ')) { r += reEsc(L) + '(?:(.+?) )?'; p[i + 1] = R.slice(1); }   // "a {} b" -> "a b" when empty
    else if (!L && i === 0 && R.startsWith(' ')) { r += '(?:(.+?) )?'; p[i + 1] = R.slice(1); }   // "{} b" -> "b"
    else if (!R && i === p.length - 2 && L.endsWith(' ')) r += reEsc(L.slice(0, -1)) + '(?: (.+?))?';   // "a {}" -> "a"
    else r += reEsc(L) + '(.*?)';
  }
  return r + reEsc(p.at(-1));
};
const PATS = KEYS.flatMap(k => [[new RegExp('^' + strict(k) + '$', 's'), EN[k]], [new RegExp('^' + loose(k) + '$', 's'), EN[k]]]);   // longest key first
// Sentences glued from several pieces: known patterns anywhere in the text, with short plain values only.
const VAL = '[^\\u0E00-\\u0E7F·—]';
const thaiLen = k => (k.match(/[\u0E00-\u0E7F]/g) || []).length;
const INNER = KEYS.filter(k => THAI.test(k.replace(/\{\}/g, ''))).map(k => [thaiLen(k), new RegExp(k.split('{}').map(reEsc).join(`(${VAL}+?)`).replace(/\(\[\^[^\]]*\]\+\?\)$/, `(${VAL}+)`), 'g'), EN[k]]).sort((a, b) => b[0] - a[0]);
const PARTS = Object.keys(EN).filter(k => !k.includes('{}') && k.length > 1).sort((a, b) => thaiLen(b) - thaiLen(a));

// Thai has no spaces, so only swap whole words (a phrase must start and end on a word boundary).
const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const bounds = s => { const b = new Set([0, s.length]); if (SEG) for (const x of SEG.segment(s)) { b.add(x.index); b.add(x.index + x.segment.length); } return b; };
const edgeOk = (s, i, b) => b.has(i) || !THAI.test(s[i - 1] || '') || !THAI.test(s[i] || '');

let names = new Set(), game = null;
export function setNames(list) { names = new Set(list.filter(Boolean)); }
export function setGame(g) { game = g; }   // a few words mean different things in different games

const fill = (en, caps) => {
  let i = 0;
  return en.replace(/\{(\d*)\}/g, (_, n) => { const v = caps[n ? +n - 1 : i++] ?? ''; return names.has(v.trim()) ? v : tr(v) ?? v; }).replace(/ {2,}/g, ' ').trim();
};
// Translate one string; null when it has no Thai (or nothing matched).
export function tr(text) {
  const k = norm(text);
  if (!k || !THAI.test(k) || names.has(k)) return null;
  const G = EN_GAME[game];
  if (G && k in G) return G[k];
  if (k in EN) return EN[k];
  for (const [re, en] of PATS) { const m = k.match(re); if (m) return fill(en, m.slice(1)); }
  // keep player names untouched, then swap the pieces we know
  const hold = [];
  let out = k;
  for (const n of [...names].sort((a, b) => b.length - a.length)) if (n && out.includes(n)) { out = out.split(n).join(`\u0001${hold.length}\u0002`); hold.push(n); }
  // repeatedly swap the known piece with the most Thai in it (so a long phrase wins over a word inside it)
  for (let guard = 0; guard < 60 && THAI.test(out); guard++) {
    const b = bounds(out);
    let best = null;
    const ok = (i, n) => edgeOk(out, i, b) && edgeOk(out, i + n, b);
    for (const [score, re, en] of INNER) {
      if (best && score <= best.score) break;   // sorted longest first
      re.lastIndex = 0;
      for (const m of out.matchAll(re)) if (ok(m.index, m[0].length)) { best = { score, i: m.index, n: m[0].length, rep: fill(en, m.slice(1)) + (/\s$/.test(m[0]) ? ' ' : '') }; break; }
    }
    parts: for (const p of PARTS) {
      if (best && thaiLen(p) <= best.score) break;
      for (let i = out.indexOf(p); i >= 0; i = out.indexOf(p, i + 1)) if (ok(i, p.length)) { best = { score: thaiLen(p), i, n: p.length, rep: (G && G[p]) || EN[p] }; break parts; }
    }
    if (!best) break;
    out = out.slice(0, best.i) + best.rep + out.slice(best.i + best.n);
  }
  out = out.replace(/\u0001(\d+)\u0002/g, (_, i) => hold[+i]).replace(/ {2,}/g, ' ');
  return out === k ? null : out;
}
// For strings used outside the page (toast, confirm, prompt).
export const t = s => (lang === 'en' ? tr(s) ?? s : s);

const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
export function translate(root) {
  if (lang !== 'en' || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) if (THAI.test(n.nodeValue) && !n.parentElement?.closest('.notr, script, style')) nodes.push(n);
  for (const n of nodes) {
    const v = n.nodeValue, en = tr(v);
    if (en != null) n.nodeValue = (/^\s/.test(v) ? ' ' : '') + en + (/\s$/.test(v) ? ' ' : '');
  }
  for (const a of ATTRS) for (const el of root.querySelectorAll(`[${a}]`)) {
    const en = tr(el.getAttribute(a));
    if (en != null) el.setAttribute(a, en);
  }
}
