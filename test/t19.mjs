import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out18';
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = []; win.on('pageerror', (e) => logs.push(e.stack)); win.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const d = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const files = { tta: d('/tmp/aai_tta.png'), ttb: d('/tmp/aai_ttb.png'), a2: d('/tmp/aai2a.png'), b2: d('/tmp/aai2b.png') };
const style = { id: 'x', name: 'AAI RU', imageOpacity: 1, opacity: 1, nameplate: { top: 50, right: 70, width: 25, fontSize: 30 }, text: { fontSize: 30, left: 5, top: 56, width: 90, height: 4 }, nextButton: { top: 76, left: 90, iconSize: 3 } };
const R = {};
R.geo = await win.evaluate(async ({ files, style }) => {
  const out = {};
  const sys = window.Assets.Lib.textbox('2');
  for (const [name, box, ar, extra] of [['534 in 9:16', 'tta', '9:16', {}], ['534 in 16:9', 'tta', '16:9', {}], ['1920 in 9:16', 'a2', '9:16', {}], ['1920 in 16:9', 'a2', '16:9', {}], ['534 in 9:16 any', 'tta', '9:16', { designFor: 'any' }], ['std AJ in 16:9', null, '16:9', {}], ['std AJ in 3:2', null, '3:2', {}]]) {
    const [W, H] = ar === '9:16' ? [405, 720] : ar === '3:2' ? [1080, 720] : [1280, 720];
    const pl = new window.Player(document.createElement('canvas'), App.audio);
    pl.project = { options: { aspectRatio: ar }, aliases: [], pairs: [], groups: [{ frames: [] }] };
    pl.frames = []; pl.setSize(W, H);
    pl.previewStyle = box ? { ...style, ...extra, url: files[box] } : { ...sys }; pl.previewRev = Math.random();
    await pl.prepareTextbox();
    const r = pl.tbRect(); const f = pl.tbFrame();
    out[name] = { key: pl.designKey(), asIs: !!r.asIs, rx: Math.round(r.rx), rw: Math.round(r.rw), size: +f.size.toFixed(3), vw: Math.round(f.vw), y0: Math.round(f.y0) };
  }
  return out;
}, { files, style });
R.editor = await win.evaluate(async ({ files, style }) => {
  const a = { ...window.LibraryUI.newTextbox('t1'), ...JSON.parse(JSON.stringify(style)), url: files.tta };
  a.nameplate.url = files.ttb;
  const r = window.LibraryUI.textboxEditor(a, { audio: App.audio, aspectRatio: '16:9' });
  window.UI.modal({ title: 'tb', wide: true, body: r.el });
  await new Promise((res) => setTimeout(res, 1500));
  const cv = r.el.querySelector('canvas'); const cr = cv.getBoundingClientRect();
  const ta = r.el.querySelector('.tb-area.text').getBoundingClientRect();
  const opt = [...r.el.querySelectorAll('option')].find((o) => o.value === 'auto' && /Определить/.test(o.textContent));
  return { canvas: [cv.width, cv.height], label: opt && opt.textContent, textInside: ta.left >= cr.left - 1 && ta.right <= cr.right + 1 && ta.top >= cr.top - 1 && ta.bottom <= cr.bottom + 1 };
}, { files, style });
await win.screenshot({ path: OUT + '/editor-534.png' });
console.log(JSON.stringify(R, null, 1), logs.join('\n'));
await app.close();
