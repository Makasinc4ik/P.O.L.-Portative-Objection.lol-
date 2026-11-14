import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: ROOT + '/test/Library' } });
const win = await app.firstWindow();
win.on('console', (m) => console.log('[c]', m.text()));
win.on('pageerror', (e) => console.log('[err]', e.message));
await win.waitForTimeout(1500);
const r = await win.evaluate(async () => {
  const out = [];
  const P = window.App.player;
  const f = P.frames;
  // время кадра 0
  let t0 = performance.now();
  P.on('frame', (i) => out.push(['frame', i, Math.round(performance.now() - t0)]));
  P.playFrom(0, {});
  await new Promise((r) => setTimeout(r, 7000));
  P.stop();
  // декодирование
  const list = P.framePreloadList(261);
  for (const [u, h] of list) {
    const t = performance.now();
    const img = await window.Assets.ImageCache.get(u, h);
    out.push(['decode', u.slice(-50), h, img && img.frames.length, img && img.w + 'x' + img.h, Math.round(performance.now() - t)]);
  }
  return out;
});
console.log(JSON.stringify(r, null, 0));
await app.close();
