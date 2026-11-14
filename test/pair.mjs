import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: ROOT + '/test/LibraryP' } });
const win = await app.firstWindow();
const logs = []; win.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`)); win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: out + '/' + o.defaultPath.split('/').pop() }); }, OUT);
await win.waitForTimeout(1500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const pairId = 'p1';
const p = { type: 'scene', options: { aspectRatio: '16:9' }, pairs: [{ id: pairId, name: 'Пара', pairs: [{ characterId: 1, offsetX: -10, offsetY: 0, size: 100, front: 0 }, { characterId: 4, offsetX: 30, offsetY: 0, size: 100, front: 0 }] }],
  groups: [{ frames: [
    { id: 1, characterId: 1, poseId: 1, backgroundId: 3, pair: { id: pairId, poseIds: {} }, text: 'Мы вдвоём.' },
    { id: 2, characterId: 1, poseId: 1, backgroundId: 3, pair: { id: pairId, poseIds: {} }, text: 'Я исчезаю[#p800]', fade: { type: 'fadeOut', target: 'characters', duration: 300, characters: 2 } },
    { id: 3, characterId: 1, poseId: 1, backgroundId: 3, pair: { id: pairId, poseIds: {} }, text: 'Возвращаюсь', fade: { type: 'fadeIn', target: 'characters', duration: 300, characters: 2 } },
  ] }] };
await win.evaluate((t) => window.App.open({ path: null, name: 'pair.objection', text: t }), JSON.stringify(p));
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const r = await win.evaluate(async () => window.Exporter.exportVideo(window.App.player, window.App.audio, { from: 0, to: 3, height: 720, fps: 30, aspect: 21 / 9, suggestedName: 'pair219' }).catch((e) => ({ error: e.message })));
console.log(JSON.stringify(r)); console.log(logs.filter((l) => !/stats/.test(l)).join('\n'));
const proc = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(() => {});
await new Promise((r) => setTimeout(r, 1500)); proc.kill('SIGKILL'); process.exit(0);
