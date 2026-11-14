// fetch для main.js: запросы идут через Java (OONet), поэтому CORS сайтов не мешает.
// Ответ отдаётся, как только пришли заголовки (как обычный fetch); тело — когда докачается.
// Дополнительно: opts.toFile — тело пишется сразу в файл (не проходит через JavaScript); res.done — когда файл записан.
import { Buffer } from 'buffer';
import { NET } from './native.js';

let seq = 0;
const reqs = new Map();
globalThis.__ooNetHead = (id, r) => { const q = reqs.get(id); if (q) q.head(r); };
globalThis.__ooNetDone = (id, r) => { const q = reqs.get(id); if (q) { reqs.delete(id); q.done(r); } };

function headersObj(h) {
  const o = {};
  if (!h) return o;
  if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v, k) => { o[k] = v; });
  else for (const [k, v] of Object.entries(h)) if (v != null) o[k] = String(v);
  return o;
}

export function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const id = 'n' + (++seq);
    const signal = opts.signal;
    const abortErr = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    if (signal && signal.aborted) { reject(abortErr()); return; }
    let headed = false;
    let bodyResolve, bodyReject;
    const body = new Promise((res, rej) => { bodyResolve = res; bodyReject = rej; });
    body.catch(() => {});
    const makeResponse = (r) => {
      const bytes = async () => { const d = await body; return d.body ? Buffer.from(d.body, 'base64') : new Uint8Array(0); };
      return {
        ok: r.status >= 200 && r.status < 300, status: r.status, statusText: '', url: r.url, redirected: false,
        headers: new Headers(r.headers || {}), body: null,
        done: body.then((d) => ({ size: d.size })),
        cancel: () => onAbort(),
        arrayBuffer: async () => { const b = await bytes(); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
        text: async () => new TextDecoder().decode(await bytes()),
        json: async () => JSON.parse(new TextDecoder().decode(await bytes())),
      };
    };
    const onAbort = () => {
      reqs.delete(id);
      NET().cancel(id);
      const e = abortErr();
      if (!headed) reject(e);
      bodyReject(e);
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    reqs.set(id, {
      head: (r) => { if (headed) return; headed = true; resolve(makeResponse(r)); },
      done: (r) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        if (r.error) {
          const e = new TypeError('fetch failed: ' + r.error);
          if (!headed) reject(e);
          bodyReject(e);
          return;
        }
        if (!headed) { headed = true; resolve(makeResponse(r)); }
        bodyResolve(r);
      },
    });
    const b = opts.body == null ? '' : typeof opts.body === 'string' ? opts.body : String(opts.body);
    NET().request(id, String(url), opts.method || 'GET', JSON.stringify(headersObj(opts.headers)), b, opts.toFile || '');
  });
}
