import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out', FX = ROOT + '/test/fixtures';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: ROOT + '/test/Library2' } });
const win = await app.firstWindow();
const logs = [];
win.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await win.waitForTimeout(1500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
// библиотека → персонажи → добавить
await win.click('#btnLibrary');
await win.waitForTimeout(400);
await win.click('.lib-list button.btn.primary');
await win.waitForTimeout(300);
const inputs = win.locator('.lib-edit input.input[type=text]');
await inputs.nth(0).fill('Тестовый герой');
await inputs.nth(1).fill('Герой');
// позы из файлов
const [fc] = await Promise.all([win.waitForEvent('filechooser'), win.click('text=＋ Позы из файлов…')]);
await fc.setFiles([FX + '/hero_idle.webp', FX + '/hero_talk.webp']);
await win.waitForTimeout(800);
await win.screenshot({ path: OUT + '/lib-char.png' });
await win.click('.lib-edit button.btn.primary');
await win.waitForTimeout(500);
// музыка
await win.click('.tabs button:nth-child(3)');
await win.waitForTimeout(300);
const [fc2] = await Promise.all([win.waitForEvent('filechooser'), win.click('text=＋ Из файлов…')]);
await fc2.setFiles([FX + '/theme.mp3']);
await win.waitForTimeout(600);
// фон
await win.click('.tabs button:nth-child(2)');
await win.waitForTimeout(300);
const [fc3] = await Promise.all([win.waitForEvent('filechooser'), win.click('text=＋ Из файлов…')]);
await fc3.setFiles([FX + '/room.png']);
await win.waitForTimeout(600);
await win.screenshot({ path: OUT + '/lib-bg.png' });
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
// новый проект и кадр с героем
const res = await win.evaluate(async () => {
  const L = window.Assets.Lib;
  const hero = L.list('characters').find((c) => c.name === 'Тестовый герой');
  const mus = L.list('music').find((m) => m.name === 'theme');
  const bg = L.list('backgrounds').find((b) => b.name === 'room');
  const p = { type: 'scene', groups: [{ frames: [
    { id: 1, characterId: hero.id, poseId: hero.poses[0].id, backgroundId: bg.id, text: `[#bgm${mus.id}]Привет! Это [#/r]свой[/#] персонаж[#p300]...[#fm] и своя музыка.` },
    { id: 2, characterId: hero.id, poseId: hero.poses[0].id, backgroundId: bg.id, text: '[#sm600:quake]Тряска!', flipped: 2 },
  ] }], options: { aspectRatio: '16:9' } };
  await window.App.open({ path: null, name: 'custom.objection', text: JSON.stringify(p) });
  return { hero: hero.poses.map((x) => [x.name, x.idleImageUrl, x.speakImageUrl]), mus: mus.id, bg: bg.id };
});
console.log(JSON.stringify(res));
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.waitForTimeout(800);
await win.evaluate(() => window.App.play(0));
await win.waitForTimeout(2200);
await win.screenshot({ path: OUT + '/custom-play.png' });
const music = await win.evaluate(() => !!window.App.audio.music);
console.log('music playing:', music);
console.log(logs.join('\n'));
const proc = app.process();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));
proc.kill('SIGKILL');
process.exit(0);
