import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = []; win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.evaluate((t) => window.App.open({ path: null, name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(600);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const boxAlive = () => win.evaluate(() => { const tb = window.App.player.tb; return tb ? window.Assets.ImageCache.alive(tb.box) && !!tb.box : 'no tb'; });
// 1) очистка кэша (как при изменении библиотеки) во время просмотра
await win.evaluate(() => window.App.play(2));
await win.waitForTimeout(2500);
console.log('before clear:', await boxAlive());
await win.evaluate(() => window.Assets.ImageCache.clear());
await win.waitForTimeout(1500);
console.log('after clear:', await boxAlive());
await win.locator('#stage canvas').screenshot({ path: OUT + '/tbfix-1.png' });
// 2) нехватка памяти: крошечный лимит кэша, листаем много кадров
await win.evaluate(() => { window.Assets.ImageCache.limit = 30 * 1024 * 1024; });
await win.evaluate(() => window.App.play(190));
await win.waitForTimeout(25000);
console.log('after eviction run:', await boxAlive(), 'frame', await win.evaluate(() => window.App.player.current));
await win.locator('#stage canvas').screenshot({ path: OUT + '/tbfix-2.png' });
console.log(logs.join('\n'));
const proc = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
await new Promise((r) => setTimeout(r, 1500)); proc.kill('SIGKILL'); process.exit(0);
