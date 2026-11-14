import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const tag = process.argv[2] || 'x';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: null, name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
for (const q of ['high', 'medium', 'small']) {
  const f = `/tmp/size-${tag}-${q}.mp4`;
  await app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, f);
  const r = await win.evaluate(async (q) => window.Exporter.exportVideo(window.App.player, window.App.audio, { from: 184, to: 230, height: 720, fps: 30, quality: q, onProgress: () => {} }), q);
  console.log(tag, q, (fs.statSync(f).size / 1e6).toFixed(2), 'MB', r.seconds.toFixed(1), 's', 'took', r.took.toFixed(0));
}
app.process().kill('SIGKILL'); process.exit(0);
