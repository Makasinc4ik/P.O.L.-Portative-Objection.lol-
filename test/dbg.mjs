import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
win.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: null, name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const r2 = await win.evaluate(async () => {
  const L = window.Assets.Lib;
  const u = '/Images/Popups/wt.gif';
  const t0 = performance.now();
  const img = await window.Assets.ImageCache.get(u, 0);
  const fr = window.App.project.groups[0].frames;
  fr[8].actions = [...(fr[8].actions || []), { actionId: 7, actionParam: '1' }];
  window.App.player.setProject(window.App.project);
  return { local: L.localPath(u), ms: performance.now() - t0, img: img && [img.w, img.h, img.frames.length, img.total] };
});
console.log(JSON.stringify(r2));
await win.evaluate(() => { const P = window.App.player; window.__ticks = 0; window.__err = null; const d = P.draw.bind(P); P.draw = (n) => { window.__ticks++; try { d(n); } catch (e) { window.__err = String(e.stack); throw e; } }; window.App.play(8); });
for (let k = 0; k < 6; k++) { await win.waitForTimeout(700); await win.locator('#stage canvas').screenshot({ path: '/tmp/wt' + k + '.png' }); console.log(k, JSON.stringify(await win.evaluate(() => { const P = window.App.player; return { ticks: window.__ticks, err: window.__err && window.__err.slice(0, 300), cur: P.current, ls: P.loadingSince, box: P.state.box.chars.map((c) => c.ch).join('').slice(0, 30), pp: P.state.presetPopups.map((p) => { const b = p.img.frameAt(P.now() - p.start, false); return [p.url, b && b.width, Math.round(P.now() - p.start)]; }) }; }))); }
const proc = app.process(); proc.kill('SIGKILL'); process.exit(0);
