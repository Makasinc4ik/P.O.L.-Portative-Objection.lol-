import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out14';
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const R = {};
R.tags = await win.evaluate(() => {
  const M = window.Assets.Marks, L = window.Assets.Lib;
  const og = L.get; const fake = (name) => { L.get = () => ({ id: 1, name }); try { return M.autoTags('characters', 1); } finally { L.get = og; } };
  return { pwt: fake('Phoenix [PWT]'), two: fake('X [PW][AJ]'), slash: fake('Y [PW/AJ]'), webp: fake('Z [WEBP AAI]'), paren: fake('Edgeworth (GAA)') };
});
// окно выбора персонажа: роли и сочетание
R.picker = await win.evaluate(async () => {
  const L = window.Assets.Lib;
  localStorage.removeItem('oo.pick.cat.characters');
  const items = L.list('characters').map((c) => ({ id: c.id, name: c.name }));
  window.UI.pickerDialog({ title: 'Персонаж', type: 'characters', items });
  await new Promise((r) => setTimeout(r, 300));
  const side = [...document.querySelectorAll('.modal-wrap .pick-side .folder')];
  const role = side.find((e) => /Свидетель/.test(e.textContent));
  const tag = side.find((e) => /AJ Trilogy|Trilogy/.test(e.textContent));
  role.click(); await new Promise((r) => setTimeout(r, 150));
  const nRole = document.querySelectorAll('.modal-wrap .grid .card').length;
  tag.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true })); await new Promise((r) => setTimeout(r, 150));
  const nBoth = document.querySelectorAll('.modal-wrap .grid .card').length;
  const on = [...document.querySelectorAll('.modal-wrap .pick-side .folder.on')].map((e) => e.querySelector('.fn').textContent);
  return { nRole, nBoth, on, tag: tag.querySelector('.fn').textContent, cap: document.querySelector('.modal-wrap .grid .card .tag')?.textContent };
});
await win.screenshot({ path: OUT + '/picker-roles.png' });
for (let i = 0; i < 2; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
// библиотека: улики — редактор, роль-фильтр
await win.evaluate(() => { [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === 'Библиотека')?.click(); });
await win.waitForTimeout(1200);
R.lib = await win.evaluate(async () => {
  const sels = [...document.querySelectorAll('.modal-wrap select')];
  const roleSel = sels.find((s) => [...s.options].some((o) => o.textContent === 'Все роли'));
  roleSel.value = 'prosecution'; roleSel.dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 400));
  const caps = [...document.querySelectorAll('.modal-wrap .grid .card .tag')].slice(0, 3).map((t) => t.textContent);
  [...document.querySelectorAll('.modal-wrap .tabs button')].find((b) => /Улики/.test(b.textContent))?.click();
  await new Promise((r) => setTimeout(r, 400));
  [...document.querySelectorAll('.modal-wrap button')].find((b) => /Добавить/.test(b.textContent))?.click();
  await new Promise((r) => setTimeout(r, 400));
  const labels = [...document.querySelectorAll('.modal-wrap .field label')].map((l) => l.textContent).filter((t) => /рамка|звук/i.test(t));
  return { caps, roleVisible: roleSel.style.display, labels };
});
await win.screenshot({ path: OUT + '/lib-evidence.png' });
for (let i = 0; i < 2; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
// настройки: индикатор умолчаний
await win.evaluate(() => { [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === 'Настройки проекта')?.click(); });
await win.waitForTimeout(500);
R.def = await win.evaluate(async () => {
  const m = document.querySelector('.modal-wrap');
  const btn = () => [...m.querySelectorAll('button')].find((b) => /умолчани/i.test(b.textContent) && !/Сбросить/.test(b.textContent));
  const before = btn().textContent;
  btn().click(); await new Promise((r) => setTimeout(r, 300));
  const after = btn().textContent;
  const inp = [...m.querySelectorAll('input[type=number]')][0]; inp.value = String(Number(inp.value) + 1); inp.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  const changed = btn().textContent;
  return { before, after, changed, flash: !!m.querySelector('input[type=color]') };
});
for (let i = 0; i < 2; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
await win.evaluate(() => window.api.lib.setPresets('optionsDefault', []));
console.log(JSON.stringify(R, null, 1), logs);
await app.close();
