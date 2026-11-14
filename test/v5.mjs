import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out5';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
const step = (s) => console.log('==', s);
const shot = (n) => win.locator('#stage canvas').screenshot({ path: `${OUT}/${n}.png` });
const page = (n) => win.screenshot({ path: `${OUT}/${n}.png` });
const closeModals = () => win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
await win.waitForTimeout(2500);
await closeModals();
step('system files');
console.log(await win.evaluate(() => window.api.download.system()));
await win.evaluate(() => window.Assets.Lib.load());
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: null, name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await closeModals();

step('stills');
for (const i of [1, 2, 262, 394]) {
  await win.evaluate((i) => window.App.player.showStill(i), i);
  await win.waitForTimeout(900);
  await shot('still-' + i);
}

step('play fades 184..193');
await win.evaluate(() => window.App.play(184));
for (let k = 0; k < 8; k++) { await win.waitForTimeout(1300); await shot('fade-' + k); }
console.log('frame now', await win.evaluate(() => window.App.player.current));
await win.evaluate(() => window.App.player.stop());

step('pair with duplicates');
const pr = await win.evaluate(() => {
  const P = window.App;
  const fr = P.project.groups[0].frames;
  const f = fr[262];
  const pair = P.project.pairs[0];
  pair.pairs.push({ characterId: f.characterId, front: 1, offsetX: 30, offsetY: 0, size: 90 });
  pair.pairs.push({ characterId: fr[300].characterId, front: 0, offsetX: 10, offsetY: 5, size: 80 });
  P.player.setProject(P.project);
  const sc = window.PlayerUtil.sceneCharacters(P.project, fr, 262, {});
  return sc.map((x) => [x.character.name, x.slot, x.isMain]);
});
console.log(JSON.stringify(pr));
await win.evaluate(() => { window.App.player.showStill(262); });
await win.waitForTimeout(900);
await shot('pair-dup');
// выбрать кадр 262 в редакторе, скрин инспектора
await win.evaluate(() => window.App.select(262));
await win.waitForTimeout(600);
await page('inspector-pair');
step('pair editor');
await win.evaluate(() => { [...document.querySelectorAll('#inspector button')].find((b) => b.textContent.includes('Настроить эту пару')).click(); });
await win.waitForTimeout(1200);
await page('pair-editor');
await closeModals();

step('multi-select');
const ms = await win.evaluate(async () => {
  const cards = [...document.querySelectorAll('.frame')];
  const n0 = window.App.project.groups[0].frames.length;
  cards[1].querySelector('.thumb').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  cards[3].querySelector('.thumb').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  const sel = window.App.multi.size;
  const bar = document.querySelector('#selBar').textContent;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
  const n1 = window.App.project.groups[0].frames.length;
  return { sel, bar, n0, n1 };
});
console.log(JSON.stringify(ms));
await page('multi');
await win.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })));

step('evidence + popup');
const ev = await win.evaluate(async () => {
  const L = window.Assets.Lib;
  const bg = L.list('backgrounds').find((b) => !b.isPreset) || L.list('backgrounds')[0];
  const a = await L.upsert('evidence', { id: 990001, name: 'Тест улика', url: bg.url, source: 'custom' });
  const pop = await L.upsert('popups', { id: 990002, name: 'Тест картинка', url: bg.url, resize: 30, posX: 5, posY: 5, center: false, source: 'custom' });
  const fr = window.App.project.groups[0].frames;
  fr[5].text = '[#evdi990001]Улика значком. [#p300]Дальше.';
  fr[6].text = '[#evd990001]Улика на весь экран';
  fr[7].text = '[#evdh]Без улики';
  fr[7].popupId = 990002;
  fr[8].actions = [...(fr[8].actions || []), { actionId: 7, actionParam: '1' }];
  window.App.player.setProject(window.App.project);
  return [a.url, pop.url];
});
console.log(JSON.stringify(ev));
for (const i of [5, 6, 7]) { await win.evaluate((i) => window.App.player.showStill(i), i); await win.waitForTimeout(900); await shot('ev-' + i); }
await win.evaluate(() => window.App.play(8));
await win.waitForTimeout(1500);
await shot('popup-wt');
await win.evaluate(() => window.App.player.stop());

step('library textbox editor');
await win.evaluate(() => document.getElementById('btnLibrary').click());
await win.waitForTimeout(800);
await win.evaluate(() => { [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('Текстбоксы')).click(); });
await win.waitForTimeout(500);
await win.evaluate(() => { const c = [...document.querySelectorAll('.lib-list .card')].find((x) => !x.textContent.includes('стандарт')); (c || document.querySelector('.lib-list .card')).click(); });
await win.waitForTimeout(1500);
await page('lib-textbox');
await win.evaluate(() => { [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('Персонажи')).click(); });
await win.waitForTimeout(500);
await win.evaluate(() => { const cards = [...document.querySelectorAll('.lib-list .card')].filter((c) => !c.textContent.includes('стандарт')); cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); cards[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); });
await win.waitForTimeout(300);
await page('lib-bulk');
await closeModals();

step('export');
await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/v5-export.mp4' }); });
const ex = await win.evaluate(async () => {
  const P = window.App;
  const t0 = performance.now();
  const r = await window.Exporter.exportVideo(P.player, P.audio, { from: 184, to: 196, height: 480, fps: 30, quality: 'small', suggestedName: 'x', onProgress: () => {}, onPreview: () => {} });
  return { r, ms: performance.now() - t0 };
});
console.log(JSON.stringify(ex));
console.log('size', fs.statSync('/tmp/v5-export.mp4').size);

step('export abort');
await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/v5-abort.mp4' }); });
await win.evaluate(() => {
  window.__ctl = new AbortController();
  window.__abortRes = 'pending';
  window.Exporter.exportVideo(window.App.player, window.App.audio, { from: 0, to: 120, height: 720, fps: 30, signal: window.__ctl.signal, onProgress: (p) => { window.__prog = p.text; } })
    .then((r) => { window.__abortRes = r; }, (e) => { window.__abortRes = 'err ' + e.message; });
});
await win.waitForTimeout(9000);
console.log('progress before abort:', await win.evaluate(() => window.__prog));
const tA = Date.now();
await win.evaluate(() => window.__ctl.abort());
for (let k = 0; k < 40; k++) { const r = await win.evaluate(() => window.__abortRes); if (r !== 'pending') { console.log('abort result', r, 'after', Date.now() - tA, 'ms'); break; } await win.waitForTimeout(250); }
console.log('file exists after abort:', fs.existsSync('/tmp/v5-abort.mp4'));
console.log('ui alive:', await win.evaluate(() => 1 + 1));

step('export watch mode');
await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/v5-watch.mp4' }); });
const wx = await win.evaluate(async () => {
  const P = window.App;
  let previews = 0;
  const t0 = performance.now();
  const r = await window.Exporter.exportVideo(P.player, P.audio, { from: 2, to: 6, height: 360, fps: 30, watch: true, onProgress: () => {}, onPreview: () => { previews++; } });
  return { r, previews, ms: performance.now() - t0 };
});
console.log(JSON.stringify(wx));

console.log(logs.slice(0, 40).join('\n'));
const proc = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
await new Promise((r) => setTimeout(r, 1500)); proc.kill('SIGKILL'); process.exit(0);
