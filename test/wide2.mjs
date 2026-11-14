import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out14';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const shots = await win.evaluate(async () => {
  const A = window.App; const P = A.player; const M = window.Assets.Marks;
  A.project.options.aspectRatio = '16:9';
  const fr = (o) => ({ id: Math.floor(Math.random() * 1e9), text: 'Тест', characterId: o.c, poseId: o.p, backgroundId: o.bg || 72269, transition: o.tr, wideSpot: o.spot, pair: o.pair, actions: [] });
  const c = document.querySelector('#stage canvas');
  const out = [];
  const snap = async (frames, i, zoom) => {
    await M.set('backgrounds', 72269, { zoom43: !!zoom });
    A.project.groups[0].frames = frames; P.setProject(A.project); A.select && A.select(0);
    await P.showStill(i); await new Promise((r) => setTimeout(r, 400)); await P.showStill(i); await new Promise((r) => setTimeout(r, 200));
    out.push(c.toDataURL('image/jpeg', 0.75));
  };
  await snap([fr({ c: 1, p: 1, tr: { left: 0 } })], 0);
  await snap([fr({ c: 14, p: 77, tr: { left: 100 }, spot: 'prosecution' })], 0);
  await snap([fr({ c: 14, p: 77, tr: { left: 50 } })], 0, true);
  await snap([fr({ c: 1, p: 1, tr: { left: 0 } })], 0, true);
  // пара из проекта, если есть
  const pr = A.project.pairs && A.project.pairs[0];
  if (pr) await snap([Object.assign(fr({ c: pr.pairs[0].characterId, p: null, tr: { left: 0 } }), { pair: { id: pr.id } })], 0);
  await M.set('backgrounds', 72269, {});
  return out;
});
shots.forEach((x, i) => fs.writeFileSync(`${OUT}/w${i}.jpg`, Buffer.from(x.split(',')[1], 'base64')));
console.log(shots.length, logs);
await app.close();
