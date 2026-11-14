// Тестовая обвязка на ПК: изображает Android-оболочку (MainActivity.java) в Electron, чтобы проверить сборку APK без телефона.
// https://objection.offline/app/… — из android/build/assets/app, /lib/… — из папки библиотеки (с Range), мосты — в preload.js
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = process.env.OO_TEST_ROOT || '/tmp/oo-android';
const ASSETS = path.join(__dirname, '..', 'build', 'assets', 'app');
const LIB = path.join(ROOT, 'files', 'Library');
fs.mkdirSync(LIB, { recursive: true });
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm' };
const mimeOf = (f) => MIME[(f.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
app.whenReady().then(() => {
  protocol.handle('https', async (req) => {
    const u = new URL(req.url);
    if (u.host !== 'objection.offline') return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const p = decodeURIComponent(u.pathname);
    let file;
    if (p.startsWith('/app/')) file = path.join(ASSETS, p.slice(5) || 'index.html');
    else if (p.startsWith('/lib/')) file = path.join(LIB, p.slice(5));
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('', { status: 404 });
    const size = fs.statSync(file).size;
    const range = req.headers.get('range');
    const m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (m && size) {
      let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      let end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
      const buf = fs.readFileSync(file).subarray(start, end + 1);
      return new Response(buf, { status: 206, headers: { 'content-type': mimeOf(file), 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': String(buf.length) } });
    }
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': mimeOf(file), 'accept-ranges': 'bytes' } });
  });
  const w = new BrowserWindow({
    width: Number(process.env.OO_W || 412), height: Number(process.env.OO_H || 915), backgroundColor: '#15171c',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: false, sandbox: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  w.loadURL('https://objection.offline/app/index.html');
});
