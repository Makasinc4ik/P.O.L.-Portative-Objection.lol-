// Node fs поверх моста OOFS (синхронные вызовы Java). Только то, что нужно main.js / storage.js / zipimport.js.
import { Buffer } from 'buffer';
import { FS, APP, outDir } from './native.js';

const S = (p) => String(p);
function err(code, op, p) {
  const e = new Error(`${code}: ${op} '${p}'`);
  e.code = code;
  return e;
}
const encOf = (o) => (typeof o === 'string' ? o : o && o.encoding) || null;

export function existsSync(p) { return !!FS().exists(S(p)); }

function makeStat(o) {
  return {
    size: o.size, mtimeMs: o.mtimeMs, mtime: new Date(o.mtimeMs),
    isDirectory: () => !!o.isDir, isFile: () => !!o.isFile, isSymbolicLink: () => false,
  };
}
export function statSync(p, opts) {
  const s = FS().stat(S(p));
  if (!s) { if (opts && opts.throwIfNoEntry === false) return undefined; throw err('ENOENT', 'stat', p); }
  return makeStat(JSON.parse(s));
}
export const lstatSync = statSync;

export function readdirSync(p, opts) {
  if (opts && opts.withFileTypes) {
    const r = FS().readdirTypes(S(p));
    if (!r) throw err('ENOENT', 'scandir', p);
    return JSON.parse(r).map(([name, dir]) => ({ name, isDirectory: () => dir, isFile: () => !dir, isSymbolicLink: () => false }));
  }
  const r = FS().readdir(S(p));
  if (!r) throw err('ENOENT', 'scandir', p);
  return JSON.parse(r);
}

export function readFileSync(p, opts) {
  const enc = encOf(opts);
  if (enc === 'utf8' || enc === 'utf-8') {
    const t = FS().readText(S(p));
    if (t == null) throw err('ENOENT', 'open', p);
    return t;
  }
  const b = FS().readB64(S(p));
  if (b == null) throw err('ENOENT', 'open', p);
  const buf = Buffer.from(b, 'base64');
  return enc ? buf.toString(enc) : buf;
}

// Файлы в папке «out» (Сохранить как…) после записи копируются в Загрузки / Фильмы телефона
const shown = new Map();
export function shownPath(p) { return shown.get(S(p)) || S(p); }
function publishIfOut(p) {
  p = S(p);
  if (!p.startsWith(outDir() + '/')) return;
  const name = p.slice(p.lastIndexOf('/') + 1);
  const ext = (name.match(/\.([^.]+)$/) || [])[1] || '';
  const video = /^(mp4|webm|mkv)$/i.test(ext);
  const mime = video ? (ext.toLowerCase() === 'webm' ? 'video/webm' : 'video/mp4') : 'application/octet-stream';
  const r = APP().publish(p, name, mime, video ? 'video' : 'file');
  if (r && !String(r).startsWith('error:')) {
    shown.set(p, r);
    APP().toast('Сохранено: ' + r);
  } else {
    APP().toast('Не удалось сохранить в общую папку: ' + String(r || '').replace(/^error:/, ''));
  }
}

function writeAny(p, data, append) {
  let ok;
  if (typeof data === 'string') ok = FS().writeText(S(p), data, !!append);
  else {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
    ok = FS().writeB64(S(p), Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'), !!append);
  }
  if (!ok) throw err('EIO', 'write', p);
}
export function writeFileSync(p, data) { writeAny(p, data, false); publishIfOut(p); }
export function appendFileSync(p, data) { writeAny(p, data, true); }

export function mkdirSync(p) { if (!FS().mkdirs(S(p))) throw err('EACCES', 'mkdir', p); }
export function renameSync(a, b) { if (!FS().rename(S(a), S(b))) throw err('ENOENT', 'rename', a); }
export function copyFileSync(a, b) { if (!FS().copy(S(a), S(b))) throw err('ENOENT', 'copyfile', a); }
export function unlinkSync(p) { if (!FS().exists(S(p))) throw err('ENOENT', 'unlink', p); FS().remove(S(p), false); }
export function rmSync(p, opts = {}) {
  if (!FS().exists(S(p))) { if (opts.force) return; throw err('ENOENT', 'rm', p); }
  if (!FS().remove(S(p), !!opts.recursive)) throw err('ENOTEMPTY', 'rm', p);
}
export function rmdirSync(p) { if (!FS().remove(S(p), false)) throw err('ENOTEMPTY', 'rmdir', p); }
export function createReadStream() { throw new Error('createReadStream: нет на Android'); }

function cpSync(a, b) {
  const st = statSync(a);
  if (st.isDirectory()) {
    mkdirSync(b, { recursive: true });
    for (const n of readdirSync(a)) cpSync(a + '/' + n, b + '/' + n);
  } else copyFileSync(a, b);
}

// Открытый файл (запись видео): запись с позиции, обрезка, закрытие
class FileHandle {
  constructor(p) { this.p = S(p); this.pos = 0; writeAny(p, '', false); }
  async write(buf, off = 0, len, position) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const part = u8.subarray(off || 0, len == null ? u8.length : (off || 0) + len);
    const at = position == null ? this.pos : position;
    if (!FS().writeAt(this.p, Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64'), at)) throw err('EIO', 'write', this.p);
    if (position == null) this.pos += part.length;
    return { bytesWritten: part.length, buffer: buf };
  }
  async truncate(len = 0) { FS().truncate(this.p, len); if (this.pos > len) this.pos = len; }
  discard() { this.discarded = true; }
  async close() {
    if (this.closed) return;
    this.closed = true;
    if (!this.discarded) publishIfOut(this.p);
  }
}

const wrap = (fn) => (...a) => { try { return Promise.resolve(fn(...a)); } catch (e) { return Promise.reject(e); } };
export const promises = {
  readFile: wrap(readFileSync),
  writeFile: wrap(writeFileSync),
  appendFile: wrap(appendFileSync),
  mkdir: wrap(mkdirSync),
  readdir: wrap(readdirSync),
  stat: wrap(statSync),
  lstat: wrap(statSync),
  rename: wrap(renameSync),
  copyFile: wrap(copyFileSync),
  unlink: wrap(unlinkSync),
  rm: wrap(rmSync),
  rmdir: wrap(rmdirSync),
  cp: wrap(cpSync),
  access: wrap((p) => { if (!existsSync(p)) throw err('ENOENT', 'access', p); }),
  open: wrap((p) => new FileHandle(p)),
};

export default {
  existsSync, statSync, lstatSync, readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync,
  copyFileSync, unlinkSync, rmSync, rmdirSync, createReadStream, promises,
};
