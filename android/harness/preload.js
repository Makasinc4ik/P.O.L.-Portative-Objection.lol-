// Мосты OOFS / OONet / OOApp как в MainActivity.java, на Node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = process.env.OO_TEST_ROOT || '/tmp/oo-android';
const P = { lib: path.join(ROOT, 'files', 'Library'), data: path.join(ROOT, 'data'), cache: path.join(ROOT, 'cache'), sdk: 33, model: 'Test Phone' };
for (const d of [P.lib, P.data, P.cache]) fs.mkdirSync(d, { recursive: true });
const PUBLIC = path.join(ROOT, 'public');
const log = (...a) => { try { fs.appendFileSync(path.join(ROOT, 'bridge.log'), a.join(' ') + '\n'); } catch (e) { /* */ } };
const mk = (p) => fs.mkdirSync(path.dirname(p), { recursive: true });
window.OOFS = {
  exists: (p) => fs.existsSync(p),
  stat: (p) => { try { const s = fs.statSync(p); return JSON.stringify({ size: s.isFile() ? s.size : 0, mtimeMs: Math.floor(s.mtimeMs), isDir: s.isDirectory(), isFile: s.isFile() }); } catch (e) { return ''; } },
  readdir: (p) => { try { return JSON.stringify(fs.readdirSync(p)); } catch (e) { return ''; } },
  readdirTypes: (p) => { try { return JSON.stringify(fs.readdirSync(p, { withFileTypes: true }).map((d) => [d.name, d.isDirectory()])); } catch (e) { return ''; } },
  mkdirs: (p) => { try { fs.mkdirSync(p, { recursive: true }); return true; } catch (e) { return false; } },
  readText: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } },
  readB64: (p) => { try { return fs.readFileSync(p).toString('base64'); } catch (e) { return null; } },
  writeText: (p, t, append) => { try { mk(p); (append ? fs.appendFileSync : fs.writeFileSync)(p, t); return true; } catch (e) { return false; } },
  writeB64: (p, b, append) => { try { mk(p); (append ? fs.appendFileSync : fs.writeFileSync)(p, Buffer.from(b, 'base64')); return true; } catch (e) { return false; } },
  writeAt: (p, b, pos) => { try { const fd = fs.openSync(p, fs.existsSync(p) ? 'r+' : 'w'); const buf = Buffer.from(b, 'base64'); fs.writeSync(fd, buf, 0, buf.length, pos); fs.closeSync(fd); return true; } catch (e) { return false; } },
  truncate: (p, n) => { try { fs.truncateSync(p, n); return true; } catch (e) { return false; } },
  rename: (a, b) => { try { mk(b); fs.renameSync(a, b); return true; } catch (e) { return false; } },
  copy: (a, b) => { try { mk(b); fs.copyFileSync(a, b); return true; } catch (e) { return false; } },
  remove: (p, rec) => { try { if (!fs.existsSync(p)) return true; const s = fs.statSync(p); if (s.isDirectory()) { if (rec) fs.rmSync(p, { recursive: true }); else fs.rmdirSync(p); } else fs.unlinkSync(p); return true; } catch (e) { return false; } },
  sha1: (p) => { try { return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return null; } },
  sameBytes: (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch (e) { return false; } },
};
const ctl = new Map();
window.OONet = {
  request: (id, url, method, headers, body, toFile) => {
    const ac = new AbortController();
    ctl.set(id, ac);
    (async () => {
      const r = {};
      try {
        const res = await fetch(url, { method, headers: JSON.parse(headers || '{}'), body: body || undefined, signal: ac.signal, redirect: 'follow' });
        r.status = res.status; r.url = res.url; r.headers = Object.fromEntries(res.headers.entries());
        const head = { ...r };
        setTimeout(() => window.__ooNetHead && window.__ooNetHead(id, head), 0);
        const buf = Buffer.from(await res.arrayBuffer());
        if (toFile && res.status < 400) { mk(toFile); fs.writeFileSync(toFile, buf); r.size = buf.length; } else { r.body = buf.toString('base64'); r.size = buf.length; }
      } catch (e) { r.error = ac.signal.aborted ? 'aborted' : String(e.message || e); }
      ctl.delete(id);
      setTimeout(() => window.__ooNetDone && window.__ooNetDone(id, r), 0);
    })();
  },
  cancel: (id) => { const c = ctl.get(id); if (c) c.abort(); },
};
window.OOApp = {
  version: () => require(path.join(__dirname, '..', '..', 'package.json')).version,
  paths: () => JSON.stringify(P),
  openExternal: (u) => log('openExternal', u),
  keepScreenOn: (on) => log('keepScreenOn', on),
  toast: (m) => log('toast', m),
  setOrientation: (o) => log('orientation', o),
  publish: (src, name, mime, kind) => { const dir = path.join(PUBLIC, kind === 'video' ? 'Movies/Objection Offline' : 'Download/Objection Offline'); fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(src, path.join(dir, name)); log('publish', name, mime, kind); return (kind === 'video' ? 'Movies' : 'Download') + '/Objection Offline/' + name; },
  exit: () => log('exit'),
  takeLaunchFile: () => { const f = process.env.OO_LAUNCH_FILE || ''; process.env.OO_LAUNCH_FILE = ''; return f; },
};
