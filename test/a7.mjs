// Android (обвязка): открыть проект с ресурсами (ZIP) в пустой библиотеке через выбор файла и через «Открыть с помощью»
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const TR = '/tmp/oo-android7';
fs.rmSync(TR, { recursive: true, force: true });
const ZIP = '/tmp/bundle-test/Minecraft.zip';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT + '/android/harness'], env: { ...process.env, OO_TEST_ROOT: TR, OO_W: '412', OO_H: '915', LANG: 'ru_RU.UTF-8' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (!/Mixed Content/.test(m.text())) logs.push('[c] ' + m.type() + ' ' + m.text().slice(0, 300)); });
await win.waitForTimeout(3500);
const R = {};
const t0 = Date.now();
const fcP = win.waitForEvent('filechooser', { timeout: 15000 });
await win.locator('button', { hasText: 'Открыть проект' }).first().click();
const fc = await fcP;
await fc.setFiles(ZIP);
for (let i = 0; i < 240; i++) { await win.waitForTimeout(500); if (await win.evaluate(() => window.Assets.Lib.list('characters').length > 0 && !document.querySelector('.modal-wrap'))) break; }
R.ms = Date.now() - t0;
await win.waitForTimeout(1500);
R.after = await win.evaluate(() => { const L = window.Assets.Lib; const fr = App.project.groups[0].frames; return { frames: fr.length, chars: L.list('characters').length, bgs: L.list('backgrounds').length, music: L.list('music').length, missingChars: fr.filter((f) => f.characterId && !L.char(f.characterId)).length, modal: document.querySelector('.modal-wrap')?.textContent.slice(0, 120) || null, toast: document.querySelector('.toast')?.textContent || null }; });
await win.evaluate(() => App.select(263));
await win.waitForTimeout(1500);
await win.screenshot({ path: ROOT + '/test/outA3/14-bundle.png' });
console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
