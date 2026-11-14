import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const r = await win.evaluate(async () => {
  const A = window.App; const P = A.player;
  const mk = (c, p, text, fade) => ({ id: Math.floor(Math.random() * 1e9), text, characterId: c, poseId: p, actions: [], fade });
  A.project.groups[0].frames = [
    mk(1, 1, 'Первый кадр текст', { type: 'fadeOut', target: 'scene', duration: 1000, color: '#000000' }),
    mk(2, 5, 'Второй кадр', { type: 'fadeIn', target: 'scene', duration: 1000, color: '#000000' }),
    mk(1, 1, 'Третий'),
  ];
  window.Assets.ImageCache.clear && window.Assets.ImageCache.clear();
  P.setProject(A.project);
  P.playFrom(0, {});
  const log = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 9000) {
    await new Promise((r) => setTimeout(r, 100));
    log.push([Math.round(performance.now() - t0), P.current, P.state.overlay ? +P.state.overlay.a.toFixed(2) : null, P.state.chars[0]?.c?.id]);
  }
  P.stop();
  return log;
});
console.log(r.map((x) => x.join(':')).join(' '), logs);
await app.close();
