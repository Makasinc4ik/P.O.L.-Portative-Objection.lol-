// Несколько фильтров, контраст/насыщенность, «Сепия + негатив», цветное наложение, режим наложения картинки
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out24';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
const close = () => win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await close();
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await close();
const R = await win.evaluate(async () => {
  const A = window.App; const P = A.player;
  const base = JSON.parse(JSON.stringify(A.project.groups[0].frames[2]));
  const cv = P.g.canvas;
  const px = (x, y) => [...P.g.getImageData(Math.round(cv.width * x), Math.round(cv.height * y), 1, 1).data].slice(0, 3);
  const pts = [[0.03, 0.05], [0.5, 0.45], [0.97, 0.3], [0.2, 0.9]];
  const shot = async (patch) => {
    const f = Object.assign(JSON.parse(JSON.stringify(base)), patch);
    A.project.groups[0].frames = [f]; P.setProject(A.project); await P.showStill(0);
    await new Promise((r) => setTimeout(r, 60));
    P.draw(P.now());
    const d = P.g.getImageData(0, 0, cv.width, cv.height).data; let hsh = 0; for (let i = 0; i < d.length; i += 97) hsh = (hsh * 31 + d[i]) >>> 0;
    return { px: pts.map(([x, y]) => px(x, y)), hash: hsh, pp: P.state.popup ? !!P.state.popup.img : null, st: P.state.filter && P.state.filter.sig };
  };
  const out = {};
  out.none = await shot({ effect: null });
  out.gray = await shot({ effect: { type: 'grayscale', amount: 100, target: 63 } });
  out.grayContrast = await shot({ effect: { type: 'grayscale', amount: 100, target: 63 }, extraEffects: [{ type: 'contrast', amount: 200, target: 63 }] });
  out.sepInv1 = await shot({ effect: { type: 'sepia-invert', amount: 100, target: 63 } });
  out.sepInv2 = await shot({ effect: { type: 'sepia', amount: 100, target: 63 }, extraEffects: [{ type: 'invert', amount: 100, target: 63 }] });
  out.sat0 = await shot({ effect: { type: 'saturate', amount: 0, target: 63 } });
  out.tintBg = await shot({ effect: { type: 'tint', amount: 100, color: '#ff0000', blend: 'multiply', target: 1 } });
  out.tintChars = await shot({ effect: { type: 'tint', amount: 100, color: '#ff0000', blend: 'multiply', target: 62 } });
  out.tintPlusGray = await shot({ effect: { type: 'grayscale', amount: 100, target: 63 }, extraEffects: [{ type: 'tint', amount: 60, color: '#3366ff', blend: 'color', target: 63 }] });
  const pp = window.Assets.Lib.list('popups')[0];
  if (pp) { out.popupNormal = await shot({ popupId: pp.id }); out.popupDiff = await shot({ popupId: pp.id, popupFx: { blend: 'difference' } }); }
  // плавное появление набора фильтров
  A.project.groups[0].frames = [JSON.parse(JSON.stringify(base)), Object.assign(JSON.parse(JSON.stringify(base)), { effect: { type: 'sepia', amount: 100, target: 63, fadeInMs: 800 }, extraEffects: [{ type: 'contrast', amount: 160, target: 63 }] })];
  P.setProject(A.project);
  P.playFrom(0, {});
  const t0 = performance.now();
  while (P.current !== 1 && performance.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 20));
  const ks = [];
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 220)); ks.push(+(P.state.filterK ?? -1).toFixed(2)); }
  P.stop();
  out.fadeK = ks;
  // редактор: список фильтров
  A.project.groups[0].frames = [JSON.parse(JSON.stringify(base))];
  P.setProject(A.project);
  A.refresh && A.refresh();
  return out;
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isGray = (p) => Math.max(...p) - Math.min(...p) <= 2;
const C = {
  grayIsGray: R.gray.px.every(isGray),
  grayContrastGray: R.grayContrast.px.every(isGray),
  contrastChanges: !same(R.gray.px, R.grayContrast.px),
  sepInvEqual: R.sepInv1.px.every((p, i) => p.every((v, j) => Math.abs(v - R.sepInv2.px[i][j]) <= 2)),
  sat0Gray: R.sat0.px.every(isGray),
  tintBgCornerRed: R.tintBg.px[0][1] <= R.none.px[0][1] && R.tintBg.px[0][2] <= R.none.px[0][2] && !same(R.tintBg.px[0], R.none.px[0]),
  tintCharsCornerSame: same(R.tintChars.px[0], R.none.px[0]),
  popupDiffers: R.popupNormal ? [R.popupNormal.hash !== R.popupDiff.hash, R.popupNormal.hash !== R.none.hash, R.popupNormal.pp] : 'no popup',
};
// UI
await win.locator('.frame').first().click().catch(() => {});
await win.waitForTimeout(400);
const addBtn = win.locator('button', { hasText: '＋ Добавить фильтр' });
await addBtn.scrollIntoViewIfNeeded();
await addBtn.click(); await win.waitForTimeout(300);
await win.locator('button', { hasText: '＋ Ещё фильтр' }).click(); await win.waitForTimeout(300);
await win.locator('.eff-item select').nth(1).selectOption('tint'); await win.waitForTimeout(300);
const ui = await win.evaluate(() => { const f = window.App.project.groups[0].frames[0]; return { effect: f.effect, extra: f.extraEffects, items: document.querySelectorAll('.eff-item').length, badge: [...document.querySelectorAll('.frame[data-idx="0"] .badge')].map((b) => b.textContent) }; });
await win.locator('.eff-item').first().scrollIntoViewIfNeeded();
await win.screenshot({ path: OUT + '/filters.png' });
// убрать первый — второй становится основным
await win.locator('.eff-item').first().locator('button', { hasText: '✕' }).click(); await win.waitForTimeout(300);
ui.afterRemove = await win.evaluate(() => { const f = window.App.project.groups[0].frames[0]; return { effect: f.effect, extra: f.extraEffects }; });

console.log(JSON.stringify({ C, ui, fadeK: R.fadeK, sample: { none: R.none.px, tintBg: R.tintBg.px, tintPlusGray: R.tintPlusGray.px } }, null, 1));
console.log(logs.join('\n'));
await win.evaluate(() => { window.App.dirty = false; });
await app.close();
