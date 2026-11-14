import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
fs.rmSync('/tmp/dupLib', { recursive: true, force: true });
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: process.env.LIBDIR || '/tmp/dupLib' } });
const win = await app.firstWindow();
await win.waitForTimeout(2500);
const files = fs.readdirSync('/tmp/duptest').map((f) => ['/tmp/duptest/' + f, fs.readFileSync('/tmp/duptest/' + f).toString('base64')]);
const r = await win.evaluate(async (files) => {
  const out = [];
  for (const [name, b64] of files) {
    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const rel = await window.api.lib.importBuffer(buf, name.split('/').pop());
    const d = await window.api.lib.findDuplicates('music', { id: -1, url: rel });
    out.push([name.split('/').pop(), rel, d]);
    if (!d.length) await window.Assets.Lib.upsert('music', { id: await window.api.lib.newId(), name: name.split('/').pop().replace(/\.[^.]+$/, ''), url: rel, volume: 100, source: 'custom' });
  }
  return out;
}, files);
console.log(JSON.stringify(r, null, 1));
app.process().kill('SIGKILL'); process.exit(0);
