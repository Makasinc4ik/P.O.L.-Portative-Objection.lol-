// Английский интерфейс: переключение, снимки, поиск оставшейся кириллицы (кроме содержимого проекта)
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out23';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
let win = await app.firstWindow();
const logs = [];
const hook = (w) => { w.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack)); };
hook(win);
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
// переключение через меню «Файл»
await win.locator('[data-menu="file"]').click();
await win.waitForTimeout(200);
const label = await win.locator('#menuLang').textContent();
await Promise.all([win.waitForEvent('load').catch(() => {}), win.locator('#menuLang').click()]);
await win.waitForTimeout(3500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const R = { label, lang: await win.evaluate(() => window.OO_LANG) };
// кириллица в интерфейсе (без текста реплик, названий ресурсов и имён)
const cyr = async (name) => win.evaluate((name) => {
  const out = new Set();
  const skip = (el) => el.closest('textarea, .frame .badges, .picker-btn .nm, .pose span, .card .nm, .scene-name, #projectTitle, .lib-folders, .grid, .poses, .pose-tab, option[data-user]');
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue.trim();
    if (!/[А-Яа-яЁё]/.test(t)) continue;
    const el = n.parentElement;
    if (!el || skip(el) || el.closest('.hidden') || getComputedStyle(el).display === 'none') continue;
    out.add(t.slice(0, 80));
  }
  for (const el of document.querySelectorAll('[title],[placeholder]')) for (const a of ['title', 'placeholder']) { const v = el.getAttribute(a); if (v && /[А-Яа-яЁё]/.test(v) && !skip(el)) out.add('@' + a + ': ' + v.slice(0, 60)); }
  return [...out].slice(0, 40);
}, name);
const shot = async (n) => { await win.waitForTimeout(500); await win.screenshot({ path: `${OUT}/${n}.png` }); R[n] = await cyr(n); };
await win.locator('.frame textarea').nth(2).click().catch(() => {});
await shot('main');
await win.locator('[data-menu="file"]').click(); await shot('filemenu'); await win.keyboard.press('Escape'); await win.evaluate(() => document.getElementById('fileMenu').classList.add('hidden'));
await win.locator('.tagbar button').nth(0).click(); await shot('pausemenu'); await win.mouse.click(5, 300);
await win.locator('#btnLibrary').click(); await win.waitForTimeout(1200); await shot('library');
await win.locator('.lib-list .grid > *').first().click().catch(() => {}); await win.waitForTimeout(800); await shot('library-char');
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
await win.locator('#btnSettings').click(); await shot('settings'); await win.keyboard.press('Escape');
await win.locator('#btnExport').click(); await shot('export'); await win.keyboard.press('Escape');
await win.locator('#btnScenes').click(); await shot('scenes'); await win.keyboard.press('Escape');
// сообщение из «главного процесса»
R.mainMsg = await win.evaluate(async () => { try { await window.api.download.byCode('characters', '', ''); return 'no error'; } catch (e) { return e.message; } });
// назад на русский
await win.locator('[data-menu="file"]').click();
await Promise.all([win.waitForEvent('load').catch(() => {}), win.locator('#menuLang').click()]);
await win.waitForTimeout(3000);
R.back = await win.evaluate(() => ({ lang: window.OO_LANG, btn: document.getElementById('btnLibrary').textContent }));
console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
