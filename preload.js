'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: 'electron',
  sysLangs: ((process.argv.find((x) => x.startsWith('--oo-langs=')) || '').slice(11)).split(',').filter(Boolean),
  arch: process.arch,
  lib: {
    get: () => ipcRenderer.invoke('lib:get'),
    info: () => ipcRenderer.invoke('lib:info'),
    openFolder: (sub) => ipcRenderer.invoke('lib:openFolder', sub),
    showAsset: (type, id) => ipcRenderer.invoke('lib:showAsset', type, id),
    legacyCandidates: () => ipcRenderer.invoke('lib:legacyCandidates'),
    dismissLegacy: (dir) => ipcRenderer.invoke('lib:dismissLegacy', dir),
    pickLegacy: () => ipcRenderer.invoke('lib:pickLegacy'),
    importLegacy: (dir) => ipcRenderer.invoke('lib:importLegacy', dir),
    changeDir: () => ipcRenderer.invoke('lib:changeDir'),
    upsert: (type, asset) => ipcRenderer.invoke('lib:upsert', type, asset),
    remove: (type, id) => ipcRenderer.invoke('lib:remove', type, id),
    removeMany: (type, ids) => ipcRenderer.invoke('lib:removeMany', type, ids),
    checkFiles: () => ipcRenderer.invoke('lib:checkFiles'),
    setPresets: (kind, list) => ipcRenderer.invoke('lib:setPresets', kind, list),
    startupCheck: () => ipcRenderer.invoke('lib:startupCheck'),
    newId: () => ipcRenderer.invoke('lib:newId'),
    duplicates: (type) => ipcRenderer.invoke('lib:duplicates', type),
    findDuplicates: (type, asset) => ipcRenderer.invoke('lib:findDuplicates', type, asset),
    merge: (type, keepId, removeIds) => ipcRenderer.invoke('lib:merge', type, keepId, removeIds),
    setFolder: (type, ids, folder) => ipcRenderer.invoke('lib:setFolder', type, ids, folder),
    setFolders: (type, list) => ipcRenderer.invoke('lib:setFolders', type, list),
    setMarks: (type, id, mark) => ipcRenderer.invoke('lib:setMarks', type, id, mark),
    undo: () => ipcRenderer.invoke('lib:undo'),
    sizes: (type) => ipcRenderer.invoke('lib:sizes', type),
    // Импорт файла, выбранного через <input type=file>
    importFile: async (file) => {
      let p = '';
      // webUtils есть с Electron 29; в сборке для старых macOS (Electron 26) путь лежит в file.path
      try { p = webUtils ? webUtils.getPathForFile(file) : (file.path || ''); } catch (e) { p = file.path || ''; }
      if (p) return ipcRenderer.invoke('lib:importPath', p);
      const buf = await file.arrayBuffer();
      return ipcRenderer.invoke('lib:importBuffer', buf, file.name);
    },
    importBuffer: (buf, name) => ipcRenderer.invoke('lib:importBuffer', buf, name),
    importPath: (p) => ipcRenderer.invoke('lib:importPath', p),
    pickPaths: (kind, multiple) => ipcRenderer.invoke('dialog:pickFiles', kind, !!multiple),
    hasThumb: (key, rel) => ipcRenderer.invoke('lib:hasThumb', key, rel),
    saveThumb: (key, buf) => ipcRenderer.invoke('lib:saveThumb', key, buf),
    exportAsset: (type, id) => ipcRenderer.invoke('lib:exportAsset', type, id),
    importPack: (folder) => ipcRenderer.invoke('lib:importPack', folder),
    importZip: (folder) => ipcRenderer.invoke('lib:importZip', folder),
  },
  download: {
    presets: () => ipcRenderer.invoke('dl:presets'),
    project: (project, folder) => ipcRenderer.invoke('dl:project', project, folder),
    cancel: () => ipcRenderer.invoke('dl:cancel'),
    system: () => ipcRenderer.invoke('dl:system'),
    byCode: (kind, code, folder) => ipcRenderer.invoke('dl:byCode', kind, code, folder),
    mine: (folder) => ipcRenderer.invoke('dl:mine', folder),
    onProgress: (cb) => {
      const fn = (e, p) => cb(p);
      ipcRenderer.on('progress', fn);
      return () => ipcRenderer.removeListener('progress', fn);
    },
  },
  project: {
    open: () => ipcRenderer.invoke('project:open'),
    readPath: (p) => ipcRenderer.invoke('project:readPath', p),
    save: (opts) => ipcRenderer.invoke('project:save', opts),
  },
  video: {
    begin: (opts) => ipcRenderer.invoke('video:begin', opts),
    chunk: (id, buf) => ipcRenderer.invoke('video:chunk', id, buf),
    reset: (id) => ipcRenderer.invoke('video:reset', id),
    write: (id, buf, position) => ipcRenderer.invoke('video:write', id, buf, position),
    end: (id, reveal) => ipcRenderer.invoke('video:end', id, reveal),
    abort: (id) => ipcRenderer.invoke('video:abort', id),
  },
  scenes: {
    list: () => ipcRenderer.invoke('scenes:list'),
    get: (id) => ipcRenderer.invoke('scenes:get', id),
    save: (meta, text) => ipcRenderer.invoke('scenes:save', meta, text),
    update: (id, patch) => ipcRenderer.invoke('scenes:update', id, patch),
    remove: (id) => ipcRenderer.invoke('scenes:delete', id),
  },
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  launchFile: () => ipcRenderer.invoke('app:launchFile'),
  version: () => ipcRenderer.invoke('app:version'),
  setLang: (l) => ipcRenderer.invoke('app:setLang', l),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  tutorials: () => ipcRenderer.invoke('app:tutorials'),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (e, p) => cb(p)),
});
