import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = []; win.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`)); win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: out + '/' + o.defaultPath.split('/').pop() }); }, OUT);
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
let t0 = Date.now();
const imp = await win.evaluate(async () => { const r = await window.api.lib.importLegacy('/tmp/oldP/Library'); await window.Assets.Lib.load(); return { r, chars: window.Assets.Lib.list('characters').length }; });
console.log('IMPORT', JSON.stringify(imp), Math.round((Date.now() - t0) / 1000) + 's');
await win.evaluate((t) => window.App.open({ path: null, name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await win.evaluate(() => [...document.querySelectorAll('.modal .btn.primary')].pop()?.click());
t0 = Date.now();
for (;;) {
  await win.waitForTimeout(2000);
  const s = await win.evaluate(() => document.querySelector('.modal-body')?.innerText || '');
  if (/Ресурсов проекта|Файлов обработано/.test(s)) { console.log('REPORT', s.replace(/\n/g, ' ').slice(0, 300)); break; }
  if (Date.now() - t0 > 600000) { console.log('timeout'); break; }
}
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
console.log('TB', await win.evaluate(() => { const t = window.Assets.Lib.textbox(window.App.project.options.chatbox); return t ? t.name + ' | ' + t.url + ' | ' + t.text.fontUrl : 'none'; }));
await win.evaluate(() => window.App.player.showStill(262));
await win.waitForTimeout(3500);
await win.locator('#stage canvas').screenshot({ path: OUT + '/f-still262.png' });
await win.evaluate(() => window.App.player.showStill(0));
await win.waitForTimeout(2000);
await win.locator('#stage canvas').screenshot({ path: OUT + '/f-still0.png' });
const ex = await win.evaluate(async () => window.Exporter.exportVideo(window.App.player, window.App.audio, { from: 255, to: 300, height: 720, fps: 30, suggestedName: 'fast2' }).catch((e) => ({ error: e.message })));
console.log('EXPORT', JSON.stringify(ex));
await win.click('#btnLibrary');
await win.waitForTimeout(800);
await win.click('.tabs button:nth-child(5)');
await win.waitForTimeout(2500);
await win.evaluate(() => { const c = [...document.querySelectorAll('.lib-list .card')].pop(); c && c.click(); });
await win.waitForTimeout(3000);
await win.screenshot({ path: OUT + '/f-tb.png' });
console.log(logs.filter((l) => /error|warn|stats/i.test(l)).slice(0, 15).join('\n'));
const proc = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
await new Promise((r) => setTimeout(r, 1500)); proc.kill('SIGKILL'); process.exit(0);
