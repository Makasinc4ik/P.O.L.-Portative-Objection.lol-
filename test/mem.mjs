import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
async function metrics0() { await metrics('empty'); }
const metrics = async (label) => {
  const m = await app.evaluate(({ app }) => {
    const fs = process.getBuiltinModule ? process.getBuiltinModule('fs') : null;
    return app.getAppMetrics().map((x) => { let anon = 0; try { const t = fs.readFileSync('/proc/' + x.pid + '/status', 'utf8'); anon = Math.round(Number((t.match(/RssAnon:\s+(\d+)/) || [])[1] || 0) / 1024); } catch (e) {} return { type: x.type, ws: Math.round(x.memory.workingSetSize / 1024), anon }; });
  });
  const c = await win.evaluate(() => ({ img: Math.round(window.Assets.ImageCache.bytes / 1048576), n: window.Assets.ImageCache.map.size, aud: Math.round(window.App.audio.bufBytes / 1048576) }));
  console.log(label, JSON.stringify(c), JSON.stringify(m));
};
await metrics0();
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await metrics('start');
console.log('heap', JSON.stringify(await win.evaluate(() => ({ used: Math.round(performance.memory.usedJSHeapSize / 1048576), total: Math.round(performance.memory.totalJSHeapSize / 1048576), dom: document.getElementsByTagName('*').length, imgs: document.images.length }))));
// просмотр «быстро»: проходим по многим кадрам через showStill (грузит картинки)
await win.evaluate(async () => {
  const A = window.App; A.project.options.aspectRatio = '16:9'; A.player.setProject(A.project);
  for (let i = 0; i < 400; i += 3) { await A.player.showStill(i); }
});
await metrics('after 130 stills');
console.log('top', JSON.stringify(await win.evaluate(() => [...window.Assets.ImageCache.map.entries()].filter(([, e]) => e.img).map(([k, e]) => [k.slice(-60), Math.round(e.img.bytes / 1048576), e.img.frames.length, e.img.width + 'x' + e.img.height]).sort((a, b) => b[1] - a[1]).slice(0, 10))));
await win.evaluate(() => window.App.trimMemory());
await win.waitForTimeout(3000);
await metrics('after trim');
console.log(logs);
await app.close();
