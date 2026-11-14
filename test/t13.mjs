import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out13';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
const close = () => win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await close();
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await close();
const R = {};
// фейды: смена состава сбрасывает затемнение; «только на этот кадр»
console.error('STEP fades');
R.fades = await win.evaluate(async () => {
  const A = window.App; const P = A.player;
  const mk = (c, p, fade) => ({ id: Math.floor(Math.random() * 1e9), text: 'x', characterId: c, poseId: p, actions: [], fade });
  const saved = A.project.groups[0].frames;
  const out = {};
  const test = async (frames, at) => { A.project.groups[0].frames = frames; P.setProject(A.project); await P.showStill(at); return P.state.charAlpha[2] ?? 1; };
  out.sameChar = await test([mk(1, 1, { type: 'fadeOut', target: 'characters', characters: 2, duration: 0 }), mk(1, 1)], 1);
  out.otherChar = await test([mk(1, 1, { type: 'fadeOut', target: 'characters', characters: 2, duration: 0 }), mk(2, 5)], 1);
  out.once = await test([mk(1, 1, { type: 'fadeOut', target: 'characters', characters: 2, duration: 0, onlyThisFrame: true }), mk(1, 1)], 1);
  A.project.options.strictCharacterFades = true;
  out.strictOther = await test([mk(1, 1, { type: 'fadeOut', target: 'characters', characters: 2, duration: 0 }), mk(2, 5)], 1);
  delete A.project.options.strictCharacterFades;
  // фильтр: плавное появление
  A.project.groups[0].frames = [mk(1, 1), Object.assign(mk(1, 1), { effect: { type: 'grayscale', amount: 100, target: 63, fadeInMs: 1000 } })];
  P.setProject(A.project);
  P.playFrom(0, {});
  const ks = [];
  const t0 = performance.now();
  while (P.current !== 1 && performance.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 250)); ks.push(+(P.state.filterK ?? -1).toFixed(2)); }
  P.stop();
  out.filterK = ks;
  A.project.groups[0].frames = saved; P.setProject(A.project);
  return out;
});
// бейджи всплывающих картинок
console.error('STEP badges');
R.badges = await win.evaluate(async () => {
  const A = window.App; const f = A.project.groups[0].frames[0];
  f.actions = [{ actionId: 7, actionParam: '1' }];
  const p = window.Assets.Lib.list('popups')[0]; if (p) f.popupId = p.id;
  A.refresh ? A.refresh() : null;
  window.App.select && window.App.select(0);
  await new Promise((r) => setTimeout(r, 300));
  return [...document.querySelectorAll('.frame[data-idx="0"] .badge')].map((b) => b.textContent);
});
// автометки
console.error('STEP tags');
R.autoTags = await win.evaluate(() => {
  const M = window.Assets.Marks, L = window.Assets.Lib;
  const c = L.list('characters').filter((x) => /\[/.test(x.name)).slice(0, 4).map((x) => [x.name, M.tags('characters', x.id)]);
  return { c, preset: M.tags('characters', 1), all: M.allTags('characters') };
});
// настройки проекта: пресеты, замена имён
await win.evaluate(() => { [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === 'Настройки проекта')?.click(); });
await win.waitForTimeout(600);
console.error('STEP settings');
R.settings = await win.evaluate(() => {
  const m = document.querySelector('.modal-wrap');
  const btns = [...m.querySelectorAll('button')].map((b) => b.textContent).filter((t) => /пресет|умолчани/i.test(t));
  [...m.querySelectorAll('button')].find((b) => b.textContent.includes('Замена')).click();
  const inp = [...m.querySelectorAll('#aliasSec input[list]')].pop();
  const dl = inp && document.getElementById(inp.getAttribute('list'));
  return { btns, aliasOptions: dl ? dl.options.length : -1, first: dl ? [...dl.options].slice(0, 5).map((o) => o.value) : [] };
});
await win.screenshot({ path: OUT + '/settings.png' });
await close();
// новые проекты: умолчания
R.defaults = await win.evaluate(async () => {
  const A = window.App;
  await window.api.lib.setPresets('optionsDefault', [{ name: 'default', options: { textSpeed: 50, autoplaySpeed: 900 } }]);
  (window.Assets.Lib.data.presets = window.Assets.Lib.data.presets || {}).optionsDefault = [{ name: 'default', options: { textSpeed: 50, autoplaySpeed: 900 } }];
  A.dirty = false;
  await A.newProject ? null : null;
  document.querySelectorAll('button').forEach(() => {});
  return 'ok';
});
// инспектор кадра с парой: фильтр по участникам
console.error('STEP insp');
R.inspector = await win.evaluate(async () => {
  const A = window.App; const fr = A.project.groups[0].frames;
  const idx = fr.findIndex((f) => f.pair);
  if (idx < 0) return 'no pair';
  fr[idx].effect = { type: 'sepia', amount: 100, target: 63 };
  A.select(idx);
  await new Promise((r) => setTimeout(r, 400));
  const sec = [...document.querySelectorAll('#inspector .section')].find((s) => /Фильтр/.test(s.textContent));
  return { idx, checks: sec ? [...sec.querySelectorAll('label.chk')].map((l) => l.textContent) : null };
});
await win.screenshot({ path: OUT + '/inspector-pair.png' });
// библиотека: музыка — длительность и плеер
await win.evaluate(() => { [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === 'Библиотека')?.click(); });
await win.waitForTimeout(800);
await win.evaluate(() => { [...document.querySelectorAll('.modal-wrap .tab, .modal-wrap button')].find((b) => /Музыка/.test(b.textContent))?.click(); });
await win.waitForTimeout(2500);
console.error('STEP music');
R.music = await win.evaluate(async () => {
  const tags = [...document.querySelectorAll('.modal-wrap .grid .card .tag')].slice(0, 3).map((t) => t.textContent);
  document.querySelector('.modal-wrap .grid .card')?.click();
  await new Promise((r) => setTimeout(r, 1500));
  const pl = document.querySelector('.modal-wrap .audio-player');
  return { tags, player: !!pl, time: pl && pl.textContent };
});
await win.screenshot({ path: OUT + '/library-music.png' });
await close();
await win.evaluate(() => window.api.lib.setPresets('optionsDefault', []));
console.log(JSON.stringify(R, null, 1), logs);
await app.close();
