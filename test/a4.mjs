// Android-сборка (обвязка): запуск с файлом («Открыть с помощью»), «Назад», вкладки, клавиатура, поворот при полном экране
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const TR = '/tmp/oo-android4';
fs.rmSync(TR, { recursive: true, force: true });
fs.mkdirSync(TR + '/cache/picked', { recursive: true });
fs.copyFileSync('/tmp/Minecraft.objection', TR + '/cache/picked/Minecraft.objection');
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT + '/android/harness'], env: { ...process.env, OO_TEST_ROOT: TR, OO_W: '412', OO_H: '915', OO_LAUNCH_FILE: TR + '/cache/picked/Minecraft.objection' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
await win.waitForTimeout(4000);
const R = {};
R.launch = await win.evaluate(() => ({ frames: App.project.groups[0].frames.length, name: App.fileName, modal: document.querySelector('.modal-wrap h3')?.textContent }));
const back = () => win.evaluate(() => window.__ooBack());
R.back1 = await back(); // закрывает окно «не хватает ресурсов»
R.modalAfter = await win.evaluate(() => !!document.querySelector('.modal-wrap'));
await win.locator('#mobileTabs button').nth(1).click();
R.tabFrame = await win.evaluate(() => document.body.className);
R.back2 = await back(); // вкладка «Кадр» → «Кадры»
R.tabAfter = await win.evaluate(() => document.body.className);
R.back3 = await back(); // нечего закрывать → приложение свернётся
// открытие файла при запущенном приложении
await win.evaluate((p) => window.__ooOpenFile(p), TR + '/cache/picked/Minecraft.objection');
await win.waitForTimeout(1500);
R.reopen = await win.evaluate(() => ({ modal: document.querySelector('.modal-wrap')?.textContent.slice(0, 80) }));
await back();
// клавиатура: поле в фокусе и окно стало ниже
await win.locator('.frame textarea').first().click();
await win.setViewportSize({ width: 412, height: 500 });
await win.waitForTimeout(500);
R.kbd = await win.evaluate(() => ({ cls: document.body.classList.contains('kbd'), stage: getComputedStyle(document.getElementById('stage')).display }));
await win.evaluate(() => document.activeElement.blur());
await win.setViewportSize({ width: 412, height: 915 });
await win.waitForTimeout(500);
R.kbdOff = await win.evaluate(() => document.body.classList.contains('kbd'));
R.log = (fs.existsSync(TR + '/bridge.log') ? fs.readFileSync(TR + '/bridge.log', 'utf8') : '').split('\n').filter(Boolean).slice(-5);
console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
