import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
win.on('console', (m) => logs.push('[' + m.type() + '] ' + m.text()));
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
await win.evaluate(() => { window.App.dirty = false; });
await win.evaluate((t) => window.App.open({ path: '/tmp/Minecraft.objection', name: 'Minecraft.objection', text: t }), fs.readFileSync('/mnt/user-data/uploads/d50e114a-Minecraft.objection', 'utf8'));
await win.waitForTimeout(800);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const r = await win.evaluate(async () => {
  const L = window.Assets.Lib, A = window.App;
  const p = (L.list('popups').find((x) => x.name === 'Тест-заставка')) || await L.upsert('popups', { name: 'Тест-заставка', url: 'System/Images/Popups/testimony.gif', introDuration: 1600 });
  const f = A.project.groups[0].frames[3];
  f.actions = (f.actions || []).filter((a) => a.actionId !== 7); f.actions.push({ actionId: 7, actionParam: 'c' + p.id });
  A.player.setProject(A.project);
  const pf = A.player.frames[3];
  A.player.playFrom(3, {});
  const seen = [];
  for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 200)); seen.push(A.player.state.presetPopups.map((x) => x.url + ':' + !!x.img).join(',') + '|' + (A.player.state.box.visible ? 'box' : '')); }
  A.player.stop();
  return { pf: pf && pf.actions, same: pf === f, seen, text: (f.text || '').slice(0, 30) };
});
console.log(JSON.stringify(r, null, 1), logs.filter((l) => !l.startsWith('[log]')).slice(-10));
await app.close();
