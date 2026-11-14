// Android: «главный процесс» (main.js) работает прямо в WebView, а window.api — тот же, что даёт preload.js на ПК
import { Buffer } from 'buffer';
import { handlers, ready, onSend, emit } from './electron.js';
import { APP, paths } from './native.js';
import { shownPath } from './fs.js';

import { fetch as nativeFetch } from './fetch.js';
import { process as procShim } from './process.js';

// main.js видит свои fetch / process / Buffer (сборка подменяет эти имена), страница — обычные браузерные
globalThis.__ooFetch = nativeFetch;
globalThis.__ooProcess = procShim;
globalThis.__ooBuffer = Buffer;
globalThis.__ooShown = shownPath;
require('../../main.js');

const sender = { sender: { id: 1 } };
// В Electron данные между процессами копируются; здесь тоже копируем, чтобы правки в окне не меняли библиотеку «тайком»
const clone = (v) => {
  if (v == null || typeof v !== 'object') return v;
  try { return structuredClone(v); } catch (e) { return JSON.parse(JSON.stringify(v)); }
};
async function invoke(name, ...args) {
  await ready;
  const fn = handlers.get(name);
  if (!fn) throw new Error('Нет обработчика ' + name);
  return clone(await fn(sender, ...args.map(clone)));
}

const P = paths();
window.api = {
  platform: 'android',
  mobile: true,
  arch: 'arm64',
  libBase: location.origin + '/lib/',
  android: { sdk: P.sdk, model: P.model, libDir: P.lib },
  lib: {
    get: () => invoke('lib:get'),
    info: () => invoke('lib:info'),
    openFolder: (sub) => invoke('lib:openFolder', sub),
    showAsset: (type, id) => invoke('lib:showAsset', type, id),
    legacyCandidates: async () => [],
    dismissLegacy: (dir) => invoke('lib:dismissLegacy', dir),
    pickLegacy: async () => null,
    importLegacy: (dir) => invoke('lib:importLegacy', dir),
    changeDir: async () => { APP().toast('На телефоне папка библиотеки не меняется'); return null; },
    upsert: (type, asset) => invoke('lib:upsert', type, asset),
    remove: (type, id) => invoke('lib:remove', type, id),
    removeMany: (type, ids) => invoke('lib:removeMany', type, ids),
    checkFiles: () => invoke('lib:checkFiles'),
    setPresets: (kind, list) => invoke('lib:setPresets', kind, list),
    startupCheck: () => invoke('lib:startupCheck'),
    newId: () => invoke('lib:newId'),
    duplicates: (type) => invoke('lib:duplicates', type),
    findDuplicates: (type, asset) => invoke('lib:findDuplicates', type, asset),
    merge: (type, keepId, removeIds) => invoke('lib:merge', type, keepId, removeIds),
    setFolder: (type, ids, folder) => invoke('lib:setFolder', type, ids, folder),
    setFolders: (type, list) => invoke('lib:setFolders', type, list),
    setMarks: (type, id, mark) => invoke('lib:setMarks', type, id, mark),
    undo: () => invoke('lib:undo'),
    sizes: (type) => invoke('lib:sizes', type),
    importFile: async (file) => invoke('lib:importBuffer', await file.arrayBuffer(), file.name),
    importBuffer: (buf, name) => invoke('lib:importBuffer', buf, name),
    importPath: (p) => invoke('lib:importPath', p),
    pickPaths: (kind, multiple) => invoke('dialog:pickFiles', kind, !!multiple),
    hasThumb: (key, rel) => invoke('lib:hasThumb', key, rel),
    saveThumb: (key, buf) => invoke('lib:saveThumb', key, buf),
    exportAsset: (type, id) => invoke('lib:exportAsset', type, id),
    importPack: (folder) => invoke('lib:importPack', folder),
    importZip: (folder) => invoke('lib:importZip', folder),
  },
  download: {
    presets: () => invoke('dl:presets'),
    project: (project, folder) => invoke('dl:project', project, folder),
    cancel: () => invoke('dl:cancel'),
    system: () => invoke('dl:system'),
    byCode: (kind, code, folder) => invoke('dl:byCode', kind, code, folder),
    mine: (folder) => invoke('dl:mine', folder),
    onProgress: (cb) => onSend('progress', (p) => cb(clone(p))),
  },
  project: {
    open: () => invoke('project:open'),
    readPath: (p) => invoke('project:readPath', p),
    save: (opts) => invoke('project:save', opts),
  },
  video: {
    begin: (opts) => invoke('video:begin', opts).then((r) => { if (r) APP().keepScreenOn(true); return r; }),
    chunk: (id, buf) => invoke('video:chunk', id, buf),
    reset: (id) => invoke('video:reset', id),
    write: (id, buf, position) => invoke('video:write', id, buf, position),
    end: (id, reveal) => { APP().keepScreenOn(false); return invoke('video:end', id, false); },
    abort: (id) => { APP().keepScreenOn(false); return invoke('video:abort', id); },
  },
  scenes: {
    list: () => invoke('scenes:list'),
    get: (id) => invoke('scenes:get', id),
    save: (meta, text) => invoke('scenes:save', meta, text),
    update: (id, patch) => invoke('scenes:update', id, patch),
    remove: (id) => invoke('scenes:delete', id),
  },
  auth: {
    status: () => invoke('auth:status'),
    login: () => invoke('auth:login'),
    logout: () => invoke('auth:logout'),
  },
  openExternal: (url) => invoke('app:openExternal', url),
  launchFile: async () => { await ready; return (APP().takeLaunchFile && APP().takeLaunchFile()) || null; },
  version: () => invoke('app:version'),
  setLang: (l) => invoke('app:setLang', l),
  onOpenFile: (cb) => onSend('open-file', cb),
};
window.Buffer = window.Buffer || Buffer;
// «Открыть с помощью» при уже запущенном приложении
globalThis.__ooOpenFile = (p) => emit('open-file', p);
