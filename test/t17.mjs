import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out17';
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

await win.evaluate(() => {
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL('image/png'); };
  window.__img = {
    dual: mk(1920, 1080, (g, w, h) => { const cw = h * 9 / 16; g.fillStyle = 'rgba(80,20,20,.9)'; g.fillRect((w - cw) / 2 + 20, h * 0.7, cw - 40, h * 0.22); }),
    wide1080: mk(1920, 1080, (g, w, h) => { g.fillStyle = 'rgba(20,20,90,.9)'; g.fillRect(420, h * 0.7, 1080, h * 0.22); }),
    snow: mk(1920, 1080, (g, w, h) => { g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 300; i++) g.fillRect((i * 97) % w, (i * 53) % h, 6, 6); g.strokeStyle = '#f0f'; g.lineWidth = 20; g.strokeRect(0, 0, w, h); }),
    tall: mk(1080, 1920, (g, w, h) => { g.strokeStyle = '#0f0'; g.lineWidth = 20; g.strokeRect(0, 0, w, h); }),
    ev169: mk(1600, 900, (g, w, h) => { g.fillStyle = '#c6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#000'; g.font = '200px sans-serif'; g.fillText('16:9', 500, 520); }),
  };
});

// 1. геометрия текстбоксов
R.tb = await win.evaluate(async () => {
  const out = {};
  const sys = ['1', '2', '3', '4', '5'].map((i) => window.Assets.Lib.textbox(i)).find((t) => t && /AJ/i.test(t.name || '')) || window.Assets.Lib.textbox('2');
  const cases = [
    ['standard AJ 16:9', sys ? sys.url : null, '16:9', {}],
    ['standard AJ 9:16', sys ? sys.url : null, '9:16', {}],
    ['dual 9:16', __img.dual, '9:16', {}],
    ['wide1080 9:16 auto', __img.wide1080, '9:16', {}],
    ['wide1080 9:16 width', __img.wide1080, '9:16', { fit: 'width' }],
    ['wide1080 9:16 height', __img.wide1080, '9:16', { fit: 'height' }],
    ['tall 16:9', __img.tall, '16:9', {}],
  ];
  for (const [name, url, ar, extra] of cases) {
    if (!url) { out[name] = 'нет картинки'; continue; }
    const [W, H] = ar === '9:16' ? [405, 720] : [1280, 720];
    const pl = new window.Player(document.createElement('canvas'), App.audio);
    pl.project = { options: { aspectRatio: ar }, aliases: [], pairs: [], groups: [{ frames: [] }] };
    pl.frames = []; pl.setSize(W, H);
    pl.previewStyle = name.startsWith('standard') ? { ...sys } : { id: 'x', name: 't', url, imageOpacity: 1, opacity: 1, nameplate: {}, text: { fontSize: 30, left: 5, top: 70, width: 90, height: 3 }, nextButton: {}, ...extra };
    pl.previewRev = 1;
    await pl.prepareTextbox();
    const r = pl.tbRect(); const f = pl.tbFrame();
    out[name] = { name: pl.tb && pl.tb.style && pl.tb.style.name, rx: Math.round(r.rx), rw: Math.round(r.rw), size: +f.size.toFixed(3), vw: Math.round(f.vw), y0: Math.round(f.y0) };
  }
  return out;
});

// 2. картинки поверх сцены и улики в 9:16 — снимки
const shot = async (name, fn) => {
  await win.evaluate(fn);
  await win.waitForTimeout(250);
  await win.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: 430, height: 745 } });
};
const setup = `(() => {
  document.querySelector('#__s')?.remove();
  const cv = document.createElement('canvas'); cv.id = '__s';
  Object.assign(cv.style, { position: 'fixed', left: '10px', top: '10px', zIndex: 9999, border: '2px solid red' });
  document.body.append(cv);
  const pl = new window.Player(cv, App.audio);
  pl.setProject({ ...App.project, options: { ...App.project.options, aspectRatio: '9:16' } });
  pl.setSize(405, 720);
  window.__pl = pl;
  return pl;
})()`;
R.popup = await win.evaluate(async (setup) => {
  const pl = eval(setup);
  const out = {};
  for (const k of ['snow', 'tall']) {
    const img = await pl.img(__img[k], 0);
    const bmp = img.frameAt(0, true);
    out[k] = pl.mediaBox(bmp);
  }
  return out;
}, setup);
for (const [k, extra] of [['snow', {}], ['tall', {}], ['snow-half', { opacity: 50 }]]) {
  await shot('popup-' + k, async () => {});
  await win.evaluate(async ({ setup, k, extra }) => {
    const pl = eval(setup);
    const key = k.startsWith('snow') ? 'snow' : 'tall';
    pl.state.popup = { asset: { id: 1, resize: 100, center: true, ...extra }, img: await pl.img(__img[key], 0), start: 0, shownAt: -1e9 };
    pl.state.box.visible = false;
    pl.draw(pl.now());
  }, { setup, k, extra });
  await win.waitForTimeout(300);
  await win.screenshot({ path: `${OUT}/popup-${k}.png`, clip: { x: 0, y: 0, width: 430, height: 745 } });
}
R.drawFn = await win.evaluate(() => Object.getOwnPropertyNames(Object.getPrototypeOf(window.__pl)).filter((n) => /^(draw|render|frame|paint)/i.test(n)));

// улика на весь экран 16:9 в 9:16 и значок с разными появлениями
await win.evaluate(async (setup) => {
  const pl = eval(setup);
  pl.state.popup = null; pl.state.box.visible = false;
  pl.state.evidence = { id: 1, icon: false, img: await pl.img(__img.ev169, 0), box: null, start: 0 };
  pl.drawFrame ? pl.drawFrame() : null;
}, setup);
R.evDraw = await win.evaluate(() => { try { const pl = window.__pl; const fn = ['drawFrame', 'draw', 'render'].find((n) => typeof pl[n] === 'function'); if (fn) pl[fn](pl.now ? pl.now() : 0); return fn; } catch (e) { return String(e); } });
await win.waitForTimeout(300);
await win.screenshot({ path: `${OUT}/evidence-full-9x16.png`, clip: { x: 0, y: 0, width: 430, height: 745 } });
R.evIcon = await win.evaluate(async () => {
  const pl = window.__pl; const out = {};
  for (const anim of ['scale', 'slide', 'drop', 'fade']) {
    pl.project.options.evidenceAnim = anim; pl.project.options.evidenceSide = 'left';
    pl.state.evidence = { id: 1, icon: true, img: await pl.img(__img.ev169, 0), box: null, start: pl.now() - 100 };
    try { pl.drawEvidence(pl.now()); out[anim] = 'ok'; } catch (e) { out[anim] = String(e); }
  }
  return out;
});

// 3. цвет поверх оформления
R.color = await win.evaluate(async () => {
  const ta = document.querySelector('.frame textarea');
  ta.value = '[#/i]курсив[/#] и [#/g]зелёный[/#] [#/bd g]жирный[/#] конец';
  ta.dispatchEvent(new Event('input'));
  ta.focus(); ta.setSelectionRange(0, ta.value.length);
  [...document.querySelector('.frame .tagbar').querySelectorAll('button')].find((b) => /Цвет/.test(b.textContent)).click();
  await new Promise((r) => setTimeout(r, 200));
  [...document.querySelectorAll('.dropdown.tagmenu button')].find((b) => /Красный/.test(b.textContent)).click();
  await new Promise((r) => setTimeout(r, 200));
  const v = ta.value;
  const toks = window.Tags.parseText(v).filter((t) => t.type === 'text').map((t) => [t.text, t.color, t.fmt ? Object.keys(t.fmt).join('') : '']);
  return { v, toks };
});

// 4. метки
R.tags = await win.evaluate(() => {
  const M = window.Assets.Marks, L = window.Assets.Lib; const og = L.get;
  const f = (type, name) => { L.get = () => ({ id: 1, name }); try { return M.autoTags(type, 1); } finally { L.get = og; } };
  return { aaihd: f('characters', 'Kay (AAI HD)'), ajtr: f('characters', 'Apollo (AJT Remaster)'), ajtr2: f('characters', 'Apollo (AJT Remastered)'), plain: f('characters', 'Maya (by someone, GBA-sized)'),
    m2001: f('music', 'Objection! 2001'), m2002: f('music', 'Cornered 2002'), m2007: f('music', 'Apollo Justice ~ Objection! 2007'), m2016: f('music', 'Turnabout Sisters 2016 remix'), mnone: f('music', 'Track 20015') };
});

// 5. список с подгрузкой
R.prog = await win.evaluate(async () => {
  const box = document.createElement('div'); Object.assign(box.style, { position: 'fixed', left: '0', top: '0', width: '300px', height: '300px', overflow: 'auto', zIndex: 9999, background: '#222' });
  const grid = document.createElement('div'); grid.className = 'grid'; box.append(grid); document.body.append(box);
  const list = Array.from({ length: 1000 }, (_, i) => i);
  window.UI.appendProgressive(grid, list, (i) => { const d = document.createElement('div'); d.textContent = 'item ' + i; d.style.height = '20px'; return d; }, 300);
  const first = grid.querySelectorAll('div:not(.prog-tail)').length;
  for (let k = 0; k < 10; k++) { box.scrollTop = box.scrollHeight; await new Promise((r) => setTimeout(r, 150)); }
  const all = grid.querySelectorAll('div:not(.prog-tail)').length;
  const last = grid.lastElementChild.textContent;
  box.remove();
  return { first, all, last };
});

// 6. прозрачность персонажа кадра
R.opacity = await win.evaluate(async () => {
  const f = App.project.groups[0].frames[0];
  f.charOpacity = 40;
  App.player.setProject(App.project);
  await App.player.showStill(0);
  const v = App.player.state.charOpacity;
  delete f.charOpacity;
  App.player.setProject(App.project);
  await App.player.showStill(0);
  return { set: v, after: App.player.state.charOpacity };
});

console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
