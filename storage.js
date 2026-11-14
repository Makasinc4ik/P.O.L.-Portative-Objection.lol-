// Хранение библиотеки на диске (главный процесс).
// Структура:
//   Library/
//     library.json                 — список ресурсов
//     Characters/<Имя>/<Поза>/idle.gif, talk.gif, pre-1.gif, sound-1.mp3
//     Characters/<Имя>/icon.png, blip.wav, Bubbles/<Выкрик>.png
//     Backgrounds/<Имя>.png, Music/<Имя>.ogg, Sounds/<Имя>.mp3, Textboxes/<Имя>/…
//     Customs/<те же папки>/<папки пользователя>/…   — всё, что не стандартное
//     System/…                     — общие файлы сайта (голоса, выкрики, текстбоксы)
//     .inbox/ .cache/              — служебное
'use strict';
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');

const TYPES = ['characters', 'backgrounds', 'music', 'sounds', 'textboxes', 'evidence', 'popups'];
const TYPE_DIR = { characters: 'Characters', backgrounds: 'Backgrounds', music: 'Music', sounds: 'Sounds', textboxes: 'Textboxes', evidence: 'Evidence', popups: 'Popups' };
const LAYOUT = 2;

const st = { dir: null, file: null, lib: null, saveTimer: null };

function isLocal(u) { return typeof u === 'string' && u.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('/'); }
function abs(rel) { return path.join(st.dir, ...rel.split('/')); }
function extOf(rel) { const e = path.extname(rel).toLowerCase(); return e && e.length <= 6 ? e : ''; }
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
function safeName(s, max = 60) {
  let t = String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!t) t = 'Без названия';
  if (RESERVED.test(t)) t = '_' + t;
  if (t.length > max) t = t.slice(0, max).trim().replace(/[. ]+$/, '');
  return t;
}

function emptyLibrary() {
  return { version: 1, layout: LAYOUT, nextId: 900000001, characters: [], backgrounds: [], music: [], sounds: [], textboxes: [], evidence: [], popups: [], urlMap: {}, aliases: {}, folders: {} };
}
function normalize(lib) {
  for (const t of TYPES) lib[t] = lib[t] || [];
  lib.urlMap = lib.urlMap || {};
  lib.aliases = lib.aliases || {};
  lib.folders = lib.folders || {};
  lib.marks = lib.marks || {};
  lib.nextId = lib.nextId || 900000001;
  return lib;
}

function load(dir) {
  st.dir = dir;
  st.file = path.join(dir, 'library.json');
  fs.mkdirSync(dir, { recursive: true });
  try { st.lib = normalize(JSON.parse(fs.readFileSync(st.file, 'utf8'))); } catch (e) { st.lib = emptyLibrary(); }
  return st.lib;
}
function saveNow() {
  clearTimeout(st.saveTimer);
  st.saveTimer = null;
  const tmp = st.file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(st.lib));
  fs.renameSync(tmp, st.file);
}
function saveSoon() { if (!st.saveTimer) st.saveTimer = setTimeout(saveNow, 400); }

// ---------- ссылки на файлы внутри ресурса ----------
function urlRefs(type, a) {
  const refs = [];
  const add = (o, k) => { if (o && typeof o[k] === 'string' && o[k]) refs.push([o, k]); };
  if (type === 'characters') {
    ['iconUrl', 'blipUrl', 'galleryImageUrl', 'galleryAJImageUrl'].forEach((k) => add(a, k));
    for (const p of a.poses || []) {
      ['idleImageUrl', 'speakImageUrl', 'iconUrl'].forEach((k) => add(p, k));
      for (const s of p.poseStates || []) add(s, 'imageUrl');
      for (const t of p.poseAudioTicks || []) add(t, 'fileName');
    }
    for (const b of a.speechBubbles || []) { add(b, 'imageUrl'); add(b, 'soundUrl'); }
  } else if (type === 'backgrounds') {
    add(a, 'url'); add(a, 'deskUrl');
  } else if (type === 'popups') {
    add(a, 'url'); add(a, 'introSound');
  } else if (type === 'evidence') {
    add(a, 'url'); add(a, 'boxUrl'); add(a, 'soundUrl');
  } else if (type === 'textboxes') {
    add(a, 'url'); add(a.nameplate, 'url'); add(a.nameplate, 'fontUrl'); add(a.text, 'fontUrl'); add(a.nextButton, 'url');
  } else {
    add(a, 'url');
  }
  return refs;
}

function nameKey(type, a) {
  const parts = [];
  if (!a.isPreset) parts.push('customs');
  parts.push(TYPE_DIR[type]);
  if (!a.isPreset && a.folder) for (const f of String(a.folder).split('/')) if (f.trim()) parts.push(safeName(f, 40));
  parts.push(safeName(a.name));
  return parts.join('/').toLowerCase();
}

function baseRel(type, a) {
  const parts = [];
  if (!a.isPreset) parts.push('Customs');
  parts.push(TYPE_DIR[type]);
  if (!a.isPreset && a.folder) for (const f of String(a.folder).split('/')) if (f.trim()) parts.push(safeName(f, 40));
  const key = nameKey(type, a);
  const clash = st.lib[type].some((b) => b.id !== a.id && nameKey(type, b) === key);
  parts.push(safeName(a.name) + (clash ? ` [${a.id}]` : ''));
  return parts.join('/');
}

// Куда должен лежать каждый файл ресурса (без расширения)
function plan(type, a) {
  const B = baseRel(type, a);
  const out = [];
  const add = (o, k, dest) => { if (o && isLocal(o[k])) out.push([o, k, dest]); };
  const uniq = (set, raw, max) => { const base = safeName(raw, max); let n = base; let i = 2; while (set.has(n.toLowerCase())) n = `${base} ${i++}`; set.add(n.toLowerCase()); return n; };
  if (type === 'characters') {
    add(a, 'iconUrl', `${B}/icon`); add(a, 'blipUrl', `${B}/blip`);
    add(a, 'galleryImageUrl', `${B}/gallery`); add(a, 'galleryAJImageUrl', `${B}/gallery-aj`);
    const used = new Set(['bubbles']);
    for (const p of a.poses || []) {
      const P = `${B}/${uniq(used, p.name || 'Поза', 50)}`;
      add(p, 'idleImageUrl', `${P}/idle`); add(p, 'speakImageUrl', `${P}/talk`); add(p, 'iconUrl', `${P}/icon`);
      (p.poseStates || []).forEach((s, i) => add(s, 'imageUrl', `${P}/pre-${i + 1}`));
      (p.poseAudioTicks || []).forEach((t, i) => add(t, 'fileName', `${P}/sound-${i + 1}`));
    }
    const ub = new Set();
    for (const b of a.speechBubbles || []) {
      const n = uniq(ub, b.name || 'Выкрик', 40);
      add(b, 'imageUrl', `${B}/Bubbles/${n}`); add(b, 'soundUrl', `${B}/Bubbles/${n}`);
    }
  } else if (type === 'backgrounds') {
    add(a, 'url', B); add(a, 'deskUrl', `${B} (стол)`);
  } else if (type === 'popups') {
    add(a, 'url', B); add(a, 'introSound', `${B} (звук)`);
  } else if (type === 'evidence') {
    add(a, 'url', B); add(a, 'boxUrl', `${B} (рамка)`); add(a, 'soundUrl', `${B} (звук)`);
  } else if (type === 'textboxes') {
    add(a, 'url', `${B}/box`); add(a.nameplate, 'url', `${B}/nameplate`);
    add(a.nameplate, 'fontUrl', `${B}/font-name`); add(a.text, 'fontUrl', `${B}/font-text`); add(a.nextButton, 'url', `${B}/next`);
  } else {
    add(a, 'url', B);
  }
  return out;
}

// Сколько раз на файл ссылаются ресурсы (кроме указанного)
function refCounts(exType, exId) {
  const m = new Map();
  for (const t of TYPES) {
    for (const a of st.lib[t]) {
      if (t === exType && a.id === exId) continue;
      for (const [o, k] of urlRefs(t, a)) if (isLocal(o[k])) { const key = o[k].toLowerCase(); m.set(key, (m.get(key) || 0) + 1); }
    }
  }
  return m;
}

async function moveFile(src, dest) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  try { await fsp.rename(src, dest); }
  catch (e) { await fsp.copyFile(src, dest); await fsp.unlink(src).catch(() => {}); }
}

async function pruneDirs(dir) {
  let d = dir;
  while (d.startsWith(st.dir) && d !== st.dir) {
    try {
      const items = await fsp.readdir(d);
      if (items.length) break;
      await fsp.rmdir(d);
    } catch (e) { break; }
    d = path.dirname(d);
  }
}

// Раскладывает файлы ресурса по его папкам. Возвращает ресурс с новыми ссылками.
async function organizeAsset(type, a) {
  const others = refCounts(type, a.id);
  const own = new Set(urlRefs(type, a).map(([o, k]) => o[k]).filter(isLocal).map((s) => s.toLowerCase()));
  const assigned = new Map();
  for (const [o, k, base] of plan(type, a)) {
    const src = o[k];
    const sl = src.toLowerCase();
    if (assigned.has(sl)) { o[k] = assigned.get(sl); continue; }
    const ext = extOf(src);
    let dest = base + ext;
    if (dest.toLowerCase() === sl) { assigned.set(sl, src); continue; }
    if (!fs.existsSync(abs(src))) continue;
    let n = 2;
    const taken = (d) => {
      const dl = d.toLowerCase();
      if (dl === sl) return false;
      if ([...assigned.values()].some((v) => v.toLowerCase() === dl)) return true;
      if (own.has(dl)) return true;
      if ((others.get(dl) || 0) > 0) return true;
      return false;
    };
    while (taken(dest)) dest = `${base} (${n++})${ext}`;
    // системные файлы программы (System/…) никогда не переносим — только копируем
    const fromUserInbox = sl.startsWith('.inbox/user/') || sl.startsWith('system/');
    const shared = (others.get(sl) || 0) > 0;
    if (fromUserInbox || shared) {
      await fsp.mkdir(path.dirname(abs(dest)), { recursive: true });
      await fsp.copyFile(abs(src), abs(dest));
    } else {
      await moveFile(abs(src), abs(dest));
      for (const [u, v] of Object.entries(st.lib.urlMap)) if (v.toLowerCase() === sl) st.lib.urlMap[u] = dest;
      await pruneDirs(path.dirname(abs(src)));
    }
    assigned.set(sl, dest);
    o[k] = dest;
  }
  return a;
}

// Удаляет файлы ресурса, на которые больше никто не ссылается
// trash — массив, куда записываются перенесённые в корзину файлы ({rel, tmp}); без него файлы удаляются насовсем
async function removeAssetFiles(type, a, keep = new Set(), trash = null) {
  const others = refCounts(type, a.id);
  const mapped = new Set(Object.values(st.lib.urlMap).map((v) => v.toLowerCase()));
  for (const [o, k] of urlRefs(type, a)) {
    const v = o[k];
    if (!isLocal(v) || /^system\//i.test(v) || keep.has(v.toLowerCase()) || (others.get(v.toLowerCase()) || 0) > 0 || mapped.has(v.toLowerCase())) continue;
    try {
      if (trash) {
        if (trash.some((t) => t.rel.toLowerCase() === v.toLowerCase())) continue;
        const tmp = `.trash/${Date.now().toString(36)}-${trash.length}-${path.basename(v)}`;
        await fsp.mkdir(path.dirname(abs(tmp)), { recursive: true });
        await fsp.rename(abs(v), abs(tmp));
        trash.push({ rel: v, tmp });
      } else await fsp.unlink(abs(v));
      await pruneDirs(path.dirname(abs(v)));
    } catch (e) { /* уже нет */ }
  }
}
// вернуть файлы из корзины на прежние места
async function restoreTrash(trash) {
  for (const t of trash || []) {
    try {
      if (fs.existsSync(abs(t.rel))) continue;
      await fsp.mkdir(path.dirname(abs(t.rel)), { recursive: true });
      await fsp.rename(abs(t.tmp), abs(t.rel));
    } catch (e) { /* файл уже не вернуть */ }
  }
}
// корзина живёт до закрытия программы (отмена действий — только в пределах сеанса)
async function clearTrash() { try { await fsp.rm(abs('.trash'), { recursive: true, force: true }); } catch (e) { /* */ } }

// ---------- системные файлы сайта ----------
function systemRel(url) {
  const p = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
  return 'System/' + p.split('/').map((s) => safeName(s, 80)).join('/');
}

// Входящие файлы: user — выбранные пользователем (копируются при сохранении), dl — скачанные/распакованные (переносятся)
async function stageBuffer(buf, name, kind = 'dl') {
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
  let ext = path.extname(name || '').toLowerCase() || '.bin';
  if (ext === '.jpeg' || ext === '.jfif' || ext === '.jpe') ext = '.jpg';
  const rel = `.inbox/${kind}/${hash}${ext}`;
  if (!fs.existsSync(abs(rel))) {
    await fsp.mkdir(path.dirname(abs(rel)), { recursive: true });
    await fsp.writeFile(abs(rel), buf);
  }
  return rel;
}

// ---------- проверка: файлы ресурсов удалены вручную (например, в проводнике) ----------
// Убирает из библиотеки ресурсы, у которых не осталось нужных файлов; у персонажей — позы без картинок.
function checkFiles() {
  const lib = st.lib;
  const gone = (u) => isLocal(u) && !fs.existsSync(abs(u));
  const removed = [];
  let fixedPoses = 0;
  for (const [u, v] of Object.entries(lib.urlMap)) if (!fs.existsSync(abs(v))) delete lib.urlMap[u];
  for (const t of TYPES) {
    lib[t] = lib[t].filter((a) => {
      if (t === 'characters') {
        const before = (a.poses || []).length;
        a.poses = (a.poses || []).filter((p) => !(gone(p.idleImageUrl) && gone(p.speakImageUrl || p.idleImageUrl)));
        for (const p of a.poses) {
          if (gone(p.idleImageUrl)) p.idleImageUrl = p.speakImageUrl;
          if (gone(p.speakImageUrl)) p.speakImageUrl = p.idleImageUrl;
          p.poseStates = (p.poseStates || []).filter((x) => !gone(x.imageUrl));
          p.poseAudioTicks = (p.poseAudioTicks || []).filter((x) => !gone(x.fileName));
          if (gone(p.iconUrl)) p.iconUrl = '';
        }
        if (gone(a.iconUrl)) a.iconUrl = '';
        a.speechBubbles = (a.speechBubbles || []).filter((b) => !gone(b.imageUrl));
        fixedPoses += before - a.poses.length;
        if (before && !a.poses.length) { removed.push({ type: t, id: a.id, name: a.name }); return false; }
        return true;
      }
      if (gone(a.url)) { removed.push({ type: t, id: a.id, name: a.name }); return false; }
      if (t === 'backgrounds' && gone(a.deskUrl)) a.deskUrl = null;
      return true;
    });
  }
  if (removed.length || fixedPoses) saveNow();
  return { removed, fixedPoses };
}

// ---------- переход со старой раскладки (files/<хеш>) и уборка ----------
async function organizeAll(systemUrls, progress) {
  const lib = st.lib;
  // ссылки на системные файлы держим как адреса сайта
  const sysRev = new Map();
  for (const u of systemUrls) { const v = lib.urlMap[u]; if (v) sysRev.set(v.toLowerCase(), u); }
  for (const t of TYPES) for (const a of lib[t]) for (const [o, k] of urlRefs(t, a)) { const r = sysRev.get(String(o[k]).toLowerCase()); if (r) o[k] = r; }
  for (const u of systemUrls) {
    const v = lib.urlMap[u];
    if (!v || v.startsWith('System/')) continue;
    const dest = systemRel(u);
    if (fs.existsSync(abs(v))) { await moveFile(abs(v), abs(dest)); lib.urlMap[u] = dest; } else delete lib.urlMap[u];
  }
  let done = 0;
  const total = TYPES.reduce((s, t) => s + lib[t].length, 0);
  for (const t of TYPES) {
    for (const a of lib[t]) {
      await organizeAsset(t, a);
      done++;
      if (progress && done % 20 === 0) progress({ phase: 'files', label: 'Раскладка библиотеки по папкам…', done, total });
    }
  }
  // устаревшие записи кэша адресов
  for (const [u, v] of Object.entries(lib.urlMap)) if (!fs.existsSync(abs(v))) delete lib.urlMap[u];
  lib.layout = LAYOUT;
  saveNow();
  await collectGarbage();
}

async function listFiles(dir) {
  const out = [];
  const walk = async (d) => {
    let items;
    try { items = await fsp.readdir(d, { withFileTypes: true }); } catch (e) { return; }
    for (const it of items) {
      const p = path.join(d, it.name);
      if (it.isDirectory()) await walk(p); else out.push(p);
    }
  };
  await walk(dir);
  return out;
}

// Удаляет только служебный мусор: .inbox, старые files/ и thumbs/, если на файлы никто не ссылается
async function collectGarbage() {
  const refs = refCounts(null, null);
  for (const v of Object.values(st.lib.urlMap)) refs.set(v.toLowerCase(), 1);
  for (const sub of ['.inbox', 'files']) {
    const dir = path.join(st.dir, sub);
    for (const f of await listFiles(dir)) {
      const rel = path.relative(st.dir, f).split(path.sep).join('/');
      if (!refs.has(rel.toLowerCase())) await fsp.unlink(f).catch(() => {});
    }
    for (const f of (await listFiles(dir)).length ? [] : [dir]) await fsp.rm(f, { recursive: true, force: true }).catch(() => {});
  }
  await fsp.rm(path.join(st.dir, 'thumbs'), { recursive: true, force: true }).catch(() => {});
}

// ---------- перенос библиотеки из старой версии ----------
async function importLegacy(oldDir, systemUrls, progress) {
  const file = path.join(oldDir, 'library.json');
  const old = normalize(JSON.parse(await fsp.readFile(file, 'utf8')));
  if (path.resolve(oldDir) === path.resolve(st.dir)) throw new Error('Это и есть текущая библиотека');
  const lib = st.lib;
  let added = 0;
  const stageOld = async (ref) => {
    const src = path.join(oldDir, ...ref.split('/'));
    if (!fs.existsSync(src)) return null;
    const hash = crypto.createHash('sha1').update(oldDir + '|' + ref).digest('hex').slice(0, 20);
    const rel = `.inbox/dl/${hash}${extOf(ref)}`;
    await moveFile(src, abs(rel));
    return rel;
  };
  const staged = new Map();
  const stage = async (ref) => { if (staged.has(ref)) return staged.get(ref); const r = await stageOld(ref); staged.set(ref, r); return r; };
  for (const t of TYPES) {
    const have = new Set(lib[t].map((a) => a.id));
    for (const a of old[t]) {
      if (have.has(a.id)) continue;
      for (const [o, k] of urlRefs(t, a)) {
        if (!isLocal(o[k])) continue;
        const r = await stage(o[k]);
        if (r) o[k] = r;
        else {
          // файл мог числиться за адресом сайта
          const url = Object.keys(old.urlMap).find((u) => old.urlMap[u] === o[k]);
          if (url) o[k] = url;
        }
      }
      lib[t].push(a);
      added++;
    }
  }
  for (const [u, v] of Object.entries(old.urlMap)) {
    if (lib.urlMap[u] && fs.existsSync(abs(lib.urlMap[u]))) continue;
    const r = await stage(v);
    if (r) lib.urlMap[u] = r;
  }
  for (const k of Object.keys(old.aliases || {})) lib.aliases[k] = { ...(old.aliases[k] || {}), ...(lib.aliases[k] || {}) };
  for (const t of Object.keys(old.marks || {})) lib.marks[t] = { ...(old.marks[t] || {}), ...(lib.marks[t] || {}) };
  for (const k of Object.keys(old.folders || {})) lib.folders[k] = [...new Set([...(lib.folders[k] || []), ...(old.folders[k] || [])])];
  lib.nextId = Math.max(lib.nextId, old.nextId || 0);
  saveNow();
  await organizeAll(systemUrls, progress);
  await fsp.rename(file, file + '.перенесено').catch(() => {});
  return { added };
}

// ---------- поиск старых библиотек рядом с программой ----------
function findLegacyLibraries(exeDir) {
  const found = new Set();
  const check = (dir) => {
    try {
      const f = path.join(dir, 'library.json');
      if (fs.existsSync(f) && path.resolve(dir) !== path.resolve(st.dir)) found.add(path.resolve(dir));
    } catch (e) { /* */ }
  };
  const scan = (dir, depth) => {
    if (depth < 0) return;
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    let n = 0;
    for (const it of items) {
      if (!it.isDirectory() || ++n > 60) continue;
      const p = path.join(dir, it.name);
      if (it.name === 'Library') check(p);
      else if (!/^(node_modules|locales|resources|\.|Windows|Program Files)/i.test(it.name)) scan(p, depth - 1);
    }
  };
  check(path.join(exeDir, 'Library'));
  scan(path.dirname(exeDir), 2);
  scan(path.dirname(path.dirname(exeDir)), 2);
  return [...found].map((dir) => {
    let count = 0;
    try { const l = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')); count = TYPES.reduce((s, t) => s + ((l[t] || []).length), 0); } catch (e) { /* */ }
    return { dir, count };
  }).filter((x) => x.count > 0);
}

module.exports = { restoreTrash, clearTrash,
  TYPES, TYPE_DIR, st, isLocal, abs, safeName, load, saveNow, saveSoon, urlRefs, organizeAsset, organizeAll,
  removeAssetFiles, checkFiles, systemRel, stageBuffer, collectGarbage, importLegacy, findLegacyLibraries, moveFile, LAYOUT,
};
