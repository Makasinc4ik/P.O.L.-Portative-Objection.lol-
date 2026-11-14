import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out16';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
const esc = async (n = 2) => { for (let i = 0; i < n; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); } };
await esc(3);
const R = {};
const gifs = Object.fromEntries(['loop', 'once', 'twice'].map((n) => [n, 'data:image/gif;base64,' + fs.readFileSync(`/tmp/gifs/${n}.gif`).toString('base64')]));

// картинки: горизонтальная «на оба формата» и её середина 9:16 (та же высота)
await win.evaluate(() => {
  const draw = (g, w, h, ox) => { g.fillStyle = 'rgba(120,20,40,.9)'; g.fillRect(ox + 10, h * 0.62, h * 9 / 16 - 20, h * 0.08); g.fillStyle = 'rgba(40,20,30,.85)'; g.fillRect(ox + 10, h * 0.7, h * 9 / 16 - 20, h * 0.22); };
  const mk = (w, h, ox) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h, ox); return c.toDataURL('image/png'); };
  window.__tb = { dual: mk(1920, 1080, (1920 - 1080 * 9 / 16) / 2), crop: mk(608, 1080, 0) };
});

const style = (url, extra = {}) => ({ id: 'x', name: 't', url, imageOpacity: 1, opacity: 1, nameplate: { url: '', top: 62.5, right: 40, width: 20, fontSize: 30 }, text: { fontSize: 34, left: 37, top: 72, width: 26, height: 4 }, nextButton: { top: 85, left: 60, iconSize: 3 }, ...extra });
// подставить картинки (data URL лежат в окне)
R.geo = await win.evaluate(async ({ st }) => {
  const out = {};
  for (const name of ['dual', 'crop']) {
    for (const [ar, W, H] of [['16:9', 1280, 720], ['9:16', 405, 720]]) {
      const pl = new window.Player(document.createElement('canvas'), App.audio);
      pl.project = { options: { aspectRatio: ar }, aliases: [], pairs: [], groups: [{ frames: [] }] };
      pl.frames = []; pl.setSize(W, H);
      pl.previewStyle = { ...st, url: __tb[name] }; pl.previewRev = 1;
      await pl.prepareTextbox();
      const g = pl.textGeometry();
      out[name + ' ' + ar] = { x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), fs: +g.fs.toFixed(2), lift: Math.round(pl.textboxLift()) };
    }
  }
  return out;
}, { st: style('') });

// снимки: 9:16, середина картинки, с оформлением, обводкой и цветом имени
for (const [name, ar, extra] of [['crop', '9:16', {}], ['dual', '9:16', {}], ['crop', '9:16', { hideName: true }]]) {
  await win.evaluate(async ({ name, ar, st }) => {
    document.querySelector('#__tbshot')?.remove();
    const cv = document.createElement('canvas'); cv.id = '__tbshot';
    Object.assign(cv.style, { position: 'fixed', left: '10px', top: '10px', zIndex: 9999, border: '2px solid red', background: '#557' });
    document.body.append(cv);
    const pl = new window.Player(cv, App.audio);
    pl.project = { options: { aspectRatio: ar }, aliases: [], pairs: [], groups: [{ frames: [] }] };
    pl.frames = []; pl.setSize(405, 720);
    const s = { ...st, url: __tb[name] };
    s.text = { ...s.text, outlineWidth: 2, outlineColor: '000000' };
    s.nameplate = { ...s.nameplate, outlineWidth: 2, outlineColor: '0000AA' };
    pl.previewStyle = s; pl.previewRev = 3;
    await pl.prepareTextbox();
    const toks = window.Tags.parseText('Обычный [#/i]курсив[/#] [#/u]подчёркнутый[/#] [#/s]зачёркнутый[/#] [#/bd r]жирный красный[/#] [#/sz160]крупно[/#] конец.');
    const chars = []; for (const t of toks) if (t.type === 'text') for (const ch of t.text) chars.push({ ch, color: t.color, fmt: t.fmt });
    pl.state.box = { visible: true, name: 'Edgeworth', nameColor: '#ffcc00', chars, shown: chars.length, center: false, layout: null };
    pl.drawTextbox(0);
  }, { name, ar, st: style('', extra) });
  await win.waitForTimeout(150);
  await win.screenshot({ path: `${OUT}/tb-${name}-${ar.replace(':', 'x')}${extra.hideName ? '-noname' : ''}.png`, clip: { x: 0, y: 0, width: 430, height: 745 } });
}
await win.evaluate(() => document.querySelector('#__tbshot')?.remove());

// редактор: середина 9:16 с разметкой «кадр 16:9» — предпросмотр 16:9, рамки внутри холста
R.editor = await win.evaluate(async ({ st }) => {
  const a = { ...window.LibraryUI.newTextbox('t1'), ...JSON.parse(JSON.stringify(st)), url: __tb.crop };
  const r = window.LibraryUI.textboxEditor(a, { audio: App.audio, aspectRatio: '9:16' });
  window.UI.modal({ title: 'tb', wide: true, body: r.el });
  await new Promise((res) => setTimeout(res, 1200));
  const cv = r.el.querySelector('canvas');
  const cr = cv.getBoundingClientRect();
  const ta = r.el.querySelector('.tb-area.text').getBoundingClientRect();
  const sel = [...r.el.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'image'));
  const res = { canvas: [cv.width, cv.height], vertical: r.el.classList.contains('vertical'), textInside: ta.left >= cr.left - 1 && ta.right <= cr.right + 1 && ta.top >= cr.top - 1 && ta.bottom <= cr.bottom + 1, hasBaseSel: !!sel };
  // переключить на «от картинки» — предпросмотр в пропорциях картинки, раскладка в две колонки
  sel.value = 'image'; sel.dispatchEvent(new Event('change'));
  await new Promise((res2) => setTimeout(res2, 600));
  const cr2 = cv.getBoundingClientRect();
  const rng = r.el.querySelector('.slider-row input[type=range]').getBoundingClientRect();
  res.image = { canvas: [cv.width, cv.height], vertical: r.el.classList.contains('vertical'), sliderW: Math.round(rng.width), previewW: Math.round(cr2.width), overflowX: r.el.scrollWidth > r.el.clientWidth + 2 };
  return res;
}, { st: style('') });
await win.screenshot({ path: OUT + '/editor-image-base.png' });
await esc(1);

// метки AAIC / AAIHD / AJHD
R.tags = await win.evaluate(() => {
  const M = window.Assets.Marks, L = window.Assets.Lib; const og = L.get;
  const f = (name) => { L.get = () => ({ id: 1, name }); try { return M.autoTags('characters', 1); } finally { L.get = og; } };
  return { aaic: f('Edgeworth [AAIC]'), aaihd: f('Kay (AAIHD) [AAIHD]'), ajhd: f('Apollo [AJHD]'), pwthd: f('Phoenix [PWT-HD]'), hd: f('Godot [HD]') };
});

// GIF: число повторов из файла
R.gif = await win.evaluate(async (g) => {
  const out = {};
  for (const [k, u] of Object.entries(g)) { const img = await window.Assets.ImageCache.get(u, 0); out[k] = { reps: img.reps, plays: img.plays, total: img.total }; }
  // проигрыватель: анимация позы «один раз» застывает на последнем кадре
  const once = await window.Assets.ImageCache.get(g.once, 0);
  const pl = App.player;
  const ch = { override: once, overrideStart: 0, overridePlays: pl.statePlays({}, once) };
  const last = once.frames[once.frames.length - 1].bmp;
  out.player = { plays: ch.overridePlays, at150: pl.charBmp(ch, once, 150, 0) === once.frames[1].bmp, at450: pl.charBmp(ch, once, 450, 0) === last, at1000: pl.charBmp(ch, once, 1000, 0) === last, repeat3: pl.statePlays({ repeat: 3 }, once), ms: pl.stateMs({}, null, once), ms3: pl.stateMs({ repeat: 3 }, null, once) };
  return out;
}, gifs);

// совместимость с сайтом: открыть Minecraft, включить, отчёт
const t = fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8');
await win.evaluate(async (t) => { await window.App.open({ path: null, name: 'Minecraft.objection', text: t }); }, t);
await win.waitForTimeout(1500);
await esc(2);
R.compat = await win.evaluate(async () => {
  const fr = App.project.groups[0].frames[2];
  fr.text = 'Тест [#flcFF0000] и [#/i]курсив[/#]';
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Настройки проекта')?.click();
  await new Promise((r) => setTimeout(r, 400));
  const chk = [...document.querySelectorAll('.modal-wrap label.chk')].find((l) => /Совместимость с objection\.lol/.test(l.textContent)).querySelector('input');
  chk.click();
  await new Promise((r) => setTimeout(r, 400));
  const rows = [...document.querySelectorAll('.compat-row')].map((x) => x.textContent);
  return { on: !!App.project.options.siteCompat, limit: window.PlayerUtil.pairLimit(App.project), rows: rows.slice(0, 6), n: rows.length };
});
await win.screenshot({ path: OUT + '/compat.png' });
await esc(3);
R.compatMenu = await win.evaluate(() => {
  const btns = [...document.querySelectorAll('.frame .tagbar button')].map((b) => b.textContent);
  return { hasFormat: btns.some((b) => /Оформление/.test(b)) };
});
await win.evaluate(() => { delete App.project.options.siteCompat; });

// предпросмотр позы
R.pose = await win.evaluate(async () => {
  const L = window.Assets.Lib;
  const c = L.list('characters').find((x) => (x.poses || []).some((p) => (p.poseStates || []).length));
  if (!c) return 'нет персонажа с анимацией позы';
  const p = c.poses.find((p) => (p.poseStates || []).length);
  window.LibraryUI.posePreview(c, p, { audio: App.audio });
  await new Promise((r) => setTimeout(r, 600));
  const img = document.querySelector('.pose-prev-img');
  return { char: c.name, pose: p.name, src: (img && img.src || '').slice(0, 60), status: document.querySelector('.modal-wrap:last-child .muted')?.textContent };
});
await win.waitForTimeout(800);
await win.screenshot({ path: OUT + '/pose-preview.png' });
await esc(1);

console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
