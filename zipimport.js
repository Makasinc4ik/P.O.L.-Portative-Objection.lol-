// Импорт персонажей из ZIP-архива с папкой спрайтов (главный процесс)
'use strict';
const zlib = require('zlib');
const path = require('path');

// ---------- чтение ZIP ----------
function decodeName(bytes, utf8Flag, extra) {
  // Info-ZIP Unicode Path (0x7075)
  let p = 0;
  while (extra && p + 4 <= extra.length) {
    const id = extra.readUInt16LE(p); const len = extra.readUInt16LE(p + 2);
    if (id === 0x7075 && len > 5) return extra.slice(p + 9, p + 4 + len).toString('utf8');
    p += 4 + len;
  }
  if (utf8Flag) return bytes.toString('utf8');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* не UTF-8 */ }
  try { return new TextDecoder('ibm866').decode(bytes); } catch (e) { return bytes.toString('latin1'); }
}

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(tx('Это не ZIP-архив'));
  let count = buf.readUInt16LE(eocd + 10);
  let cdOff = buf.readUInt32LE(eocd + 16);
  if (cdOff === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && buf.readUInt32LE(loc) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(loc + 8));
      count = Number(buf.readBigUInt64LE(z64 + 32));
      cdOff = Number(buf.readBigUInt64LE(z64 + 48));
    }
  }
  const entries = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    let compSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nLen = buf.readUInt16LE(p + 28);
    const eLen = buf.readUInt16LE(p + 30);
    const cLen = buf.readUInt16LE(p + 32);
    let localOff = buf.readUInt32LE(p + 42);
    const nameBytes = buf.slice(p + 46, p + 46 + nLen);
    const extra = buf.slice(p + 46 + nLen, p + 46 + nLen + eLen);
    // zip64-размеры
    let q = 0;
    while (q + 4 <= extra.length) {
      const id = extra.readUInt16LE(q); const len = extra.readUInt16LE(q + 2);
      if (id === 0x0001) {
        let r = q + 4;
        if (size === 0xffffffff) { size = Number(extra.readBigUInt64LE(r)); r += 8; }
        if (compSize === 0xffffffff) { compSize = Number(extra.readBigUInt64LE(r)); r += 8; }
        if (localOff === 0xffffffff) { localOff = Number(extra.readBigUInt64LE(r)); }
      }
      q += 4 + len;
    }
    const name = decodeName(nameBytes, flags & 0x800, extra).replace(/\\/g, '/');
    entries.push({ name, method, compSize, size, localOff, encrypted: !!(flags & 1) });
    p += 46 + nLen + eLen + cLen;
  }
  return {
    entries,
    read(e) {
      const lo = e.localOff;
      if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error(tx('повреждённый архив'));
      const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
      const data = buf.slice(start, start + e.compSize);
      if (e.method === 0) return data;
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(tx('неподдерживаемое сжатие в ') + e.name);
    },
  };
}

// ---------- длительность анимации GIF/WebP (для кадров «перед позой») ----------
function animDuration(buf) {
  if (buf.slice(0, 4).toString('latin1') === 'GIF8') {
    let total = 0;
    for (let i = 0; i < buf.length - 6; i++) {
      if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 0x04) {
        const d = buf.readUInt16LE(i + 4) * 10;
        total += d < 20 ? 100 : d;
        i += 6;
      }
    }
    return total || 0;
  }
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    let total = 0;
    let p = 12;
    while (p + 8 <= buf.length) {
      const id = buf.slice(p, p + 4).toString('latin1');
      const size = buf.readUInt32LE(p + 4);
      if (id === 'ANMF' && p + 8 + 16 <= buf.length) {
        const d = buf[p + 8 + 12] | (buf[p + 8 + 13] << 8) | (buf[p + 8 + 14] << 16);
        total += d < 20 ? 100 : d;
      }
      p += 8 + size + (size & 1);
    }
    return total;
  }
  return 0;
}

// ---------- сборка персонажей ----------
const IMG = /\.(png|gif|webp|jpe?g|apng|avif)$/i;
const AUD = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i;
const ROLE_IDLE = ['idle', 'stand', 'still', 'a', 'silent'];
const ROLE_TALK = ['talk', 'talking', 'speak', 'speaking', 'b', 'mouth'];
const ROLE_PRE = ['pre', 'anim', 'animation', 'intro', 'start'];
const BUBBLES = [
  [/^(objection|протестую|возражаю)/i, 'Objection!'],
  [/^(hold\s*it|holdit|минуточку|стоп)/i, 'Hold It!'],
  [/^(take\s*that|takethat|получай|вот)/i, 'Take That!'],
];

function splitRole(base) {
  const m = base.match(/^(.*?)[\s_\-.()]*\(?(idle|stand|still|silent|talk|talking|speak|speaking|mouth|pre|anim|animation|intro|start|a|b)\)?$/i);
  if (!m) return { base, role: '' };
  return { base: m[1].trim(), role: m[2].toLowerCase() };
}

function prettify(s) { return s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(); }

// files: [{rel: 'Папка/поза.gif', buf}] внутри корня персонажа
async function buildCharacter(name, files, ctx) {
  const { saveBuffer, newId } = ctx;
  const ch = {
    id: newId(), name: prettify(name), nameplate: prettify(name).split(' ')[0], side: 'witness', alignment: 0,
    offsetX: 0, offsetY: 0, size: 100, limitWidth: false, blipUrl: '/Audio/blip.wav', backgroundId: null,
    iconUrl: '', poses: [], speechBubbles: [], source: 'custom',
  };
  const poses = new Map();
  const audios = [];
  const bubbleImgs = [];
  for (const f of files) {
    const parts = f.rel.split('/');
    const file = parts.pop();
    const ext = path.extname(file);
    const stem = file.slice(0, -ext.length);
    const parent = parts.length ? parts[parts.length - 1] : '';
    if (AUD.test(file)) { audios.push({ stem, parent, f }); continue; }
    if (!IMG.test(file)) continue;
    if (/^(icon|иконка|значок)$/i.test(stem)) { ch.iconUrl = await saveBuffer(f.buf, file); continue; }
    const bub = BUBBLES.find(([re]) => re.test(stem));
    // выкрики — только из папки вида «Bubbles», «Выкрики», «Shouts» (иначе это поза, например «Objection»)
    if (bub && /bubble|выкрик|shout|speech/i.test(f.rel)) { bubbleImgs.push({ stem, name: bub[1], f }); continue; }
    let { base, role } = splitRole(stem);
    // поза в своей папке: «Стоит/idle.gif», «Стоит/talk.gif»
    if ((!base || [...ROLE_IDLE, ...ROLE_TALK, ...ROLE_PRE].includes(stem.toLowerCase())) && parent) { base = parent; role = role || stem.toLowerCase(); }
    if (!base) base = stem;
    const key = (parent && parent !== base ? parent + '/' : '') + base;
    const g = poses.get(key) || { name: prettify(base), idle: null, talk: null, pre: [] };
    if (ROLE_TALK.includes(role)) g.talk = f;
    else if (ROLE_PRE.includes(role)) g.pre.push(f);
    else if (!g.idle || !role) g.idle = f;
    poses.set(key, g);
  }
  const sorted = [...poses.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
  for (const g of sorted) {
    const idleF = g.idle || g.talk;
    if (!idleF) continue;
    const idle = await saveBuffer(idleF.buf, idleF.rel);
    const talk = g.talk ? await saveBuffer(g.talk.buf, g.talk.rel) : idle;
    const pose = { id: newId(), name: g.name, idleImageUrl: idle, speakImageUrl: talk, isSpeedlines: false, iconUrl: '', order: ch.poses.length, poseStates: [], poseAudioTicks: [], poseFunctionTicks: [] };
    for (const pf of g.pre) pose.poseStates.push({ imageUrl: await saveBuffer(pf.buf, pf.rel), nextPoseDelay: animDuration(pf.buf) || 1000, noSpeakDelay: false });
    ch.poses.push(pose);
  }
  // звуки: blip — голос, «как поза» — звук позы, «как выкрик» — звук выкрика
  for (const a of audios) {
    const low = a.stem.toLowerCase();
    if (/^(blip|голос|voice)/.test(low)) { ch.blipUrl = await saveBuffer(a.f.buf, a.f.rel); continue; }
    const kind = BUBBLES.find(([re]) => re.test(low));
    const bub = bubbleImgs.find((b) => b.stem.toLowerCase() === low) || (kind && bubbleImgs.find((b) => b.name === kind[1]));
    if (bub && !bub.sound) { bub.sound = await saveBuffer(a.f.buf, a.f.rel); continue; }
    const pose = ch.poses.find((p) => p.name.toLowerCase() === prettify(splitRole(a.stem).base || a.stem).toLowerCase());
    if (pose) pose.poseAudioTicks.push({ fileName: await saveBuffer(a.f.buf, a.f.rel), time: 0, volume: 100 });
  }
  for (const b of bubbleImgs) {
    ch.speechBubbles.push({ id: newId(), name: b.name, imageUrl: await saveBuffer(b.f.buf, b.f.rel), soundUrl: b.sound || '/Audio/Vocal/sfx-objection.wav', duration: 1000, shake: true, fullscreen: false, order: ch.speechBubbles.length });
  }
  return ch.poses.length ? ch : null;
}

async function importCharactersFromZip(zipPath, buf, ctx) {
  const z = readZip(buf);
  const files = z.entries
    .filter((e) => !e.name.endsWith('/') && !e.encrypted)
    .filter((e) => !/(^|\/)(__MACOSX|\.)/.test(e.name) && !/thumbs\.db$|desktop\.ini$/i.test(e.name))
    .filter((e) => IMG.test(e.name) || AUD.test(e.name));
  if (!files.length) return [];
  const zipName = path.basename(zipPath).replace(/\.zip$/i, '');
  // общий корень убираем: «Персонаж/…» → «…»
  let paths = files.map((e) => e.name.split('/'));
  let root = [];
  while (paths.every((p) => p.length > 1 && p[0] === paths[0][0])) { root.push(paths[0][0]); paths = paths.map((p) => p.slice(1)); }
  const items = files.map((e, i) => ({ e, parts: paths[i] }));
  // несколько персонажей: картинок в корне нет, а подпапок с картинками несколько, и в них есть свои подпапки или много файлов
  const topImgs = items.filter((it) => it.parts.length === 1 && IMG.test(it.parts[0]));
  const groups = new Map();
  for (const it of items) if (it.parts.length > 1) { const k = it.parts[0]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const looksMulti = !topImgs.length && groups.size > 1 && [...groups.values()].every((g) => g.filter((it) => IMG.test(it.e.name)).length >= 2)
    && [...groups.values()].some((g) => g.some((it) => it.parts.length > 2) || g.length > 4);
  const result = [];
  const load = (list, strip) => list.map((it) => ({ rel: it.parts.slice(strip).join('/'), buf: z.read(it.e) }));
  if (looksMulti) {
    for (const [name, list] of groups) {
      const ch = await buildCharacter(name, load(list, 1), ctx);
      if (ch) result.push(ch);
    }
  } else {
    const ch = await buildCharacter(root.length ? root[root.length - 1] : zipName, load(items, 0), ctx);
    if (ch) result.push(ch);
  }
  return result;
}

module.exports = { readZip, importCharactersFromZip, animDuration };
