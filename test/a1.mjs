// Android-сборка в тестовой обвязке: запуск, библиотека, системные файлы, скачивание, сцены
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/outA1';
fs.mkdirSync(OUT, { recursive: true });
const TR = process.env.OO_TEST_ROOT || '/tmp/oo-android';
if (process.env.FRESH) fs.rmSync(TR, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT + '/android/harness'], env: { ...process.env, OO_TEST_ROOT: TR, OO_W: process.env.OO_W || '412', OO_H: process.env.OO_H || '915' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push('[console.' + m.type() + '] ' + m.text()); });
await win.waitForTimeout(4000);
const R = {};
R.basic = await win.evaluate(async () => ({ url: location.href, api: !!window.api, platform: window.api && window.api.platform, version: await window.api.version(), info: await window.api.lib.info(), header: document.getElementById('appVersion')?.textContent, bodyClass: document.body.className }));
await win.screenshot({ path: OUT + '/start.png' });
console.log(JSON.stringify(R, null, 1));
console.log(logs.slice(0, 30).join('\n'));
await app.close();
