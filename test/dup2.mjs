import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: process.env.LIBDIR } });
const win = await app.firstWindow();
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.evaluate(() => document.getElementById('btnLibrary').click());
await win.waitForTimeout(800);
await win.evaluate(() => [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('Музыка')).click());
await win.waitForTimeout(300);
const files = fs.readdirSync('/tmp/duptest').sort().map((f) => '/tmp/duptest/' + f);
for (const f of (process.env.ONEBYONE ? files.map((x) => [x]) : [files])) {
  const [fc] = await Promise.all([win.waitForEvent('filechooser'), win.evaluate(() => [...document.querySelectorAll('.lib-list button')].find((b) => b.textContent.includes('Из файлов')).click())]);
  await fc.setFiles(f);
  await win.waitForTimeout(3000);
  console.log('toast:', await win.evaluate(() => document.getElementById('toast').textContent), '| modals:', await win.evaluate(() => [...document.querySelectorAll('.modal-body')].map((m) => m.textContent.slice(0, 200)).join(' || ')));
}
console.log(JSON.stringify(await win.evaluate(() => window.Assets.Lib.list('music').filter((m) => !m.isPreset && m.source !== 'objection.lol').map((m) => [m.id, m.name, m.url]))));
app.process().kill('SIGKILL'); process.exit(0);
