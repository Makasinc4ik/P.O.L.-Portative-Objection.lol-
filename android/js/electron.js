// «electron» для main.js в WebView: ipcMain — таблица обработчиков, окна и протокол — заглушки,
// dialog — системный выбор файлов Android (через <input type=file>), shell — открыть ссылку / сообщение.
import { Buffer } from 'buffer';
import { APP, FS, paths, outDir, pickDir } from './native.js';

export const handlers = new Map();
const listeners = new Map();
export function onSend(channel, fn) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel).add(fn);
  return () => listeners.get(channel).delete(fn);
}
export function emit(channel, payload) {
  for (const fn of listeners.get(channel) || []) { try { fn(payload); } catch (e) { console.error(e); } }
}

let readyResolve;
export const ready = new Promise((r) => { readyResolve = r; });

export const ipcMain = {
  handle(name, fn) { handlers.set(name, fn); },
  on() {},
};

const noop = () => {};
const webContents = {
  send: (ch, p) => emit(ch, p),
  on: noop, once: noop, setWindowOpenHandler: noop, toggleDevTools: noop,
  executeJavaScript: async () => null, getUserAgent: () => navigator.userAgent, setUserAgent: noop,
};
export class BrowserWindow {
  constructor() {
    this.webContents = webContents;
    BrowserWindow.main = this;
    // createWindow() вызывается после registerIpc() — значит, всё готово
    setTimeout(() => readyResolve(), 0);
  }
  static fromWebContents() { return BrowserWindow.main || null; }
  static getAllWindows() { return BrowserWindow.main ? [BrowserWindow.main] : []; }
  loadURL() {} loadFile() {} setMenu() {} setMenuBarVisibility() {} on() {} once() {} close() {} focus() {} restore() {}
  isDestroyed() { return false; } isMinimized() { return false; }
}

export const app = {
  isPackaged: true,
  getPath(k) {
    const P = paths();
    return { userData: P.data, appData: P.data, documents: P.data, home: P.data, videos: outDir(), downloads: outDir(), temp: P.cache }[k] || P.data;
  },
  getVersion: () => APP().version(),
  getName: () => 'Objection Offline',
  whenReady: () => Promise.resolve(),
  on: noop, once: noop,
  quit: () => APP().exit(),
  exit: () => APP().exit(),
  relaunch: noop,
  requestSingleInstanceLock: () => true,
};

export const protocol = { registerSchemesAsPrivileged: noop, handle: noop, registerFileProtocol: noop };
export const net = { fetch: (...a) => fetch(...a) };
export const session = { defaultSession: {}, fromPartition: () => ({ clearStorageData: async () => {} }) };
export const safeStorage = { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s, 'utf8'), decryptString: (b) => Buffer.from(b).toString('utf8') };

export const shell = {
  openExternal: (url) => { APP().openExternal(String(url)); return Promise.resolve(); },
  openPath: (p) => { APP().toast('Папка на телефоне: ' + shortPath(p)); return Promise.resolve(''); },
  showItemInFolder: (p) => { APP().toast('Файл: ' + shortPath(p)); },
};
function shortPath(p) { return String(p).replace(/^\/storage\/emulated\/0\//, ''); }

// ---------- Выбор и сохранение файлов ----------
function acceptOf(opts) {
  const exts = [];
  for (const f of (opts && opts.filters) || []) for (const e of f.extensions || []) if (e !== '*') exts.push('.' + e.toLowerCase());
  return [...new Set(exts)].join(',');
}
// Выбранные файлы копируются в кэш приложения (на Android у них нет обычного пути)
async function copyToCache(file) {
  // одно и то же имя — тот же путь: повторно открытый проект продолжает ту же сцену в «Сценах»
  const dir = pickDir();
  const safe = String(file.name || 'file').replace(/[\\/:*?"<>|]+/g, '_');
  const p = dir + '/' + safe;
  FS().mkdirs(dir);
  const CH = 3 * 1024 * 1024; // кусками, чтобы большие файлы не упирались в память
  if (!file.size) FS().writeText(p, '', false);
  for (let off = 0; off < file.size; off += CH) {
    const ab = await file.slice(off, off + CH).arrayBuffer();
    if (!FS().writeB64(p, Buffer.from(ab).toString('base64'), off > 0)) throw new Error('Не удалось скопировать файл');
  }
  return p;
}
function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    if (multiple) inp.multiple = true;
    // расширения вроде .objection Android не понимает — тогда выбор из любых файлов
    if (accept && !/\.(objection|oopack|zip|json|txt)\b/.test(accept)) inp.accept = accept;
    inp.style.display = 'none';
    let done = false;
    const finish = (files) => { if (done) return; done = true; inp.remove(); resolve(files); };
    inp.addEventListener('change', () => finish([...inp.files]));
    inp.addEventListener('cancel', () => finish([]));
    document.body.append(inp);
    inp.click();
  });
}
export const dialog = {
  async showOpenDialog(win, opts) {
    if (opts === undefined && win && !win.webContents) opts = win;
    const props = (opts && opts.properties) || [];
    if (props.includes('openDirectory')) {
      APP().toast('На телефоне выбор папки недоступен');
      return { canceled: true, filePaths: [] };
    }
    const files = await pickFiles(acceptOf(opts), props.includes('multiSelections'));
    if (!files.length) return { canceled: true, filePaths: [] };
    const filePaths = [];
    for (const f of files) filePaths.push(await copyToCache(f));
    return { canceled: false, filePaths };
  },
  async showSaveDialog(win, opts) {
    if (opts === undefined && win && !win.webContents) opts = win;
    const def = String((opts && opts.defaultPath) || 'file');
    const name = def.slice(def.lastIndexOf('/') + 1) || 'file';
    FS().mkdirs(outDir());
    return { canceled: false, filePath: outDir() + '/' + name };
  },
  showMessageBox: async () => ({ response: 0 }),
  showErrorBox: noop,
};

export default { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, session, safeStorage };
