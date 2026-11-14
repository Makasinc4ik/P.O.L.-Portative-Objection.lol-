import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
await win.waitForTimeout(2000);
console.log(await win.evaluate(async () => {
  const out = [];
  for (const codec of ['avc1.640033', 'avc1.4d0033', 'avc1.42e033', 'vp09.00.41.08', 'av01.0.08M.08']) for (const mode of ['variable', 'constant', 'quantizer']) for (const hw of ['prefer-hardware', 'prefer-software']) {
    try { const r = await VideoEncoder.isConfigSupported({ codec, width: 1280, height: 720, bitrate: 2e6, framerate: 30, bitrateMode: mode, hardwareAcceleration: hw, latencyMode: 'quality', ...(codec.startsWith('avc') ? { avc: { format: 'avc' } } : {}) }); out.push(`${codec} ${mode} ${hw}: ${r.supported}`); } catch (e) { out.push(`${codec} ${mode} ${hw}: ERR ${e.message}`); }
  }
  return out.join('\n');
}));
app.process().kill('SIGKILL'); process.exit(0);
