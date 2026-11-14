import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out10';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
await win.waitForTimeout(2500);
const closeModals = () => win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await closeModals();
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await closeModals();
const shot = (n) => win.locator('#stage canvas').screenshot({ path: `${OUT}/${n}.png` });
// classic textbox
await win.evaluate(() => { const P = window.App; P.project.options.chatbox = '0'; const fr = P.project.groups[0].frames; fr[3].text = 'Короткая реплика.'; fr[4].text = 'Очень длинная реплика, '.repeat(14) + 'конец.'; P.player.setProject(P.project); });
for (const i of [3, 4]) { await win.evaluate((i) => window.App.player.showStill(i), i); await win.waitForTimeout(800); await shot('classic-' + i); }
// 9:16
await win.evaluate(() => { const P = window.App; P.project.options.aspectRatio = '9:16'; P.player.setProject(P.project); });
for (const i of [3, 262]) { await win.evaluate((i) => window.App.player.showStill(i), i); await win.waitForTimeout(900); await shot('portrait-' + i); }
await win.evaluate(() => { const P = window.App; P.project.options.chatbox = 'fd32ac1c-34a6-4258-bdb9-a11464bed740'; P.player.setProject(P.project); });
await win.evaluate(() => window.App.player.showStill(262)); await win.waitForTimeout(900); await shot('portrait-tb-262');
await win.evaluate(() => { const P = window.App; P.project.options.aspectRatio = '16:9'; P.player.setProject(P.project); });
// per-character textbox
const ct = await win.evaluate(async () => {
  const L = window.Assets.Lib; const P = window.App;
  const fr = P.project.groups[0].frames;
  const c = L.char(fr[3].characterId);
  const copy = { ...c, textboxId: '3' };
  await L.upsert('characters', copy);
  P.player.setProject(P.project);
  await P.player.showStill(3);
  const a = P.player.tb && P.player.tb.style && P.player.tb.style.name;
  P.project.options.useCharacterTextboxes = false;
  await P.player.showStill(3);
  const b = P.player.tb && P.player.tb.style && P.player.tb.style.name;
  delete P.project.options.useCharacterTextboxes;
  delete copy.textboxId; await L.upsert('characters', copy);
  return [c.name, a, b];
});
console.log('char textbox', JSON.stringify(ct));
// frames per page
const fp = await win.evaluate(() => { const t0 = performance.now(); const sel = [...document.querySelectorAll('#pager select')][0]; sel.value = '0'; sel.dispatchEvent(new Event('change')); return { n: document.querySelectorAll('.frame').length, ms: Math.round(performance.now() - t0) }; });
console.log('all frames', JSON.stringify(fp));
await win.evaluate(() => { const sel = document.querySelector('#pager select'); sel.value = '20'; sel.dispatchEvent(new Event('change')); });
// my scenes
await win.evaluate(() => window.App.markDirtyForTest && 0);
await win.waitForTimeout(3500);
await win.evaluate(() => document.getElementById('btnScenes').click());
await win.waitForTimeout(1200);
await win.screenshot({ path: OUT + '/scenes.png' });
console.log('scenes', JSON.stringify(await win.evaluate(async () => (await window.api.scenes.list()).map((x) => [x.name, x.frames, !!x.thumb, x.size]))));
await closeModals();
// presets
await win.evaluate(() => document.getElementById('btnSettings').click());
await win.waitForTimeout(800);
await win.screenshot({ path: OUT + '/settings.png' });
console.log(logs.join('\n'));
app.process().kill('SIGKILL'); process.exit(0);
