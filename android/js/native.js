// Доступ к мостам Android (OOFS, OONet, OOApp). В тестах на ПК их подставляет тестовая обвязка.
export const FS = () => globalThis.OOFS;
export const NET = () => globalThis.OONet;
export const APP = () => globalThis.OOApp;

let pathsCache = null;
export function paths() {
  if (!pathsCache) pathsCache = JSON.parse(APP().paths() || '{}');
  return pathsCache;
}

// Куда кладутся файлы «Сохранить как…»: после записи они копируются в общую папку телефона
export const outDir = () => paths().cache + '/out';
export const pickDir = () => paths().cache + '/picked';
