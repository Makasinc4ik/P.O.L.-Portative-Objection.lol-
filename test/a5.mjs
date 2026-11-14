// Android: полноэкранный просмотр на телефоне в горизонтальной ориентации — холст на весь экран
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo';
const TR = '/tmp/oo-android2';
const W = process.env.OO_W || '915', H = process.env.OO_H || '412';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT + '/android/harness'], env: { ...process.env, OO_TEST_ROOT: TR, OO_W: W, OO_H: H } });
const win = await app.firstWindow();
await win.waitForTimeout(3500);
for (let i = 0; i < 3; i++) { await win.evaluate(() => window.__ooBack && window.__ooBack()); await win.waitForTimeout(200); }
const r = {};
r.mobile = await win.evaluate(() => document.body.classList.contains('mobile'));
await win.evaluate(() => document.body.classList.add('mobile')); // как на телефоне (в обвязке может быть широкое окно)
await win.locator('#stage').click({ position: { x: 5, y: 5 } }).catch(() => {});
await win.evaluate(() => document.getElementById('stage').requestFullscreen());
await win.waitForTimeout(800);
r.fs = await win.evaluate(() => { const c = document.querySelector('#stage canvas').getBoundingClientRect(); return { fs: !!document.fullscreenElement, vw: innerWidth, vh: innerHeight, canvas: [Math.round(c.width), Math.round(c.height)] }; });
await win.screenshot({ path: ROOT + '/test/outA3/10-fullscreen.png' });
await win.evaluate(() => document.exitFullscreen());
await win.waitForTimeout(500);
r.after = await win.evaluate(() => { const c = document.querySelector('#stage canvas').getBoundingClientRect(); return [Math.round(c.width), Math.round(c.height)]; });
console.log(JSON.stringify(r));
await app.close();
