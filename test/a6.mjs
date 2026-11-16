// Android (обвязка, телефон 412×915): библиотека — вкладки листаются вбок, список прокручивается вместе с панелями
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT + '/android/harness'], env: { ...process.env, OO_TEST_ROOT: '/tmp/oo-android2', OO_W: '412', OO_H: '915' } });
const win = await app.firstWindow();
await win.waitForTimeout(3500);
for (let i = 0; i < 3; i++) { await win.evaluate(() => window.__ooBack && window.__ooBack()); await win.waitForTimeout(200); }
await win.evaluate(() => document.getElementById('btnLibrary').click());
await win.waitForTimeout(1500);
const r = await win.evaluate(() => {
  const t = document.querySelector('.modal .tabs'); const mb = document.querySelector('.modal-body'); const grid = document.querySelector('.lib-list .grid');
  const cs = getComputedStyle(t);
  return { mobile: document.body.classList.contains('mobile'), tabs: { sw: t.scrollWidth, cw: t.clientWidth, ox: cs.overflowX }, body: { sh: mb.scrollHeight, ch: mb.clientHeight, oy: getComputedStyle(mb).overflowY }, gridOy: getComputedStyle(grid).overflowY };
});
await win.evaluate(() => { const t = document.querySelector('.modal .tabs'); t.scrollLeft = t.scrollWidth; });
await win.waitForTimeout(200);
await win.screenshot({ path: ROOT + '/test/outA3/11-library-tabs.png' });
await win.mouse.move(200, 700);
await win.mouse.wheel(0, 1500);
await win.waitForTimeout(400);
r.scrolledTop = await win.evaluate(() => document.querySelector('.modal-body').scrollTop);
await win.screenshot({ path: ROOT + '/test/outA3/12-library-scrolled.png' });
// открыть карточку — редактор поверх списка, вверху
await win.locator('.lib-list .grid .card').nth(4).click().catch(() => {});
await win.waitForTimeout(600);
r.edit = await win.evaluate(() => { const e = document.querySelector('.lib-edit.open'); const mb = document.querySelector('.modal-body'); return e ? { top: Math.round(e.getBoundingClientRect().top), mbTop: Math.round(mb.getBoundingClientRect().top), scrollTop: mb.scrollTop } : null; });
await win.screenshot({ path: ROOT + '/test/outA3/13-library-edit.png' });
console.log(JSON.stringify(r));
await app.close();
