// 0.9.6: картинки в 9:16 от сцены, прозрачная улика, сторона значка в кадре и тегом, плавность картинки в кадре, Ctrl+Z после тега
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out20';
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

R.player = await win.evaluate(async () => {
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL('image/png'); };
  const tall = mk(540, 960, (g, w, h) => { g.fillStyle = '#0f0'; g.fillRect(0, 0, w, h); });
  const evT = mk(540, 960, (g, w, h) => { g.fillStyle = '#f00'; g.fillRect(w / 2 - 40, h / 2 - 40, 80, 80); });
  const out = {};
  const mkPl = (W, H) => {
    const cv = document.createElement('canvas');
    const pl = new window.Player(cv, App.audio);
    pl.project = { options: { aspectRatio: W < H ? '9:16' : '16:9' }, aliases: [], pairs: [], groups: [{ frames: [] }] };
    pl.frames = []; pl.setSize(W, H); pl.state.box.visible = false;
    return pl;
  };
  const greenBox = (pl) => {
    const g = pl.g; const d = g.getImageData(0, 0, pl.W, pl.H).data; let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = 0; y < pl.H; y += 2) for (let x = 0; x < pl.W; x++) { const i = (y * pl.W + x) * 4; if (d[i + 1] > 150 && d[i] < 80) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    return x1 < 0 ? null : { x0, x1, y0, y1, w: x1 - x0 + 1 };
  };
  // своя вертикальная картинка 32 % по центру (настроена в 16:9 под высоту кадра)
  for (const [name, W, H, extra] of [['16:9', 1280, 720, {}], ['9:16 scene', 405, 720, {}], ['9:16 frame', 405, 720, { sizeBase: 'frame' }]]) {
    const pl = mkPl(W, H);
    pl.state.popup = { asset: { id: 1, resize: 32, center: true, ...extra }, img: await pl.img(tall, 0), start: 0, shownAt: -1e9 };
    pl.draw(pl.now());
    out['popup ' + name] = { W, ...greenBox(pl) };
  }
  // прозрачность из кадра и «отпечаток» во время появления
  {
    const pl = mkPl(405, 720);
    const fx = window.PlayerUtil ? null : null;
    pl.state.popup = { asset: { id: 1, resize: 32, center: true, opacity: 80 }, img: await pl.img(tall, 0), start: 0, shownAt: pl.now(), fx: { opacity: 0.5, fadeInMs: 1000, fadeOutMs: 0 } };
    out.sigFadeIn = pl.frameSig(pl.now());
    pl.state.popup.shownAt = -1e9;
    out.sigAfter = typeof pl.frameSig(pl.now());
    pl.draw(pl.now());
    const d = pl.g.getImageData(200, 360, 1, 1).data; out.halfGreen = d[1];
  }
  // улика на весь экран с прозрачностью
  for (const tb of [false, true]) {
    const pl = mkPl(405, 720);
    pl.g.fillStyle = '#00f'; pl.g.fillRect(0, 0, 405, 720);
    pl.state.evidence = { id: 1, icon: false, img: await pl.img(evT, 0), box: null, start: 0, asset: { transparentBg: tb } };
    pl.drawEvidence(pl.now());
    const c = pl.g.getImageData(10, 10, 1, 1).data; const m = pl.g.getImageData(202, 360, 1, 1).data;
    out['evidence transparentBg=' + tb] = { corner: [c[0], c[1], c[2]], middle: [m[0], m[1], m[2]] };
  }
  // сторона значка
  {
    const pl = mkPl(1280, 720);
    pl.state.chars = [];
    const side = (evSide, frameSide, tagSide) => { pl.project.options.evidenceSide = evSide; pl.state.frameEvSide = frameSide; pl.state.evidence = { id: 1, icon: true, side: tagSide }; return pl.evidenceLeft() ? 'L' : 'R'; };
    out.side = { auto: side(undefined, null, null), proj: side('left', null, null), frame: side('left', 'right', null), tag: side('left', 'right', 'left') };
  }
  out.tags = ['evdi12', 'evdi12l', 'evdi12r', 'evd12'].map((t) => JSON.stringify(window.Tags.parseText(`[#${t}]`).find((x) => x.type === 'cmd')));
  return out;
});

// проигрывание: popupFx кадра и сторона из настроек кадра
R.play = await win.evaluate(async () => {
  const pl = App.player;
  const f = App.project.groups[0].frames[0];
  const lib = window.Assets.Lib;
  const pp = await lib.upsert('popups', { name: 'tst', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', resize: 30, opacity: 80, fadeInMs: 500 });
  const id = pp && pp.id != null ? pp.id : lib.list('popups').slice(-1)[0].id;
  f.popupId = id; f.popupFx = { opacity: 40, fadeOutMs: 700 }; f.evidenceSide = 'right';
  pl.setProject(App.project);
  await pl.showStill(0);
  const r = { fx: pl.state.popup && pl.state.popup.fx, frameEvSide: pl.state.frameEvSide };
  delete f.popupId; delete f.popupFx; delete f.evidenceSide;
  pl.setProject(App.project); await pl.showStill(0);
  return r;
});

// Ctrl+Z прямо в поле после вставки тега
const ta = win.locator('.frame textarea').first();
await ta.click();
await win.keyboard.press('Control+KeyA');
await win.keyboard.type('abc');
await win.waitForTimeout(400);
const pauseBtn = win.locator('button', { hasText: '⏸ Пауза' }).first();
await pauseBtn.click();
await win.waitForTimeout(200);
await win.locator('.dropdown.tagmenu >> text=100 мс').first().click();
await win.waitForTimeout(500);
R.undo = { afterTag: await ta.inputValue(), focused: await win.evaluate(() => document.activeElement && document.activeElement.tagName) };
await win.keyboard.press('Control+KeyZ');
await win.waitForTimeout(500);
R.undo.afterCtrlZ = await ta.inputValue();
R.undo.frameText = await win.evaluate(() => App.project.groups[0].frames[0].text);
await win.keyboard.press('Control+Shift+KeyZ');
await win.waitForTimeout(300);
R.undo.afterRedo = await ta.inputValue();

// инспектор кадра: новые поля и отчёт совместимости
await win.evaluate(() => {
  const f = App.project.groups[0].frames[0];
  f.popupId = window.Assets.Lib.list('popups').slice(-1)[0].id;
  f.text = 'x [#evdi1l]';
});
await win.locator('.frame textarea').nth(1).click();
await win.waitForTimeout(300);
await win.locator('.frame textarea').nth(0).click();
await win.waitForTimeout(600);
R.inspector = await win.evaluate(() => {
  const labels = [...document.querySelectorAll('.field > label')].map((l) => l.textContent);
  const el = [...document.querySelectorAll('.field > label')].find((l) => /Непрозрачность в этом кадре/.test(l.textContent));
  if (el) el.scrollIntoView({ block: 'center' });
  return { labels: labels.filter((l) => /этом кадре|Появление|Исчезновение/.test(l)), placeholders: [...document.querySelectorAll('input[placeholder*="из картинки"]')].map((i) => i.placeholder) };
});
await win.waitForTimeout(300);
await win.screenshot({ path: OUT + '/inspector.png' });

R.compat = await win.evaluate(async () => {
  const f = App.project.groups[0].frames[0];
  f.popupFx = { opacity: 40 }; f.evidenceSide = 'right';
  const ev = window.Assets.Lib.list('evidence')[0];
  if (ev) { await window.Assets.Lib.upsert('evidence', { ...ev, transparentBg: true }); f.text = `x [#evdi1l] [#evd${ev.id}]`; }
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Настройки проекта')?.click();
  await new Promise((r) => setTimeout(r, 400));
  const chk = [...document.querySelectorAll('.modal-wrap label.chk')].find((l) => /Совместимость с objection\.lol/.test(l.textContent)).querySelector('input');
  if (chk.checked) { chk.click(); await new Promise((r) => setTimeout(r, 200)); }
  chk.click();
  await new Promise((r) => setTimeout(r, 400));
  return { hasEvidence: !!ev, rows: [...document.querySelectorAll('.compat-row')].map((x) => x.textContent).filter((t) => /^Кадр 1\b|кадр 1:/i.test(t) || /Кадр 1:/.test(t)).slice(0, 8) };
});
await win.evaluate(() => { const f = App.project.groups[0].frames[0]; delete f.popupFx; delete f.evidenceSide; delete f.popupId; App.project.options.siteCompat = false; });
await win.keyboard.press('Escape');
await win.waitForTimeout(3000); // автосохранение
console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
