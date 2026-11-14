import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const r = await win.evaluate(async () => {
  const A = window.App; const P = A.player;
  A.project.options.aspectRatio = '16:9'; P.setProject(A.project);
  P.playFrom(150, {});
  const waits = []; let since = 0; let frames = new Set();
  const t0 = performance.now();
  while (performance.now() - t0 < 45000) {
    await new Promise((r) => setTimeout(r, 50));
    frames.add(P.current);
    if (P.loadingSince && !since) since = performance.now();
    if (!P.loadingSince && since) { waits.push(Math.round(performance.now() - since)); since = 0; }
  }
  P.stop();
  const IC = window.Assets.ImageCache;
  return { frames: frames.size, waits: waits.filter((w) => w > 100), total: waits.reduce((a, b) => a + b, 0), cacheMB: Math.round(IC.bytes / 1048576), n: IC.map.size };
});
console.log(JSON.stringify(r), logs);
await app.close();
