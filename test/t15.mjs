import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out15';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const R = {};
const esc = async (n = 2) => { for (let i = 0; i < n; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); } };

// картинки текстбоксов: вертикальный 1080×1920, горизонтальный «на оба формата» (рисунок только в середине) и обычный
await win.evaluate(() => {
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); return c.toDataURL('image/png'); };
  window.__tb = {
    vert: mk(1080, 1920, (g, w, h) => { g.fillStyle = 'rgba(20,20,80,.85)'; g.fillRect(40, h * 0.72, w - 80, h * 0.2); }),
    vplate: mk(1080, 1920, (g, w, h) => { g.fillStyle = '#a02050'; g.fillRect(40, h * 0.68, 360, h * 0.04); }),
    dual: mk(1920, 1080, (g, w, h) => { const cw = h * 9 / 16; g.fillStyle = 'rgba(80,20,20,.85)'; g.fillRect((w - cw) / 2 + 10, h * 0.7, cw - 20, h * 0.25); }),
    wide: mk(1920, 1080, (g, w, h) => { g.fillStyle = 'rgba(20,80,20,.85)'; g.fillRect(20, h * 0.7, w - 40, h * 0.27); }),
  };
});

R.geo = await win.evaluate(async () => {
  const out = {};
  const style = (url, plate) => ({ id: 'x', name: 't', url, imageOpacity: 1, opacity: 1, nameplate: { url: plate || '', top: 68, right: 70, width: 30, fontSize: 40 }, text: { fontSize: 40, left: 8, top: 10, width: 84, height: 3 }, nextButton: { top: 80, left: 90, iconSize: 3 } });
  for (const [name, url, plate] of [['vert', __tb.vert, __tb.vplate], ['dual', __tb.dual], ['wide', __tb.wide]]) {
    for (const [ar, W, H] of [['16:9', 1280, 720], ['9:16', 405, 720]]) {
      const cv = document.createElement('canvas');
      const pl = new window.Player(cv, App.audio);
      pl.project = { options: { aspectRatio: ar }, aliases: [], pairs: [], groups: [{ frames: [] }] };
      pl.frames = [];
      pl.setSize(W, H);
      pl.previewStyle = style(url, plate); pl.previewRev = 1;
      await pl.prepareTextbox();
      const r = pl.tbRect(); const g = pl.textGeometry();
      out[name + ' ' + ar] = { rx: Math.round(r.rx), rw: Math.round(r.rw), full: r.full, fs: +g.fs.toFixed(1), fsPctOfBox: +(g.fs / r.rw * 100).toFixed(2), x: Math.round(g.x), lift: Math.round(pl.textboxLift()) };
    }
  }
  return out;
});

// предпросмотр в плеере: вертикальный текстбокс в 9:16 и «двойной» в 9:16 — скриншоты
for (const [name, ar] of [['vert', '9:16'], ['dual', '9:16'], ['vert', '16:9']]) {
  await win.evaluate(async ({ name, ar }) => {
    document.querySelector('#__tbshot')?.remove();
    const cv = document.createElement('canvas'); cv.id = '__tbshot';
    Object.assign(cv.style, { position: 'fixed', left: '10px', top: '10px', zIndex: 9999, border: '2px solid red', background: '#555' });
    document.body.append(cv);
    const pl = new window.Player(cv, App.audio);
    pl.project = { options: { aspectRatio: ar }, aliases: [], pairs: [], groups: [{ frames: [] }] };
    pl.frames = [];
    const [W, H] = ar === '9:16' ? [405, 720] : [1280, 720];
    pl.setSize(W, H);
    pl.previewStyle = { id: 'x', name: 't', url: __tb[name], imageOpacity: 1, opacity: 1, nameplate: { url: name === 'vert' ? __tb.vplate : '', top: 68, right: 70, width: 30, fontSize: 40 }, text: { fontSize: 40, left: 8, top: 10, width: 84, height: 3 }, nextButton: { top: 80, left: 90, iconSize: 3 } };
    pl.previewRev = 2;
    await pl.prepareTextbox();
    const chars = [...'Проверка размера текста в текстбоксе, две строки.'].map((ch) => ({ ch, color: null }));
    pl.state.box = { visible: true, name: 'Феникс', chars, shown: chars.length, center: false, layout: null };
    pl.drawTextbox(0);
  }, { name, ar });
  await win.waitForTimeout(150);
  await win.screenshot({ path: `${OUT}/tb-${name}-${ar.replace(':', 'x')}.png` });
}
await win.evaluate(() => document.querySelector('#__tbshot')?.remove());

// редактор текстбокса: вертикальная картинка в горизонтальном проекте — предпросмотр в пропорциях картинки
R.editor = await win.evaluate(async () => {
  const a = window.LibraryUI.newTextbox('t1');
  a.url = __tb.vert; a.nameplate.url = __tb.vplate;
  const r = window.LibraryUI.textboxEditor(a, { audio: App.audio, aspectRatio: '16:9' });
  const m = window.UI.modal({ title: 'tb', wide: true, body: r.el });
  await new Promise((res) => setTimeout(res, 1200));
  const cv = r.el.querySelector('canvas');
  const cr = cv.getBoundingClientRect();
  const ta = r.el.querySelector('.tb-area.text').getBoundingClientRect();
  const sec = r.el.querySelector('details.tb-sec').getBoundingClientRect();
  return { canvas: [cv.width, cv.height], vertical: r.el.classList.contains('vertical'), cssRect: [Math.round(cr.width), Math.round(cr.height)], textInside: ta.left >= cr.left - 1 && ta.right <= cr.right + 1 && ta.top >= cr.top - 1 && ta.bottom <= cr.bottom + 1, controlsBeside: sec.left >= cr.right };
});
await win.screenshot({ path: OUT + '/editor-vert-in-16x9.png' });
await esc(1);

// флэш своего цвета в теге
R.flash = await win.evaluate(() => ['[#fmcFF0000]', '[#fl#00f]', '[#fs:00ff00]', '[#fm]', '[#fmzz]'].map((t) => JSON.stringify(window.Tags.parseText(t)[0] || null)));

// метки: !Trilogy!, HD не DS, удалённая автометка не возвращается
R.tags = await win.evaluate(async () => {
  const M = window.Assets.Marks, L = window.Assets.Lib;
  const og = L.get; const fake = (name, extra) => { L.get = () => ({ id: 1, name, ...extra }); try { return M.autoTags('characters', 1); } finally { L.get = og; } };
  return { trilogy: fake('Phoenix !Trilogy!'), hd: fake('Godot HD (custom)'), gba: fake('Maya [GBA-sized]') };
});
R.tagOff = await win.evaluate(async () => {
  const M = window.Assets.Marks, L = window.Assets.Lib;
  const c = L.list('characters').find((x) => M.autoTags('characters', x.id).length);
  if (!c) return 'нет персонажа с автометкой';
  const before = M.autoTags('characters', c.id);
  const tags = M.tagsOf ? M.tagsOf('characters', c.id) : null;
  await M.setTags('characters', c.id, (M.get('characters', c.id).tags || []).filter((t) => t !== before[0]), before.slice(1));
  const after = M.autoTags('characters', c.id);
  // вернуть как было
  const m = M.get('characters', c.id); m.off = []; await M.set('characters', c.id, m);
  return { name: c.name, before, after, tags };
});

// Ctrl+Z после удаления кадра (русская раскладка: key 'я', code 'KeyZ')
R.undoFrame = await win.evaluate(async () => {
  const n0 = App.project.groups.flatMap((g) => g.frames).length;
  return n0;
});
await win.evaluate(() => { const b = document.querySelector('#btnAddFrameTop'); b && b.click(); });
await win.waitForTimeout(300);
const n1 = await win.evaluate(() => App.project.groups.flatMap((g) => g.frames).length);
await win.evaluate(() => { document.querySelector('.frame textarea')?.focus(); [...document.querySelectorAll('.frame')][0].querySelector('button[title="Удалить кадр"]').click(); });
await win.waitForTimeout(400);
const n2 = await win.evaluate(() => App.project.groups.flatMap((g) => g.frames).length);
await win.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true })));
await win.waitForTimeout(400);
const n3 = await win.evaluate(() => App.project.groups.flatMap((g) => g.frames).length);
R.undoFrame = { before: R.undoFrame, added: n1, deleted: n2, undone: n3 };

// правый клик по тегу
R.rclick = await win.evaluate(async () => {
  const ta = document.querySelector('.frame textarea');
  ta.value = 'Привет [#fm] мир [#/r]красный[/#] конец';
  ta.dispatchEvent(new Event('input'));
  ta.focus();
  return true;
});
{
  const ta = win.locator('.frame textarea').first();
  // ставим курсор внутрь [#fm] и жмём правую кнопку на этом месте
  await win.evaluate(() => { const t = document.querySelector('.frame textarea'); t.setSelectionRange(9, 9); });
  await win.evaluate(() => { const t = document.querySelector('.frame textarea'); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  const s1 = await win.evaluate(() => { const t = document.querySelector('.frame textarea'); return t.value.slice(t.selectionStart, t.selectionEnd); });
  await win.evaluate(() => { const t = document.querySelector('.frame textarea'); t.setSelectionRange(19, 19); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  const s2 = await win.evaluate(() => { const t = document.querySelector('.frame textarea'); return t.value.slice(t.selectionStart, t.selectionEnd); });
  // настоящий правый клик мышью в начало текста (не тег) — выделение не меняется на тег
  const box = await ta.boundingBox();
  await win.mouse.click(box.x + 60, box.y + 12, { button: 'right' });
  await win.waitForTimeout(150);
  const s3 = await win.evaluate(() => { const t = document.querySelector('.frame textarea'); return [t.selectionStart, t.selectionEnd, t.value.slice(t.selectionStart, t.selectionEnd)]; });
  R.rclick = { inFlash: s1, inColor: s2, realClick: s3 };
}

// размер шрифта в списке кадров
R.font = await win.evaluate(async () => {
  document.querySelector('[data-menu="file"]').click();
  document.querySelector('[data-act="uifont"]').click();
  await new Promise((r) => setTimeout(r, 200));
  const num = document.querySelector('.modal-wrap input[type=number]');
  num.value = 20; num.dispatchEvent(new Event('change'));
  const fs1 = getComputedStyle(document.querySelector('.frame textarea')).fontSize;
  return { fs1, stored: localStorage.getItem('oo.frameFont') };
});
await win.screenshot({ path: OUT + '/frame-font.png' });
await esc(1);
await win.evaluate(() => localStorage.removeItem('oo.frameFont'));

// замена имён: свой выпадающий список
await win.evaluate(() => { App.project.aliases = [{ from: '', to: '' }]; [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Настройки проекта')?.click(); });
await win.waitForTimeout(500);
R.combo = await win.evaluate(async () => {
  const inp = [...document.querySelectorAll('.modal-wrap input')].find((i) => /Имя на табличке/.test(i.placeholder));
  if (!inp) return 'нет поля';
  inp.scrollIntoView(); inp.focus();
  await new Promise((r) => setTimeout(r, 200));
  const list = document.querySelector('.combo-list:not(.hidden)');
  if (!list) return 'нет списка';
  const n = list.querySelectorAll('.combo-item').length;
  for (let i = 0; i < 15; i++) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  const st = list.scrollTop;
  const act = list.querySelector('.combo-item.active')?.textContent;
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  return { n, scrollTopAfterArrows: st, active: act, picked: App.project.aliases[0].from, scrollable: list.scrollHeight > list.clientHeight };
});
await win.waitForTimeout(200);
{
  const inp = win.locator('.modal-wrap input[placeholder^="Имя на табличке"]').first();
  await inp.click();
  await win.waitForTimeout(200);
  const lb = await win.locator('.combo-list:not(.hidden)').boundingBox();
  if (lb) { await win.mouse.move(lb.x + 20, lb.y + 40); await win.mouse.wheel(0, 300); await win.waitForTimeout(250); }
  R.comboWheel = await win.evaluate(() => document.querySelector('.combo-list:not(.hidden)')?.scrollTop);
  await win.screenshot({ path: OUT + '/combo.png' });
}
await esc(2);
await win.evaluate(() => { App.project.aliases = []; });

// библиотека: Ctrl+клик по двум меткам и Ctrl+Z
await win.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Библиотека')?.click(); });
await win.waitForTimeout(1200);
R.libCtrl = await win.evaluate(async () => {
  const side = () => [...document.querySelectorAll('.modal-wrap .lib-folders .folder, .modal-wrap .lib-folders [data-key]')];
  const items = side();
  const cnt = () => document.querySelectorAll('.modal-wrap .grid .card').length;
  const tagEls = items.filter((e) => /Trilogy|DS|iOS|AAI|GBA/.test(e.textContent));
  if (tagEls.length < 2) return { note: 'меток мало', all: items.map((e) => e.textContent).slice(0, 20) };
  tagEls[0].click(); await new Promise((r) => setTimeout(r, 250));
  const a = cnt();
  tagEls[1].dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true })); await new Promise((r) => setTimeout(r, 250));
  const b = cnt();
  const on = [...document.querySelectorAll('.modal-wrap .lib-folders .on')].map((e) => e.textContent.trim());
  return { first: tagEls[0].textContent.trim(), second: tagEls[1].textContent.trim(), a, b, on };
});
await win.screenshot({ path: OUT + '/lib-ctrl.png' });
await esc(2);

console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
