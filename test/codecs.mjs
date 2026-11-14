import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const av = await win.evaluate(() => window.Exporter.availableCodecs());
const out = { av };
for (const c of ['avc', 'hevc', 'vp9', 'av1']) {
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, `/tmp/cd-${c}.mp4`);
  out[c] = await win.evaluate(async (c) => {
    const P = window.App; P.project.options.aspectRatio = '16:9'; P.player.setProject(P.project);
    try { const r = await window.Exporter.exportVideo(P.player, P.audio, { from: 0, to: 4, height: 360, fps: 30, quality: 'medium', codec: c, suggestedName: 'x', onProgress: () => {}, onPreview: () => {} }); return { codec: r.codec, family: r.family, fb: r.codecFallback, took: Math.round(r.took) }; } catch (e) { return 'ERR ' + e.message; }
  }, c);
}
console.log(JSON.stringify(out), logs);
await app.close();
