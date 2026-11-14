import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out', FX = ROOT + '/test/fixtures';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: ROOT + '/test/LibraryU' } });
const win = await app.firstWindow();
const logs = []; win.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`)); win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await app.evaluate(({ dialog }, fx) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fx + '/Гоша.zip', fx + '/pack.zip'] }); }, FX);
await win.waitForTimeout(1500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
console.log('version:', await win.evaluate(() => document.getElementById('appVersion').textContent));
// открыть проект (для подсчёта использования) без скачивания
const fs = await import('fs');
await win.evaluate((t) => window.App.open({ path: null, name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.click('#btnLibrary');
await win.waitForTimeout(2500);
await win.screenshot({ path: OUT + '/v2-lib-chars.png' });
// ZIP
await win.click('text=＋ Из ZIP…');
await win.waitForTimeout(2500);
console.log('toast:', await win.evaluate(() => document.getElementById('toast').textContent));
// папки: создать папку и перенести двух персонажей
await win.evaluate(async () => {
  const L = window.Assets.Lib;
  const ids = L.list('characters').filter((c) => ['Alpha', 'Beta'].includes(c.name)).map((c) => c.id);
  await window.api.lib.setFolder('characters', ids, 'Тест/Пак');
});
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
await win.evaluate(() => window.Assets.Lib.load());
await win.click('#btnLibrary');
await win.waitForTimeout(2500);
await win.screenshot({ path: OUT + '/v2-lib-folders.png' });
// дубликаты
await win.click('text=Дубликаты…');
await win.waitForTimeout(3000);
await win.screenshot({ path: OUT + '/v2-dups.png' });
const dupText = await win.evaluate(() => [...document.querySelectorAll('.modal')].pop().innerText.slice(0, 400));
console.log('DUPS:', dupText.replace(/\n/g, ' | '));
await win.click('text=Объединить все группы');
await win.waitForTimeout(1500);
const after = await win.evaluate(() => ({ chars: window.Assets.Lib.list('characters').length, alias: window.Assets.Lib.data.aliases, gumshoe: window.Assets.Lib.char(1581235)?.id, pose: window.Assets.Lib.pose(window.Assets.Lib.char(1581235), 22192574)?.id }));
console.log('AFTER:', JSON.stringify(after).slice(0, 600));
await win.keyboard.press('Escape');
// фоны с миниатюрами
await win.click('#btnLibrary');
await win.waitForTimeout(500);
await win.click('.tabs button:nth-child(2)');
await win.waitForTimeout(2500);
await win.screenshot({ path: OUT + '/v2-lib-bgs.png' });
await win.keyboard.press('Escape');
// кадр 186 (Gumshoe 1581235, объединённый) — показать
await win.evaluate(() => { window.App.player.showStill(185); });
await win.waitForTimeout(2000);
await win.locator('#stage canvas').screenshot({ path: OUT + '/v2-f186.png' });
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 20).join('\n'));
const proc = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
await new Promise((r) => setTimeout(r, 1500)); proc.kill('SIGKILL'); process.exit(0);
