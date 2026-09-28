// Unbiased crypto RNG helpers
const cr = globalThis.crypto;

export function rint(n) {
  if (!(n > 0)) throw new Error('rint: n must be > 0');
  const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n;
  let x;
  do { cr.getRandomValues(a); x = a[0]; } while (x >= lim);
  return x % n;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rint(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = a => a[rint(a.length)];

const ROOM_AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ID_AL = 'abcdefghijkmnpqrstuvwxyz23456789';
const gen = (al, n) => Array.from({ length: n }, () => al[rint(al.length)]).join('');
export const roomCode = () => gen(ROOM_AL, 4);
export const uid = (n = 16) => gen(ID_AL, n);
