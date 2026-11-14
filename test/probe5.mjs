import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
win.on('console', (m) => console.log('[c]', m.text().slice(0, 300)));
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: null, name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const urls = await win.evaluate(async () => {
  const fr = window.App.project.groups[0].frames.slice(0, 120);
  const L = window.Assets.Lib; const out = [];
  for (const f of fr) for (const t of window.Tags.parseText(f.text || '')) { if (t.cmd === 'music') out.push(['m', L.music(t.id)?.url]); if (t.cmd === 'sound') out.push(['s', L.sound(t.id)?.url]); }
  const res = [];
  for (const [k, u] of out) { const t0 = performance.now(); const b = await Promise.race([window.App.audio.buffer(u), new Promise((r) => setTimeout(() => r('TIMEOUT'), 8000))]); res.push([k, u, b === 'TIMEOUT' ? 'TIMEOUT' : !!b, Math.round(performance.now() - t0)]); }
  return res;
});
console.log(JSON.stringify(urls));
await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/p5.mp4' }); });
await win.evaluate(() => {
  window.__t0 = performance.now();
  window.Exporter.exportVideo(window.App.player, window.App.audio, { from: 0, to: 120, height: 480, fps: 30, onProgress: (p) => { if (p.text !== window.__last) { window.__last = p.text; console.log(Math.round(performance.now() - window.__t0), p.text); } } }).then((r) => console.log('DONE', JSON.stringify(r)), (e) => console.log('ERR', e.message));
});
await win.waitForTimeout(40000);
const proc = app.process(); proc.kill('SIGKILL'); process.exit(0);
