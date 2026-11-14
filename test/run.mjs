// Автотест в Electron: открыть проект, скачать ресурсы, проиграть, записать видео
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const ROOT = '/home/claude/oo';
const OUT = '/home/claude/oo/test/out';
fs.mkdirSync(OUT, { recursive: true });
const LIB = process.env.LIB || '/home/claude/oo/test/Library';
const step = process.argv[2] || 'all';

const app = await electron.launch({
  executablePath: ROOT + '/node_modules/electron/dist/electron',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', ROOT],
  env: { ...process.env, OO_LIBRARY: LIB },
});
const win = await app.firstWindow();
const logs = [];
win.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); });
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(1500);

// подменяем диалоги сохранения
await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: out + '/' + o.defaultPath.split('/').pop() }); }, OUT);

async function shot(name) { await win.screenshot({ path: `${OUT}/${name}.png` }); }
await shot('01-start');
// закрыть приветствие
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));

const text = fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8');
await win.evaluate((t) => window.App.open({ path: null, name: 'Minecraft.objection', text: t }), text);
await win.waitForTimeout(800);
await shot('02-opened');
const dlgText = await win.evaluate(() => document.querySelector('.modal-body')?.innerText);
console.log('DIALOG:', dlgText);
if (!(step === 'all' || step === 'download')) await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));

if (step === 'all' || step === 'download') {
  // нажать «Скачать»
  await win.evaluate(() => [...document.querySelectorAll('.modal .btn.primary')].pop()?.click());
  const t0 = Date.now();
  for (;;) {
    await win.waitForTimeout(3000);
    const s = await win.evaluate(() => document.querySelector('.modal-body')?.innerText || '');
    process.stdout.write('\r' + s.replace(/\n/g, ' ').slice(0, 120) + '   ');
    if (/Ресурсов проекта|Файлов обработано/.test(s)) { console.log('\nREPORT:', s); break; }
    if (Date.now() - t0 > 15 * 60 * 1000) { console.log('timeout'); break; }
  }
  await shot('03-report');
  await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
}

await win.evaluate(() => { window.App.player && null; });
await win.waitForTimeout(1500);
await shot('04-editor');

if (step === 'all' || step === 'play') {
  // проиграть с кадра 185 (затемнения) и сделать снимки
  for (const [idx, label] of [[0, 'f001'], [70, 'f071-bubble'], [189, 'f190'], [261, 'f262-pair'], [305, 'f306-quake']]) {
    await win.evaluate((i) => window.App.play(i), idx);
    await win.waitForTimeout(label.includes('bubble') ? 600 : 2500);
    await win.locator('#stage canvas').screenshot({ path: `${OUT}/play-${label}.png` });
    await win.evaluate(() => window.App.player.stop());
  }
}

if (step === 'all' || step === 'export') {
  const formats = await win.evaluate(() => window.Exporter.fastSupported());
  console.log('FORMATS', JSON.stringify(formats));
  const r = await win.evaluate(async () => {
    try {
      return await window.Exporter.exportVideo(window.App.player, window.App.audio, { from: 255, to: 300, height: 720, fps: 30, suggestedName: 'test' });
    } catch (e) { return { error: e.message }; }
  });
  console.log('EXPORT', JSON.stringify(r));
}

fs.writeFileSync(`${OUT}/console.log`, logs.join('\n'));
console.log('console lines:', logs.length);
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 30).join('\n'));
const proc = app.process();
const exited = new Promise((r) => proc.once('exit', () => r('exited')));
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
console.log('CLOSE:', await Promise.race([exited, new Promise((r) => setTimeout(() => r('HANG'), 8000))]));
proc.kill('SIGKILL');
process.exit(0);
