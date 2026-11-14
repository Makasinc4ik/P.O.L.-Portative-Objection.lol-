// 1.0.0: позы участников пары вкладками, «Говорят все в паре»
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out22';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const R = {};
R.setup = await win.evaluate(() => {
  const Lib = window.Assets.Lib;
  const chars = Lib.list('characters').filter((c) => c.poses && c.poses.length > 2).slice(0, 2);
  App.project.pairs = App.project.pairs || [];
  let pair = App.project.pairs.find((p) => p.id === 'tpair');
  if (!pair) { pair = { id: 'tpair', name: 'Тест-пара', pairs: chars.map((c, i) => ({ characterId: c.id, offsetX: i ? 20 : -20, offsetY: 0, front: i })) }; App.project.pairs.push(pair); }
  const f = App.project.groups[0].frames[0];
  f.characterId = chars[0].id; f.poseId = chars[0].poses[0].id; f.pair = { id: 'tpair', poseIds: {} }; f.text = 'Проверка разговора вдвоём, довольно длинная реплика';
  delete f.pairAllTalk;
  return chars.map((c) => c.name + ' / ' + c.poses.length);
});
// инспектор
await win.locator('.frame textarea').nth(1).click();
await win.waitForTimeout(300);
await win.locator('.frame textarea').nth(0).click();
await win.waitForTimeout(600);
R.tabs = await win.evaluate(() => [...document.querySelectorAll('.pose-tab')].map((b) => b.textContent));
await win.locator('.pose-tab').nth(1).click();
await win.waitForTimeout(300);
R.afterTab = await win.evaluate(() => ({ label: [...document.querySelectorAll('.field > label')].find((l) => /Поза/.test(l.textContent))?.textContent, tiles: document.querySelectorAll('.poses .pose').length, keepSel: !!document.querySelector('.pose.pose-keep.sel') }));
await win.locator('.poses .pose').nth(2).click();
await win.waitForTimeout(400);
R.afterPick = await win.evaluate(() => ({ poseIds: App.project.groups[0].frames[0].pair.poseIds, tabs: [...document.querySelectorAll('.pose-tab')].map((b) => b.textContent), activeTab: document.querySelector('.pose-tab.primary')?.textContent, sel: document.querySelector('.poses .pose.sel')?.title }));
await win.locator('.pose-tab').nth(0).click();
await win.waitForTimeout(300);
await win.locator('.poses .pose').nth(1).click();
await win.waitForTimeout(400);
R.speaker = await win.evaluate(() => { const f = App.project.groups[0].frames[0]; return { poseId: f.poseId, first: window.Assets.Lib.char(f.characterId).poses[1].id, pairPoses: f.pair.poseIds }; });
// галочка
const box = win.locator('label.chk', { hasText: 'Говорят все в паре' }).first();
R.chkDisabled = await box.locator('input').isDisabled();
await box.locator('input').check();
await win.waitForTimeout(300);
R.allTalk = await win.evaluate(() => App.project.groups[0].frames[0].pairAllTalk);
await win.evaluate(() => document.querySelector('.poses')?.scrollIntoView({ block: 'center' }));
await win.screenshot({ path: OUT + '/inspector.png' });
// проигрывание: кто шевелит губами
R.talk = await win.evaluate(async () => {
  const out = {};
  for (const all of [false, true]) {
    const f = { ...App.project.groups[0].frames[0], pairAllTalk: all || undefined, id: 'x' };
    const proj = { ...App.project, groups: [{ ...App.project.groups[0], frames: [f] }] };
    const cv = document.createElement('canvas');
    const pl = new window.Player(cv, App.audio); pl.setSize(640, 360); pl.setProject(proj);
    const seen = new Set();
    const iv = setInterval(() => { for (const c of pl.state.chars || []) if (c.talking) seen.add(c.c.name + (c.isMain ? '*' : '')); }, 15);
    await pl.playFrom(0, { tail: 50 });
    clearInterval(iv);
    out[all ? 'all' : 'one'] = [...seen];
  }
  return out;
});
// без пары галочка неактивна
await win.evaluate(() => { delete App.project.groups[0].frames[0].pair; delete App.project.groups[0].frames[0].pairAllTalk; });
await win.locator('.frame textarea').nth(1).click(); await win.waitForTimeout(300);
await win.locator('.frame textarea').nth(0).click(); await win.waitForTimeout(500);
R.noPair = await win.evaluate(() => { const l = [...document.querySelectorAll('label.chk')].find((x) => /Говорят все в паре/.test(x.textContent)); return { disabled: l?.querySelector('input').disabled, tabs: document.querySelectorAll('.pose-tab').length }; });
await win.evaluate(() => { App.project.pairs = (App.project.pairs || []).filter((p) => p.id !== 'tpair'); });
await win.waitForTimeout(3000);
console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
