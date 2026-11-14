import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out12';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
await win.waitForTimeout(2500);
const closeModals = () => win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await closeModals();
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await closeModals();
const R = {};
// 1. цвет вокруг тегов
R.color = await win.evaluate(() => {
  const ta = document.createElement('textarea'); document.body.append(ta);
  ta.value = 'Однажды[#p300] пиво'; const f = { text: ta.value };
  ta.setSelectionRange(0, ta.value.length);
  window.App._t.wrapColor(ta, f, 'g');
  const wrapped = f.text;
  const toks = window.Tags.parseText(wrapped).map((t) => t.type + ':' + (t.text || t.value || '') + ':' + (t.color || ''));
  ta.setSelectionRange(0, ta.value.length);
  window.App._t.wrapColor(ta, f, null);
  ta.remove();
  return { wrapped, toks, removed: f.text };
});
// 13. копирование/вставка/перемещение кадров
R.frames = await win.evaluate(() => {
  const A = window.App, fr = () => A.project.groups[0].frames;
  const n0 = fr().length;
  const t3 = fr()[3].text;
  A._t.copyFrames(false, 3);
  const lite = JSON.stringify(A.clip[0]);
  A._t.pasteFrames(1);
  const pasted = fr()[1];
  const n1 = fr().length;
  const id5 = fr()[5].text;
  A._t.moveFramesTo([5], 0);
  const moved = fr()[0].text === id5;
  A._t.copyFrames(true, 2);
  A._t.pasteFrames(0);
  const full = fr()[0].text === fr()[3].text;
  return { n0, n1, liteKeys: Object.keys(JSON.parse(lite)), pastedText: pasted.text || '', moved, full, t3: t3.slice(0, 20) };
});
// 14. своя заставка в списке
R.intro = await win.evaluate(async () => {
  const L = window.Assets.Lib;
  const p = await L.upsert('popups', { name: 'Тест-заставка', url: 'System/Images/Popups/testimony.gif', introDuration: 1600, introSound: 'System/Audio/testimony-start.wav' });
  window.App.sel = 3; window.App.select && window.App.select(3);
  await new Promise((r) => setTimeout(r, 300));
  const opts = [...document.querySelectorAll('#inspector option')].map((o) => o.value).filter((v) => v.startsWith('c'));
  return { id: p.id, hasOption: opts.includes('c' + p.id), editBtn: !!document.querySelector('#inspector .picker-line .btn') };
});
// воспроизводим кадр с заставкой
await win.evaluate(async (id) => {
  const A = window.App; const f = A.project.groups[0].frames[3];
  f.actions = (f.actions || []).filter((a) => a.actionId !== 7); f.actions.push({ actionId: 7, actionParam: 'c' + id });
  A.player.setProject(A.project);
  A.player.playFrom(3, {});
}, R.intro.id);
for (const ms of [400, 900, 1500, 2500]) { await win.waitForTimeout(ms === 400 ? 400 : 500); await win.locator('#stage canvas').screenshot({ path: OUT + '/intro' + ms + '.png' }); }
await win.evaluate(() => window.App.player.stop());
// 19/20 — окно выбора: избранное, метки, сортировка, список
R.picker = await win.evaluate(async () => {
  const L = window.Assets.Lib, M = window.Assets.Marks;
  const bgs = L.list('backgrounds');
  const last = bgs[bgs.length - 1];
  await M.toggleFav('backgrounds', last.id);
  await M.setTags('backgrounds', last.id, ['Суд', 'Любимое']);
  await M.setTags('backgrounds', bgs[0].id, ['Суд']);
  const pr = window.UI.pickerDialog({ title: 'Фон', type: 'backgrounds', items: bgs.map((b) => ({ id: b.id, name: b.name, thumb: { url: b.url, kind: 'bg' } })) });
  await new Promise((r) => setTimeout(r, 300));
  const first = document.querySelector('.modal-wrap .grid .card .cap').textContent;
  const side = [...document.querySelectorAll('.modal-wrap .pick-side .folder')].map((e) => e.textContent);
  [...document.querySelectorAll('.modal-wrap .pick-side .folder')].find((e) => e.textContent.includes('Суд')).click();
  await new Promise((r) => setTimeout(r, 200));
  const inTag = document.querySelectorAll('.modal-wrap .grid .card').length;
  const sel = document.querySelector('.modal-wrap .pick-main select'); sel.value = 'big'; sel.dispatchEvent(new Event('change'));
  [...document.querySelectorAll('.modal-wrap .pick-side .folder')][0].click();
  await new Promise((r) => setTimeout(r, 500));
  [...document.querySelectorAll('.modal-wrap .pick-main .btn')].find((b) => b.textContent.includes('Список')).click();
  await new Promise((r) => setTimeout(r, 2500));
  const list = document.querySelector('.modal-wrap .grid').className;
  const sizeShown = document.querySelector('.modal-wrap .grid .card .tag')?.textContent || '';
  return { first, favName: last.name, side, inTag, list, sizeShown, marks: L.data.marks.backgrounds };
});
await win.screenshot({ path: OUT + '/picker.png' });
await closeModals();
await win.evaluate(() => { localStorage.removeItem('oo.pick.view'); localStorage.removeItem('oo.pick.sort'); localStorage.removeItem('oo.pick.cat.backgrounds'); });
// 15/16 — 9:16 кадр экспорта, края
R.portrait = await win.evaluate(async () => {
  const A = window.App; A.project.options.aspectRatio = '9:16'; A.player.setProject(A.project);
  await A.player.showStill(3);
  await new Promise((r) => setTimeout(r, 900));
  const c = document.querySelector('#stage canvas');
  return { w: c.width, h: c.height };
});
await win.locator('#stage canvas').screenshot({ path: OUT + '/portrait.png' });
// разрешения экспорта
R.sizes = await win.evaluate(async () => {
  const E = window.Exporter; const out = {};
  for (const hgt of [144, 240, 360, 2160, 4320]) {
    const s = E.sizeFor(hgt, 16 / 9);
    let ok = null;
    for (const codec of (s.w * s.h > 4096 * 2304 ? ['avc1.64003C', 'avc1.64003D', 'avc1.64003E', 'vp09.00.61.08'] : ['avc1.640033', 'avc1.42e01f'])) {
      try { const r = await VideoEncoder.isConfigSupported({ codec, width: s.w, height: s.h, bitrate: E.bitrateFor(s.w, s.h, 30, 'medium'), framerate: 30 }); if (r.supported) { ok = codec; break; } } catch (e) { /* */ }
    }
    out[hgt] = { ...s, mbps: +(E.bitrateFor(s.w, s.h, 30, 'medium') / 1e6).toFixed(2), codec: ok };
  }
  return out;
});
fs.writeFileSync(OUT + '/r.json', JSON.stringify({ R, logs }, null, 1));
console.log(JSON.stringify({ R, logs }, null, 1));
await app.close();
