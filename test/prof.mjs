import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: ROOT + '/test/Library' } });
const win = await app.firstWindow();
await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: out + '/' + o.defaultPath.split('/').pop() }); }, OUT);
await win.waitForTimeout(1500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const r = await win.evaluate(async () => {
  const IC = window.Assets.ImageCache;
  const orig = IC.get.bind(IC);
  const st = { calls: 0, misses: 0, ms: 0, keys: new Set() };
  IC.get = (u, h) => { st.calls++; const k = IC.key(window.Assets.Lib.url(u), h ? Math.max(8, Math.round(h / 8) * 8) : 0); if (!IC.map.has(k)) { st.misses++; st.keys.add(k); const t = performance.now(); const p = orig(u, h); p.then(() => { st.ms += performance.now() - t; }); return p; } return orig(u, h); };
  IC.clear();
  const res = await window.Exporter.exportVideo(window.App.player, window.App.audio, { from: 255, to: 300, height: 720, fps: 30, suggestedName: 'prof' });
  return { res, calls: st.calls, misses: st.misses, uniq: st.keys.size, decodeMs: Math.round(st.ms), cacheMB: Math.round(IC.bytes / 1048576) };
});
console.log(JSON.stringify(r));
const proc = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
await new Promise((r) => setTimeout(r, 1500)); proc.kill('SIGKILL'); process.exit(0);
