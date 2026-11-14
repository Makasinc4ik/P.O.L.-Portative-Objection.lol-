// process для main.js / storage.js в WebView
import { paths } from './native.js';

export const process = {
  env: { OO_LIBRARY: paths().lib },
  platform: 'android',
  arch: 'arm64',
  argv: [],
  execPath: '/',
  versions: {},
  nextTick: (fn, ...a) => Promise.resolve().then(() => fn(...a)),
  cwd: () => '/',
};
