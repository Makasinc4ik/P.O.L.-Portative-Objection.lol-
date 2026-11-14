import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out18';
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = []; win.on('pageerror', (e) => logs.push(e.stack));
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const d = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const files = { tta: d('/tmp/aai_tta.png'), ttb: d('/tmp/aai_ttb.png'), a2: d('/tmp/aai2a.png'), b2: d('/tmp/aai2b.png') };
// разметка «как сделана под 16:9»: текст в коробке (x 694..1228 из 1920, y 579..896)
const style = { id: 'x', name: 'AAI RU', imageOpacity: 1, opacity: 1,
  nameplate: { top: 54.5, right: 52, width: 10, fontSize: 30, color: 'FFFFFF' },
  text: { fontSize: 30, left: 37.3, top: 56, width: 25.5, height: 4 }, nextButton: { top: 76, left: 61.5, iconSize: 3 } };
const R = {};
for (const [name, box, plate, ar] of [['16x9files-in-9x16', 'a2', 'b2', '9:16'], ['9x16files-in-9x16', 'tta', 'ttb', '9:16'], ['16x9files-in-16x9', 'a2', 'b2', '16:9'], ['9x16files-in-16x9', 'tta', 'ttb', '16:9']]) {
  R[name] = await win.evaluate(async ({ box, plate, ar, style }) => {
    document.querySelector('#__s')?.remove();
    const cv = document.createElement('canvas'); cv.id = '__s';
    const [W, H] = ar === '9:16' ? [405, 720] : [1280, 720];
    Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', zIndex: 9999, background: '#4a6' });
    document.body.append(cv);
    const pl = new window.Player(cv, App.audio);
    pl.project = { options: { aspectRatio: ar }, aliases: [], pairs: [], groups: [{ frames: [] }] };
    pl.frames = []; pl.setSize(W, H);
    pl.previewStyle = { ...style, url: box, nameplate: { ...style.nameplate, url: plate } }; pl.previewRev = Math.random();
    await pl.prepareTextbox();
    const chars = [...'Мммм, как же я хорош. Проверка второй строки текста.'].map((ch) => ({ ch, color: null }));
    pl.state.box = { visible: true, name: 'Klavier', chars, shown: chars.length, center: false, layout: null };
    const g = pl.ctx || cv.getContext('2d'); g.fillStyle = '#4a6'; g.fillRect(0, 0, W, H);
    pl.drawTextbox(0);
    const r = pl.tbRect(); const geo = pl.textGeometry();
    return { rx: Math.round(r.rx), rw: Math.round(r.rw), fs: +geo.fs.toFixed(1), x: Math.round(geo.x), y: Math.round(geo.y), w: Math.round(geo.w) };
  }, { box: files[box], plate: files[plate], ar, style });
  await win.waitForTimeout(150);
  await win.screenshot({ path: `${OUT}/${name}.png`, clip: ar === '9:16' ? { x: 0, y: 0, width: 405, height: 720 } : { x: 0, y: 0, width: 1280, height: 720 } });
}
console.log(JSON.stringify(R, null, 1), logs.join('\n'));
await app.close();
