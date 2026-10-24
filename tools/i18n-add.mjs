// Adds translations for the keys tools/i18n-extract.mjs reports as missing.
//   node tools/i18n-extract.mjs | grep -v keys, | cut -f2 > missing.txt   (then write the English, one per line, in the same order)
//   node tools/i18n-add.mjs missing.txt english.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { EN } from '../js/i18n-en.js';
const lines = f => readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
const [th, en] = [lines(process.argv[2]), lines(process.argv[3])];
if (th.length !== en.length) throw new Error(`${th.length} Thai lines but ${en.length} English lines`);
const count = s => (s.match(/\{\d*\}/g) || []).length;
th.forEach((k, i) => { if (count(k) !== count(en[i])) throw new Error(`placeholder mismatch: ${k} | ${en[i]}`); });
const d = { ...EN, ...Object.fromEntries(th.map((k, i) => [k, en[i]])) };
const tmp = new URL('./.i18n-tmp.json', import.meta.url);
writeFileSync(tmp, JSON.stringify(d));
execFileSync('node', [new URL('./i18n-build.mjs', import.meta.url).pathname, tmp.pathname], { stdio: 'inherit' });
