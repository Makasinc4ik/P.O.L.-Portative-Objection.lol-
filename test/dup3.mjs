import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: process.env.LIBDIR } });
const win = await app.firstWindow();
await win.waitForTimeout(2500);
const files = fs.readdirSync('/tmp/duptest').sort().map((f) => ['/tmp/duptest/' + f, fs.readFileSync('/tmp/duptest/' + f).toString('base64')]);
const r = await win.evaluate(async (files) => {
  const L = window.Assets.Lib; const out = [];
  const add = async ([name, b64], nm) => {
    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const rel = await window.api.lib.importBuffer(buf, name.split('/').pop());
    const draft = { id: await window.api.lib.newId(), name: nm, url: rel, volume: 100, source: 'custom' };
    const d = await window.api.lib.findDuplicates('music', draft);
    out.push([nm, d.map((x) => x.name + ' ' + x.file)]);
    return L.upsert('music', draft);
  };
  // 1) одинаковое имя у разных песен, 2) удаление и повторное добавление, 3) правка файла у существующего
  const a = await add(files[0], 'Abo Takeshi');
  await add(files[2], 'Abo Takeshi');
  await L.remove('music', a.id);
  await add(files[1], 'Abo Takeshi');
  await add(files[0], 'Abo Takeshi');
  for (const f of files) await add(f, 'Песня');
  const all = L.list('music').filter((m) => m.source === 'custom');
  const groups = await window.api.lib.duplicates('music');
  return { out, groups: groups.map((g) => g.map((id) => L.get('music', id)?.name + ' ' + L.get('music', id)?.url)) };
}, files);
console.log(JSON.stringify(r, null, 1));
app.process().kill('SIGKILL'); process.exit(0);
