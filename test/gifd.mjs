import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
await win.waitForTimeout(2500);
const r = await win.evaluate(async () => {
  const out = {};
  for (const rel of ["Backgrounds/Godot's Mask Glow.gif", 'System/Images/Popups/testimony.gif', 'System/Images/Popups/wt.gif']) {
    const img = await window.Assets.ImageCache.get(rel, 48);
    out[rel] = img && { animated: img.animated, total: img.total };
  }
  // как при выборе файла: staging во входящие
  const buf = await (await fetch('oo://lib/System/Images/Popups/wt.gif')).arrayBuffer(); const st = await window.api.lib.importFile(new File([buf], 'wt.gif', { type: 'image/gif' }));
  const img = await window.Assets.ImageCache.get(st, 48);
  out.staged = { st, total: img && img.total };
  return out;
});
console.log(JSON.stringify(r));
await app.close();
