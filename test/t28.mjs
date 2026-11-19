// Проект с ресурсами (ZIP): сохранить из одной библиотеки, открыть в пустой; конфликт номеров своих ресурсов
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const ZIP = '/tmp/bundle-test/Minecraft.zip';
fs.rmSync('/tmp/bundle-test', { recursive: true, force: true }); fs.mkdirSync('/tmp/bundle-test');
fs.rmSync('/tmp/libB', { recursive: true, force: true });
const launch = async (lib, ud) => {
  const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', '--user-data-dir=' + ud, ROOT], env: { ...process.env, OO_LIBRARY: lib, LANG: 'ru_RU.UTF-8' } });
  const win = await app.firstWindow(); await win.waitForTimeout(2500);
  await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
  return { app, win };
};
const out = {};
// 1) экспорт
{
  fs.rmSync('/tmp/udE', { recursive: true, force: true });
  const { app, win } = await launch('/tmp/fresh/Library', '/tmp/udE');
  await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
  await win.waitForTimeout(800);
  await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
  await app.evaluate(({ dialog }, zip) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: zip }); }, ZIP);
  const t0 = Date.now();
  out.export = await win.evaluate(() => window.api.project.exportBundle({ text: window.App.encodeProject(window.App.project), name: 'Minecraft', includePresets: true }));
  out.exportMs = Date.now() - t0;
  out.srcFrames = await win.evaluate(() => window.App.project.groups[0].frames.length);
  out.srcChar = await win.evaluate(() => { const f = window.App.project.groups[0].frames.find((x) => x.characterId); const c = window.Assets.Lib.char(f.characterId); return { id: f.characterId, name: c && c.name }; });
  await win.evaluate(() => { window.App.dirty = false; });
  await app.close();
}
out.zipSize = fs.statSync(ZIP).size;
// 2) пустая библиотека + свой ресурс с тем же номером, что у одного из ресурсов архива
{
  fs.rmSync('/tmp/udF', { recursive: true, force: true });
  const { app, win } = await launch('/tmp/libB', '/tmp/udF');
  const clash = await win.evaluate(async () => {
    const { Lib } = window.Assets;
    const a = await Lib.upsert('backgrounds', { name: 'Чужой фон', url: '' });
    return a.id;
  });
  out.clashId = clash;
  out.open = await win.evaluate(async (zip) => { const r = await window.api.project.readPath(zip); return { name: r.name, path: r.path, bundle: r.bundle, len: r.text.length }; }, ZIP);
  // открыть как пользователь (через doOpen)
  await win.evaluate(async (zip) => { window.App.dirty = false; await window.__ooOpenFile ? 0 : 0; }, ZIP);
  const r2 = await win.evaluate(async (zip) => {
    const r = await window.api.project.readPath(zip); // повторное открытие — ресурсы уже есть
    return r.bundle;
  }, ZIP);
  out.reopen = r2;
  out.lib = await win.evaluate(async () => { await window.Assets.Lib.load(); const L = window.Assets.Lib; return Object.fromEntries(['characters', 'backgrounds', 'music', 'sounds', 'textboxes', 'popups', 'evidence'].map((t) => [t, L.list(t).length])); });
  await app.close();
}
// 3) открыть архив через меню-путь (doOpen) и проверить кадр
{
  const { app, win } = await launch('/tmp/libB', '/tmp/udF');
  await app.evaluate(({ dialog }, zip) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [zip] }); }, ZIP);
  await win.evaluate(() => { window.App.dirty = false; });
  await win.locator('[data-menu="file"]').click();
  await win.locator('[data-act="open"]').click();
  await win.waitForTimeout(3000);
  out.opened = await win.evaluate(() => {
    const A = window.App; const L = window.Assets.Lib;
    const fr = A.project.groups[0].frames;
    const missingChars = fr.filter((f) => f.characterId && !L.char(f.characterId)).length;
    const missingBgs = fr.filter((f) => f.backgroundId && !L.bg(f.backgroundId)).length;
    const bgmIds = [...new Set(fr.flatMap((f) => [...(f.text || '').matchAll(/\[#bgm(\d+)\]/g)].map((m) => +m[1])))];
    return { frames: fr.length, missingChars, missingBgs, missingMusic: bgmIds.filter((id) => !L.get('music', id)).length, name: A.fileName, path: A.filePath };
  });
  await win.evaluate(() => window.App.select(263));
  await win.waitForTimeout(1500);
  await win.screenshot({ path: ROOT + '/test/out26/bundle-opened.png' });
  out.files = await win.evaluate(async () => { const L = window.Assets.Lib; const c = L.list('characters').find((x) => !x.isPreset); return c ? { name: c.name, url: c.poses && c.poses[0] && c.poses[0].idleImageUrl } : null; });
  await win.evaluate(() => { window.App.dirty = false; });
  await app.close();
}
console.log(JSON.stringify(out, null, 1));
