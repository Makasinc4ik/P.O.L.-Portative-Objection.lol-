import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out13';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const r = await win.evaluate(async () => {
  const A = window.App;
  A.dirty = false;
  const fr = (o) => ({ id: Math.floor(Math.random() * 1e9), iid: 0, text: o.text || 'Тест', characterId: o.c, poseId: o.p, backgroundId: 72269, transition: o.tr, actions: [] });
  const proj = window.Project ? null : null;
  A.project.groups[0].frames = [
    fr({ c: 1, p: 1, text: 'Защита', tr: { left: 0, duration: 0, easing: null } }),
    fr({ c: 2, p: 5, text: 'Обвинение', tr: { left: 100, duration: 1200, easing: 'easeInOut' } }),
    fr({ c: 14, p: 77, text: 'Свидетель', tr: { left: 50, duration: 800, easing: null } }),
  ];
  A.player.setProject(A.project);
  A.refresh && A.refresh();
  A.select && A.select(1);
  return true;
});
await win.waitForTimeout(600);
await win.screenshot({ path: OUT + '/inspector.png' });
// кадры во время перехода
const shots = await win.evaluate(async () => {
  const A = window.App; const c = document.querySelector('#stage canvas');
  A.player.playFrom(0, {});
  const out = [];
  const t0 = performance.now();
  // ждём конец первого кадра
  while (A.player.current !== 1 && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 20));
  for (const ms of [0, 300, 600, 900, 1300]) {
    await new Promise((r) => setTimeout(r, ms === 0 ? 0 : 300));
    out.push({ view: A.player.state.view, img: c.toDataURL('image/jpeg', 0.7) });
  }
  A.player.stop();
  return out;
});
shots.forEach((x, i) => fs.writeFileSync(`${OUT}/pan${i}.jpg`, Buffer.from(x.img.split(',')[1], 'base64')));
console.log(JSON.stringify(shots.map((x) => x.view)), logs);
await app.close();
