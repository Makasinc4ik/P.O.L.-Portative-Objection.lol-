// Багтрек 8: найти и заменить, ▶ в окне выбора музыки, картинка «на весь кадр», персонаж после закрытия картинки
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out26';
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
const close = () => win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await close();
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800); await close();
const R = {};
// подготовка: тексты с дефисами и тегом с дефисом
await win.evaluate(() => { const fr = window.App.project.groups[0].frames; fr[0].text = 'Раз - два - три [#ss.500.default]'; fr[1].text = 'Ещё - один'; fr[2].text = 'без'; window.App.select(0); });
await win.waitForTimeout(300);
await win.keyboard.press('Control+h');
await win.waitForTimeout(300);
R.panel = await win.evaluate(() => !!document.querySelector('.find-panel'));
const inputs = win.locator('.find-panel input.input');
await inputs.nth(0).fill(' - ');
await inputs.nth(1).fill(' — ');
await win.waitForTimeout(200);
R.count = await win.evaluate(() => document.querySelector('.find-info').textContent);
await inputs.nth(0).press('Enter');
await win.waitForTimeout(300);
R.sel = await win.evaluate(() => { const ta = document.activeElement; return { sel: window.App.sel }; });
await win.screenshot({ path: OUT + '/find.png' });
await win.locator('.find-panel button', { hasText: 'Заменить все' }).click();
await win.waitForTimeout(300);
R.after = await win.evaluate(() => window.App.project.groups[0].frames.slice(0, 3).map((f) => f.text));
R.info = await win.evaluate(() => document.querySelector('.find-info').textContent);
await win.keyboard.press('Escape');
await win.keyboard.press('Control+z');
await win.waitForTimeout(300);
R.undo = await win.evaluate(() => window.App.project.groups[0].frames.slice(0, 2).map((f) => f.text));
await win.evaluate(() => { document.querySelector('.find-panel')?.remove(); });
// ▶ в окне выбора музыки
await win.evaluate(() => { window.__pick = window.App.pickAudio ? 1 : 0; });
const hasPick = await win.evaluate(() => typeof window.App.openPicker);
// картинка «на весь кадр» в 9:16
R.fill = await win.evaluate(async () => {
  const A = window.App; const P = A.player; const { Lib } = window.Assets;
  const pp = await Lib.upsert('popups', { name: 'Оверлей 9:16', url: 'System/Images/Popups/testimony.gif', resize: 29, center: true });
  const base = JSON.parse(JSON.stringify(A.project.groups[0].frames[2]));
  const orig = A.project.groups[0].frames; const ar = A.project.options.aspectRatio;
  A.project.options.aspectRatio = '9:16'; P.setProject(A.project); P.setSize && P.setSize(405, 720);
  const shot = async () => { A.project.groups[0].frames = [Object.assign(JSON.parse(JSON.stringify(base)), { popupId: pp.id })]; P.setProject(A.project); await P.showStill(0); await new Promise((r) => setTimeout(r, 100)); P.draw(P.now()); const c = P.g.canvas; const d = P.g.getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 101) h = (h * 31 + d[i]) >>> 0; return { w: c.width, h: c.height, hash: h }; };
  const a = await shot();
  await Lib.upsert('popups', { ...Lib.get('popups', pp.id), fill: true });
  const b = await shot();
  await Lib.remove('popups', pp.id);
  A.project.groups[0].frames = orig; A.project.options.aspectRatio = ar; P.setProject(A.project);
  return { differs: a.hash !== b.hash, size: [a.w, a.h] };
});
// персонаж: закрытая картинка восстанавливается
R.heal = await win.evaluate(async () => {
  const A = window.App; const P = A.player;
  A.select(2); await new Promise((r) => setTimeout(r, 800));
  const ch = P.state.chars[0];
  if (!ch) return 'нет персонажа';
  ch.idle.close(); ch.speak.close();
  P.draw(P.now());
  await new Promise((r) => setTimeout(r, 1200));
  P.draw(P.now());
  const ch2 = P.state.chars[0];
  return { restored: window.Assets.ImageCache.alive(ch2.idle), w: ch2.idle.frames[0].bmp.width };
});
console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await win.evaluate(() => { window.App.dirty = false; });
await app.close();
