// crypto для main.js / storage.js: SHA-1 (createHash('sha1')) и randomUUID
import { Buffer } from 'buffer';

function sha1(bytes) {
  const len = bytes.length;
  const words = ((len + 8) >> 6) + 1;
  const w = new Int32Array(words * 16);
  for (let i = 0; i < len; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  w[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  const bits = len * 8;
  w[words * 16 - 1] = bits | 0;
  w[words * 16 - 2] = Math.floor(bits / 0x100000000);
  let h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476, h4 = 0xc3d2e1f0 | 0;
  const x = new Int32Array(80);
  for (let b = 0; b < w.length; b += 16) {
    for (let i = 0; i < 16; i++) x[i] = w[b + i];
    for (let i = 16; i < 80; i++) { const t = x[i - 3] ^ x[i - 8] ^ x[i - 14] ^ x[i - 16]; x[i] = (t << 1) | (t >>> 31); }
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
      else if (i < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc | 0; }
      else { f = bb ^ c ^ d; k = 0xca62c1d6 | 0; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + x[i]) | 0;
      e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  const out = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach((h, i) => { out[i * 4] = h >>> 24; out[i * 4 + 1] = (h >>> 16) & 255; out[i * 4 + 2] = (h >>> 8) & 255; out[i * 4 + 3] = h & 255; });
  return out;
}

export function createHash(alg) {
  if (String(alg).toLowerCase() !== 'sha1') throw new Error('createHash: только sha1');
  const parts = [];
  return {
    update(d) { parts.push(typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d.buffer ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : d)); return this; },
    digest(enc) {
      const all = parts.length === 1 ? parts[0] : Buffer.concat(parts);
      const r = Buffer.from(sha1(all));
      return enc ? r.toString(enc) : r;
    },
  };
}
export const randomUUID = () => globalThis.crypto.randomUUID();
export const randomBytes = (n) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n)));
export default { createHash, randomUUID, randomBytes };
