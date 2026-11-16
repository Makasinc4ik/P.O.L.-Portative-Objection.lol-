// Библиотека ресурсов, загрузка картинок (с анимацией) и звука
'use strict';

const SITE = 'https://objection.lol';
// откуда браузерная часть берёт файлы библиотеки: oo://lib/ на ПК, https://objection.offline/lib/ на Android
const LIB_BASE = (window.api && window.api.libBase) || 'oo://lib/';

const SYSTEM = {
  blips: [
    { id: 1, label: tx('Мужской'), url: '/Audio/blip.wav' },
    { id: 2, label: tx('Женский'), url: '/Audio/blip-female.wav' },
    { id: 3, label: tx('Печатная машинка'), url: '/Audio/blip-machine.wav' },
    { id: 4, label: tx('Эхо'), url: '/Audio/blip-echo.wav' },
    { id: 5, label: 'Katonk', url: '/Audio/blip-katonk.wav' },
    { id: 6, label: tx('Без звука'), url: '/Audio/blip-muted.wav' },
  ],
  bubbles: [
    { id: 1, name: 'Objection!', imageUrl: '/Images/Bubbles/1.png', soundUrl: '/Audio/Vocal/sfx-objection.wav' },
    { id: 2, name: 'Hold It!', imageUrl: '/Images/Bubbles/2.png', soundUrl: '/Audio/Vocal/sfx-objection.wav' },
    { id: 3, name: 'Take That!', imageUrl: '/Images/Bubbles/3.png', soundUrl: '/Audio/Vocal/sfx-objection.wav' },
  ],
  speedlines: '/Images/speedlines.gif',
  objectionSfx: '/Audio/Vocal/sfx-objection.wav',
  // Текстбоксы objection.lol (файлы скачиваются вместе со стандартными ресурсами)
  textboxes: [
    { id: '1', isPreset: true, name: 'Ace Attorney Trilogy', url: '/Images/UI/Chatbox/Trilogy/textbox.png', imageOpacity: 0.92, wordSpacing: 0, defaultColor: null, red: null, green: null, blue: null, nameplate: { fontSize: 29, url: '/Images/UI/Chatbox/Trilogy/nameplate.png', top: 62.9, right: 31.7, fontUrl: '/Fonts/Trilogy-body.woff2', replaceBox: false, color: 'FFFFFF', textAlignment: 'center', width: 100 }, text: { fontSize: 34, width: 67, widthCenter: 98, height: 4.5179, left: 23.2, leftCenter: 1, top: 69, topCenter: 68.5, fontUrl: '/Fonts/Trilogy-body.woff2', textAlignment: 'start' }, nextButton: { iconSize: 3.75, iconColor: 'FFD560', top: 75.7, left: 91 } },
    { id: '2', isPreset: true, name: 'Apollo Justice', url: '/Images/UI/Chatbox/AJ/textbox-nameless.png', wordSpacing: 0.5, defaultColor: 'DCDCDC', red: null, green: null, blue: null, nameplate: { fontSize: 27, url: '/Images/UI/Chatbox/AJ/textbox.png', top: 71, right: 27.6, fontUrl: '/Fonts/AJ-nameplate.ttf', replaceBox: true, color: 'FFFFFF', textAlignment: 'center', width: 100 }, text: { fontSize: 28, width: 69, height: 4.2, left: 15.5, top: 77.5, topCenter: 77.8, lineHeight: 1.4, fontUrl: '/Fonts/AJ_body.woff2', textAlignment: 'start' }, nextButton: { iconSize: 5.8125, iconColor: 'FFFFFF', top: 83, left: 88.8 } },
    { id: '3', isPreset: true, name: 'The Great Ace Attorney', url: '/Images/UI/Chatbox/TGAA/textbox-nameless.png', letterSpacing: 0.05, wordSpacing: 0, defaultColor: 'E0E0E0', red: 'FF6D18', green: '80FB0A', blue: '18D7FA', nameplate: { fontSize: 24, url: '/Images/UI/Chatbox/TGAA/textbox.png', top: 69, right: 27.8, fontUrl: '/Fonts/TGAA-nameplate.woff2', replaceBox: true, letterSpacing: 0.05, color: 'FFFFFF', textAlignment: 'center', width: 100 }, text: { fontSize: 30, width: 73, height: 2.8, left: 13.6, top: 76.5, fontUrl: '/Fonts/TGAA-body.otf', lineHeight: 1.4, textAlignment: 'start' }, nextButton: { iconSize: 2.5, iconColor: 'DAD79F', top: 80.1, left: 86 } },
    { id: '4', isPreset: true, name: 'DS Style', url: '/Images/UI/Chatbox/DS/textbox-nameless.png', wordSpacing: 0, letterSpacing: 0.05, opacity: 0.85, defaultColor: null, red: null, green: null, blue: null, nameplate: { fontSize: 26, url: '/Images/UI/Chatbox/DS/textbox.png', top: 61.7, right: 39.7, fontUrl: '/Fonts/DS-nameplate.ttf', replaceBox: true, letterSpacing: 0.05, color: 'FFFFFF', textAlignment: 'center', width: 100 }, text: { fontSize: 50, width: 92, height: 3.6, left: 4, top: 70, fontUrl: '/Fonts/DS.ttf', lineHeight: 1.2, textAlignment: 'start' }, nextButton: { iconSize: 2.75, iconColor: 'FFFFFF', top: 87, left: 96.25 } },
  ],
};

// Точки зацикливания стандартной музыки (мс), как на сайте
const MUSIC_LOOPS = {"allegro2001":"1791-59104","allegro2002":"6857-51428","allegro2004":"1846-75692","blue badger":"4799-23999","circus":"12007-52078","congratulations":"1714-29142","cornered variation":"1599-39999","cornered":"8000-46399","cornered2002 variation":"8000-39999","cornered2002":"12799-44799","cornered2004 - pursuit variation":"4800-43199","cornered2004 - pursuit":"8000-46409","crossexamining":"6486-59999","crossexaminingvariation":"1621-55135","dahlia hawthorne":"0-68307","darkcoffee":"6760-74366","ema skye":"6857-54857","gant":"16006-67942","gumshoe":"2181-56727","luke atmey":"13759-53759","maya":"2307-76153","maya2":"2307-53076","miles edgeworth":"13452-46842","moderato2001":"1904-47619","moderato2002":"3387-42580","moderato2004":"1967-97376","objection":"25999-49999","objection2002":"18000-49999","objection2004":"2000-55999","reminiscence":"8000-63999","scars etched by flame":"2857-71428","search core":"6000-57999","search midst 2002":"2086-47999","search opening 2002":"2400-40799","sl-9 incident":"4173-45912","steel samurai":"3428-56571","suspense":"8571-35999","trial":"9599-57599","trial2":"4800-52799","trial3":"2448-66122","trick":"2181-71999","trick2002":"10-54867","truth2001":"3333-36666","truth2002":"8000-50666","truth2004":"3333-59999","von karma":"18947-52631","warehouse tiger":"6000-49999","wild west":"5760-49919","won the case":"6153-55384","truth2007":"0-47710","seeing through":"6368-29782","allegro2007":"3637-49091","trial4":"0-29689","suspense2007":"5474-23405","moderato2007":"0-34357","kitaki family":"12750-65860","cornered2007":"7297-52702","klavier":"5293-47650","trucy wright":"4910-87680","trial5":"0-54876","trick2007":"2160-47569","cornered2007 variation":"2431-47837","troupe gramarye":"7378-55388","psycho lock":"10240-68811","objection2007":"11440-57143","steel samurai's ballad":"6164-66768","kurain village":"10285-55714","allegro2009":"12584-99375","the great truth burglar":"0-67572","cornered2009":"4646-97574","presto2009":"1548-88278","moderato2009":"5217-117107","objection2009":"6965-86982","truth2009":"6672-74693","shi-long lang":"11403-88223","trial6":"22114-90337","hazy scenery":"4897-112653","defendant lobby":"4800-38399","pearl fey":"3428-32571","tragicomic interview":"0-103513","drew studio":"0-89150","solitary confinement":"0-49223","a hurt fox":"0-64845","a fate smeared by tricks and gadgets":"902-61811","search opening 2007":"0-38819","search core 2007":"2710-57951","forgotten legend":"1431-65362","won the case 2007":"3000-60610","eccentric 2007":"0-45360","the guitar's serenade":"6693-85764"};

const Lib = {
  data: null,
  maps: {},
  async load() {
    this.data = await window.api.lib.get();
    this.reindex();
    return this.data;
  },
  reindex() {
    this.maps = {};
    for (const t of ['characters', 'backgrounds', 'music', 'sounds', 'textboxes', 'evidence', 'popups']) {
      this.maps[t] = new Map((this.data[t] || []).map((a) => [a.id, a]));
    }
  },
  get(type, id) {
    if (id == null) return null;
    let n = Number(id);
    for (let i = 0; i < 6; i++) {
      const a = this.maps[type]?.get(n);
      if (a) return a;
      const al = this.data?.aliases?.[type]?.[n];
      if (al == null) return null;
      n = Number(al);
    }
    return null;
  },
  // Поза с учётом объединённых дубликатов
  pose(c, poseId) {
    if (!c || !c.poses) return null;
    if (poseId == null) return c.poses[0] || null;
    let p = c.poses.find((x) => x.id === poseId);
    if (!p) { const al = this.data?.aliases?.poses?.[poseId]; if (al != null) p = c.poses.find((x) => x.id === Number(al)); }
    return p || c.poses[0] || null;
  },
  textbox(id) {
    if (id == null || id === '' || id === '0' || id === 0) return null;
    const sid = String(id);
    return SYSTEM.textboxes.find((t) => t.id === sid) || (this.data?.textboxes || []).find((t) => String(t.id) === sid) || null;
  },
  bubbleId(id) { const al = this.data?.aliases?.bubbles?.[id]; return al != null ? Number(al) : id; },
  char(id) { return this.get('characters', id); },
  bg(id) { return this.get('backgrounds', id); },
  music(id) { return this.get('music', id); },
  sound(id) { return this.get('sounds', id); },
  list(type) { return this.data[type] || []; },
  async upsert(type, asset) {
    const before = this.data[type].find((a) => a.id === asset.id);
    const saved = await window.api.lib.upsert(type, asset);
    // файл могли заменить другим под тем же именем — сбрасываем кэши картинок и миниатюр этого ресурса
    for (const u of new Set([...assetUrls(before), ...assetUrls(asset), ...assetUrls(saved)])) { ImageCache.forget(u); Thumbs.forget(u); }
    const arr = this.data[type];
    const i = arr.findIndex((a) => a.id === saved.id);
    if (i >= 0) arr[i] = saved; else arr.push(saved);
    this.reindex();
    return saved;
  },
  async remove(type, id) {
    await window.api.lib.remove(type, id);
    this.data[type] = this.data[type].filter((a) => a.id !== id);
    this.reindex();
  },
  canon(u) { try { return new URL(u).href; } catch (e) { return u; } },
  abs(u) {
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return this.canon(u);
    if (u.startsWith('//')) return this.canon('https:' + u);
    if (u.startsWith('/')) return this.canon(SITE + u);
    return u;
  },
  // Файл внутри папки библиотеки (относительный путь)
  isLocal(u) { return typeof u === 'string' && u.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('/'); },
  // Путь к файлу в библиотеке, если он скачан
  localPath(u) {
    if (!u) return null;
    if (this.isLocal(u)) return u;
    if (/^(data|blob|oo):/i.test(u)) return null;
    if (u.startsWith(LIB_BASE)) return null;
    return this.data?.urlMap?.[this.abs(u)] || null;
  },
  // Превращает ссылку ресурса в адрес, который можно загрузить
  url(u) {
    if (!u) return '';
    if (/^(data|blob|oo):/i.test(u)) return u;
    const rel = this.localPath(u);
    if (rel) return LIB_BASE + rel.split('/').map(encodeURIComponent).join('/');
    return this.abs(u); // не скачано — попробуем из интернета
  },
  isAvailableOffline(u) {
    if (!u || u.startsWith('data:')) return true;
    return !!this.localPath(u);
  },
  blipUrl(frame, character) {
    if (frame && frame.blip) {
      const b = SYSTEM.blips.find((x) => x.id === frame.blip);
      if (b) return b.url;
    }
    return character?.blipUrl || SYSTEM.blips[0].url;
  },
  musicLoop(music) {
    if (!music || !music.isPreset) return null;
    const key = (music.name || '').toLowerCase();
    const v = MUSIC_LOOPS[key];
    if (!v) return null;
    const [a, b] = v.split('-').map(Number);
    return { start: a / 1000, end: b / 1000 };
  },
};

// ---------- Картинки ----------
function sniffType(bytes) {
  const b = new Uint8Array(bytes.slice(0, 16));
  const s = String.fromCharCode(...b);
  if (s.startsWith('GIF8')) return 'image/gif';
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (s.slice(4, 12).includes('ftypavif')) return 'image/avif';
  if (s.startsWith('BM')) return 'image/bmp';
  return '';
}

class AnimImage {
  constructor(frames, w, h) {
    this.frames = frames; // [{bmp, dur}]
    this.w = w;
    this.h = h;
    this.total = frames.reduce((s, f) => s + f.dur, 0);
    this.bytes = frames.length * w * h * 4;
    // сколько раз анимация повторяется после первого показа (как в браузере: Infinity — без конца,
    // 0 — проигрывается один раз; у GIF без блока NETSCAPE — тоже один раз)
    this.reps = Infinity;
  }
  // сколько раз анимация проигрывается целиком (Infinity — по кругу)
  get plays() { return this.reps === Infinity ? Infinity : this.reps + 1; }
  get animated() { return this.frames.length > 1; }
  frameAt(ms, loop = true) {
    const f = this.frames;
    if (f.length === 1 || ms <= 0) return f[0].bmp;
    let t = loop ? ms % this.total : Math.min(ms, this.total - 1);
    for (const fr of f) {
      if (t < fr.dur) return fr.bmp;
      t -= fr.dur;
    }
    return f[f.length - 1].bmp;
  }
  close() { for (const fr of this.frames) try { fr.bmp.close(); } catch (e) { /* ignore */ } }
}

const ImageCache = {
  map: new Map(), // key -> {promise, img, used}
  bytes: 0,
  // 0.1.2: было 1,2 ГБ — программа держала почти гигабайт даже в простое. Для экспорта лимит временно поднимается.
  // 0.1.2 урезал лимит до 400 МБ — большие GIF-персонажи вытесняли подгруженные наперёд кадры, и всё грузилось
  // заново. Теперь лимит больше, а память освобождается в простое и при сворачивании (trim).
  limit: 800 * 1024 * 1024,
  baseLimit: 800 * 1024 * 1024,
  key(url, h) { return url + '@' + (h || 0); },
  pinned: new Set(), // картинки, которые сейчас на экране — их не выгружаем
  sticky: new Set(), // картинки интерфейса сцены (текстбокс) — не выгружаем никогда
  async get(url, targetH) {
    if (!url) return null;
    const real = Lib.url(url);
    const h = targetH ? Math.max(8, Math.round(targetH / 8) * 8) : 0;
    const k = this.key(real, h);
    let e = this.map.get(k);
    if (!e) {
      e = { used: performance.now(), img: null, promise: null };
      e.promise = decodeImage(real, h).then((img) => {
        e.img = img;
        if (img) this.bytes += img.bytes;
        this.evict();
        return img;
      }).catch((err) => { console.warn(tx('Не удалось загрузить'), real, err); return null; });
      this.map.set(k, e);
    }
    e.used = performance.now();
    return e.promise;
  },
  // картинки на экране у всех проигрывателей (редактор, предпросмотр в библиотеке) выгружать нельзя
  live() {
    const set = new Set();
    for (const p of (window.Player && window.Player.instances) || []) for (const img of p.liveImages()) set.add(img);
    return set;
  },
  evict() {
    if (this.bytes <= this.limit) return;
    const entries = [...this.map.entries()].filter(([, e]) => e.img).sort((a, b) => a[1].used - b[1].used);
    const live = this.live();
    // 0.1.3: недавно использованные (в т. ч. подгруженные наперёд кадры) не трогаем, а выкинутые из кэша
    // картинки не закрываем — их может ещё держать проигрыватель (всплывающие картинки, следующий кадр).
    // Память освободит сборщик мусора, когда на них не останется ссылок. Закрывает только trim() в простое.
    for (const [k, e] of entries) {
      if (this.bytes <= this.limit * 0.85) break;
      if (performance.now() - e.used < 15000 || this.pinned.has(e.img) || this.sticky.has(e.img) || live.has(e.img)) continue;
      this.bytes -= e.img.bytes;
      this.map.delete(k);
    }
  },
  clear() {
    for (const e of this.map.values()) if (e.img) e.img.close();
    this.map.clear();
    this.bytes = 0;
    this.sticky.clear();
    this.epoch = (this.epoch || 0) + 1; // все, кто держит картинки у себя, должны загрузить их заново
  },
  alive(img) { return !img || (img.frames && img.frames.every((f) => f.bmp && f.bmp.width > 0)); },
  // Освободить всё, что не на экране (простой, свернули окно)
  trim() {
    const live = this.live();
    for (const [k, e] of [...this.map.entries()]) {
      if (!e.img || this.pinned.has(e.img) || this.sticky.has(e.img) || live.has(e.img)) continue;
      this.bytes -= e.img.bytes;
      e.img.close();
      this.map.delete(k);
    }
    this.epoch = (this.epoch || 0) + 1;
  },
  forget(url) {
    const real = Lib.url(url);
    for (const [k, e] of [...this.map.entries()]) {
      if (!k.startsWith(real + '@')) continue;
      if (e.img && !this.pinned.has(e.img) && !this.sticky.has(e.img)) { this.bytes -= e.img.bytes; e.img.close(); }
      this.map.delete(k);
    }
    this.epoch = (this.epoch || 0) + 1;
  },
};

// все ссылки на файлы внутри ресурса (картинки поз, звуки и т. п.)
function assetUrls(a) {
  const out = [];
  const walk = (v) => {
    if (!v) return;
    if (typeof v === 'string') { if (/\.(png|gif|webp|jpe?g|avif|bmp|svg)(\?|#|$)/i.test(v)) out.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(a);
  return out;
}

// 32-битная Windows: у программы меньше памяти — держим меньше картинок
if (window.api && (window.api.arch === 'ia32' || window.api.mobile)) ImageCache.limit = ImageCache.baseLimit = 320 * 1024 * 1024;

function scaledSize(w, h, targetH) {
  if (!targetH || h <= targetH * 1.05) return null; // не увеличиваем
  return { w: Math.max(1, Math.round((w * targetH) / h)), h: Math.round(targetH) };
}

async function decodeImage(url, targetH) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  const type = sniffType(buf) || res.headers.get('content-type') || 'image/png';
  if ('ImageDecoder' in window && ['image/gif', 'image/webp', 'image/png', 'image/avif'].includes(type)) {
    try {
      const supported = await ImageDecoder.isTypeSupported(type);
      if (supported) {
        const dec = new ImageDecoder({ data: buf, type });
        await dec.tracks.ready;
        const track = dec.tracks.selectedTrack;
        await dec.completed.catch(() => {});
        const count = Math.max(1, track ? track.frameCount : 1);
        const frames = [];
        let w = 0; let h = 0;
        for (let i = 0; i < count; i++) {
          const { image } = await dec.decode({ frameIndex: i });
          const sz = scaledSize(image.displayWidth, image.displayHeight, targetH);
          const bmp = sz
            ? await createImageBitmap(image, { resizeWidth: sz.w, resizeHeight: sz.h, resizeQuality: 'medium' })
            : await createImageBitmap(image);
          let dur = image.duration ? image.duration / 1000 : 100;
          if (dur < 20) dur = 100; // как в браузерах для GIF с нулевой задержкой
          frames.push({ bmp, dur });
          w = bmp.width; h = bmp.height;
          image.close();
        }
        const reps = track && typeof track.repetitionCount === 'number' ? track.repetitionCount : Infinity;
        dec.close();
        const ai = new AnimImage(frames, w, h);
        ai.reps = reps;
        return ai;
      }
    } catch (e) {
      console.warn(tx('ImageDecoder не справился, используется обычный способ'), url, e);
    }
  }
  const blob = new Blob([buf], { type });
  let bmp = await createImageBitmap(blob);
  const sz = scaledSize(bmp.width, bmp.height, targetH);
  if (sz) {
    const b2 = await createImageBitmap(bmp, { resizeWidth: sz.w, resizeHeight: sz.h, resizeQuality: 'medium' });
    bmp.close();
    bmp = b2;
  }
  return new AnimImage([{ bmp, dur: 100 }], bmp.width, bmp.height);
}

// ---------- Звук ----------
// Огибающая звука: появление и угасание в секундах, вместе не длиннее самого звука
function soundEnvelope(dur, fadeInMs, fadeOutMs) {
  let fi = Math.max(0, Number(fadeInMs) || 0) / 1000;
  let fo = Math.max(0, Number(fadeOutMs) || 0) / 1000;
  if (fi + fo > dur && fi + fo > 0) { const k = dur / (fi + fo); fi *= k; fo *= k; }
  return { fi, fo };
}

class AudioEngine {
  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.recDest = null;
    this.buffers = new Map(); // url -> {p: Promise<AudioBuffer>, buf, used}
    this.bufBytes = 0;
    // раскодированный звук занимает много (3 минуты музыки ≈ 70 МБ) — держим не больше этого, старое выгружаем
    this.bufLimit = (window.api && (window.api.arch === 'ia32' || window.api.mobile) ? 80 : 160) * 1024 * 1024;
    this.music = null; // {src, gain, id}
    this.sounds = new Set();
    this.musicVolume = 1;
    this.sfxVolume = 1;
  }
  resume() { if (this.ctx.state !== 'running') return this.ctx.resume(); return Promise.resolve(); }
  recordStream() {
    if (!this.recDest) {
      this.recDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.recDest);
    }
    return this.recDest.stream;
  }
  async buffer(url) {
    if (!url) return null;
    const real = Lib.url(url);
    let e = this.buffers.get(real);
    if (!e) {
      e = { buf: null, used: performance.now(), p: null };
      e.p = fetch(real).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }).then((b) => this.ctx.decodeAudioData(b)).then((buf) => {
        e.buf = buf;
        this.bufBytes += buf.length * buf.numberOfChannels * 4;
        this.evictAudio();
        return buf;
      }).catch((err) => { console.warn(tx('Звук не загрузился'), real, err); this.buffers.delete(real); return null; });
      this.buffers.set(real, e);
    }
    e.used = performance.now();
    return e.p;
  }
  evictAudio(all = false) {
    if (!all && this.bufBytes <= this.bufLimit) return;
    const playing = new Set([this.music && this.music.src && this.music.src.buffer, ...[...this.sounds].map((n) => n.src.buffer)].filter(Boolean));
    const list = [...this.buffers.entries()].filter(([, e]) => e.buf).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of list) {
      if (!all && this.bufBytes <= this.bufLimit * 0.7) break;
      if (playing.has(e.buf) || (!all && performance.now() - e.used < 5000)) continue;
      if (all && e.buf.length * e.buf.numberOfChannels * 4 < 256 * 1024) continue; // мелкие звуки (бипы) оставим
      this.bufBytes -= e.buf.length * e.buf.numberOfChannels * 4;
      this.buffers.delete(k);
    }
  }
  playBuffer(buf, volume = 1, { loop = false, loopStart = 0, loopEnd = 0, offset = 0, group = 'sfx', fadeInMs = 0, fadeOutMs = 0 } = {}) {
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    // плавное появление и угасание звука (угасание — к концу файла; при остановке — тоже плавно)
    const t0 = this.ctx.currentTime;
    const env = soundEnvelope(buf.duration, fadeInMs, fadeOutMs);
    if (!loop && (env.fi || env.fo)) {
      gain.gain.setValueAtTime(env.fi ? 0 : volume, t0);
      if (env.fi) gain.gain.linearRampToValueAtTime(volume, t0 + env.fi);
      if (env.fo) { gain.gain.setValueAtTime(volume, t0 + buf.duration - env.fo); gain.gain.linearRampToValueAtTime(0, t0 + buf.duration); }
    }
    src.connect(gain).connect(this.master);
    if (loop) {
      src.loop = true;
      if (loopEnd > loopStart && loopEnd <= buf.duration) { src.loopStart = loopStart; src.loopEnd = loopEnd; }
    }
    src.start(0, offset);
    const node = { src, gain, vol: volume, fadeOut: env.fo };
    if (group === 'sfx') {
      this.sounds.add(node);
      src.onended = () => this.sounds.delete(node);
    }
    return node;
  }
  async playSound(url, volume = 100, fades = {}) {
    const buf = await this.buffer(url);
    return this.playBuffer(buf, (volume / 100) * this.sfxVolume, { fadeInMs: fades.fadeInMs || 0, fadeOutMs: fades.fadeOutMs || 0 });
  }
  // остановить звуки: у звука с плавным угасанием — плавно, остальные сразу
  stopSounds() {
    for (const n of [...this.sounds]) {
      if (n.fadeOut > 0) this.fadeNode(n, n.fadeOut * 1000);
      else { try { n.src.stop(); } catch (e) { /* ignore */ } this.sounds.delete(n); }
    }
  }
  fadeOutSounds(ms = 1500) { for (const n of [...this.sounds]) this.fadeNode(n, n.fadeOut > 0 ? n.fadeOut * 1000 : ms); }
  fadeNode(n, ms) {
    const t = this.ctx.currentTime;
    const g = n.gain.gain;
    const cur = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(cur, t);
    g.linearRampToValueAtTime(0, t + ms / 1000);
    try { n.src.stop(t + ms / 1000 + 0.02); } catch (e) { /* уже остановлен */ }
    this.sounds.delete(n);
  }
  async playMusic(asset) {
    if (!asset) return;
    if (this.music && this.music.id === asset.id && !this.music.fading) return; // уже играет
    this.stopMusic();
    const token = {};
    this.musicToken = token;
    const buf = await this.buffer(asset.url);
    if (this.musicToken !== token || !buf) return;
    const loop = Lib.musicLoop(asset);
    const vol = ((asset.volume ?? 100) / 100) * this.musicVolume;
    const node = this.playBuffer(buf, vol, { loop: true, loopStart: loop?.start || 0, loopEnd: loop?.end || 0, group: 'music' });
    this.music = { ...node, id: asset.id, vol };
  }
  stopMusic() {
    this.musicToken = null;
    if (this.music) {
      try { this.music.src.stop(); } catch (e) { /* ignore */ }
      this.music = null;
    }
  }
  // плавно выключить: музыка дальше идёт без звука (как на сайте), [#bgmfi] плавно возвращает её
  fadeOutMusic(ms = 1500) {
    const m = this.music;
    if (!m) return;
    m.fading = true;
    const t = this.ctx.currentTime;
    const g = m.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + ms / 1000);
  }
  fadeInMusic(ms = 1500) {
    const m = this.music;
    if (!m) return;
    m.fading = false;
    const t = this.ctx.currentTime;
    const g = m.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(m.vol, t + ms / 1000);
  }
  stopAll() { this.stopMusic(); this.stopSounds(); }
}

// ---------- Шрифты текстбоксов ----------
const Fonts = {
  map: new Map(),
  family(url) {
    if (!url) return null;
    const real = Lib.url(url);
    let e = this.map.get(real);
    if (!e) {
      const fam = 'tbf' + this.map.size;
      e = { fam, ready: false, failed: false, promise: null };
      e.promise = new FontFace(fam, `url("${real}")`).load().then((ff) => { document.fonts.add(ff); e.ready = true; }).catch(() => { e.failed = true; });
      this.map.set(real, e);
    }
    return e;
  },
  async ensure(urls) { await Promise.all(urls.filter(Boolean).map((u) => this.family(u).promise)); },
  css(url, fallback) { const e = this.family(url); return e && e.ready ? `"${e.fam}", ${fallback}` : fallback; },
};

// ---------- Миниатюры для библиотеки ----------
// Для персонажа: находим непрозрачную часть спрайта и вырезаем квадрат с головой.
// Готовые миниатюры лежат в Library/thumbs и считаются один раз.
const Thumbs = {
  mem: new Map(),
  queue: [],
  active: 0,
  key(url, kind) {
    const rel = Lib.localPath(url);
    if (!rel) return null;
    let h = 0x811c9dc5;
    for (let i = 0; i < rel.length; i++) { h ^= rel.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0') + rel.length.toString(16) + ({ bg: '-b', icon: '-i', tb: '-t' }[kind] || '-c');
  },
  forget(url) { for (const kind of ['bg', 'icon', 'tb', 'char']) { const k = this.key(url, kind); if (k) this.mem.delete(k); } },
  get(url, kind = 'char') {
    if (!url) return Promise.resolve('');
    const k = this.key(url, kind);
    if (!k) return Promise.resolve(Lib.url(url)); // не скачано — покажем как есть
    if (this.mem.has(k)) return this.mem.get(k);
    const p = new Promise((resolve) => { this.queue.push({ url, kind, k, resolve }); this.pump(); });
    this.mem.set(k, p);
    return p;
  },
  pump() {
    while (this.active < 3 && this.queue.length) {
      const job = this.queue.shift();
      this.active++;
      this.make(job).then(job.resolve, () => job.resolve(Lib.url(job.url))).finally(() => { this.active--; this.pump(); });
    }
  },
  async make({ url, kind, k }) {
    const saved = LIB_BASE + '.cache/thumbs/' + k + '.webp';
    // миниатюра на диске годится, только если она новее самого файла (файл могли заменить под тем же именем)
    const v = await window.api.lib.hasThumb(k, Lib.localPath(url));
    if (v) return saved + '?v=' + v;
    const res = await fetch(Lib.url(url));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const full = await createImageBitmap(await res.blob());
    // уменьшенная копия для анализа
    const sw = Math.min(320, full.width);
    const sh = Math.max(1, Math.round((full.height * sw) / full.width));
    const small = new OffscreenCanvas(sw, sh);
    const sg = small.getContext('2d', { willReadFrequently: true });
    sg.drawImage(full, 0, 0, sw, sh);
    full.close();
    let out;
    if (kind === 'tb') {
      // текстбокс: вырезаем непрозрачную часть
      const data = sg.getImageData(0, 0, sw, sh).data;
      let x0 = sw; let y0 = sh; let x1 = -1; let y1 = -1;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (data[(y * sw + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = sw - 1; y1 = sh - 1; }
      const bw = x1 - x0 + 1; const bh = y1 - y0 + 1;
      out = new OffscreenCanvas(240, 160);
      const og = out.getContext('2d');
      og.fillStyle = '#3a3f4b'; og.fillRect(0, 0, 240, 160);
      const r = Math.min(232 / bw, 152 / bh);
      og.drawImage(small, x0, y0, bw, bh, (240 - bw * r) / 2, (160 - bh * r) / 2, bw * r, bh * r);
    } else if (kind === 'icon') {
      out = new OffscreenCanvas(160, 160);
      const og = out.getContext('2d');
      og.imageSmoothingEnabled = sw < 160;
      const r = Math.min(160 / sw, 160 / sh);
      og.drawImage(small, (160 - sw * r) / 2, (160 - sh * r) / 2, sw * r, sh * r);
    } else if (kind === 'bg') {
      out = new OffscreenCanvas(240, 160);
      const og = out.getContext('2d');
      const r = Math.max(240 / sw, 160 / sh);
      og.drawImage(small, (240 - sw * r) / 2, (160 - sh * r) / 2, sw * r, sh * r);
    } else {
      const data = sg.getImageData(0, 0, sw, sh).data;
      let x0 = sw; let y0 = sh; let x1 = -1; let y1 = -1;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (data[(y * sw + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = sw - 1; y1 = sh - 1; }
      const bw = x1 - x0 + 1; const bh = y1 - y0 + 1;
      // центр головы — середина непрозрачных пикселей в верхней части фигуры
      const band = Math.max(4, Math.round(bh * 0.18));
      let sumX = 0; let cnt = 0;
      for (let y = y0; y < Math.min(sh, y0 + band); y++) {
        for (let x = x0; x <= x1; x++) if (data[(y * sw + x) * 4 + 3] > 24) { sumX += x; cnt++; }
      }
      const cx = cnt ? sumX / cnt : x0 + bw / 2;
      let side = Math.min(bw, bh, Math.max(bh * 0.42, Math.min(bw, bh) * 0.5));
      side = Math.max(side, Math.min(bw, bh) * 0.35);
      let sx = Math.round(cx - side / 2);
      let sy = Math.round(y0 - side * 0.04);
      sx = Math.max(0, Math.min(sw - side, sx));
      sy = Math.max(0, Math.min(sh - side, sy));
      out = new OffscreenCanvas(160, 160);
      out.getContext('2d').drawImage(small, sx, sy, side, side, 0, 0, 160, 160);
    }
    const blob = await out.convertToBlob({ type: 'image/webp', quality: 0.85 });
    const rel = await window.api.lib.saveThumb(k, await blob.arrayBuffer());
    return rel ? LIB_BASE + rel + '?v=' + Date.now() : URL.createObjectURL(blob);
  },
};

// ---------- Избранное, метки и сортировка (общие для библиотеки и окон выбора) ----------
// Метки по играм: в названиях своих ресурсов часто пишут [Trilogy], [AJ], [AAI]… — такие метки ставятся сами
const GAME_TAGS = ['Trilogy', 'AJ Trilogy', 'Investigations', 'Great Ace Attorney', 'PL vs PW', 'DS', 'iOS'];
const GAME_TAG_ALIASES = {
  Trilogy: ['trilogy', 'pw', 'pwt', 'pwaa', 'pwaat', 'pwt1', 'aa', 'aa1', 'aa2', 'aa3', 'aat', 'aa123', 'jfa', 'tat', 't&t', 'pw:aa', 'pw1', 'pw2', 'pw3', 'gs1', 'gs2', 'gs3', 'gs123', 'phoenix wright trilogy', 'phoenix wright'],
  'AJ Trilogy': ['aj', 'ajt', 'aaj', 'ajaa', 'ajaat', 'aj4', 'dd', 'soj', 'aa4', 'aa5', 'aa6', 'aj trilogy', 'apollo justice', 'apollo justice trilogy', 'gs4', 'gs5', 'gs6', 'gs456'],
  Investigations: ['aai', 'aai1', 'aai2', 'investigations', 'mei', 'gyakuten kenji', 'mm'],
  'Great Ace Attorney': ['gaa', 'tgaa', 'gaa1', 'gaa2', 'dgs', 'dgs1', 'dgs2', 'great ace attorney'],
  'PL vs PW': ['plvspw', 'pl vs pw', 'plvpw', 'layton'],
  DS: ['ds', 'nds'],
  iOS: ['ios'],
};
// год выхода игры → метка (первые выпуски частей)
const TAG_BY_YEAR = {
  2001: 'Trilogy', 2002: 'Trilogy', 2004: 'Trilogy', 2005: 'Trilogy',
  2007: 'AJ Trilogy', 2013: 'AJ Trilogy', 2016: 'AJ Trilogy',
  2009: 'Investigations', 2011: 'Investigations',
  2012: 'PL vs PW',
  2015: 'Great Ace Attorney', 2017: 'Great Ace Attorney',
};
const TAG_BY_ALIAS = {};
for (const [t, list] of Object.entries(GAME_TAG_ALIASES)) for (const a of list) TAG_BY_ALIAS[a] = t;
// AAIC, AAIHD, AJHD, PWT-HD, AAI2 Remastered: окончания HD / C (Collection) / Remaster не мешают распознать игру
function tagByAlias(word) {
  if (!word) return null;
  if (TAG_BY_ALIAS[word]) return TAG_BY_ALIAS[word];
  // «aai hd», «ajt remaster» в круглых скобках — тоже
  const base = word.trim().replace(/[-_\s]*(hd|c|collection|remaster|remastered|r)$/, '').trim();
  return base !== word && base.length >= 2 ? TAG_BY_ALIAS[base] || null : null;
}
const Marks = {
  GAME_TAGS,
  get(type, id) { return (Lib.data && Lib.data.marks && Lib.data.marks[type] && Lib.data.marks[type][id]) || {}; },
  fav(type, id) { return !!this.get(type, id).fav; },
  // метки, которые программа ставит сама: по тегам в названии и «iOS» у стандартных персонажей сайта
  autoTags(type, id) {
    const a = type === 'textboxes' ? Lib.textbox(id) : Lib.get(type, id);
    if (!a) return [];
    const out = new Set();
    // [PWT], [PW][AJ], [PW/AJ], [WEBP AAI], !Trilogy!, {AJ} — каждое слово в таких скобках проверяется отдельно.
    // В круглых скобках часто пишут пояснения («by MMWAB, GBA-sized»), там засчитывается только скобка целиком: (AJ)
    const name = a.name || '';
    const take = (txt, words) => {
      const whole = txt.trim().toLowerCase();
      if (tagByAlias(whole)) out.add(tagByAlias(whole));
      if (words) for (const part of whole.split(/[^a-z0-9&:]+/)) { const t = tagByAlias(part); if (t) out.add(t); }
    };
    let m;
    const sq = /\[([^\]]{1,40})\]|\{([^}]{1,40})\}|!([^!\s][^!]{0,38})!/g;
    while ((m = sq.exec(name))) take(m[1] || m[2] || m[3], true);
    const rnd = /\(([^)]{1,40})\)/g;
    while ((m = rnd.exec(name))) take(m[1], false);
    if (type === 'characters' && a.isPreset) out.add('iOS');
    // музыка: год выхода игры в названии («Objection! 2001», «Cornered 2002») — тоже метка игры
    if (type === 'music') {
      const yr = /(?:^|[^0-9])(20[0-1][0-9])(?![0-9])/g;
      while ((m = yr.exec(name))) { const t = TAG_BY_YEAR[m[1]]; if (t) out.add(t); }
    }
    // метки, которые пользователь убрал вручную, больше не возвращаются
    const off = this.get(type, id).off || [];
    return [...out].filter((t) => !off.includes(t));
  },
  ownTags(type, id) { return this.get(type, id).tags || []; },
  tags(type, id) { const own = this.ownTags(type, id); const auto = this.autoTags(type, id); return auto.length ? [...new Set([...own, ...auto])] : own; },
  allTags(type) {
    const set = new Set();
    for (const m of Object.values((Lib.data && Lib.data.marks && Lib.data.marks[type]) || {})) for (const t of m.tags || []) set.add(t);
    for (const a of (Lib.data && Lib.data[type]) || []) for (const t of this.autoTags(type, a.id)) set.add(t);
    // порядок меток задаётся перетаскиванием в библиотеке; новые — в конце по алфавиту
    const order = this.tagOrder(type);
    return [...set].sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      return a.localeCompare(b);
    });
  },
  tagOrder(type) {
    const p = Lib.data && Lib.data.presets && Lib.data.presets.tagOrder;
    const e = (p || []).find((x) => x.type === type);
    return (e && e.order) || [];
  },
  async moveTag(type, tag, before) {
    const list = this.allTags(type).filter((t) => t !== tag);
    const i = before == null ? list.length : Math.max(0, list.indexOf(before));
    list.splice(i, 0, tag);
    Lib.data.presets = Lib.data.presets || {};
    const all = (Lib.data.presets.tagOrder || []).filter((x) => x.type !== type);
    all.push({ type, order: list });
    Lib.data.presets.tagOrder = all;
    await window.api.lib.setPresets('tagOrder', all);
  },
  // роли персонажей (как «сторона» на сайте)
  ROLES: { defense: tx('Защита'), prosecution: tx('Обвинение'), witness: tx('Свидетель'), judge: tx('Судья'), counsel: tx('Помощник'), gallery: tx('Галерея') },
  async set(type, id, mark) {
    Lib.data.marks = Lib.data.marks || {};
    const all = (Lib.data.marks[type] = Lib.data.marks[type] || {});
    const clean = {};
    if (mark.fav) clean.fav = true;
    if (mark.zoom43) clean.zoom43 = true;
    const off = [...new Set(mark.off || [])];
    if (off.length) clean.off = off;
    const tags = [...new Set((mark.tags || []).map((t) => String(t).trim()).filter(Boolean))];
    if (tags.length) clean.tags = tags;
    if (Object.keys(clean).length) all[id] = clean; else delete all[id];
    await window.api.lib.setMarks(type, id, clean);
  },
  toggleFav(type, id) { const m = this.get(type, id); return this.set(type, id, { ...m, fav: !m.fav }); },
  setTags(type, id, tags) {
    const m = this.get(type, id);
    const auto = new Set(this.autoTags(type, id));
    const want = new Set(tags);
    // убранные автометки запоминаем, чтобы они не возвращались; возвращённые — снимаем с запрета
    const off = new Set(m.off || []);
    for (const t of auto) if (!want.has(t)) off.add(t);
    for (const t of want) off.delete(t);
    return this.set(type, id, { ...m, off: [...off], tags: tags.filter((t) => !auto.has(t)) }); // автометки не храним — они и так есть
  },
  // размеры файлов — один запрос на тип, кэш на минуту
  _sizes: {},
  async sizes(type) {
    const c = this._sizes[type];
    if (c && Date.now() - c.t < 60000) return c.v;
    let v = {};
    try { v = (await window.api.lib.sizes(type)) || {}; } catch (e) { /* старый main */ }
    this._sizes[type] = { t: Date.now(), v };
    return v;
  },
  SORTS: [['default', tx('Обычный порядок')], ['name', tx('По алфавиту (А→Я)')], ['name-desc', tx('По алфавиту (Я→А)')], ['new', tx('Сначала новые')], ['old', tx('Сначала старые')], ['big', tx('Сначала большие')], ['small', tx('Сначала маленькие')]],
  // когда добавлен: своё — по полю added (или по порядку id), стандартные — «самые старые»
  addedOf(a) { return a.added || (a.isPreset ? 0 : (a.id > 900000000 ? 1e12 + (a.id - 900000000) * 1000 : a.id)); },
  // сортирует копию списка; избранное всегда сверху
  sort(type, list, mode, sizes, defaultCmp) {
    const nm = (x) => (x.name || '').toLocaleLowerCase();
    const cmps = {
      name: (x, y) => nm(x).localeCompare(nm(y), undefined, { numeric: true }),
      'name-desc': (x, y) => nm(y).localeCompare(nm(x), undefined, { numeric: true }),
      new: (x, y) => this.addedOf(y) - this.addedOf(x),
      old: (x, y) => this.addedOf(x) - this.addedOf(y),
      big: (x, y) => ((sizes && sizes[y.id]) || 0) - ((sizes && sizes[x.id]) || 0),
      small: (x, y) => ((sizes && sizes[x.id]) || 0) - ((sizes && sizes[y.id]) || 0),
    };
    const cmp = cmps[mode] || defaultCmp || (() => 0);
    return list.map((a, i) => [a, i]).sort(([x, i], [y, j]) => (this.fav(type, y.id) ? 1 : 0) - (this.fav(type, x.id) ? 1 : 0) || cmp(x, y) || i - j).map(([a]) => a);
  },
};

window.Assets = { Lib, ImageCache, AudioEngine, SYSTEM, AnimImage, Thumbs, Fonts, Marks, soundEnvelope };
