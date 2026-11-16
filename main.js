// Objection Offline — главный процесс Electron
'use strict';
const zlib = require('zlib');
const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { importCharactersFromZip } = require('./zipimport');
const S = require('./storage');

// Перевод сообщений: язык выбирает окно программы (app:setLang); ключ — русская строка, как в app/js/i18n.js
let UI_LANG = 'ru';
let EN_DICT = null;
function tx(s, ...vals) {
  const dict = UI_LANG === 'en' ? (EN_DICT || (EN_DICT = require('./app/js/lang-en.js'))) : null;
  if (Array.isArray(s) && s.raw) {
    const key = s.map((x, i) => x + (i < vals.length ? '{' + i + '}' : '')).join('');
    if (dict && dict[key] != null) return dict[key].replace(/\{(\d+)\}/g, (m, i) => (Number(i) < vals.length ? String(vals[Number(i)]) : m));
    return s.map((x, i) => x + (i < vals.length ? String(vals[i]) : '')).join('');
  }
  return dict && dict[s] != null ? dict[s] : s;
}
global.tx = tx;

const SITE = 'https://objection.lol';
const APP_DIR = path.join(__dirname, 'app');
// Папка программы. AppImage запускается из временной папки — берём место самого файла .AppImage
const EXE_DIR = process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : (app.isPackaged ? path.dirname(process.execPath) : __dirname);

// ---------- Настройки (общие для всех версий программы) ----------
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')); } catch (e) { return {}; } }
function writeConfig(c) { fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true }); fs.writeFileSync(CONFIG_FILE(), JSON.stringify(c, null, 2)); }

function canWrite(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-test');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch (e) { return false; }
}
function defaultLibraryDir() { return path.join(app.getPath('documents'), 'Objection Offline', 'Library'); }

// Библиотека одна на все версии: по умолчанию «Документы/Objection Offline/Library»
function pickLibraryDir() {
  if (process.env.OO_LIBRARY && canWrite(process.env.OO_LIBRARY)) return process.env.OO_LIBRARY;
  const cfg = readConfig();
  if (cfg.libraryDir && canWrite(cfg.libraryDir)) return cfg.libraryDir;
  // переносная версия: файл portable.txt рядом с exe — библиотека рядом с программой
  if (fs.existsSync(path.join(EXE_DIR, 'portable.txt')) && canWrite(path.join(EXE_DIR, 'Library'))) return path.join(EXE_DIR, 'Library');
  const def = defaultLibraryDir();
  if (canWrite(def)) return def;
  const fallback = path.join(app.getPath('userData'), 'Library');
  canWrite(fallback);
  return fallback;
}

let LIB_DIR;
const lib = () => S.st.lib;
let startupCheck = null;

// ---------- Протокол oo:// (app и lib) ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'oo', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(root)) return null;
  return p;
}

function registerProtocol() {
  protocol.handle('oo', async (request) => {
    const u = new URL(request.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    let root = null;
    if (u.host === 'app') root = APP_DIR;
    else if (u.host === 'lib') root = LIB_DIR;
    if (!root) return new Response('not found', { status: 404 });
    const file = safeJoin(root, rel || 'index.html');
    if (!file || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    // звук и видео: отдаём с поддержкой Range — иначе <audio> не знает длительность и не умеет перематывать
    const mt = MEDIA_TYPES[path.extname(file).toLowerCase()];
    if (mt) return mediaResponse(file, mt, request.headers.get('range'));
    return net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
  });
}

const MEDIA_TYPES = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.weba': 'audio/webm', '.webm': 'video/webm', '.mp4': 'video/mp4' };
async function mediaResponse(file, type, range) {
  const size = (await fsp.stat(file)).size;
  const { Readable } = require('stream');
  let start = 0; let end = size - 1;
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - Number(m[2])); }
    else { start = Number(m[1] || 0); if (m[2] !== '') end = Math.min(size - 1, Number(m[2])); }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  }
  const body = size ? Readable.toWeb(fs.createReadStream(file, { start, end })) : null;
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(size ? end - start + 1 : 0) };
  if (m) headers['content-range'] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: m ? 206 : 200, headers });
}

// ---------- Окно ----------
let win;
let launchFile = null;
function fileFromArgv(argv) {
  return (argv || []).slice(1).find((a) => /\.objection$/i.test(a) && fs.existsSync(a)) || null;
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#15171c',
    title: 'Objection Offline',
    icon: path.join(__dirname, 'app', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      // языки системы (для выбора языка интерфейса при первом запуске)
      additionalArguments: ['--oo-langs=' + (() => { try { return (app.getPreferredSystemLanguages ? app.getPreferredSystemLanguages() : [app.getLocale()]).join(','); } catch (e) { return ''; } })()],
    },
  });
  win.setMenu(null);
  win.loadURL('oo://app/index.html');
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', () => { if (S.st.saveTimer) S.saveNow(); });
}

// ---------- Системные файлы сайта (общие, лежат в System/) ----------
const SYSTEM_PATHS = [
  '/Audio/blip.wav', '/Audio/blip-female.wav', '/Audio/blip-machine.wav', '/Audio/blip-echo.wav',
  '/Audio/blip-katonk.wav', '/Audio/blip-muted.wav',
  '/Images/Bubbles/1.png', '/Images/Bubbles/2.png', '/Images/Bubbles/3.png',
  '/Audio/Vocal/sfx-objection.wav', '/Images/speedlines.gif',
  '/Images/Popups/wt.gif', '/Images/Popups/ce.gif', '/Images/Popups/guilty.gif', '/Images/Popups/not guilty.gif',
  '/Audio/testimony-start.wav', '/Audio/testimony-end.wav', '/Audio/Sound/guilty.mp3',
  '/Images/Popups/testimony.gif', '/Images/evidence container.png', '/Audio/Sound/shooop.mp3',
  // текстбоксы сайта
  '/Images/UI/Chatbox/Trilogy/textbox.png', '/Images/UI/Chatbox/Trilogy/nameplate.png', '/Fonts/Trilogy-body.woff2',
  '/Images/UI/Chatbox/AJ/textbox-nameless.png', '/Images/UI/Chatbox/AJ/textbox.png', '/Fonts/AJ-nameplate.ttf', '/Fonts/AJ_body.woff2',
  '/Images/UI/Chatbox/TGAA/textbox-nameless.png', '/Images/UI/Chatbox/TGAA/textbox.png', '/Fonts/TGAA-nameplate.woff2', '/Fonts/TGAA-body.otf',
  '/Images/UI/Chatbox/DS/textbox-nameless.png', '/Images/UI/Chatbox/DS/textbox.png', '/Fonts/DS-nameplate.ttf', '/Fonts/DS.ttf',
];
// Канонический вид адреса (одинаково кодирует пробелы и скобки во всех версиях)
function canon(u) { try { return new URL(u).href; } catch (e) { return u; } }
function absUrl(u) {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return canon(u);
  if (u.startsWith('//')) return canon('https:' + u);
  if (u.startsWith('/')) return canon(SITE + u);
  return u;
}
const SYSTEM_URLS = SYSTEM_PATHS.map((p) => absUrl(p));
const SYSTEM_SET = new Set(SYSTEM_URLS);
const isSystem = (u) => SYSTEM_SET.has(absUrl(u));

// ---------- Загрузчик ----------
const EXT_BY_TYPE = {
  'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/apng': '.png',
  'image/avif': '.avif', 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/ogg': '.ogg', 'audio/opus': '.opus',
  'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
  'audio/webm': '.webm', 'audio/flac': '.flac', 'video/mp4': '.mp4', 'video/webm': '.webm',
  'font/woff2': '.woff2', 'font/woff': '.woff', 'font/ttf': '.ttf', 'font/otf': '.otf',
};
const KNOWN_EXT = /\.(png|gif|webp|jpe?g|avif|apng|bmp|mp3|ogg|oga|opus|wav|m4a|aac|flac|webm|mp4|woff2?|ttf|otf)$/i;
function extFrom(url, contentType) {
  try {
    const p = decodeURIComponent(new URL(url).pathname);
    const m = p.match(KNOWN_EXT);
    if (m) return m[0].toLowerCase();
  } catch (e) { /* ignore */ }
  const ct = (contentType || '').split(';')[0].trim().toLowerCase();
  return EXT_BY_TYPE[ct] || '.bin';
}

const inflight = new Map();
let cancelRequested = false;

// Сторонние хостинги (Fandom/wikia, imgur, discord) режут «неизвестные» клиенты и картинки без Referer —
// поэтому для них представляемся обычным браузером. К самому objection.lol ходим как раньше.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
function uaHeaders(url) {
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { /* не URL */ }
  if (/(^|\.)objection\.lol$/i.test(host)) return { 'user-agent': 'ObjectionOffline/' + app.getVersion() };
  const hd = { 'user-agent': BROWSER_UA, accept: 'image/avif,image/webp,image/apng,image/*,audio/*,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9,ru;q=0.8' };
  if (/(wikia|fandom)\.(nocookie\.net|com)$/i.test(host)) hd.referer = 'https://aceattorney.fandom.com/';
  else hd.referer = 'https://objection.lol/';
  return hd;
}

// Отмена действий в библиотеке (только в пределах сеанса; файлы удалённых ресурсов лежат в Library/.trash)
const undoStack = [];
function pushUndo(op) { undoStack.push(op); if (undoStack.length > 50) undoStack.shift(); }

// «Отмена» в окне скачивания обрывает все текущие запросы сразу (а не ждёт, пока они докачаются)
let dlAbort = new AbortController();
function cancelDownloads() { cancelRequested = true; dlAbort.abort(); dlAbort = new AbortController(); }
// Сетевые ограничения скачивания. Главная задержка — время ответа на каждый файл (0,5–1 с), а не скорость канала,
// поэтому файлы качаются параллельно: с objection.lol — до 24 одновременно, с остальных хостингов — до 12 на хост,
// чтобы не упираться в их ограничения.
const DL_POOL = 32;
const HEADERS_TIMEOUT = [25000, 45000, 60000]; // ожидание ответа сервера по попыткам
const STALL_TIMEOUT = 30000; // файл «завис»: столько времени не пришло ни байта — попытка заново
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; } }
const isSiteHost = (h) => /(^|\.)objection\.lol$/i.test(h);
const hostSlots = new Map();
async function withHostSlot(url, fn) {
  const host = hostOf(url);
  const limit = isSiteHost(host) ? 24 : 12;
  let st = hostSlots.get(host);
  if (!st) { st = { active: 0, queue: [] }; hostSlots.set(host, st); }
  if (st.active >= limit) await new Promise((r) => st.queue.push(r));
  st.active++;
  try { return await fn(); } finally { st.active--; const next = st.queue.shift(); if (next) next(); }
}
// Читает тело ответа; если данные перестали приходить на STALL_TIMEOUT — обрывает (иначе зависший файл держит очередь)
async function readBody(res, ctl) {
  if (!res.body || !res.body.getReader) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let timer;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(), STALL_TIMEOUT); };
  arm();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      arm();
    }
  } finally { clearTimeout(timer); }
  return Buffer.concat(chunks);
}
// opts.buffer — сразу прочитать тело (с защитой от зависания); тогда возвращается { res, buf }
async function fetchWithRetry(url, opts = {}, tries = 3) {
  let lastErr;
  const runSignal = dlAbort.signal;
  const { buffer, timeout, ...fetchOpts } = opts;
  for (let i = 0; i < tries; i++) {
    if (runSignal.aborted || cancelRequested) throw Object.assign(new Error(tx('Отменено')), { fatal: true, cancelled: true });
    const ctl = new AbortController();
    const onCancel = () => ctl.abort();
    runSignal.addEventListener('abort', onCancel, { once: true });
    try {
      const t = setTimeout(() => ctl.abort(), timeout || HEADERS_TIMEOUT[Math.min(i, HEADERS_TIMEOUT.length - 1)]);
      // для сторонних сайтов каждую вторую попытку делаем через сетевой стек Chromium —
      // некоторые CDN (Cloudflare у Fandom) отличают его от Node и не отдают файл «скрипту»
      const viaChromium = i % 2 === 1 && !/objection\.lol/i.test(url) && session.defaultSession && typeof session.defaultSession.fetch === 'function';
      const fo = { ...fetchOpts, signal: ctl.signal, headers: { ...uaHeaders(url), ...(fetchOpts.headers || {}) } };
      let res;
      try { res = viaChromium ? await session.defaultSession.fetch(url, fo) : await fetch(url, fo); } finally { clearTimeout(t); }
      // файла нет совсем — повторять бессмысленно; «доступ запрещён» — после попытки через Chromium
      if (res.status === 404 || res.status === 410) throw Object.assign(new Error(String(res.status)), { fatal: true });
      if ((res.status === 401 || res.status === 403 || res.status === 451) && i >= 1) throw Object.assign(new Error('HTTP ' + res.status), { fatal: true });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (!buffer) return res;
      const buf = await readBody(res, ctl);
      return { res, buf };
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      if (runSignal.aborted || cancelRequested) throw Object.assign(new Error(tx('Отменено')), { fatal: true, cancelled: true });
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    } finally { runSignal.removeEventListener('abort', onCancel); }
  }
  throw lastErr;
}

// Android: попытки как у fetchWithRetry, но тело ответа сразу пишется в файл (res.done — файл записан)
async function fetchWithRetryToFile(url, file, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchWithRetry(url, { toFile: file }, 1);
      // «Отмена» обрывает и докачку тела
      const sig = dlAbort.signal;
      await new Promise((resolve, reject) => {
        const onCancel = () => { if (res.cancel) res.cancel(); reject(Object.assign(new Error(tx('Отменено')), { fatal: true, cancelled: true })); };
        if (sig.aborted) { onCancel(); return; }
        sig.addEventListener('abort', onCancel, { once: true });
        res.done.then((v) => { sig.removeEventListener('abort', onCancel); resolve(v); }, (e) => { sig.removeEventListener('abort', onCancel); reject(e); });
      });
      return res;
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      if (dlAbort.signal.aborted || cancelRequested) throw Object.assign(new Error(tx('Отменено')), { fatal: true, cancelled: true });
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Скачивает файл: системный — сразу в System/, остальное — во входящие (потом разложится по папкам ресурса)
async function downloadUrl(u) {
  if (!u || S.isLocal(u) || u.startsWith('data:')) return u;
  const url = absUrl(u);
  const mapped = lib().urlMap[url];
  if (mapped && fs.existsSync(S.abs(mapped))) return mapped;
  if (inflight.has(url)) return inflight.get(url);
  const job = (async () => {
    const relFor = (res) => (SYSTEM_SET.has(url) ? S.systemRel(url) : `.inbox/dl/${crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)}${extFrom(url, res.headers.get('content-type'))}`);
    let rel;
    if (process.platform === 'android') {
      // Android: файл пишется на диск прямо из сети (через Java), не проходя через JavaScript
      const part = `.inbox/dl/.part-${crypto.randomUUID()}`;
      const res = await withHostSlot(url, () => fetchWithRetryToFile(url, S.abs(part)));
      rel = relFor(res);
      await fsp.mkdir(path.dirname(S.abs(rel)), { recursive: true });
      await fsp.rename(S.abs(part), S.abs(rel));
    } else {
      const { res, buf } = await withHostSlot(url, () => fetchWithRetry(url, { buffer: true }));
      rel = relFor(res);
      await fsp.mkdir(path.dirname(S.abs(rel)), { recursive: true });
      await fsp.writeFile(S.abs(rel), buf);
    }
    lib().urlMap[url] = rel;
    S.saveSoon();
    return rel;
  })();
  inflight.set(url, job);
  try { return await job; } finally { inflight.delete(url); }
}

// Перемешивает адреса по хостам (по очереди с каждого), чтобы медленный хостинг не занял все потоки разом
function interleaveHosts(urls) {
  const by = new Map();
  for (const u of urls) { const h = hostOf(u); if (!by.has(h)) by.set(h, []); by.get(h).push(u); }
  const lists = [...by.values()];
  const out = [];
  for (let i = 0; out.length < urls.length; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

async function runPool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length && !cancelRequested) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

function upsertAssets(type, list, extra = {}) {
  const arr = lib()[type];
  const byId = new Map(arr.map((a, i) => [a.id, i]));
  const out = [];
  for (const raw of list) {
    const a = { ...raw, ...extra, source: 'objection.lol' };
    delete a.userId;
    if (!a.name) a.name = ({ evidence: tx('Улика '), popups: tx('Картинка '), textboxes: tx('Текстбокс ') }[type] || '') + a.id;
    if (byId.has(a.id)) {
      const old = arr[byId.get(a.id)];
      if (old.source !== 'objection.lol') continue; // своё не трогаем
      if (old.folder) a.folder = old.folder;
      a.added = old.added || Date.now();
      arr[byId.get(a.id)] = a;
    } else {
      a.added = Date.now();
      arr.push(a);
      byId.set(a.id, arr.length - 1);
    }
    out.push(a);
  }
  return out;
}

async function downloadAssetFiles(entries, progress) {
  const refs = [];
  for (const { type, asset } of entries) for (const r of S.urlRefs(type, asset)) if (!S.isLocal(r[0][r[1]])) refs.push(r);
  const uniq = [...new Set(refs.map(([o, k]) => absUrl(o[k])))];
  const sys = SYSTEM_URLS.filter((u) => !lib().urlMap[u] || !fs.existsSync(S.abs(lib().urlMap[u])));
  const all = [...new Set([...uniq, ...sys])];
  let done = 0;
  let failed = 0;
  const failedUrls = [];
  progress({ phase: 'files', done, total: all.length, failed });
  const result = new Map();
  await runPool(interleaveHosts(all), DL_POOL, async (url) => {
    try { result.set(url, await downloadUrl(url)); }
    catch (e) { if (!e.cancelled) { failed++; failedUrls.push(url); } }
    done++;
    if (done % 5 === 0 || done === all.length) progress({ phase: 'files', done, total: all.length, failed });
  });
  // системные ссылки остаются адресами сайта, остальные — на скачанные файлы
  for (const [o, k] of refs) {
    if (isSystem(o[k])) continue;
    const local = result.get(absUrl(o[k]));
    if (local) o[k] = local;
  }
  progress({ phase: 'files', label: tx('Раскладка по папкам…'), done, total: all.length, failed });
  for (const { type, asset } of entries) await S.organizeAsset(type, asset);
  S.saveNow();
  return { total: all.length, failed, failedUrls: failedUrls.slice(0, 50), cancelled: cancelRequested, done };
}

async function apiGet(p) { return (await fetchWithRetry(SITE + '/api' + p, { timeout: 60000 })).json(); }
async function apiPost(p, body) {
  const res = await fetchWithRetry(SITE + '/api' + p, { method: 'POST', timeout: 60000, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

async function downloadPresets(progress) {
  progress({ phase: 'meta', label: tx('Получение списка стандартных ресурсов…') });
  const [chars, bgs, music, sounds] = await Promise.all([
    apiGet('/assets/character/getPreset'), apiGet('/assets/background/getPreset'),
    apiGet('/assets/music/getPreset'), apiGet('/assets/sound/getPreset'),
  ]);
  const entries = [];
  upsertAssets('characters', chars, { isPreset: true }).forEach((a) => entries.push({ type: 'characters', asset: a }));
  upsertAssets('backgrounds', bgs, { isPreset: true }).forEach((a) => entries.push({ type: 'backgrounds', asset: a }));
  upsertAssets('music', music, { isPreset: true }).forEach((a) => entries.push({ type: 'music', asset: a }));
  upsertAssets('sounds', sounds, { isPreset: true }).forEach((a) => entries.push({ type: 'sounds', asset: a }));
  S.saveNow();
  return downloadAssetFiles(entries, progress);
}

function collectProjectIds(project) {
  const chars = new Set(); const bgs = new Set(); const music = new Set(); const sounds = new Set(); const boxes = new Set();
  const evidence = new Set(); const popups = new Set();
  const isBoxId = (v) => v && !/^[0-4]$/.test(String(v));
  if (isBoxId(project.options && project.options.chatbox)) boxes.add(String(project.options.chatbox));
  for (const g of project.groups || []) {
    for (const f of g.frames || []) {
      if (f.characterId) chars.add(f.characterId);
      if (f.backgroundId) bgs.add(f.backgroundId);
      for (const a of f.actions || []) if (a.actionId === 12 && isBoxId(a.actionParam)) boxes.add(String(a.actionParam));
      const text = f.text || '';
      for (const m of text.matchAll(/\[#bgm(\d+)\]/gi)) music.add(+m[1]);
      for (const m of text.matchAll(/\[#bgs(\d+)\]/gi)) sounds.add(+m[1]);
      for (const m of text.matchAll(/\[#evdi?(\d+)\]/gi)) evidence.add(+m[1]);
      if (f.popupId) popups.add(f.popupId);
    }
  }
  for (const p of project.pairs || []) for (const c of p.pairs || []) if (c.characterId) chars.add(c.characterId);
  return { chars, bgs, music, sounds, boxes, evidence, popups };
}

async function downloadForProject(project, progress, folder) {
  const L = lib();
  const ids = collectProjectIds(project);
  const have = (type, id) => L[type].some((a) => a.id === id) || !!(L.aliases && L.aliases[type] && L.aliases[type][id]);
  const missing = (type, set) => [...set].filter((id) => !have(type, id));
  progress({ phase: 'meta', label: tx('Поиск ресурсов проекта на objection.lol…') });
  const entries = [];
  const errors = [];
  const mChars = missing('characters', ids.chars);
  if (mChars.length) {
    try {
      const list = await apiPost('/assets/character/getAll', { ids: mChars });
      upsertAssets('characters', list).forEach((a) => entries.push({ type: 'characters', asset: a }));
      for (const c of list) if (c.backgroundId) ids.bgs.add(c.backgroundId);
    } catch (e) { errors.push(tx('персонажи: ') + e.message); }
  }
  for (const c of L.characters) if (ids.chars.has(c.id) && c.backgroundId) ids.bgs.add(c.backgroundId);
  const mBgs = missing('backgrounds', ids.bgs);
  if (mBgs.length) {
    try {
      const list = await apiPost('/assets/background/getAll', { ids: mBgs });
      upsertAssets('backgrounds', list).forEach((a) => entries.push({ type: 'backgrounds', asset: a }));
    } catch (e) { errors.push(tx('фоны: ') + e.message); }
  }
  const mPop = missing('popups', ids.popups);
  if (mPop.length) {
    try {
      const list = await apiPost('/assets/popup/getAll', { ids: mPop });
      upsertAssets('popups', list).forEach((a) => entries.push({ type: 'popups', asset: a }));
    } catch (e) { errors.push(tx('картинки: ') + e.message); }
  }
  for (const [type, api, set] of [['music', 'music', ids.music], ['sounds', 'sound', ids.sounds], ['textboxes', 'dialogue-box', ids.boxes], ['evidence', 'evidence', ids.evidence]]) {
    if (cancelRequested) break;
    const miss = missing(type, set);
    const got = [];
    await runPool(miss, 12, async (id) => {
      try { got.push(await apiGet(`/assets/${api}/${encodeURIComponent(id)}`)); } catch (e) { errors.push(`${api} ${id}: ${e.message}`); }
    });
    upsertAssets(type, got).forEach((a) => entries.push({ type, asset: a }));
  }
  // докачать файлы и у тех, что уже в библиотеке, но не скачаны
  const sets = { characters: ids.chars, backgrounds: ids.bgs, music: ids.music, sounds: ids.sounds, textboxes: ids.boxes, evidence: ids.evidence, popups: ids.popups };
  for (const type of S.TYPES) {
    for (const a of L[type]) {
      if (sets[type].has(a.id) && !entries.some((e) => e.asset === a) && S.urlRefs(type, a).some(([o, k]) => !S.isLocal(o[k]) && !isSystem(o[k]))) entries.push({ type, asset: a });
    }
  }
  if (folder) for (const { asset } of entries) if (!asset.folder && !asset.isPreset) asset.folder = folder;
  S.saveNow();
  const r = await downloadAssetFiles(entries, progress);
  return { ...r, errors, assets: entries.length };
}

// ---------- Дубликаты ----------
const hashCache = new Map();
async function contentKey(ref) {
  if (!ref) return '';
  const rel = S.isLocal(ref) ? ref : lib().urlMap[absUrl(ref)];
  if (!rel) return 'url:' + absUrl(ref);
  const st = await fsp.stat(S.abs(rel)).catch(() => null);
  if (!st) return 'missing:' + rel;
  const ck = rel + '|' + st.size + '|' + st.mtimeMs;
  if (hashCache.has(ck)) return hashCache.get(ck);
  const key = crypto.createHash('sha1').update(await fsp.readFile(S.abs(rel))).digest('hex');
  hashCache.set(ck, key);
  return key;
}
async function poseKey(p) { return (await contentKey(p.idleImageUrl)) + '|' + (await contentKey(p.speakImageUrl)); }
async function signature(type, a) {
  if (type === 'characters') {
    const keys = [];
    for (const p of a.poses || []) keys.push(await poseKey(p));
    return keys.length ? keys.sort().join(',') : null;
  }
  if (type === 'backgrounds') return a.url ? (await contentKey(a.url)) + '|' + (await contentKey(a.deskUrl)) : null;
  if (type === 'textboxes') return a.url ? (await contentKey(a.url)) + '|' + (await contentKey(a.nameplate && a.nameplate.url)) : null;
  return a.url ? contentKey(a.url) : null;
}
async function findDuplicateGroups(type) {
  const bySig = new Map();
  for (const a of lib()[type]) {
    const sig = await signature(type, a);
    // ресурсы без скачанных файлов сравнивать нельзя — пропускаем
    if (!sig || /(^|\|)(missing|url):/.test(sig)) continue;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(a);
  }
  const groups = [];
  for (const g of bySig.values()) {
    if (g.length < 2) continue;
    const same = [g[0].id];
    for (const a of g.slice(1)) if (await sameBytes(mainRef(type, g[0]), mainRef(type, a))) same.push(a.id);
    if (same.length > 1) groups.push(same);
  }
  return groups;
}
// Локальный путь к файлу ссылки (или null, если файла нет на диске)
function localFile(ref) {
  if (!ref) return null;
  const rel = S.isLocal(ref) ? ref : lib().urlMap[absUrl(ref)];
  if (!rel) return null;
  const f = S.abs(rel);
  return fs.existsSync(f) ? { rel, file: f } : null;
}
// Совпадают ли файлы побайтно (проверка поверх хеша, чтобы исключить ложные «дубликаты»)
async function sameBytes(r1, r2) {
  const a = localFile(r1); const b = localFile(r2);
  if (!a || !b) return false;
  if (a.file === b.file) return true;
  const [s1, s2] = await Promise.all([fsp.stat(a.file), fsp.stat(b.file)]);
  if (s1.size !== s2.size) return false;
  const [x, y] = await Promise.all([fsp.readFile(a.file), fsp.readFile(b.file)]);
  return x.equals(y);
}
const mainRef = (type, a) => (type === 'characters' ? a.poses && a.poses[0] && a.poses[0].idleImageUrl : a.url);
async function findDuplicatesOf(type, asset) {
  // дубликатом считаем только ресурс с настоящим файлом на диске, совпадающим байт в байт
  if (!localFile(mainRef(type, asset))) return [];
  const sig = await signature(type, asset);
  if (!sig || /(^|\|)(missing|url):/.test(sig)) return [];
  const out = [];
  for (const a of lib()[type]) {
    if (a.id === asset.id) continue;
    if ((await signature(type, a)) !== sig) continue;
    if (!(await sameBytes(mainRef(type, asset), mainRef(type, a)))) continue;
    const lf = localFile(mainRef(type, a));
    out.push({ id: a.id, name: a.name, file: lf ? lf.rel : '' });
  }
  return out;
}
async function mergeAssets(type, keepId, removeIds) {
  const L = lib();
  const keep = L[type].find((a) => a.id === keepId);
  if (!keep) throw new Error(tx('нет ресурса'));
  const al = (k) => (L.aliases[k] = L.aliases[k] || {});
  const removed = [];
  for (const id of removeIds) {
    if (id === keepId) continue;
    const old = L[type].find((a) => a.id === id);
    if (!old) continue;
    al(type)[id] = keepId;
    if (type === 'characters') {
      const keepKeys = [];
      for (const p of keep.poses) keepKeys.push(await poseKey(p));
      for (let i = 0; i < (old.poses || []).length; i++) {
        const p = old.poses[i];
        let j = keepKeys.indexOf(await poseKey(p));
        if (j < 0) j = keep.poses.findIndex((q) => q.name === p.name);
        if (j < 0) j = Math.min(i, keep.poses.length - 1);
        if (j >= 0) al('poses')[p.id] = keep.poses[j].id;
      }
      (old.speechBubbles || []).forEach((b, i) => {
        const kb = (keep.speechBubbles || []).find((x) => x.name === b.name) || (keep.speechBubbles || [])[i];
        if (kb) al('bubbles')[b.id] = kb.id;
      });
    }
    for (const [k, v] of Object.entries(al(type))) if (v === id) al(type)[k] = keepId;
    removed.push(old);
  }
  const rm = new Set(removed.map((a) => a.id));
  L[type] = L[type].filter((a) => !rm.has(a.id));
  for (const a of removed) await S.removeAssetFiles(type, a);
  S.saveNow();
  return true;
}

// ---------- Пакеты ресурсов (.oopack) ----------
async function exportAssetPack(type, id) {
  const asset = lib()[type].find((a) => a.id === id);
  if (!asset) return null;
  const files = {};
  for (const [o, k] of S.urlRefs(type, asset)) {
    const v = o[k];
    if (S.isLocal(v) && !files[v]) { try { files[v] = (await fsp.readFile(S.abs(v))).toString('base64'); } catch (e) { /* skip */ } }
  }
  const r = await dialog.showSaveDialog(win, {
    title: tx('Экспорт ресурса'),
    defaultPath: path.join(app.getPath('documents'), S.safeName(asset.name || 'asset') + '.oopack'),
    filters: [{ name: tx('Пакет ресурса'), extensions: ['oopack'] }],
  });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, JSON.stringify({ format: 'oopack', version: 2, type, asset, files }));
  return r.filePath;
}

async function importAssetPack(folder) {
  const r = await dialog.showOpenDialog(win, {
    title: tx('Импорт ресурса'), filters: [{ name: tx('Пакет ресурса'), extensions: ['oopack'] }], properties: ['openFile', 'multiSelections'],
  });
  if (r.canceled) return [];
  const added = [];
  const L = lib();
  for (const p of r.filePaths) {
    try {
      const pack = JSON.parse(await fsp.readFile(p, 'utf8'));
      if (pack.format !== 'oopack' || !L[pack.type]) continue;
      const map = new Map();
      for (const [rel, b64] of Object.entries(pack.files || {})) map.set(rel, await S.stageBuffer(Buffer.from(b64, 'base64'), rel));
      const asset = pack.asset;
      for (const [o, k] of S.urlRefs(pack.type, asset)) if (map.has(o[k])) o[k] = map.get(o[k]);
      if (L[pack.type].some((a) => a.id === asset.id)) asset.id = L.nextId++;
      asset.source = 'custom';
      delete asset.isPreset;
      if (folder) asset.folder = folder;
      asset.added = Date.now();
      L[pack.type].push(asset);
      await S.organizeAsset(pack.type, asset);
      added.push({ type: pack.type, asset });
    } catch (e) { /* пропускаем битые */ }
  }
  S.saveNow();
  return added;
}


// ---------- Вход на objection.lol (для ресурсов по коду доступа и своих ресурсов) ----------
// Пользователь сам входит на сайт в отдельном окне. Программа только берёт ключ входа (token) из этого окна
// и хранит его зашифрованным средствами системы. Пароль программа не видит.
const AUTH_PARTITION = 'persist:objection';
const authFile = () => path.join(app.getPath('userData'), 'auth.bin');
function loadToken() {
  try {
    const buf = fs.readFileSync(authFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch (e) { return null; }
}
function saveToken(t) {
  try {
    if (!t) { fs.rmSync(authFile(), { force: true }); return; }
    fs.writeFileSync(authFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t, 'utf8'));
  } catch (e) { console.error('saveToken', e); }
}
function tokenUser(t) {
  try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')); return p.username || p.name || p.sub || null; } catch (e) { return null; }
}
function authLogin() {
  if (process.platform === 'android') return Promise.resolve({ ok: false, error: tx('Вход на objection.lol в версии для Android пока не сделан — ресурсы по коду доступа и ресурсы аккаунта скачиваются в версии для ПК') });
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      width: 1100, height: 800, parent: win, title: tx('Вход на objection.lol'),
      webPreferences: { partition: AUTH_PARTITION, contextIsolation: true, sandbox: true },
    });
    w.setMenuBarVisibility(false);
    let done = false;
    const finish = (r) => { if (done) return; done = true; clearInterval(timer); if (!w.isDestroyed()) w.close(); resolve(r); };
    const timer = setInterval(async () => {
      if (w.isDestroyed()) return;
      try {
        const t = await w.webContents.executeJavaScript("localStorage.getItem('token')", true);
        if (t && t.split('.').length === 3) { saveToken(t); finish({ ok: true, user: tokenUser(t) }); }
      } catch (e) { /* страница ещё грузится */ }
    }, 1000);
    w.on('closed', () => finish({ ok: false }));
    // Обычный Chrome вместо «Electron» в user agent — иначе вход через Google может не пустить
    const ua = w.webContents.getUserAgent().replace(/\s*(Electron|Objection[\s-]?Offline|objection-offline)\/\S+/gi, '');
    w.webContents.setUserAgent(ua);
    // окна входа через Discord / Google открываются из сайта — пусть открываются в той же сессии
    w.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { parent: w, width: 600, height: 760, autoHideMenuBar: true, webPreferences: { partition: AUTH_PARTITION } } }));
    w.webContents.on('did-create-window', (child) => child.webContents.setUserAgent(ua));
    // На сайте нет отдельной страницы входа: вход — окно на главной. Открываем главную,
    // показываем подсказку и пробуем сами нажать кнопку входа.
    w.webContents.on('did-finish-load', () => {
      w.webContents.executeJavaScript(tx`(() => {
        if (localStorage.getItem('token') || document.getElementById('oo-hint')) return;
        const d = document.createElement('div');
        d.id = 'oo-hint';
        d.textContent = 'Objection Offline: вход в аккаунт — кнопка Login / Войти вверху справа. После входа это окно закроется само.';
        d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#1a7f72;color:#fff;font:15px sans-serif;padding:10px 14px;text-align:center;cursor:pointer';
        d.onclick = () => d.remove();
        document.body.appendChild(d);
        const tryClick = (n) => {
          const b = [...document.querySelectorAll('button, a')].find((x) => /^(log ?in|sign ?in|войти|вход)$/i.test((x.textContent || '').trim()));
          if (b) b.click(); else if (n > 0) setTimeout(() => tryClick(n - 1), 700);
        };
        setTimeout(() => tryClick(8), 1200);
      })()`, true).catch(() => {});
    });
    w.loadURL(SITE + '/');
  });
}
// запрос в сессии окна входа (с его cookie); в старом Electron (сборка для macOS 10.13) — обычный fetch
function sesFetch(ses, url, opts) { return typeof ses.fetch === 'function' ? ses.fetch(url, opts) : fetch(url, opts); }
async function authFetch(p, opts = {}, retry = true) {
  const t = loadToken();
  if (!t) throw Object.assign(new Error(tx('Нужно войти на objection.lol')), { auth: true });
  const ses = session.fromPartition(AUTH_PARTITION);
  const res = await sesFetch(ses, SITE + '/api' + p, { ...opts, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
  if (res.status === 401 && retry) {
    const r = await sesFetch(ses, SITE + '/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t }) });
    if (r.ok) { const j = await r.json().catch(() => null); if (j && j.token) { saveToken(j.token); return authFetch(p, opts, false); } }
    saveToken(null);
    throw Object.assign(new Error(tx('Вход устарел, нужно снова войти на objection.lol')), { auth: true });
  }
  if (res.status === 404) throw new Error(tx('Не найдено (возможно, неверный код)'));
  if (!res.ok) throw new Error(tx('Сайт ответил: ') + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200));
  return res.json();
}
// Ресурс по коду доступа (как «Use share code» на сайте)
async function downloadByCode(kind, code, progress, folder) {
  code = String(code || '').trim();
  if (!code) throw new Error(tx('Пустой код'));
  progress({ phase: 'meta', label: tx('Запрос к objection.lol…') });
  const api = kind === 'textboxes' ? 'dialogue-box' : 'character';
  let r = await authFetch(`/assets/${api}/code/${encodeURIComponent(code)}`, { method: 'POST' });
  if (Array.isArray(r)) r = r[0];
  if (r && r.character) r = r.character;
  if (r && r.dialogueBox) r = r.dialogueBox;
  if (!r || r.id == null) throw new Error(tx('Сайт не вернул ресурс'));
  if (kind === 'characters' && !r.poses) {
    const list = await apiPost('/assets/character/getAll', { ids: [r.id] });
    r = list[0];
    if (!r) throw new Error(tx('Персонаж не найден'));
  }
  const entries = upsertAssets(kind, [r]).map((a) => ({ type: kind, asset: a }));
  if (folder) for (const { asset } of entries) if (!asset.folder) asset.folder = folder;
  if (kind === 'characters' && r.backgroundId && !lib().backgrounds.some((b) => b.id === r.backgroundId)) {
    try { upsertAssets('backgrounds', await apiPost('/assets/background/getAll', { ids: [r.backgroundId] })).forEach((a) => { if (folder) a.folder = folder; entries.push({ type: 'backgrounds', asset: a }); }); } catch (e) { /* без фона */ }
  }
  S.saveNow();
  const res = await downloadAssetFiles(entries, progress);
  return { ...res, name: r.name, id: r.id };
}
// Все свои ресурсы с сайта
async function downloadMine(progress, folder) {
  progress({ phase: 'meta', label: tx('Получение списка ресурсов аккаунта…') });
  const kinds = [['characters', 'character'], ['backgrounds', 'background'], ['music', 'music'], ['sounds', 'sound'], ['textboxes', 'dialogue-box'], ['evidence', 'evidence'], ['popups', 'popup']];
  const entries = [];
  const errors = [];
  const counts = {};
  for (const [type, api] of kinds) {
    try {
      let list = await authFetch(`/assets/${api}/getMine`);
      if (list && !Array.isArray(list)) list = list.items || list.data || [];
      counts[type] = list.length;
      upsertAssets(type, list).forEach((a) => { if (folder && !a.folder) a.folder = folder; entries.push({ type, asset: a }); });
    } catch (e) { if (e.auth) throw e; errors.push(api + ': ' + e.message); }
  }
  S.saveNow();
  const res = await downloadAssetFiles(entries, progress);
  return { ...res, errors, counts, assets: entries.length };
}


// ---------- «Мои сцены»: все проекты в сжатом виде рядом с библиотекой ----------
// Library/Scenes/index.json — список, Library/Scenes/<id>.json.gz — сами проекты
const scenesDir = () => path.join(LIB_DIR, 'Scenes');
const sceneFile = (id) => path.join(scenesDir(), String(id).replace(/[^\w-]/g, '') + '.json.gz');
function readScenesIndex() {
  try { return JSON.parse(fs.readFileSync(path.join(scenesDir(), 'index.json'), 'utf8')); } catch (e) { return []; }
}
function writeScenesIndex(list) {
  fs.mkdirSync(scenesDir(), { recursive: true });
  const f = path.join(scenesDir(), 'index.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(list));
  fs.renameSync(f + '.tmp', f);
}
async function saveScene(meta, projectText) {
  if (!meta || !meta.id) throw new Error(tx('нет id сцены'));
  await fsp.mkdir(scenesDir(), { recursive: true });
  const gz = zlib.gzipSync(Buffer.from(projectText, 'utf8'), { level: 6 });
  const f = sceneFile(meta.id);
  await fsp.writeFile(f + '.tmp', gz);
  await fsp.rename(f + '.tmp', f);
  const list = readScenesIndex();
  const i = list.findIndex((x) => x.id === meta.id);
  const now = Date.now();
  const entry = { ...(i >= 0 ? list[i] : { created: now, archived: false }), ...meta, updated: now, size: gz.length };
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  writeScenesIndex(list);
  return entry;
}

// ---------- IPC ----------
function sendProgress(p) { if (win && !win.isDestroyed()) win.webContents.send('progress', p); }

function registerIpc() {
  ipcMain.handle('lib:get', () => lib());
  ipcMain.handle('lib:info', () => ({ dir: LIB_DIR, defaultDir: defaultLibraryDir() }));
  ipcMain.handle('lib:openFolder', (e, sub) => shell.openPath(sub ? path.join(LIB_DIR, ...String(sub).split('/')) : LIB_DIR));
  ipcMain.handle('lib:upsert', async (e, type, asset) => {
    const L = lib();
    if (!L[type]) throw new Error('bad type');
    if (!asset.id) asset.id = L.nextId++;
    const i = L[type].findIndex((a) => a.id === asset.id);
    const old = i >= 0 ? L[type][i] : null;
    const prev = old ? JSON.parse(JSON.stringify(old)) : null;
    if (!asset.added) asset.added = (old && old.added) || Date.now();
    if (i >= 0) L[type][i] = asset; else L[type].push(asset);
    await S.organizeAsset(type, asset);
    // файлы, которые больше не нужны (например, заменённые картинки) — в корзину, чтобы Ctrl+Z мог их вернуть
    const trash = [];
    if (old) await S.removeAssetFiles(type, old, new Set(S.urlRefs(type, asset).map(([o, k]) => String(o[k]).toLowerCase())), trash);
    pushUndo({ kind: 'upsert', type, id: asset.id, prev, trash, label: (prev ? tx('изменение «') : tx('добавление «')) + (asset.name || asset.id) + '»' });
    S.saveNow();
    return asset;
  });
  ipcMain.handle('lib:remove', async (e, type, id) => {
    const L = lib();
    const idx = L[type].findIndex((x) => x.id === id);
    const a = L[type][idx];
    L[type] = L[type].filter((x) => x.id !== id);
    const trash = [];
    if (a) {
      await S.removeAssetFiles(type, a, new Set(), trash);
      pushUndo({ kind: 'remove', type, items: [{ asset: JSON.parse(JSON.stringify(a)), index: idx }], trash, label: tx('удаление «') + (a.name || a.id) + '»' });
    }
    S.saveNow();
    return true;
  });
  // удалить несколько ресурсов сразу (например, всю папку)
  ipcMain.handle('lib:removeMany', async (e, type, ids) => {
    const L = lib();
    const set = new Set(ids);
    const items = L[type].map((x, index) => ({ asset: x, index })).filter((x) => set.has(x.asset.id) && !x.asset.isPreset);
    const gone = items.map((x) => x.asset);
    L[type] = L[type].filter((x) => !gone.includes(x));
    const trash = [];
    for (const a of gone) await S.removeAssetFiles(type, a, new Set(), trash);
    if (gone.length) pushUndo({ kind: 'remove', type, items: JSON.parse(JSON.stringify(items)), trash, label: tx('удаление (') + gone.length + ')' });
    S.saveNow();
    return gone.length;
  });
  // Ctrl+Z в библиотеке: отмена удаления, переноса в папку, изменения ресурса, правки списка папок
  ipcMain.handle('lib:undo', async () => {
    const op = undoStack.pop();
    if (!op) return null;
    const L = lib();
    if (op.kind === 'remove') {
      await S.restoreTrash(op.trash);
      for (const it of [...op.items].sort((a, b) => a.index - b.index)) {
        if (L[op.type].some((x) => x.id === it.asset.id)) continue;
        L[op.type].splice(Math.min(it.index, L[op.type].length), 0, it.asset);
      }
    } else if (op.kind === 'folder') {
      for (const p of op.prev) {
        const a = L[op.type].find((x) => x.id === p.id);
        if (!a) continue;
        if (p.folder) a.folder = p.folder; else delete a.folder;
        await S.organizeAsset(op.type, a);
      }
    } else if (op.kind === 'upsert') {
      const i = L[op.type].findIndex((x) => x.id === op.id);
      const cur = i >= 0 ? L[op.type][i] : null;
      await S.restoreTrash(op.trash);
      if (!op.prev) {
        if (cur) { L[op.type].splice(i, 1); await S.removeAssetFiles(op.type, cur); }
      } else {
        if (i >= 0) L[op.type][i] = op.prev; else L[op.type].push(op.prev);
        await S.organizeAsset(op.type, op.prev);
        if (cur) await S.removeAssetFiles(op.type, cur, new Set(S.urlRefs(op.type, op.prev).map(([o, k]) => String(o[k]).toLowerCase())));
      }
    } else if (op.kind === 'folders') {
      L.folders = L.folders || {};
      L.folders[op.type] = op.prev;
    }
    S.saveNow();
    return { label: op.label, type: op.type, left: undoStack.length };
  });
  ipcMain.handle('lib:checkFiles', () => S.checkFiles());
  // пресеты пар и замен имён (общие для всех проектов)
  ipcMain.handle('lib:setPresets', (e, kind, list) => {
    const L = lib();
    L.presets = L.presets || {};
    L.presets[kind] = Array.isArray(list) ? list : [];
    S.saveSoon();
    return true;
  });
  ipcMain.handle('scenes:list', () => readScenesIndex());
  ipcMain.handle('scenes:get', async (e, id) => zlib.gunzipSync(await fsp.readFile(sceneFile(id))).toString('utf8'));
  ipcMain.handle('scenes:save', (e, meta, text) => saveScene(meta, text));
  ipcMain.handle('scenes:update', (e, id, patch) => {
    const list = readScenesIndex();
    const it = list.find((x) => x.id === id);
    if (!it) return null;
    Object.assign(it, patch);
    writeScenesIndex(list);
    return it;
  });
  ipcMain.handle('scenes:delete', async (e, id) => {
    writeScenesIndex(readScenesIndex().filter((x) => x.id !== id));
    await fsp.unlink(sceneFile(id)).catch(() => {});
    return true;
  });
  ipcMain.handle('lib:startupCheck', () => { const r = startupCheck; startupCheck = null; return r; });
  ipcMain.handle('auth:status', () => { const t = loadToken(); return { loggedIn: !!t, user: t ? tokenUser(t) : null }; });
  ipcMain.handle('auth:login', () => authLogin());
  ipcMain.handle('auth:logout', async () => { saveToken(null); try { await session.fromPartition(AUTH_PARTITION).clearStorageData(); } catch (e) { /* */ } return true; });
  ipcMain.handle('dl:byCode', async (e, kind, code, folder) => { cancelRequested = false; return downloadByCode(kind, code, sendProgress, folder); });
  ipcMain.handle('dl:mine', async (e, folder) => { cancelRequested = false; return downloadMine(sendProgress, folder); });
  ipcMain.handle('lib:setFolder', async (e, type, ids, folder) => {
    const set = new Set(ids);
    const prev = lib()[type].filter((a) => set.has(a.id) && !a.isPreset).map((a) => ({ id: a.id, folder: a.folder || null }));
    if (prev.length) pushUndo({ kind: 'folder', type, prev, label: tx('перенос в папку (') + prev.length + ')' });
    for (const a of lib()[type]) {
      if (!set.has(a.id) || a.isPreset) continue;
      if (folder) a.folder = folder; else delete a.folder;
      await S.organizeAsset(type, a);
    }
    S.saveNow();
    return true;
  });
  // Избранное и метки: { [id]: { fav?: true, tags?: [..] } } — отдельно от самих ресурсов,
  // чтобы работало и для стандартных ресурсов сайта и не трогало файлы
  ipcMain.handle('lib:setMarks', (e, type, id, mark) => {
    const all = (lib().marks = lib().marks || {});
    const m = (all[type] = all[type] || {});
    const clean = {};
    if (mark && mark.fav) clean.fav = true;
    if (mark && mark.zoom43) clean.zoom43 = true;
    if (mark && Array.isArray(mark.off) && mark.off.length) clean.off = [...new Set(mark.off.map(String))];
    if (mark && Array.isArray(mark.tags)) { const t = [...new Set(mark.tags.map((x) => String(x).trim()).filter(Boolean))]; if (t.length) clean.tags = t; }
    if (Object.keys(clean).length) m[id] = clean; else delete m[id];
    S.saveSoon();
    return true;
  });
  // Размер файлов ресурсов на диске (для сортировки по размеру)
  ipcMain.handle('lib:sizes', async (e, type) => {
    const out = {};
    for (const a of lib()[type] || []) {
      let n = 0;
      const seen = new Set();
      for (const [o, k] of S.urlRefs(type, a)) {
        const lf = localFile(o[k]);
        if (!lf || seen.has(lf.file)) continue;
        seen.add(lf.file);
        try { n += (await fsp.stat(lf.file)).size; } catch (err) { /* нет файла */ }
      }
      out[a.id] = n;
    }
    return out;
  });
  ipcMain.handle('lib:setFolders', (e, type, list) => {
    pushUndo({ kind: 'folders', type, prev: [...((lib().folders || {})[type] || [])], label: tx('изменение папок') });
    lib().folders[type] = [...new Set(list.filter(Boolean))];
    S.saveSoon();
    return true;
  });
  ipcMain.handle('lib:duplicates', (e, type) => findDuplicateGroups(type));
  ipcMain.handle('lib:findDuplicates', (e, type, asset) => findDuplicatesOf(type, asset));
  ipcMain.handle('lib:merge', (e, type, keepId, removeIds) => mergeAssets(type, keepId, removeIds));
  ipcMain.handle('lib:newId', () => { const id = lib().nextId++; S.saveSoon(); return id; });
  ipcMain.handle('lib:importPath', async (e, p) => S.stageBuffer(await fsp.readFile(p), p, 'user'));
  ipcMain.handle('lib:importBuffer', (e, buf, name) => S.stageBuffer(Buffer.from(buf), name, 'user'));
  ipcMain.handle('lib:hasThumb', (e, key, rel) => {
    if (!/^[\w-]+$/.test(key)) return false;
    try {
      const t = fs.statSync(path.join(LIB_DIR, '.cache', 'thumbs', key + '.webp'));
      if (rel) {
        const src = safeJoin(LIB_DIR, rel);
        // файл заменили после того, как сделали миниатюру — её надо сделать заново
        if (src && fs.existsSync(src) && fs.statSync(src).mtimeMs > t.mtimeMs) return false;
      }
      return String(Math.round(t.mtimeMs));
    } catch (err) { return false; }
  });
  ipcMain.handle('lib:saveThumb', async (e, key, buf) => {
    if (!/^[\w-]+$/.test(key)) return null;
    const dir = path.join(LIB_DIR, '.cache', 'thumbs');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, key + '.webp'), Buffer.from(buf));
    return '.cache/thumbs/' + key + '.webp';
  });
  ipcMain.handle('lib:importZip', async (e, folder) => {
    const r = await dialog.showOpenDialog(win, {
      title: tx('Персонажи из ZIP-архива'), filters: [{ name: tx('ZIP-архив'), extensions: ['zip'] }], properties: ['openFile', 'multiSelections'],
    });
    if (r.canceled || !r.filePaths.length) return null;
    const added = [];
    const errors = [];
    const L = lib();
    const ctx = { newId: () => L.nextId++, saveBuffer: async (buf, name) => S.stageBuffer(buf, name, 'dl') };
    for (const p of r.filePaths) {
      try {
        const list = await importCharactersFromZip(p, await fsp.readFile(p), ctx);
        for (const ch of list) {
          if (folder) ch.folder = folder;
          L.characters.push(ch);
          await S.organizeAsset('characters', ch);
          added.push({ id: ch.id, name: ch.name, poses: ch.poses.length });
        }
      } catch (err) { errors.push(path.basename(p) + ': ' + err.message); }
    }
    S.saveNow();
    return { added, errors };
  });
  ipcMain.handle('lib:exportAsset', async (e, type, id) => exportAssetPack(type, id));
  ipcMain.handle('lib:importPack', async (e, folder) => importAssetPack(folder));
  ipcMain.handle('lib:assetPath', (e, type, id) => {
    const a = lib()[type].find((x) => x.id === id);
    if (!a) return null;
    const ref = S.urlRefs(type, a).map(([o, k]) => o[k]).find(S.isLocal);
    return ref ? path.dirname(S.abs(ref)) : null;
  });
  ipcMain.handle('lib:showAsset', (e, type, id) => {
    const a = lib()[type].find((x) => x.id === id);
    const ref = a && S.urlRefs(type, a).map(([o, k]) => o[k]).find(S.isLocal);
    if (ref) shell.showItemInFolder(S.abs(ref)); else shell.openPath(LIB_DIR);
  });

  // ---- папка библиотеки и перенос из старых версий ----
  ipcMain.handle('lib:legacyCandidates', () => {
    const cfg = readConfig();
    const asked = new Set(cfg.legacyDismissed || []);
    return S.findLegacyLibraries(EXE_DIR).filter((x) => !asked.has(x.dir));
  });
  ipcMain.handle('lib:dismissLegacy', (e, dir) => {
    const cfg = readConfig();
    cfg.legacyDismissed = [...new Set([...(cfg.legacyDismissed || []), dir])];
    writeConfig(cfg);
    return true;
  });
  ipcMain.handle('lib:pickLegacy', async () => {
    const r = await dialog.showOpenDialog(win, { title: tx('Папка старой библиотеки (Library) или старой версии программы'), properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const d = r.filePaths[0];
    for (const c of [d, path.join(d, 'Library'), path.join(d, 'ObjectionOffline', 'Library')]) if (fs.existsSync(path.join(c, 'library.json'))) return c;
    return { error: tx('В этой папке нет библиотеки (файла library.json)') };
  });
  ipcMain.handle('lib:importLegacy', async (e, dir) => {
    cancelRequested = false;
    try { return await S.importLegacy(dir, SYSTEM_URLS, sendProgress); } finally { sendProgress({ phase: 'done' }); }
  });
  ipcMain.handle('lib:changeDir', async () => {
    const r = await dialog.showOpenDialog(win, { title: tx('Новая папка для библиотеки'), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    let target = r.filePaths[0];
    if (path.resolve(target) === path.resolve(LIB_DIR)) return null;
    const hasLib = fs.existsSync(path.join(target, 'library.json'));
    if (!hasLib) {
      // переносим текущую библиотеку в выбранную папку
      if (fs.readdirSync(target).length) target = path.join(target, 'Library');
      if (!canWrite(target)) return { error: tx('В эту папку нельзя записывать') };
      S.saveNow();
      for (const name of fs.readdirSync(LIB_DIR)) await S.moveFile(path.join(LIB_DIR, name), path.join(target, name)).catch(async () => {
        await fsp.cp(path.join(LIB_DIR, name), path.join(target, name), { recursive: true });
        await fsp.rm(path.join(LIB_DIR, name), { recursive: true, force: true });
      });
    }
    const cfg = readConfig();
    cfg.libraryDir = target;
    writeConfig(cfg);
    app.relaunch();
    app.exit(0);
    return { dir: target };
  });

  ipcMain.handle('dl:presets', async () => {
    cancelRequested = false;
    try { return await downloadPresets(sendProgress); } finally { sendProgress({ phase: 'done' }); }
  });
  ipcMain.handle('dl:project', async (e, project, folder) => {
    cancelRequested = false;
    try { return await downloadForProject(project, sendProgress, folder); } finally { sendProgress({ phase: 'done' }); }
  });
  ipcMain.handle('dl:system', async () => {
    const miss = SYSTEM_URLS.filter((u) => !lib().urlMap[u] || !fs.existsSync(S.abs(lib().urlMap[u])));
    let ok = 0;
    await runPool(miss, 16, async (u) => { try { await downloadUrl(u); ok++; } catch (e) { /* нет сети */ } });
    S.saveNow();
    return { missing: miss.length, ok };
  });
  ipcMain.handle('dl:cancel', () => { cancelDownloads(); return true; });

  ipcMain.handle('project:open', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: tx('Открыть проект'),
      filters: [{ name: tx('Проект objection'), extensions: ['objection', 'json', 'txt'] }, { name: tx('Все файлы'), extensions: ['*'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    return { path: p, name: path.basename(p), text: await fsp.readFile(p, 'utf8') };
  });
  ipcMain.handle('project:readPath', async (e, p) => ({ path: p, name: path.basename(p), text: await fsp.readFile(p, 'utf8') }));
  ipcMain.handle('project:save', async (e, { path: p, text, suggestedName }) => {
    let target = p;
    if (!target) {
      const r = await dialog.showSaveDialog(win, {
        title: tx('Сохранить проект'),
        defaultPath: path.join(app.getPath('documents'), (suggestedName || 'project') + '.objection'),
        filters: [{ name: tx('Проект objection'), extensions: ['objection'] }],
      });
      if (r.canceled || !r.filePath) return null;
      target = r.filePath;
    }
    await fsp.writeFile(target, text, 'utf8');
    return { path: target, name: path.basename(target) };
  });

  // Запись видео в файл
  const videoFiles = new Map();
  ipcMain.handle('video:begin', async (e, { ext, suggestedName }) => {
    const r = await dialog.showSaveDialog(win, {
      title: tx('Сохранить видео'),
      defaultPath: path.join(app.getPath('videos'), (suggestedName || 'scene') + '.' + ext),
      filters: [{ name: tx('Видео'), extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return null;
    const id = crypto.randomUUID();
    videoFiles.set(id, { path: r.filePath, fd: await fsp.open(r.filePath, 'w') });
    return { id, path: r.filePath };
  });
  ipcMain.handle('video:write', async (e, id, buf, position) => {
    const v = videoFiles.get(id);
    if (v) { const b = Buffer.from(buf); await v.fd.write(b, 0, b.length, position); }
    return true;
  });
  ipcMain.handle('video:reset', async (e, id) => { const v = videoFiles.get(id); if (v) await v.fd.truncate(0); return true; });
  ipcMain.handle('video:chunk', async (e, id, buf) => {
    const v = videoFiles.get(id);
    if (v) await v.fd.write(Buffer.from(buf));
    return true;
  });
  ipcMain.handle('video:end', async (e, id, reveal) => {
    const v = videoFiles.get(id);
    if (!v) return null;
    await v.fd.close();
    videoFiles.delete(id);
    if (reveal) shell.showItemInFolder(v.path);
    // Android: видео скопировано в «Фильмы» — возвращаем путь там
    return global.__ooShown ? global.__ooShown(v.path) : v.path;
  });
  ipcMain.handle('video:abort', async (e, id) => {
    const v = videoFiles.get(id);
    if (!v) return;
    if (v.fd.discard) v.fd.discard(); // Android: недописанное видео не копировать в «Фильмы»
    await v.fd.close();
    videoFiles.delete(id);
    try { await fsp.unlink(v.path); } catch (err) { /* ignore */ }
  });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:setLang', (e, l) => { UI_LANG = l === 'en' ? 'en' : 'ru'; return UI_LANG; });
  ipcMain.handle('app:launchFile', () => { const f = launchFile; launchFile = null; return f; });
  ipcMain.handle('app:openExternal', (e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); });
  ipcMain.handle('app:checkUpdate', () => checkUpdate());
  ipcMain.handle('app:tutorials', () => fetchTutorials());
  // Выбор файлов системным окном. Раньше было <input type=file accept=…>: в Windows список типов из MIME
  // и расширений иногда скрывал подходящие файлы. Здесь есть и «Все файлы».
  ipcMain.handle('dialog:pickFiles', async (e, kind, multiple) => {
    const sets = {
      image: [tx('Картинки'), ['png', 'gif', 'webp', 'jpg', 'jpeg', 'jfif', 'apng', 'avif', 'bmp']],
      audio: [tx('Звук'), ['mp3', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'flac', 'webm']],
      font: [tx('Шрифты'), ['ttf', 'otf', 'woff', 'woff2']],
    };
    const [name, exts] = sets[kind] || sets.image;
    const all = [...exts, ...exts.map((x) => x.toUpperCase())];
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender) || win, {
      title: kind === 'audio' ? tx('Выбор звука') : kind === 'font' ? tx('Выбор шрифта') : tx('Выбор картинки'),
      filters: [{ name, extensions: process.platform === 'win32' ? exts : all }, { name: tx('Все файлы'), extensions: ['*'] }],
      properties: ['openFile', ...(multiple ? ['multiSelections'] : [])],
    });
    return r.canceled ? [] : r.filePaths;
  });
}

// ---------- Проверка обновлений: последний выпуск в GitHub Releases ----------
const UPDATE_REPO = 'Makasinc4ik/P.O.L.-Portative-Objection.lol-';
function verParts(v) { return String(v || '').trim().replace(/^[^0-9]*/, '').split(/[.\-+ ]/).slice(0, 3).map((n) => parseInt(n, 10) || 0); }
function verCmp(a, b) { const x = verParts(a); const y = verParts(b); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
function platformAsset(assets) {
  const names = (assets || []).filter((a) => a && a.name && a.browser_download_url);
  const pat = process.platform === 'android' ? /android.*\.apk$/i
    : process.platform === 'win32' ? (process.arch === 'ia32' ? /win32/i : /win64/i)
    : process.platform === 'darwin' ? /mac/i
    : /linux.*\.appimage$/i;
  const a = names.find((x) => pat.test(x.name)) || (process.platform === 'linux' ? names.find((x) => /linux/i.test(x.name)) : null);
  return a ? { name: a.name, url: a.browser_download_url, size: a.size || 0 } : null;
}
async function checkUpdate() {
  const current = app.getVersion();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(process.env.OO_UPDATE_API || `https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=20`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'ObjectionOffline/' + current }, signal: ctl.signal });
    if (r.status === 404) return { ok: true, current, latest: null, newer: false };
    if (r.status === 429 || (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0')) return { ok: false, current, error: tx('GitHub временно ограничил число запросов — проверка возможна позже') };
    if (!r.ok) return { ok: false, current, error: 'GitHub: HTTP ' + r.status };
    const list = (await r.json()).filter((x) => x && !x.draft && !x.prerelease && /\d/.test(x.tag_name || x.name || ''));
    if (!list.length) return { ok: true, current, latest: null, newer: false };
    list.sort((a, b) => verCmp(b.tag_name || b.name, a.tag_name || a.name));
    const rel = list[0];
    const latest = String(rel.tag_name || rel.name).replace(/^[^0-9]*/, '');
    return { ok: true, current, latest, newer: verCmp(latest, current) > 0, name: rel.name || rel.tag_name, url: rel.html_url, notes: String(rel.body || '').slice(0, 3000), date: rel.published_at || '', asset: platformAsset(rel.assets) };
  } catch (e) {
    return { ok: false, current, error: e && e.name === 'AbortError' ? tx('GitHub не ответил за 20 секунд') : tx('Нет связи с GitHub') + (e && e.message ? ' (' + e.message + ')' : '') };
  } finally { clearTimeout(timer); }
}
global.__ooVerCmp = verCmp;
// Список видеоуроков: tutorials.json в репозитории (обновляется без выпуска новой версии)
async function fetchTutorials() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(process.env.OO_TUTORIALS_URL || `https://raw.githubusercontent.com/${UPDATE_REPO}/main/tutorials.json`, { headers: { 'user-agent': 'ObjectionOffline/' + app.getVersion() }, signal: ctl.signal });
    if (!r.ok) return null;
    const j = JSON.parse(await r.text());
    return j && Array.isArray(j.videos) ? { source: 'online', videos: j.videos } : null;
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

// ---------- Старт ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // macOS: файл .objection открыли из Finder
  app.on('open-file', (e, file) => {
    e.preventDefault();
    if (win && !win.isDestroyed()) win.webContents.send('open-file', file); else launchFile = file;
  });
  app.on('second-instance', (e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const f = fileFromArgv(argv);
    if (f) win.webContents.send('open-file', f);
  });
  app.whenReady().then(async () => {
    launchFile = launchFile || fileFromArgv(process.argv);
    LIB_DIR = pickLibraryDir();
    S.load(LIB_DIR);
    // старые версии хранили адреса в разном виде — приводим к одному
    const um = {};
    for (const [k, v] of Object.entries(lib().urlMap)) um[absUrl(k)] = v;
    lib().urlMap = um;
    // библиотека старого формата (files/<хеш>) — раскладываем по папкам
    if (lib().layout !== S.LAYOUT) {
      try { await S.organizeAll(SYSTEM_URLS); } catch (e) { console.error('organize failed', e); }
    } else {
      // ресурсы, чьи файлы удалили вручную, убираем из библиотеки
      try { const r = S.checkFiles(); if (r.removed.length || r.fixedPoses) startupCheck = r; } catch (e) { console.error('checkFiles', e); }
      S.clearTrash();
      S.collectGarbage().catch(() => {});
    }
    registerProtocol();
    registerIpc();
    createWindow();
  });
  app.on('window-all-closed', () => { if (S.st.saveTimer) S.saveNow(); app.quit(); });
}
