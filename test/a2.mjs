// Android-сборка (обвязка): открыть проект через выбор файла, скачать ресурсы, показать кадр, экспорт видео, сохранение, сцены, импорт картинки
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
import { execSync } from 'child_process';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/outA2';
fs.mkdirSync(OUT, { recursive: true });
const TR = '/tmp/oo-android2';
if (!process.env.KEEP) fs.rmSync(TR, { recursive: true, force: true });
const W = process.env.OO_W || '1280', H = process.env.OO_H || '800';
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT + '/android/harness'], env: { ...process.env, OO_TEST_ROOT: TR, OO_W: W, OO_H: H } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console.error] ' + m.text()); });
await win.waitForTimeout(3500);
const R = {};
const t0 = Date.now();
// 1. открыть проект: «Открыть проект…» в окне приветствия → системный выбор файла
const fcP = win.waitForEvent('filechooser', { timeout: 15000 });
await win.locator('button', { hasText: 'Открыть проект' }).first().click();
const fc = await fcP;
R.chooser = { multiple: fc.isMultiple() };
await fc.setFiles('/tmp/Minecraft.objection');
await win.waitForTimeout(1500);
R.afterOpen = await win.evaluate(() => ({ frames: App.project.groups[0].frames.length, file: App.filePath, name: App.fileName, dialog: document.querySelector('.modal-wrap .modal-body, .modal-wrap')?.textContent.slice(0, 160) }));
// 2. скачать ресурсы
await win.locator('.modal-wrap button', { hasText: 'Скачать' }).last().click();
for (let i = 0; i < 240; i++) {
  await win.waitForTimeout(1000);
  const st = await win.evaluate(() => document.querySelector('.modal-wrap')?.textContent.slice(0, 200) || '');
  if (/Готово|Скачано|ресурсы проекта|Отчёт|ошиб/i.test(st) && !/Скачивание ресурсов проекта/.test(st)) { R.report = st; break; }
}
R.downloadSec = Math.round((Date.now() - t0) / 1000);
const files = execSync(`find ${TR}/files/Library -type f | wc -l`).toString().trim();
R.libFiles = files;
await win.screenshot({ path: OUT + '/report.png' });
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(200); }
// 3. кадр 190 — картинка на холсте
R.still = await win.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  await App.player.showStill(2);
  await new Promise((r) => setTimeout(r, 1500));
  const c = App.player.canvas; const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
  let nonBlack = 0; for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++;
  const st = App.player.state;
  const bgA = window.Assets.Lib.get('backgrounds', (st.bg && st.bg.id) || App.project.groups[0].frames[1].backgroundId) || window.Assets.Lib.list('backgrounds').find((b) => !b.isPreset);
  let probe = null;
  try { const im = bgA && await App.player.img(bgA.url, 0); probe = im ? { w: im.w, h: im.h, alive: window.Assets.ImageCache ? window.Assets.ImageCache.alive(im) : '?' } : 'null'; } catch (e) { probe = 'err ' + e; }
  return { w: c.width, h: c.height, nonBlackShare: Math.round(nonBlack / (d.length / 400) * 100), bg: st.bg && st.bg.img ? [st.bg.img.w, st.bg.img.h] : null, chars: (st.chars || []).length, fade: st.fade || st.overlay || null, probe, bgUrl: bgA && window.Assets.Lib.url(bgA.url), sessions: App.player.session, playing: App.player.playing };
});
// звук: длительность музыки через <audio> (нужен Range)
R.audio = await win.evaluate(async () => {
  const m = window.Assets.Lib.list('music').find((x) => window.Assets.Lib.isAvailableOffline(x.url));
  if (!m) return null;
  const a = new Audio(window.Assets.Lib.url(m.url));
  const d = await new Promise((r) => { a.onloadedmetadata = () => r(a.duration); a.onerror = () => r('err'); setTimeout(() => r('timeout'), 8000); });
  const buf = await App.audio.buffer(window.Assets.Lib.url(m.url)).catch((e) => String(e));
  return { name: m.name, duration: d, decoded: buf && buf.duration };
});
await win.screenshot({ path: OUT + '/editor.png' });
// 4. экспорт видео
R.export = await win.evaluate(async () => {
  const t = performance.now();
  const r = await window.Exporter.exportVideo(App.player, App.audio, { from: 184, to: 190, height: 360, fps: 30, quality: 'small', suggestedName: 'Minecraft 185', onProgress: () => {}, onPreview: () => {} });
  return { r, ms: Math.round(performance.now() - t) };
});
const vids = execSync(`ls -la "${TR}/public/Movies/Objection Offline" 2>&1 || true`).toString();
R.movies = vids.trim().split('\n').slice(-1)[0];
try { R.ffprobe = execSync(`ffprobe -v error -show_entries format=duration:stream=codec_name -of compact "${TR}/public/Movies/Objection Offline/Minecraft 185.mp4"`).toString().trim(); } catch (e) { R.ffprobe = 'ERR ' + e.message.slice(0, 200); }
R.outLeft = execSync(`ls ${TR}/cache/out 2>&1 || true`).toString().trim();
// 5. сохранить проект как…
R.save = await win.evaluate(async () => { const r = await window.api.project.save({ path: null, text: '{"test":1}', suggestedName: 'Проверка' }); return r; });
R.saveAgain = await win.evaluate(async (p) => window.api.project.save({ path: p, text: '{"test":2}' }), R.save && R.save.path);
R.downloads = execSync(`ls "${TR}/public/Download/Objection Offline" 2>&1; cat "${TR}/public/Download/Objection Offline/Проверка.objection" 2>&1`).toString();
// 6. сцены
R.scenes = await win.evaluate(async () => (await window.api.scenes.list()).map((s) => ({ name: s.name, frames: s.frames, size: s.size, filePath: s.filePath })));
// 7. импорт своей картинки (выбор файла)
fs.writeFileSync('/tmp/oo_pick.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const fc2P = win.waitForEvent('filechooser', { timeout: 15000 });
const pickRes = win.evaluate(() => window.api.lib.pickPaths('image', true));
const fc2 = await fc2P;
R.chooser2 = { multiple: fc2.isMultiple() };
await fc2.setFiles('/tmp/oo_pick.png');
R.picked = await pickRes;
R.imported = await win.evaluate((p) => window.api.lib.importPath(p), R.picked[0]);
R.log = fs.existsSync(TR + '/bridge.log') ? fs.readFileSync(TR + '/bridge.log', 'utf8').split('\n').slice(-8) : [];
console.log(JSON.stringify(R, null, 1));
console.log(logs.slice(0, 30).join('\n'));
await app.close();
