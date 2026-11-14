import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: ROOT + '/test/LibraryP' } });
const win = await app.firstWindow();
const logs = []; win.on('console', (m) => logs.push(m.text())); win.on('pageerror', (e) => logs.push('[err] ' + e.message));
await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: out + '/' + o.defaultPath.split('/').pop() }); }, OUT);
await win.waitForTimeout(1500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const SPEED = Number(process.argv[2]);
const p = { type: 'scene', options: { aspectRatio: '16:9' }, aliases: [{ from: 'Phoenix', to: 'Максим' }], groups: [{ frames: [
  { id: 1, characterId: 1, poseId: 1, text: '[#bgm2]Ваша честь, защита готова.' },
  { id: 2, characterId: 1, poseId: 2, speechBubble: 1, text: 'Протестую! [#p300]Свидетель лжёт!' },
  { id: 3, characterId: 1, poseId: SPEED, text: '[#sl]Вот [#/r]доказательство[/#]!' },
  { id: 4, characterId: 2, poseId: 0, text: '[#bgmfo]Хм...' },
] }] };
const ed = await win.evaluate(() => window.Assets.Lib.char(2).poses[0].id);
p.groups[0].frames[3].poseId = ed;
await win.evaluate((t) => window.App.open({ path: null, name: 'preset.objection', text: t }), JSON.stringify(p));
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const r = await win.evaluate(async () => window.Exporter.exportVideo(window.App.player, window.App.audio, { from: 0, to: 4, height: 720, format: 'mp4', suggestedName: 'preset' }).catch((e) => ({ error: e.message })));
console.log(JSON.stringify(r)); console.log(logs.join('\n'));
const proc = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
await new Promise((r) => setTimeout(r, 1500)); proc.kill('SIGKILL'); process.exit(0);
