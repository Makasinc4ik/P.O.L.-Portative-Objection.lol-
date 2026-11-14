import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: ROOT + '/test/Library' } });
const win = await app.firstWindow();
await win.waitForTimeout(1500);
const r = await win.evaluate(async () => {
  const url = 'oo://lib/files/4a7d3f7af6d2791fbe9e.gif';
  const buf = await (await fetch(url)).arrayBuffer();
  const out = {};
  for (const mode of ['none', 'low', 'medium', 'high']) {
    const t = performance.now();
    const dec = new ImageDecoder({ data: buf, type: 'image/gif' });
    await dec.tracks.ready; await dec.completed;
    const n = dec.tracks.selectedTrack.frameCount;
    let td = 0, tb = 0;
    for (let i = 0; i < n; i++) {
      const a = performance.now();
      const { image } = await dec.decode({ frameIndex: i });
      const b = performance.now(); td += b - a;
      const bmp = mode === 'none' ? await createImageBitmap(image) : await createImageBitmap(image, { resizeWidth: 1408, resizeHeight: 792, resizeQuality: mode });
      tb += performance.now() - b;
      bmp.close(); image.close();
    }
    out[mode] = { n, total: Math.round(performance.now() - t), decode: Math.round(td), bitmap: Math.round(tb) };
  }
  return out;
});
console.log(JSON.stringify(r));
const proc = app.process(); proc.kill('SIGKILL'); process.exit(0);
