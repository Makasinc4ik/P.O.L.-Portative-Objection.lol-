// Багтрек 7: виньетка, зерно, размытия, резкость; музыка bgmfo → bgmfi; копия пары; кнопки языка и «?» в шапке
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out26';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library', OO_TUTORIALS_URL: process.env.OO_TUTORIALS_URL || 'http://127.0.0.1:1/none' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
const close = () => win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await close();
await win.evaluate(() => { window.App.dirty = false; });
const mc = fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8');
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), mc);
await win.waitForTimeout(800);
await close();
const R = await win.evaluate(async () => {
  const A = window.App; const P = A.player;
  const orig = A.project.groups[0].frames;
  const base = JSON.parse(JSON.stringify(orig[2]));
  const cv = P.g.canvas;
  const pts = [[0.02, 0.04], [0.5, 0.5], [0.98, 0.96], [0.25, 0.3]];
  const shot = async (patch, t) => {
    const f = Object.assign(JSON.parse(JSON.stringify(base)), patch);
    A.project.groups[0].frames = [f]; P.setProject(A.project); await P.showStill(0);
    await new Promise((r) => setTimeout(r, 60));
    P.draw(t ?? P.now());
    const d = P.g.getImageData(0, 0, cv.width, cv.height).data; let hsh = 0; for (let i = 0; i < d.length; i += 97) hsh = (hsh * 31 + d[i]) >>> 0;
    const px = pts.map(([x, y]) => { const i = (Math.round(cv.height * y) * cv.width + Math.round(cv.width * x)) * 4; return [d[i], d[i + 1], d[i + 2]]; });
    return { px, hash: hsh, sig: P.frameSig(t ?? P.now()) };
  };
  const out = {};
  const e = (type, extra = {}) => ({ effect: { type, target: 63, ...extra } });
  out.none = await shot({ effect: null });
  out.vig = await shot(e('vignette', { amount: 100, color: '#000000' }));
  out.grainA = await shot(e('grain', { amount: 60 }), 1000);
  out.grainB = await shot(e('grain', { amount: 60 }), 1100);
  out.blur = await shot(e('blur', { amount: 8 }));
  out.radial = await shot(e('blur-radial', { amount: 80 }));
  out.edges = await shot(e('blur-edges', { amount: 100 }));
  out.sharp = await shot(e('sharpen', { amount: 100 }));
  out.combo = await shot({ effect: { type: 'grayscale', amount: 100, target: 63 }, extraEffects: [{ type: 'vignette', amount: 70, target: 1 }, { type: 'grain', amount: 30, target: 63 }, { type: 'sharpen', amount: 40, target: 62 }] });
  A.project.groups[0].frames = orig; P.setProject(A.project);
  return out;
});
const sum = (p) => p[0] + p[1] + p[2];
const diff = (a, b) => a.px.some((p, i) => p.some((v, j) => Math.abs(v - b.px[i][j]) > 3));
const C = {
  vigCornerDarker: sum(R.vig.px[0]) < sum(R.none.px[0]) - 30 && sum(R.vig.px[2]) <= sum(R.none.px[2]),
  vigCenterSame: R.vig.px[1].every((v, j) => Math.abs(v - R.none.px[1][j]) <= 6),
  grainChanges: diff(R.grainA, R.none),
  grainAnimated: R.grainA.hash !== R.grainB.hash && R.grainA.sig !== R.grainB.sig,
  blurChanges: R.blur.hash !== R.none.hash,
  radialChanges: R.radial.hash !== R.none.hash,
  edgesChanges: R.edges.hash !== R.none.hash,
  edgesCenterSame: R.edges.px[1].every((v, j) => Math.abs(v - R.none.px[1][j]) <= 8),
  sharpChanges: R.sharp.hash !== R.none.hash,
  comboOk: R.combo.hash !== R.none.hash,
};
// музыка: [#bgmfo] затем [#bgmfi] — та же дорожка снова со звуком
const M = await win.evaluate(async () => {
  const au = window.App.audio;
  const mus = window.Assets.Lib.list('music')[0];
  if (!mus) return 'нет музыки';
  await au.playMusic(mus);
  const m0 = au.music;
  au.fadeOutMusic(200);
  await new Promise((r) => setTimeout(r, 450));
  const afterOut = { same: au.music === m0, gain: +m0.gain.gain.value.toFixed(3) };
  au.fadeInMusic(200);
  await new Promise((r) => setTimeout(r, 450));
  const afterIn = { same: au.music === m0, gain: +au.music.gain.gain.value.toFixed(3), vol: +m0.vol.toFixed(3) };
  au.stopMusic();
  return { afterOut, afterIn };
});
// то же в экспорте: сведение дорожки (громкость после fi снова как была)
const X = await win.evaluate(async () => {
  const src = window.Exporter && window.Exporter.toString ? 'есть' : 'нет';
  return src;
});
// копия пары
const PR = await win.evaluate(() => {
  const A = window.App;
  const fr = A.project.groups[0].frames.findIndex((f) => f.pair);
  return { frameWithPair: fr, pairs: (A.project.pairs || []).map((p) => p.name) };
});
let pairRes = null;
if (PR.frameWithPair >= 0) {
  await win.evaluate((i) => { window.App.select(i); }, PR.frameWithPair);
  await win.waitForTimeout(400);
  const btn = win.locator('button', { hasText: '⧉ Копия пары для этого кадра' });
  if (await btn.count()) {
    await btn.scrollIntoViewIfNeeded(); await btn.click(); await win.waitForTimeout(600);
    await win.screenshot({ path: OUT + '/pair-copy.png' });
    await close();
    pairRes = await win.evaluate((i) => { const A = window.App; const f = A.project.groups[0].frames[i]; const p = A.project.pairs.find((x) => x.id === f.pair.id); return { frame: f.pair.id, name: p && p.name, count: A.project.pairs.length, sameMembers: p && JSON.stringify(p.pairs) }; }, PR.frameWithPair);
  } else pairRes = 'кнопки нет';
}
// шапка: язык и «?»
const HD = await win.evaluate(() => ({ lang: document.getElementById('btnLang')?.textContent, help: document.getElementById('btnHelp')?.textContent, inMenu: !!document.querySelector('#fileMenu [data-act="lang"]'), order: [...document.querySelectorAll('#topbar .actions button')].map((b) => b.id) }));
await win.locator('#btnHelp').click(); await win.waitForTimeout(1500);
HD.helpText = await win.evaluate(() => document.querySelector('.modal-body')?.textContent);
await win.screenshot({ path: OUT + '/help.png' });
await close();
await win.screenshot({ path: OUT + '/header.png', clip: { x: 0, y: 0, width: 1500, height: 60 } });
console.log(JSON.stringify({ C, M, PR, pairRes, HD }, null, 1));
console.log(logs.join('\n'));
await win.evaluate(() => { window.App.dirty = false; });
await app.close();
