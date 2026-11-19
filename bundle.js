'use strict';
// Проект вместе с ресурсами в одном ZIP — чтобы перенести сцену на другое устройство (например, с ПК на телефон через Telegram)
// без скачивания ресурсов заново.
//
// Внутри архива:
//   oo-bundle.json      — описание: проект, ресурсы библиотеки и какие файлы им нужны
//   project.objection   — сам проект (как обычный файл сохранения)
//   files/…             — файлы ресурсов (картинки, звук, шрифты) без сжатия
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');

const TYPES = ['characters', 'backgrounds', 'music', 'sounds', 'textboxes', 'evidence', 'popups'];
const SYSTEM_BOX = /^[0-4]$/;

// ---------- CRC-32 ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// ---------- Запись ZIP (по одному файлу, без ZIP64: до 4 ГБ) ----------
class ZipWriter {
  constructor(fh) { this.fh = fh; this.pos = 0; this.entries = []; }
  async put(name, data, { deflate = false } = {}) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const body = deflate ? zlib.deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
    const offset = this.pos;
    await this.write(Buffer.concat([h, nameBuf]));
    await this.write(body);
    this.entries.push({ nameBuf, crc, csize: body.length, size: raw.length, method: deflate ? 8 : 0, offset });
  }
  async write(b) { await this.fh.write(b, 0, b.length, this.pos); this.pos += b.length; }
  async finish() {
    const start = this.pos;
    for (const e of this.entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(e.method, 10);
      c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(e.crc, 16); c.writeUInt32LE(e.csize, 20); c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.nameBuf.length, 28); c.writeUInt32LE(e.offset, 42);
      await this.write(Buffer.concat([c, e.nameBuf]));
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(this.entries.length, 8); end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.pos - start, 12); end.writeUInt32LE(start, 16);
    await this.write(end);
  }
}

// ---------- Чтение ZIP целиком в папку (ПК; на Android — средствами системы) ----------
async function unzipTo(zipPath, dest) {
  if (typeof fs.__ooUnzip === 'function') { // Android: java.util.zip, без копирования через JS
    const r = fs.__ooUnzip(zipPath, dest);
    if (r !== true) throw new Error(String(r || 'unzip'));
    return;
  }
  const buf = await fsp.readFile(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(dest);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip');
    const method = buf.readUInt16LE(p + 10); const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28); const xlen = buf.readUInt16LE(p + 30); const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const out = path.resolve(root, ...name.split('/'));
    if (!out.startsWith(root + path.sep)) continue; // имена вида ../ не пускаем за пределы папки
    const lnl = buf.readUInt16LE(off + 26); const lxl = buf.readUInt16LE(off + 28);
    const data = buf.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await fsp.writeFile(out, method === 8 ? zlib.inflateRawSync(data) : data);
  }
}

async function isZip(p) {
  if (typeof fs.__ooHead === 'function') { // Android: открыть файл «на чтение» средствами Node там нельзя
    const b = fs.__ooHead(p, 4);
    return !!b && b.length >= 4 && b.readUInt32LE(0) === 0x04034b50;
  }
  try {
    const fh = await fsp.open(p, 'r');
    try { const b = Buffer.alloc(4); await fh.read(b, 0, 4, 0); return b.readUInt32LE(0) === 0x04034b50; } finally { await fh.close(); }
  } catch (e) {
    try { const b = await fsp.readFile(p); return b.length > 4 && b.readUInt32LE(0) === 0x04034b50; } catch (e2) { return false; }
  }
}

// ---------- Какие ресурсы нужны проекту ----------
function makeResolver(L) {
  return (type, id) => {
    if (id == null || id === '') return null;
    let n = id;
    for (let i = 0; i < 6; i++) {
      const a = (L[type] || []).find((x) => String(x.id) === String(n));
      if (a) return a;
      const al = L.aliases && L.aliases[type] && L.aliases[type][n];
      if (al == null) return null;
      n = al;
    }
    return null;
  };
}

function projectRefs(project) {
  const r = Object.fromEntries(TYPES.map((t) => [t, new Set()]));
  const box = (v) => { if (v != null && v !== '' && !SYSTEM_BOX.test(String(v))) r.textboxes.add(String(v)); };
  box(project.options && project.options.chatbox);
  for (const g of project.groups || []) {
    for (const f of g.frames || []) {
      if (f.characterId) r.characters.add(f.characterId);
      if (f.backgroundId) r.backgrounds.add(f.backgroundId);
      if (f.popupId) r.popups.add(f.popupId);
      for (const a of f.actions || []) {
        if (a.actionId === 12) box(a.actionParam);
        if (a.actionId === 7 && /^c\d+$/.test(String(a.actionParam || ''))) r.popups.add(+String(a.actionParam).slice(1));
      }
      const t = f.text || '';
      for (const m of t.matchAll(/\[#bgm(\d+)\]/gi)) r.music.add(+m[1]);
      for (const m of t.matchAll(/\[#bgs(\d+)\]/gi)) r.sounds.add(+m[1]);
      for (const m of t.matchAll(/\[#evdi?(\d+)[lr]?\]/gi)) r.evidence.add(+m[1]);
    }
  }
  for (const p of project.pairs || []) for (const c of p.pairs || []) if (c.characterId) r.characters.add(c.characterId);
  return r;
}

// ---------- Сохранить проект с ресурсами ----------
// S — storage.js, L — библиотека, project — объект проекта, text — проект в формате файла
async function exportBundle({ S, L, project, text, name, filePath, includePresets = true, appVersion, localOf }) {
  const resolve = makeResolver(L);
  const refs = projectRefs(project);
  const assets = []; const seen = new Set();
  const add = (type, a) => {
    if (!a) return;
    const k = type + ':' + a.id;
    if (seen.has(k)) return;
    seen.add(k);
    if (a.isPreset && !includePresets) return;
    // ссылки на сайт, которые уже скачаны (urlMap), — заменить на файл из библиотеки, чтобы он попал в архив
    a = JSON.parse(JSON.stringify(a));
    if (localOf) for (const [o, k] of S.urlRefs(type, a)) { const v = o[k]; if (v && !S.isLocal(v)) { const rel = localOf(v); if (rel && fs.existsSync(S.abs(rel))) o[k] = rel; } }
    assets.push({ type, a });
    if (type === 'characters') { // фон и текстбокс персонажа по умолчанию
      if (a.backgroundId) add('backgrounds', resolve('backgrounds', a.backgroundId));
      if (a.textboxId != null && !SYSTEM_BOX.test(String(a.textboxId))) add('textboxes', resolve('textboxes', a.textboxId));
    }
  };
  for (const type of TYPES) for (const id of refs[type]) add(type, resolve(type, id));
  const files = {}; // путь в библиотеке → имя в архиве
  let n = 0;
  for (const { type, a } of assets) {
    for (const [o, k] of S.urlRefs(type, a)) {
      const v = o[k];
      if (!S.isLocal(v) || files[v]) continue;
      if (!fs.existsSync(S.abs(v))) continue;
      files[v] = 'files/' + String(++n).padStart(5, '0') + (path.extname(v) || '.bin');
    }
  }
  const manifest = {
    format: 'oo-bundle', version: 1, app: appVersion || '', created: new Date().toISOString(), name: name || 'project',
    project: 'project.objection',
    assets: assets.map(({ type, a }) => ({ type, asset: a })),
    files,
  };
  const fh = await fsp.open(filePath, 'w');
  let bytes = 0;
  try {
    const z = new ZipWriter(fh);
    await z.put('oo-bundle.json', JSON.stringify(manifest), { deflate: true });
    await z.put('project.objection', text, { deflate: true });
    for (const [rel, inZip] of Object.entries(files)) {
      const b = await fsp.readFile(S.abs(rel));
      bytes += b.length;
      await z.put(inZip, b);
    }
    await z.finish();
  } catch (e) {
    if (fh.discard) fh.discard();
    throw e;
  } finally { await fh.close(); }
  return { path: filePath, assets: assets.length, files: Object.keys(files).length, bytes };
}

// ---------- Открыть проект с ресурсами ----------
// Ресурсы, которых нет в библиотеке, добавляются (стандартные — на свои места, свои — в Customs, папка «Из архива»).
// Если номер своего ресурса уже занят другим ресурсом, ресурс получает новый номер, а проект исправляется.
async function importBundle({ S, L, zipPath, tmpDir, folder, decode, encode }) {
  await fsp.rm(tmpDir, { recursive: true, force: true });
  await fsp.mkdir(tmpDir, { recursive: true });
  try {
    await unzipTo(zipPath, tmpDir);
    const manifest = JSON.parse(await fsp.readFile(path.join(tmpDir, 'oo-bundle.json'), 'utf8'));
    if (manifest.format !== 'oo-bundle') throw new Error('not oo-bundle');
    const text = await fsp.readFile(path.join(tmpDir, manifest.project || 'project.objection'), 'utf8');
    const resolve = makeResolver(L);
    const remap = Object.fromEntries(TYPES.map((t) => [t, new Map()]));
    // файлы из архива переносятся во «входящие» и раскладываются вместе с ресурсом
    const staged = new Map();
    let k = 0;
    const stage = async (rel) => {
      if (staged.has(rel)) return staged.get(rel);
      const inZip = manifest.files[rel];
      if (!inZip) return null;
      const src = path.join(tmpDir, ...inZip.split('/'));
      if (!fs.existsSync(src)) return null;
      let out;
      if (/^system\//i.test(rel)) { // общие файлы программы — на своё место, если их ещё нет
        if (!fs.existsSync(S.abs(rel))) { await fsp.mkdir(path.dirname(S.abs(rel)), { recursive: true }); await fsp.rename(src, S.abs(rel)).catch(() => fsp.copyFile(src, S.abs(rel))); }
        out = rel;
      } else {
        out = `.inbox/dl/b${Date.now().toString(36)}-${++k}${path.extname(rel).toLowerCase() || '.bin'}`;
        await fsp.mkdir(path.dirname(S.abs(out)), { recursive: true });
        await fsp.rename(src, S.abs(out)).catch(() => fsp.copyFile(src, S.abs(out)));
      }
      staged.set(rel, out);
      return out;
    };
    let added = 0; let skipped = 0;
    const filesOk = (type, a) => S.urlRefs(type, a).every(([o, key]) => !S.isLocal(o[key]) || fs.existsSync(S.abs(o[key])));
    // тот же ресурс уже есть (тот же номер, имя и, у персонажа, число поз) — не дублируем
    const sameAsset = (type, a, b) => !!(a && b && a.name === b.name && (type !== 'characters' || (a.poses || []).length === (b.poses || []).length));
    for (const { type, asset } of manifest.assets || []) {
      if (!L[type] || !asset) continue;
      const have = asset.isPreset ? (L[type] || []).find((x) => x.isPreset && String(x.id) === String(asset.id)) : resolve(type, asset.id);
      if (have && (asset.isPreset ? filesOk(type, have) : sameAsset(type, have, asset))) { skipped++; continue; }
      const a = JSON.parse(JSON.stringify(asset));
      for (const [o, key] of S.urlRefs(type, a)) if (S.isLocal(o[key]) && manifest.files[o[key]]) { const s = await stage(o[key]); if (s) o[key] = s; }
      if (asset.isPreset) {
        if (have) { const i = L[type].indexOf(have); L[type].splice(i, 1); } // стандартный ресурс без файлов — заменить
      } else {
        a.source = a.source || 'custom';
        if (have) { const nid = typeof a.id === 'string' && !/^\d+$/.test(a.id) ? a.id + '-' + (L.nextId++) : L.nextId++; remap[type].set(String(asset.id), nid); a.id = nid; }
        else if (typeof a.id === 'number' && L.nextId <= a.id) L.nextId = a.id + 1;
        if (folder && !a.folder) a.folder = folder;
      }
      a.added = Date.now();
      L[type].push(a);
      await S.organizeAsset(type, a);
      added++;
    }
    // ссылки персонажей на фон и текстбокс, у которых поменялся номер
    for (const { type, asset } of manifest.assets || []) {
      if (type !== 'characters') continue;
      const id = remap.characters.get(String(asset.id)) ?? asset.id;
      const c = L.characters.find((x) => String(x.id) === String(id));
      if (!c) continue;
      if (c.backgroundId != null && remap.backgrounds.has(String(c.backgroundId))) c.backgroundId = remap.backgrounds.get(String(c.backgroundId));
      if (c.textboxId != null && remap.textboxes.has(String(c.textboxId))) c.textboxId = remap.textboxes.get(String(c.textboxId));
    }
    S.saveNow();
    let outText = text;
    const changed = TYPES.some((t) => remap[t].size);
    if (changed) outText = encode(remapProject(decode(text), remap));
    return { name: manifest.name, text: outText, added, skipped, remapped: TYPES.reduce((s, t) => s + remap[t].size, 0) };
  } finally {
    fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function remapProject(p, remap) {
  const m = (type, v) => (v != null && remap[type].has(String(v)) ? remap[type].get(String(v)) : v);
  if (p.options && p.options.chatbox != null) p.options.chatbox = m('textboxes', p.options.chatbox);
  for (const g of p.groups || []) {
    for (const f of g.frames || []) {
      if (f.characterId) f.characterId = m('characters', f.characterId);
      if (f.backgroundId) f.backgroundId = m('backgrounds', f.backgroundId);
      if (f.popupId) f.popupId = m('popups', f.popupId);
      for (const a of f.actions || []) {
        if (a.actionId === 12) a.actionParam = m('textboxes', a.actionParam);
        if (a.actionId === 7 && /^c\d+$/.test(String(a.actionParam || ''))) a.actionParam = 'c' + m('popups', String(a.actionParam).slice(1));
      }
      if (f.text) {
        f.text = f.text
          .replace(/\[#bgm(\d+)\]/gi, (s, id) => `[#bgm${m('music', id)}]`)
          .replace(/\[#bgs(\d+)\]/gi, (s, id) => `[#bgs${m('sounds', id)}]`)
          .replace(/\[#evd(i?)(\d+)([lr]?)\]/gi, (s, i, id, side) => `[#evd${i}${m('evidence', id)}${side}]`);
      }
    }
  }
  for (const pr of p.pairs || []) for (const c of pr.pairs || []) if (c.characterId) c.characterId = m('characters', c.characterId);
  return p;
}

module.exports = { exportBundle, importBundle, isZip, projectRefs, remapProject, unzipTo, crc32 };
