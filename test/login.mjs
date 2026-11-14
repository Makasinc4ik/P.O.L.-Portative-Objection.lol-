import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
await win.waitForTimeout(2000);
win.evaluate(() => window.api.auth.login()).then((r) => console.log('login result', JSON.stringify(r)));
await win.waitForTimeout(12000);
const wins = app.windows();
console.log('windows', wins.length, await Promise.all(wins.map((w) => w.url())));
const lw = wins.find((w) => w.url().includes('objection.lol'));
if (lw) {
  await lw.screenshot({ path: '/tmp/login.png' });
  console.log(await lw.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 30).join(' | ')));
  await lw.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Discord').click());
  await lw.waitForTimeout(5000);
  console.log('after discord', await Promise.all(app.windows().map((w) => w.url())));
  console.log('ua', await lw.evaluate(() => navigator.userAgent));
}
app.process().kill('SIGKILL'); process.exit(0);
