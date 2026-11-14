// Проигрыватель сцен: рисует кадры на canvas, печатает текст, играет звук
'use strict';
(function () {
  const { Lib, ImageCache, SYSTEM } = window.Assets;
  const { parseText, plainText } = window.Tags;

  const CANCEL = Symbol('cancel');
  const FLASH = { s: 160, m: 320, l: 620 };
  const SHAKE_AMP = { s: 0.006, m: 0.013, l: 0.026 };
  const BUBBLE_SHAKE_AMP = 0.028; // сила тряски выкрика (доля высоты кадра)
  const BUBBLE_SHAKE_MS = 400; // выкрик трясётся только в начале, потом стоит на месте
  const FLIP = { BACKGROUND: 1, CHAR1: 2, CHAR2: 4 };
  const SIDES_LEFT = ['defense', 'counsel'];
  // 0.1.4: в паре до 10 персонажей (на сайте до 5). Место участника — бит 2 << номер, фон — бит 1.
  const MAX_PAIR = 10;
  const MAX_SLOT = 2 << (MAX_PAIR - 1);
  const ALL_CHARS = (MAX_SLOT << 1) - 2; // все места персонажей
  // маска «к чему применить фильтр»: старые 63 (фон + 5 мест) и 62 (5 мест) у сайта значат «всё» и «все персонажи»
  const normTarget = (t) => { t = t == null ? 63 : Number(t); if (t === 63) return ALL_CHARS | 1; if (t === 62) return ALL_CHARS; return t; };
  // Режимы наложения (canvas globalCompositeOperation)
  const BLENDS = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  const blendOf = (b) => (BLENDS.includes(b) ? b : 'source-over');
  // Все фильтры кадра: основной (f.effect, как на сайте) и дополнительные (f.extraEffects)
  const effectsOf = (f) => [f && f.effect, ...((f && Array.isArray(f.extraEffects)) ? f.extraEffects : [])].filter((e) => e && e.type);
  const effSig = (e) => [e.type, Number(e.amount ?? 100), normTarget(e.target), e.color || '', e.blend || ''].join(',');
  function filterSet(f) {
    const list = effectsOf(f);
    if (!list.length) return null;
    const p = list[0];
    return { list, fadeInMs: Math.max(0, Number(p.fadeInMs) || 0), fadeOutMs: Math.max(0, Number(p.fadeOutMs) || 0), sig: list.map(effSig).join('|') };
  }
  function cssOne(e, k) {
    const amount = Number(e.amount ?? 100);
    const a = amount * k;
    const lin = 100 + (amount - 100) * k;
    switch (e.type) {
      case 'invert': return `invert(${a}%)`;
      case 'grayscale': return `grayscale(${a}%)`;
      case 'sepia': return `sepia(${a}%)`;
      case 'sepia-invert': return `sepia(${a}%) invert(${a}%)`;
      case 'hue-rotate': return `hue-rotate(${a}deg)`;
      case 'brightness': return `brightness(${lin}%)`;
      case 'contrast': return `contrast(${lin}%)`;
      case 'saturate': return `saturate(${lin}%)`;
      default: return null;
    }
  }
  // Плавности для переходов (как на objection.lol: id → функция 0..1)
  function bezier(x1, y1, x2, y2) {
    return (t) => {
      let a = t;
      for (let i = 0; i < 8; i++) {
        const x = 3 * (1 - a) * (1 - a) * a * x1 + 3 * (1 - a) * a * a * x2 + a * a * a - t;
        const d = 3 * (1 - a) * (1 - a) * x1 + 6 * (1 - a) * a * (x2 - x1) + 3 * a * a * (1 - x2);
        if (Math.abs(d) < 1e-6) break;
        a = Math.min(1, Math.max(0, a - x / d));
      }
      return 3 * (1 - a) * (1 - a) * a * y1 + 3 * (1 - a) * a * a * y2 + a * a * a;
    };
  }
  const inOut = (fin) => (t) => (t < 0.5 ? fin(t * 2) / 2 : 1 - fin((1 - t) * 2) / 2);
  const out = (fin) => (t) => 1 - fin(1 - t);
  const POW = (n) => (t) => Math.pow(t, n);
  const SINE = (t) => 1 - Math.cos((t * Math.PI) / 2);
  const EXPO = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
  const CIRC = (t) => 1 - Math.sqrt(1 - t * t);
  const BOUNCE_OUT = (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; };
  const EASINGS = {
    linear: (t) => t, ease: bezier(0.25, 0.1, 0.25, 1), easeIn: bezier(0.42, 0, 1, 1), easeOut: bezier(0, 0, 0.58, 1), easeInOut: bezier(0.42, 0, 0.58, 1),
    easeInSine: SINE, easeOutSine: out(SINE), easeInOutSine: inOut(SINE),
    easeInQuad: POW(2), easeOutQuad: out(POW(2)), easeInOutQuad: inOut(POW(2)),
    easeInCubic: POW(3), easeOutCubic: out(POW(3)), easeInOutCubic: inOut(POW(3)),
    easeInQuart: POW(4), easeOutQuart: out(POW(4)), easeInOutQuart: inOut(POW(4)),
    easeInQuint: POW(5), easeOutQuint: out(POW(5)), easeInOutQuint: inOut(POW(5)),
    easeInExpo: EXPO, easeOutExpo: out(EXPO), easeInOutExpo: inOut(EXPO),
    easeInCirc: CIRC, easeOutCirc: out(CIRC), easeInOutCirc: inOut(CIRC),
    spring: inOut(out(BOUNCE_OUT)),
  };
  // старые id сайта ('ease-in' и т. п.)
  EASINGS['ease-in'] = EASINGS.easeIn; EASINGS['ease-out'] = EASINGS.easeOut; EASINGS['ease-in-out'] = EASINGS.easeInOut;
  const easingFn = (id) => EASINGS[id] || EASINGS.linear;

  function aspectOf(opt) {
    const s = (opt && opt.aspectRatio) || '3:2';
    const [a, b] = s.split(':').map(Number);
    return a > 0 && b > 0 ? a / b : 1.5;
  }

  // Прозрачность и плавность своей картинки: значение кадра (frame.popupFx), иначе — из самой картинки
  function popupFx(pp, f) {
    const fx = (f && f.popupFx) || {};
    const pick = (k) => { const v = fx[k] != null && fx[k] !== '' ? fx[k] : pp[k]; return v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v); };
    const op = pick('opacity');
    return { opacity: op == null ? 1 : Math.max(0, Math.min(100, op)) / 100, fadeInMs: Math.max(0, pick('fadeInMs') || 0), fadeOutMs: Math.max(0, pick('fadeOutMs') || 0), blend: blendOf(fx.blend || pp.blend) };
  }
  const pfx = (p) => p.fx || (p.fx = popupFx(p.asset, null));

  // Под какой формат нарисован текстбокс — ближайший стандартный к пропорциям картинки (до 16 % разницы).
  // 534×1080 (экран телефона) → 9:16, 1920×1080 → 16:9, 960×640 → 3:2.
  const DESIGN_ASPECTS = ['16:9', '9:16', '4:3', '3:2', '21:9'];
  function guessDesign(img) {
    if (!img || !img.w || !img.h) return null;
    const ir = img.w / img.h;
    let best = null; let bd = Infinity;
    for (const k of DESIGN_ASPECTS) {
      const [a, b] = k.split(':').map(Number);
      const d = Math.abs(ir - a / b) / (a / b);
      if (d < bd) { bd = d; best = k; }
    }
    return bd < 0.16 ? best : null;
  }

  function hexOr(c, def) {
    if (!c) return def;
    const v = String(c).trim().replace('#', '');
    return /^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? '#' + v : def;
  }
  function hexA(color, a) {
    if (!color) color = '#000';
    let c = color.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function applyAlias(name, aliases) {
    if (!name || !aliases) return name;
    const a = aliases.find((x) => x.from === name);
    return a ? a.to : name;
  }

  // Фон кадра: свой фон кадра → фон персонажа по умолчанию → чёрный (как на сайте)
  function computeBackgrounds(frames) {
    return frames.map((f) => {
      if (f.backgroundId) return f.backgroundId;
      const c = f.characterId ? Lib.char(f.characterId) : null;
      return c && c.backgroundId ? c.backgroundId : null;
    });
  }

  function findPair(project, f) {
    return f && f.pair && f.pair.id ? (project.pairs || []).find((p) => p.id === f.pair.id) || null : null;
  }

  // Вычисляет персонажей кадра. Как на сайте: в паре у каждого участника своё место (slot = 2 << номер в паре),
  // по этому месту работают затемнение, отражение и фильтры. Говорит тот, кто выбран в кадре
  // (если он стоит в паре дважды — говорят оба).
  // сколько персонажей пары показывается: в режиме совместимости с сайтом — 5, как на objection.lol
  function pairLimit(project) { return project && project.options && project.options.siteCompat ? 5 : MAX_PAIR; }
  function sceneCharacters(project, frames, i, lastPoses) {
    const f = frames[i];
    if (!f || !f.characterId) return [];
    const main = Lib.char(f.characterId);
    if (!main) return [];
    const pose = Lib.pose(main, f.poseId);
    const pair = findPair(project, f);
    if (!pair || !(pair.pairs || []).length) return [{ character: main, pose, entry: null, isMain: true, front: 0, slot: 2 }];
    const list = [];
    let hasMain = false;
    pair.pairs.slice(0, pairLimit(project)).forEach((e, idx) => {
      const slot = 2 << idx;
      if (e.characterId === f.characterId) {
        hasMain = true;
        list.push({ character: main, pose, entry: e, isMain: true, front: e.front || 0, slot });
        return;
      }
      const c = Lib.char(e.characterId);
      if (!c) return;
      const pid = (f.pair.poseIds && f.pair.poseIds[e.characterId]) ?? (lastPoses && lastPoses[e.characterId]);
      list.push({ character: c, pose: Lib.pose(c, pid), entry: e, isMain: false, front: e.front || 0, slot });
    });
    // говорящего нет среди участников пары — ставим его отдельно (на следующее свободное место)
    if (!hasMain) list.unshift({ character: main, pose, entry: null, isMain: true, front: 0, slot: 2 << Math.min(MAX_PAIR - 1, pair.pairs.length) });
    return list;
  }

  // Предустановленные позы сайта, у которых анимация играет каждый раз (например, удар по столу)
  const ALWAYS_ANIMATE = [2, 6, 11, 16, 49, 57, 73, 79, 90, 100, 101, 174, 183, 219];
  // Должна ли играть анимация позы (правила objection.lol)
  function shouldAnimatePose(project, f, prev, c, pose) {
    if (!f || !f.poseId || f.noPoseAnimation || !pose) return false;
    if (!(pose.poseStates || []).length && !(pose.poseAudioTicks || []).length && !(pose.poseFunctionTicks || []).length) return false;
    const always = !project?.options?.preventSamePoseAnimation && !!c?.isPreset && ALWAYS_ANIMATE.includes(pose.id);
    if (!f.pair) return f.poseId !== prev?.poseId || always;
    if (prev?.pair && f.characterId != null) {
      const before = prev.characterId === f.characterId ? prev.poseId : prev.pair.poseIds?.[f.characterId] ?? null;
      return before !== f.poseId || always;
    }
    return true;
  }

  // Встроенные всплывающие картинки сайта (действие кадра 7)
  const POPUPS = {
    1: { name: tx('Witness Testimony (начало показаний)'), states: [{ ttl: 2730, image: '/Images/Popups/wt.gif' }, { time: 50, sound: '/Audio/testimony-start.wav', volume: 55 }, { time: 2100, sound: '/Audio/testimony-end.wav', volume: 55 }] },
    2: { name: tx('Cross Examination (перекрёстный допрос)'), states: [{ ttl: 2930, image: '/Images/Popups/ce.gif' }, { time: 50, sound: '/Audio/testimony-start.wav', volume: 55 }, { time: 2500, sound: '/Audio/testimony-end.wav', volume: 55 }] },
    3: { name: tx('Значок «Testimony» (висит, пока не убрать)'), states: [{ ttl: 0, image: '/Images/Popups/testimony.gif' }] },
    4: { name: tx('Guilty (виновен)'), states: [{ ttl: 3000, image: '/Images/Popups/guilty.gif' }, ...[467, 667, 968, 1268, 1568, 1900].map((t) => ({ time: t, sound: '/Audio/Sound/guilty.mp3', volume: 75 }))] },
    5: { name: tx('Not Guilty (невиновен)'), states: [{ ttl: 3000, image: '/Images/Popups/not guilty.gif' }, { time: 600, sound: '/Audio/Sound/guilty.mp3', volume: 75 }, { time: 1600, sound: '/Audio/Sound/guilty.mp3', volume: 75 }] },
  };
  const TESTIMONY_LABEL = '/Images/Popups/testimony.gif';
  const EVIDENCE_BOX = '/Images/evidence container.png';
  const EVIDENCE_SOUND = '/Audio/Sound/shooop.mp3';

  // Текст «в скобках» персонаж не проговаривает (мысли), как на сайте
  function talksFor(f, plain) {
    if (f.doNotTalk) return false;
    const t = plain.trim();
    if (t.startsWith('(') && t.endsWith(')')) return false;
    return plain.replace(/[. ]/g, '').length > 0;
  }

  class Player {
    constructor(canvas, audio) {
      Player.instances.add(this);
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.audio = audio;
      this.project = null;
      this.frames = [];
      this.session = 0;
      this.manual = false;
      this.waitingClick = null;
      this.listeners = {};
      this.fontFamily = '"Segoe UI", "Arial", sans-serif';
      this.resetState();
      this.loop = this.loop.bind(this);
      this.rafId = requestAnimationFrame(this.loop);
      this.setSize(1280, 720);
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { for (const fn of this.listeners[ev] || []) try { fn(...a); } catch (e) { console.error(e); } }

    setSize(w, h) {
      const changed = this.canvas.width !== Math.round(w) || this.canvas.height !== Math.round(h);
      this.canvas.width = Math.round(w);
      this.canvas.height = Math.round(h);
      this.W = this.canvas.width;
      this.H = this.canvas.height;
      // раскладка текста посчитана под старый размер — пересчитать (например, при входе в полноэкранный режим)
      if (changed && this.state && this.state.box) this.state.box.layout = null;
    }

    setProject(project) {
      this.project = project;
      this.frames = (project.groups && project.groups[0] && project.groups[0].frames) || [];
      this.bgIndex = computeBackgrounds(this.frames);
      const ar = aspectOf(project.options);
      const H = this.H || 720;
      this.setSize(Math.round(H * ar), H);
    }

    resetState() {
      if (this.state) for (const x of this.state.presetPopups || []) if (x.img) ImageCache.sticky.delete(x.img);
      this.state = {
        bg: null,
        chars: [],
        charAlpha: {}, // прозрачность по месту персонажа (2, 4, 8…), сохраняется между кадрами — как на сайте
        slotChars: {}, // какой персонаж стоял на каждом месте (для сброса затемнения при смене состава)
        onceSlots: 0, // места, затемнённые «только на этот кадр»
        bgLeft: 0, // широкий фон: какая часть видна (0 — левый край, 100 — правый), сохраняется между кадрами
        view: 0, // текущее положение «камеры» на широком фоне (во время перехода меняется плавно)
        overlay: null, // затемнение: { target: everything|scene|background, color, a } — одно на всё, как на сайте
        box: { visible: false, name: '', chars: [], shown: 0, center: false },
        bubble: null,
        flash: null,
        shake: null,
        filter: null,
        filterK: 1, // насколько фильтр наложен (0..1) — для плавного появления/снятия
        popup: null, // своя картинка кадра (popupId)
        presetPopups: [], // встроенные: Witness Testimony и т. п.
        evidence: null,
        talkingUntil: 0,
      };
      this.anims = [];
      this.textSpeedDefault = null;
      this.blipFreqDefault = null;
      this.autoplayOverride = null;
      this.lastPoses = {};
      this.textboxId = this.project && this.project.options ? this.project.options.chatbox : '0';
      this.charTextbox = null;
      this.tbKey = null;
    }

    // ---------- Время и отмена ----------
    now() { return this.virtual ? this.virtual.t : performance.now(); }
    // У каждой анимированной картинки свои «часы» с момента первого показа: GIF персонажа или
    // картинки поверх сцены не начинается заново в каждом кадре, а плавно крутится дальше (как в браузере на сайте)
    epochOf(img) {
      if (!img) return 0;
      const m = this.epochs || (this.epochs = new WeakMap());
      let t = m.get(img);
      if (t == null) { t = this.now(); m.set(img, t); }
      return t;
    }
    check(s) { if (s !== this.session) throw CANCEL; }
    // Виртуальное время: экспорт сам двигает часы, без ожидания в реальном времени
    setVirtual(on) {
      this.virtual = on ? { t: 0, timers: [] } : null;
      this.epochs = new WeakMap();
      this.pending = new Set();
    }
    // Отмечаем «настоящие» асинхронные операции (загрузка картинок), чтобы экспорт их дожидался
    track(p) {
      if (!this.virtual || !p || typeof p.then !== 'function') return p;
      this.pending.add(p);
      const done = () => this.pending.delete(p);
      p.then(done, done);
      return p;
    }
    img(url, h) { return this.noImages ? Promise.resolve(null) : this.track(ImageCache.get(url, h)); }
    sleep(ms, s) {
      return new Promise((resolve, reject) => {
        if (s !== this.session) return reject(CANCEL);
        if (ms <= 0) return resolve();
        if (this.virtual) {
          this.virtual.timers.push({ at: this.virtual.t + ms, resolve, reject, s, seq: (this.vseq = (this.vseq || 0) + 1) });
          return;
        }
        this.timers = this.timers || new Set();
        const id = setTimeout(() => { this.timers.delete(id); if (s === this.session) resolve(); else reject(CANCEL); }, ms);
        this.timers.add(id);
      });
    }
    async sleepUntil(t, s) { const d = t - this.now(); if (d > 1) await this.sleep(d, s); else this.check(s); }
    animate(dur, fn, s) {
      // плавная анимация 0..1
      return new Promise((resolve, reject) => {
        const start = this.now();
        if (dur <= 0) { fn(1); resolve(); return; }
        if (this.virtual) {
          // в виртуальном времени конец анимации — обычный таймер; промежуточные значения считает tick()
          const a = { fn, start, dur, resolve: () => {}, reject: () => {}, s, virtual: true };
          this.anims.push(a);
          this.virtual.timers.push({ at: start + dur, s, seq: (this.vseq = (this.vseq || 0) + 1), reject,
            resolve: () => { a.done = true; fn(1); resolve(); } });
          return;
        }
        const a = { fn, start, dur, resolve, reject, s };
        this.anims.push(a);
      });
    }

    stop() {
      this.session++;
      if (this.timers) { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
      if (this.virtual) { for (const t of this.virtual.timers) t.reject(CANCEL); this.virtual.timers = []; }
      for (const a of this.anims) a.reject(CANCEL);
      this.anims = [];
      if (this.waitingClick) { this.waitingClick.reject(CANCEL); this.waitingClick = null; }
      this.audio.stopAll();
      this.playing = false;
      this.emit('stop');
    }

    // Клик по сцене в ручном режиме
    click() {
      if (this.skipText) { this.skipText(); return; }
      if (this.waitingClick) { const w = this.waitingClick; this.waitingClick = null; w.resolve(); }
    }

    // ---------- Подготовка ресурсов ----------
    charHeight(c, entry) { return this.H * ((entry?.size ?? c.size ?? 100) / 100); }

    framePreloadList(i) {
      const f = this.frames[i];
      if (!f) return [];
      const list = [];
      const bg = Lib.bg(f.backgroundId || this.bgIndex[i]);
      if (bg) { list.push([bg.url, this.H]); if (bg.deskUrl) list.push([bg.deskUrl, this.H]); }
      for (const sc of sceneCharacters(this.project, this.frames, i, this.lastPoses)) {
        const h = this.charHeight(sc.character, sc.entry);
        const p = sc.pose;
        if (!p) continue;
        list.push([p.idleImageUrl, h]);
        if (p.speakImageUrl && p.speakImageUrl !== p.idleImageUrl) list.push([p.speakImageUrl, h]);
        for (const st of p.poseStates || []) list.push([st.imageUrl, h]);
      }
      if (f.speechBubble) {
        const c = Lib.char(f.characterId);
        const b = this.findBubble(c, f.speechBubble);
        if (b) list.push([b.imageUrl, this.H]);
      }
      if (f.popupId) { const pp = Lib.get('popups', f.popupId); if (pp) list.push([pp.url, 0]); }
      for (const a of f.actions || []) {
        if (a.actionId === 7 && POPUPS[a.actionParam]) for (const st of POPUPS[a.actionParam].states) if (st.image) list.push([st.image, 0]);
        if (a.actionId === 7 && /^c\d+$/.test(String(a.actionParam))) { const pp = Lib.get('popups', Number(String(a.actionParam).slice(1))); if (pp) list.push([pp.url, 0]); }
      }
      for (const t of parseText(f.text || '')) {
        if (t.type !== 'cmd') continue;
        if (t.cmd === 'evidence' || t.cmd === 'evidence_icon') {
          const e = Lib.get('evidence', t.id);
          if (e) list.push([e.url, 0]);
          if (t.cmd === 'evidence_icon') list.push([(e && e.boxUrl) || EVIDENCE_BOX, 0]);
        }
      }
      return list;
    }

    preloadAudio(i) {
      const f = this.frames[i];
      if (!f) return;
      for (const t of parseText(f.text || '')) {
        if (t.type !== 'cmd') continue;
        if (t.cmd === 'music') { const m = Lib.music(t.id); if (m) this.audio.buffer(m.url); }
        if (t.cmd === 'sound') { const m = Lib.sound(t.id); if (m) this.audio.buffer(m.url); }
        if (t.cmd === 'evidence_icon' || t.cmd === 'evidence') { const e = Lib.get('evidence', t.id); if (e && e.soundUrl) this.audio.buffer(e.soundUrl); else if (t.cmd === 'evidence_icon') this.audio.buffer(EVIDENCE_SOUND); }
      }
      const c = Lib.char(f.characterId);
      this.audio.buffer(this.blipFor(f, c));
      if (f.speechBubble) { const b = this.findBubble(c, f.speechBubble); if (b) this.audio.buffer(b.soundUrl || SYSTEM.objectionSfx); }
      const pose = c ? Lib.pose(c, f.poseId) : null;
      for (const t of pose?.poseAudioTicks || []) this.audio.buffer(t.fileName);
      for (const a of f.actions || []) {
        if (a.actionId === 7 && POPUPS[a.actionParam]) for (const st of POPUPS[a.actionParam].states) if (st.sound) this.audio.buffer(st.sound);
        if (a.actionId === 7 && /^c\d+$/.test(String(a.actionParam))) { const pp = Lib.get('popups', Number(String(a.actionParam).slice(1))); if (pp && pp.introSound) this.audio.buffer(pp.introSound); }
      }
    }

    async preload(i, ahead = this.virtual ? 14 : 8) {
      for (let k = i + 1; k < Math.min(this.frames.length, i + 1 + ahead); k++) {
        if (!this.noImages) for (const [u, h] of this.framePreloadList(k)) ImageCache.get(u, h);
        this.preloadAudio(k);
      }
      this.preloadAudio(i);
      if (this.noImages) return;
      const cur = this.framePreloadList(i);
      await Promise.all(cur.map(([u, h]) => ImageCache.get(u, h)));
    }

    findBubble(c, id) {
      const list = (c && c.speechBubbles) || [];
      const bid = Lib.bubbleId(id);
      return list.find((b) => b.id === id || b.id === bid) || SYSTEM.bubbles.find((b) => b.id === id) || null;
    }

    // Звук речи кадра: свой выбор кадра → действие «звук речи» → у персонажа
    blipFor(f, c) {
      const act = (f.actions || []).find((a) => a.actionId === 4);
      if (!f.blip && act) { const b = SYSTEM.blips.find((x) => x.id === Number(act.actionParam)); if (b) return b.url; }
      if (f.blip && !SYSTEM.blips.some((x) => x.id === f.blip)) { const bc = Lib.char(f.blip); if (bc?.blipUrl) return bc.blipUrl; }
      return Lib.blipUrl(f, c);
    }

    // ---------- Построение сцены ----------
    async buildScene(i) {
      const f = this.frames[i];
      const bgId = f.backgroundId || this.bgIndex[i];
      const bgA = Lib.bg(bgId);
      const flipped = f.flipped || 0;
      const scs = sceneCharacters(this.project, this.frames, i, this.lastPoses);
      const speedlines = scs.some((sc) => sc.isMain && sc.pose?.isSpeedlines);
      let bg = null;
      if (speedlines) {
        const img = await this.img(SYSTEM.speedlines, this.H);
        bg = { img, desk: null, wide: false, flipped: !!(flipped & FLIP.BACKGROUND), id: 'speedlines' };
      } else if (bgA) {
        const [img, desk] = await Promise.all([this.img(bgA.url, this.H), bgA.deskUrl ? this.img(bgA.deskUrl, this.H) : null]);
        bg = { img, desk, wide: !!bgA.isWide, zoom43: !!(bgA.isWide && (bgA.wideZoom43 || (window.Assets.Marks && window.Assets.Marks.get('backgrounds', bgA.id).zoom43))), flipped: !!(flipped & FLIP.BACKGROUND), id: bgA.id };
      }
      const chars = [];
      for (const sc of scs) {
        const c = sc.character;
        const h = this.charHeight(c, sc.entry);
        const pose = sc.pose;
        if (!pose) continue;
        const [idle, speak] = await Promise.all([
          this.img(pose.idleImageUrl, h),
          pose.speakImageUrl ? this.img(pose.speakImageUrl, h) : null,
        ]);
        chars.push({
          c, pose, entry: sc.entry, isMain: sc.isMain, front: sc.front, slot: sc.slot,
          idle, speak: speak || idle, override: null, overrideStart: 0, start: this.now(),
          flipped: !!(flipped & sc.slot),
        });
        this.lastPoses[c.id] = pose.id;
      }
      chars.sort((a, b) => a.front - b.front);
      return { bg, chars };
    }

    // ---------- Воспроизведение ----------
    async playFrom(index = 0, opts = {}) {
      this.stop();
      const s = this.session;
      this.manual = !!opts.manual;
      this.playing = true;
      // пока грузится первый кадр, оставляем на экране текущую картинку
      const keepBg = this.state.bg; const keepChars = this.state.chars;
      this.resetState();
      this.state.bg = keepBg;
      this.state.chars = keepChars.map((c) => ({ ...c, talking: false, override: null }));
      await this.track(this.audio.resume());
      this.endQueue = [];
      // Восстановить состояние от начала до index (без звука и картинок)
      this.fastForward(index);
      // Музыка играет только после своего тега. Если начинаем с середины, музыку из прошлых кадров
      // включаем, только когда об этом попросили явно.
      if (!opts.resumeMusic) this.pendingMusic = null;
      const end = opts.end ?? this.frames.length;
      try {
        if (this.ffEvidence) await this.showEvidence(this.ffEvidence.id, this.ffEvidence.icon, s, true, this.ffEvidence.side);
        if (this.ffLabel) await this.addPresetPopup(TESTIMONY_LABEL, true);
        for (let i = index; i < end; i++) {
          this.check(s);
          this.current = i;
          this.emit('frame', i);
          await this.playFrame(i, s);
        }
        this.check(s);
        this.flushEnd();
        await this.sleep(opts.tail ?? 600, s);
        this.playing = false;
        this.emit('end');
      } catch (e) {
        if (e !== CANCEL) { console.error(e); this.playing = false; this.emit('error', e); }
      }
    }

    // Пропуск кадров до index: применяем «долгие» настройки, музыку, окно текста, затемнения
    // Длительность перехода по широкому фону: только если у кадра и прошлого кадра один и тот же широкий фон
    transitionMs(i) {
      const f = this.frames[i];
      const prev = this.frames[i - 1];
      const tr = f && f.transition;
      if (!tr || !(Number(tr.duration) > 0) || !prev) return 0;
      const id = f.backgroundId || this.bgIndex[i];
      const pid = prev.backgroundId || this.bgIndex[i - 1];
      const bg = Lib.bg(id);
      if (!bg || !bg.isWide || String(id) !== String(pid)) return 0;
      const scs = sceneCharacters(this.project, this.frames, i, this.lastPoses);
      if (scs.some((sc) => sc.isMain && sc.pose?.isSpeedlines)) return 0;
      return Number(tr.duration);
    }

    // Широкий фон: ширина панорамы pw и сдвиг ox (в пикселях сцены) для текущего положения камеры
    //   wv — сколько панорамы видно по ширине (при «приближении до 4:3» меньше ширины кадра, z — масштаб);
    //   spotX — где на панораме «стойка», у которой стоят персонажи кадра (защита — слева, свидетель — центр,
    //   обвинение — справа). Персонажи и их сдвиги считаются внутри этой стойки как внутри обычного кадра,
    //   поэтому пары выглядят так же, как на обычном фоне.
    wideView() {
      const st = this.state;
      const { w: W } = this.stage();
      const none = { pw: W, ox: 0, wide: false, wv: W, z: 1, spotX: 0 };
      if (!st.bg || !st.bg.wide || !st.bg.img) return none;
      const bmp = st.bg.img.frameAt(0, true);
      if (!bmp || !bmp.width) return none;
      const pw = (bmp.width * this.H) / bmp.height;
      const z = st.bg.zoom43 ? Math.max(1, W / this.H / (4 / 3)) : 1;
      const wv = W / z;
      if (pw <= wv) return { pw, ox: 0, wide: true, wv, z, spotX: 0 };
      const left = Math.max(0, Math.min(99.98, Number(st.view) || 0));
      const spot = st.wideSpot || 'witness';
      const spotX = spot === 'defense' ? 0 : spot === 'prosecution' ? pw - wv : (pw - wv) / 2;
      return { pw, ox: -((pw - wv) * left) / 100, wide: true, wv, z, spotX };
    }
    // Место персонажа на широком фоне: своё у кадра (wideSpot) или по роли говорящего
    wideSpotFor(f, chars) {
      if (f && f.wideSpot) return f.wideSpot;
      const main = (chars || []).find((c) => c.isMain) || (chars || [])[0];
      const side = main && main.c && main.c.side;
      // помощники (counsel) смотрят влево, как прокуроры, — на панораме их ставим к стойке обвинения
      return side === 'defense' ? 'defense' : side === 'prosecution' || side === 'counsel' ? 'prosecution' : 'witness';
    }
    // Приближение сцены (широкий фон «под 4:3»): масштаб вокруг центра кадра
    zoomScene(v) {
      if (!v || v.z <= 1) return;
      const { x: SX } = this.stage();
      this.g.translate(SX, this.H / 2);
      this.g.scale(v.z, v.z);
      this.g.translate(-SX, -this.H / 2);
    }

    fastForward(index) {
      let music = null;
      const st = this.state;
      const box = st.box;
      this.ffEvidence = null;
      this.ffLabel = false;
      for (let i = 0; i < index; i++) {
        const f = this.frames[i];
        const prev = this.frames[i - 1];
        if (f.transition && f.transition.left != null) st.view = st.bgLeft = Number(f.transition.left) || 0;
        const act = this.applyActions(f, true);
        if (act.hideBox === true) box.visible = false;
        if (act.hideBox === false) box.visible = true;
        for (const a of f.actions || []) {
          if (a.actionId === 7 && a.actionParam === '3') this.ffLabel = true;
          if (a.actionId === 8 && a.actionParam === '1') this.ffLabel = false;
        }
        const tokens = parseText(f.text || '');
        // теги «в конце кадра» — после остальных тегов этого кадра
        for (const t of [...tokens.filter((x) => !x.atEnd), ...tokens.filter((x) => x.atEnd)]) {
          if (t.type !== 'cmd') continue;
          if (t.cmd === 'music') music = t.id;
          if (t.cmd === 'music_stop' || t.cmd === 'music_fadeout') music = null;
          if (t.cmd === 'evidence' || t.cmd === 'evidence_icon') this.ffEvidence = { id: t.id, icon: t.cmd === 'evidence_icon', side: t.side };
          if (t.cmd === 'evidence_hide') this.ffEvidence = null;
        }
        const scs = sceneCharacters(this.project, this.frames, i, this.lastPoses);
        for (const sc of scs) this.lastPoses[sc.character.id] = sc.pose?.id;
        // затемнения: запоминаем, чем они закончились
        this.settleCharFades(i);
        this.applyFadeResult(f.fade);
        if (f.speechBubble) box.visible = false;
        const plain = tokens.filter((t) => t.type === 'text').map((t) => t.text).join('');
        if (plain.length) {
          this.charTextbox = this.characterTextbox(Lib.char(f.characterId));
          if (!(prev && prev.mergeWithNext)) box.chars = [];
          for (const t of tokens) if (t.type === 'text') for (const ch of t.text) box.chars.push({ ch, color: t.color, fmt: t.fmt });
          box.shown = box.chars.length;
          box.name = this.nameFor(f); box.nameColor = this.nameColorFor(f);
          box.visible = true;
        }
      }
      box.layout = null;
      this.pendingMusic = music;
    }

    // Затемнение персонажей держится по месту (как на сайте), но:
    //  • сбрасывается, если на этом месте теперь другой персонаж (если в проекте не включено «строго как на сайте»);
    //  • у затемнения с галочкой «Только на этот кадр» — сбрасывается на следующем кадре.
    settleCharFades(i) {
      const st = this.state;
      const f = this.frames[i];
      const own = f && f.fade && f.fade.target === 'characters' && f.fade.type !== 'fadeOutIn' ? Number(f.fade.characters ?? 2) : 0;
      if (st.onceSlots) {
        for (let slot = 2; slot <= MAX_SLOT; slot <<= 1) if ((st.onceSlots & slot) && !(own & slot)) st.charAlpha[slot] = 1;
        st.onceSlots = 0;
      }
      // затемнение сцены/фона/окна «только на этот кадр»: на следующем кадре снимается (если у него нет своего)
      const ownOverlay = f && f.fade && f.fade.type && f.fade.target !== 'characters';
      if (st.overlayOnce) { if (!ownOverlay && st.overlay) st.overlay.a = 0; st.overlayOnce = false; }
      if (ownOverlay && f.fade.type === 'fadeOut' && f.fade.onlyThisFrame) st.overlayOnce = true;
      const strict = this.project && this.project.options && this.project.options.strictCharacterFades;
      const scs = sceneCharacters(this.project, this.frames, i, this.lastPoses);
      for (const sc of scs) {
        const was = st.slotChars[sc.slot];
        if (!strict && was != null && was !== sc.character.id && !(own & sc.slot) && (st.charAlpha[sc.slot] ?? 1) < 1) st.charAlpha[sc.slot] = 1;
        st.slotChars[sc.slot] = sc.character.id;
      }
      if (own && f.fade.onlyThisFrame) st.onceSlots = own;
    }

    applyFadeResult(fade) {
      if (!fade || !fade.type || fade.type === 'fadeOutIn') return;
      const st = this.state;
      if (fade.target === 'characters') {
        const bits = Number(fade.characters ?? 2);
        for (let slot = 2; slot <= MAX_SLOT; slot <<= 1) if (bits & slot) st.charAlpha[slot] = fade.type === 'fadeIn' ? 1 : 0;
      } else {
        st.overlay = { target: fade.target || 'everything', color: fade.color || '#000', a: fade.type === 'fadeOut' ? 1 : 0 };
      }
    }

    // цвет имени у персонажа (пусто — цвет из текстбокса)
    nameColorFor(f) {
      if (f.customName) return null;
      const c = Lib.char(f.characterId);
      return c && c.nameColor ? hexOr(c.nameColor, null) : null;
    }

    nameFor(f) {
      const c = Lib.char(f.characterId);
      let name = '.';
      if (f.customName) name = f.customName;
      else if (c) name = applyAlias(c.nameplate || c.name, this.project.aliases) || '.';
      return name.trim() === '.' ? '' : name;
    }

    applyActions(f, silent) {
      const res = { center: false, offscreen: false, hideBox: null };
      for (const a of f.actions || []) {
        const p = a.actionParam;
        switch (a.actionId) {
          case 1: res.hideBox = p === '0'; break;
          case 6: res.offscreen = true; break;
          case 9: res.center = true; break;
          case 13: this.textSpeedDefault = Number(p); break;
          case 14: this.blipFreqDefault = Math.max(25, Number(p) || 64); break;
          case 15: this.autoplayOverride = Number(p); break;
          case 12: this.textboxId = p; break;
          default: break;
        }
      }
      void silent;
      return res;
    }

    textSpeed() {
      if (this.textSpeedDefault != null && !Number.isNaN(this.textSpeedDefault)) return this.textSpeedDefault;
      return this.project.options?.textSpeed ?? 35;
    }
    blipFreq() {
      if (this.blipFreqDefault) return this.blipFreqDefault;
      return Math.max(25, this.project.options?.textBlipFrequency ?? 64);
    }
    autoplayDelay() {
      if (this.autoplayOverride != null && !Number.isNaN(this.autoplayOverride)) return this.autoplayOverride;
      return this.project.options?.autoplaySpeed ?? 500;
    }
    // Пауза перед началом текста (на сайте около 300 мс; можно поменять в настройках проекта)
    textDelay() {
      const v = this.project.options?.textStartDelay;
      return v == null || Number.isNaN(Number(v)) ? 300 : Math.max(0, Number(v));
    }

    // Свой текстбокс персонажа (если включено в настройках проекта). null — текстбокс проекта.
    characterTextbox(c) {
      const o = (this.project && this.project.options) || {};
      if (o.useCharacterTextboxes === false || !c || c.textboxId == null || c.textboxId === '') return null;
      return String(c.textboxId);
    }

    // Порядок шагов кадра — как у objection.lol:
    // старт (затемнения кадра) → [конец «затемнение и проявление» прошлого кадра] → выкрик → персонаж и анимация позы →
    // [проявление] → всплывающие картинки → текст → анимация в конце текста → пауза.
    async playFrame(i, s) {
      const f = this.frames[i];
      const prev = this.frames[i - 1];
      this.loadingSince = this.virtual ? 0 : performance.now();
      let scene;
      try {
        await this.track(this.preload(i));
        // сцена кадра собирается до старта (а не после затемнения/выкрика) — иначе медленная загрузка
        // съедала начало кадра: проявление шло ещё на старой сцене
        scene = await this.track(this.buildScene(i));
      } finally { this.loadingSince = 0; }
      this.check(s);
      this.flushEnd(); // теги «в конце кадра» прошлого кадра — ровно на смене кадра
      if (this.pendingMusic != null) {
        this.audio.playMusic(Lib.music(this.pendingMusic));
        this.pendingMusic = null;
      }
      const st = this.state;
      const act = this.applyActions(f);
      const mainChar = Lib.char(f.characterId);
      const tokens = parseText(f.text || '');
      const plain = tokens.filter((t) => t.type === 'text').map((t) => t.text).join('');
      // текстбокс меняется, когда начинается новая реплика (у кадра без текста остаётся прошлый)
      if (plain.length) this.charTextbox = this.characterTextbox(mainChar);
      await this.track(this.prepareTextbox());
      this.check(s);

      // старт
      if (f.transition && f.transition.left != null) st.bgLeft = Number(f.transition.left) || 0;
      const panMs = this.transitionMs(i);
      st.box.center = act.center;
      st.box.layout = null;
      if (act.hideBox === true) st.box.visible = false;
      if (act.hideBox === false) st.box.visible = true;
      if (f.fade && f.fade.type && f.fade.type !== 'fadeOutIn') this.startFade(f.fade, s);
      const fio = prev && prev.fade && prev.fade.type === 'fadeOutIn' ? prev.fade : null;
      if (fio) await this.fadeHalf(fio, 'out', s);

      // выкрик (Objection!) поверх предыдущей сцены
      if (f.speechBubble) {
        const b = this.findBubble(mainChar, f.speechBubble);
        if (b) { st.box.visible = false; await this.playBubble(b, s); }
      }
      if (act.offscreen) {
        if (fio) await this.fadeHalf(fio, 'in', s);
        return; // кадр «вне кадра»: только выкрик, сразу дальше
      }

      // переход по широкому фону: камера едет к новой точке, персонаж меняется на середине (как на сайте)
      let panDone = null;
      if (panMs > 0) {
        st.box.visible = false; // окно текста на время перехода прячется (иначе резко меняется посреди панорамы)
        const from = st.view; const to = st.bgLeft; const ease = easingFn(f.transition.easing);
        panDone = this.animate(panMs, (t) => { st.view = from + (to - from) * ease(t); }, s).catch(() => {});
        await this.sleep(panMs / 2, s);
      }

      // персонаж
      if (!panDone) st.view = st.bgLeft;
      this.settleCharFades(i);
      st.bg = scene.bg;
      st.chars = scene.chars;
      st.charOpacity = f.charOpacity != null && f.charOpacity !== '' && Number(f.charOpacity) < 100 ? Math.max(0, Number(f.charOpacity)) / 100 : null;
      st.frameEvSide = f.evidenceSide === 'left' || f.evidenceSide === 'right' ? f.evidenceSide : null;
      st.wideSpot = this.wideSpotFor(f, scene.chars);
      this.applyFilter(filterSet(f), s);
      const pp = f.popupId ? Lib.get('popups', f.popupId) : null;
      if (!(pp && st.popup && st.popup.asset.id === pp.id)) {
        // старая картинка с плавным исчезновением гаснет поверх сцены, пока появляется новая
        if (st.popup && pfx(st.popup).fadeOutMs > 0) st.popupOut = { ...st.popup, outAt: this.now() };
        st.popup = pp ? { asset: pp, img: await this.img(pp.url, 0), start: this.now(), shownAt: this.now(), fx: popupFx(pp, f) } : null;
      } else {
        // та же картинка дальше: прозрачность и исчезновение — из нового кадра, начатое появление не трогаем
        st.popup.fx = { ...popupFx(pp, f), fadeInMs: pfx(st.popup).fadeInMs };
      }
      if (!this.noImages) ImageCache.pinned = new Set([st.bg?.img, st.bg?.desk, st.popup?.img, ...st.chars.flatMap((c) => [c.idle, c.speak])].filter(Boolean));

      // новая реплика: табличка с именем меняется вместе с кадром (как на сайте), старый текст убираем
      if (plain.length > 0) {
        if (!(prev && prev.mergeWithNext)) { st.box.chars = []; st.box.shown = 0; st.box.layout = null; }
        st.box.name = this.nameFor(f); st.box.nameColor = this.nameColorFor(f);
      }
      const mains = st.chars.filter((c) => c.isMain);
      const pose = mains[0]?.pose;
      const animate = mains.length > 0 && shouldAnimatePose(this.project, f, prev, mainChar, pose);
      const preStates = animate ? (pose.poseStates || []).filter((x) => !x.playAtTextEnd) : [];
      const hasPre = animate && (preStates.length || (pose.poseAudioTicks || []).some((x) => !x.playAtTextEnd) || (pose.poseFunctionTicks || []).length);
      const hasEnd = animate && ((pose.poseStates || []).some((x) => x.playAtTextEnd) || (pose.poseAudioTicks || []).some((x) => x.playAtTextEnd));
      if (hasPre) {
        mains.forEach((ch, k) => this.runPoseAnimation(ch, false, s, k === 0).catch(() => {}));
        if (!f.noPauseForAnimation) {
          // окно прячется на время анимации, если в кадре не стоит «Окно текста: показать»
          if (act.hideBox !== false) st.box.visible = false;
          const wait = preStates.reduce((sum, x) => sum + (x.noSpeakDelay ? 0 : this.stateMs(x, mains[0])), 0);
          await this.sleep(wait, s);
        }
      }
      if (fio) await this.fadeHalf(fio, 'in', s);
      if (panDone) { await panDone; this.check(s); }

      // всплывающие картинки (Witness Testimony и т. п.)
      await this.runDelayedActions(f, s);

      // текст
      if (plain.length > 0) await this.sleep(this.textDelay(), s);
      // «Говорят все в паре» (своё): губами шевелят все участники, говорящий — первым (его громкость «бипа»)
      const talkers = f.pairAllTalk && f.pair ? [...mains, ...st.chars.filter((c) => !c.isMain)] : mains;
      await this.typeText(tokens, { s, mains: talkers, name: this.nameFor(f), nameColor: this.nameColorFor(f), speakEnabled: talksFor(f, plain), blipUrl: this.blipFor(f, mainChar), muted: (f.actions || []).some((a) => a.actionId === 5) });
      for (const m of talkers) m.talking = false;

      // анимация «в конце текста»
      if (hasEnd) {
        mains.forEach((ch, k) => this.runPoseAnimation(ch, true, s, k === 0).catch(() => {}));
        const endStates = (pose.poseStates || []).filter((x) => x.playAtTextEnd);
        await this.sleep(endStates.reduce((sum, x) => sum + (x.noSpeakDelay ? 0 : this.stateMs(x, mains[0])), 0), s);
      }

      // пауза перед следующим кадром (кадры без текста идут дальше сразу, как на сайте)
      if (f.moveToNext || plain.length === 0) return;
      if (this.manual) {
        await new Promise((resolve, reject) => { this.waitingClick = { resolve, reject }; });
      } else {
        await this.sleep(this.autoplayDelay(), s);
      }
    }

    async playBubble(b, s) {
      const img = await this.img(b.imageUrl, this.H);
      this.check(s);
      this.state.bubble = { img, fullscreen: !!b.fullscreen, start: this.now(), shake: !!b.shake };
      this.audio.playSound(b.soundUrl || SYSTEM.objectionSfx, 100);
      await this.sleep(b.duration || 950, s);
      this.state.bubble = null;
    }

    // Затемнения текущего кадра идут параллельно с остальным (не задерживают кадр)
    startFade(fade, s) {
      const st = this.state;
      const type = fade.type;
      if (fade.target === 'characters') {
        const bits = Number(fade.characters ?? 2);
        const dur = Math.max(0, Number(fade.duration ?? 1500) || 0);
        for (let slot = 2; slot <= MAX_SLOT; slot <<= 1) {
          if (!(bits & slot)) continue;
          const from = type === 'fadeIn' ? 0 : 1;
          const to = 1 - from;
          st.charAlpha[slot] = from;
          this.animate(dur, (t) => { st.charAlpha[slot] = from + (to - from) * t; }, s).catch(() => {});
        }
        return;
      }
      const dur = Math.max(0, Number(fade.duration) || 0);
      const ov = { target: fade.target || 'everything', color: fade.color || '#000', a: type === 'fadeIn' ? 1 : 0 };
      st.overlay = ov;
      const from = ov.a; const to = 1 - from;
      this.animate(dur, (t) => { ov.a = from + (to - from) * t; }, s).catch(() => {});
    }

    // Половина «затемнения и проявления» (заданного в прошлом кадре): 'out' — в цвет, 'in' — из цвета
    async fadeHalf(fade, dir, s) {
      const st = this.state;
      const dur = Math.max(0, (Number(fade.duration) || 1500) / 2);
      if (fade.target === 'characters') {
        const bits = Number(fade.characters ?? 2);
        const slots = [];
        for (let slot = 2; slot <= MAX_SLOT; slot <<= 1) if (bits & slot) slots.push(slot);
        const from = Object.fromEntries(slots.map((k) => [k, dir === 'out' ? (st.charAlpha[k] ?? 1) : 0]));
        await this.animate(dur, (t) => { for (const k of slots) st.charAlpha[k] = dir === 'out' ? from[k] * (1 - t) : t; }, s);
        return;
      }
      if (dir === 'out' && dur > 0 && fade.target !== 'scene') st.box.visible = false;
      const ov = { target: fade.target || 'everything', color: fade.color || '#000', a: dir === 'out' ? 0 : 1 };
      st.overlay = ov;
      await this.animate(dur, (t) => { ov.a = dir === 'out' ? t : 1 - t; }, s);
    }

    // Действия кадра, которые выполняются перед текстом: всплывающие картинки
    async runDelayedActions(f, s) {
      for (const a of f.actions || []) {
        if (a.actionId === 8 && a.actionParam === '1') this.removePresetPopup(TESTIMONY_LABEL);
        if (a.actionId !== 7) continue;
        // своя «заставка» из библиотеки (вкладка «Картинки»): как Witness Testimony, но своя картинка и звук
        if (/^c\d+$/.test(String(a.actionParam))) {
          const asset = Lib.get('popups', Number(String(a.actionParam).slice(1)));
          if (!asset) continue;
          const im = await this.img(asset.url, 0);
          const dur = Number(asset.introDuration) > 0 ? Number(asset.introDuration) : im && im.animated ? Math.round(im.total) : 2000;
          await this.addPresetPopup(asset.url, !!asset.aboveTextbox);
          this.sleep(dur, s).then(() => this.removePresetPopup(asset.url)).catch(() => {});
          if (asset.introSound) this.sleep(Number(asset.introSoundTime) || 0, s).then(() => this.audio.playSound(asset.introSound, Number(asset.introVolume) || 100)).catch(() => {});
          await this.sleep(dur, s);
          continue;
        }
        const def = POPUPS[a.actionParam];
        if (!def) continue;
        const total = def.states.reduce((sum, x) => sum + (x.ttl || 0), 0);
        for (const x of def.states) {
          if (x.image) {
            await this.addPresetPopup(x.image);
            if (x.ttl) this.sleep(x.ttl, s).then(() => this.removePresetPopup(x.image)).catch(() => {});
          }
          if (x.sound) this.sleep(x.time || 0, s).then(() => this.audio.playSound(x.sound, x.volume ?? 100)).catch(() => {});
        }
        await this.sleep(total, s);
      }
    }
    async addPresetPopup(url, above = false) {
      const list = this.state.presetPopups;
      if (list.length >= 5) return;
      const img = await this.img(url, 0);
      list.push({ url, img, start: this.now(), above });
      if (img && !this.noImages) ImageCache.sticky.add(img);
    }
    removePresetPopup(url) {
      const st = this.state;
      const gone = st.presetPopups.filter((p) => p.url === url);
      st.presetPopups = st.presetPopups.filter((p) => p.url !== url);
      for (const p of gone) if (p.img) ImageCache.sticky.delete(p.img);
    }

    async showEvidence(id, icon, s, silent, side) {
      const e = Lib.get('evidence', id);
      if (!e) { this.state.evidence = null; return; }
      // у улики может быть своя рамка значка и свой звук появления
      const [img, box] = await Promise.all([this.img(e.url, 0), icon ? this.img(e.boxUrl || EVIDENCE_BOX, 0) : null]);
      this.check(s);
      this.state.evidence = { id, icon, img, box, start: this.now(), asset: e, side: side || null };
      if (!silent && (icon || e.soundUrl)) this.audio.playSound(e.soundUrl || EVIDENCE_SOUND, e.soundUrl ? (e.soundVolume ?? 100) : 75);
    }

    async runPoseAnimation(ch, atEnd, s, withSounds = true) {
      const pose = ch.pose;
      if (withSounds) {
        for (const t of pose.poseAudioTicks || []) {
          if (!!t.playAtTextEnd !== atEnd) continue;
          this.sleep(t.time || 0, s).then(() => this.audio.playSound(t.fileName, t.volume ?? 100)).catch(() => {});
        }
        if (!atEnd) {
          for (const t of pose.poseFunctionTicks || []) {
            this.sleep(t.time || 0, s).then(() => this.runFunction(t.functionName, t.functionParam)).catch(() => {});
          }
        }
      }
      const states = (pose.poseStates || []).filter((x) => !!x.playAtTextEnd === atEnd);
      const h = this.charHeight(ch.c, ch.entry);
      for (const st of states) {
        const img = await this.img(st.imageUrl, h);
        this.check(s);
        if (img) { ch.override = img; ch.overrideStart = this.now(); ch.overridePlays = this.statePlays(st, img); ImageCache.pinned.add(img); }
        else if (this.noImages) ch.override = null;
        await this.sleep(this.stateMs(st, ch, img), s);
      }
      ch.override = null;
      ch.overridePlays = Infinity;
      ch.start = this.now();
    }

    // Длительность кадра анимации позы: заданная, а если не задана — длина самой GIF/WebP
    stateMs(st, ch, img) {
      if (st.nextPoseDelay != null && st.nextPoseDelay !== '') return Number(st.nextPoseDelay) || 0;
      if (!img && ch) {
        const e = ImageCache.map.get(ImageCache.key(Lib.url(st.imageUrl), (() => { const h = this.charHeight(ch.c, ch.entry); return h ? Math.max(8, Math.round(h / 8) * 8) : 0; })()));
        img = e && e.img;
      }
      if (!img || !img.animated) return 800;
      const plays = this.statePlays(st, img);
      return Math.round(img.total * (plays === Infinity ? 1 : plays));
    }
    // Сколько раз проигрывается анимация кадра позы: задано у кадра (repeat), иначе — как записано в самой GIF
    // (браузер, а значит и objection.lol, не зацикливает GIF без бесконечного повтора)
    statePlays(st, img) {
      const r = Number(st.repeat);
      if (r > 0) return r;
      return img && img.plays ? img.plays : Infinity;
    }
    // Картинка персонажа на момент now (анимация позы с ограниченным числом повторов застывает на последнем кадре)
    charBmp(ch, img, now, t0) {
      // idle/talk тоже как в браузере: GIF без бесконечного повтора проигрывается один раз с первого показа
      const plays = ch.override === img ? (ch.overridePlays ?? Infinity) : (img.plays || Infinity);
      const loop = !(plays < Infinity && now - t0 >= img.total * plays);
      return img.frameAt(loop ? now - t0 : img.total * 2, loop);
    }

    runFunction(name, param) {
      const n = (name || '').toLowerCase();
      const size = { s: 's', m: 'm', l: 'l', small: 's', medium: 'm', large: 'l' }[String(param || 'm').toLowerCase()] || 'm';
      if (n === 'shake') this.startShake({ intensity: size, duration: 700, motion: 'default' });
      else if (n === 'quake') this.startShake({ intensity: 'l', duration: 3500, motion: 'quake' });
      else if (n === 'flash') this.startFlash(size);
    }

    startShake(sh) {
      this.state.shake = { start: this.now(), dur: sh.duration || 700, amp: SHAKE_AMP[sh.intensity] || SHAKE_AMP.m, motion: sh.motion || 'default', seed: Math.random() * 1000 };
    }
    startFlash(size, color) { this.state.flash = { start: this.now(), dur: FLASH[size] || FLASH.m, color: color || null }; }

    // Теги «в конце кадра» ([#evdhe], [#bgmse], …) копятся и срабатывают при переходе к следующему кадру
    flushEnd() {
      const q = this.endQueue || [];
      this.endQueue = [];
      for (const t of q) this.runCommand({ ...t, atEnd: false }, this.session);
    }

    async runCommand(t, s) {
      if (t.atEnd) { (this.endQueue || (this.endQueue = [])).push(t); return null; }
      switch (t.cmd) {
        case 'pause': return this.sleep(t.ms, s);
        case 'text_speed': this.curSpeed = t.value; break;
        case 'blip_speed': this.curBlip = t.value; break;
        case 'flash': this.startFlash(t.size, t.color); break;
        case 'shake': this.startShake(t); break;
        case 'music': this.audio.playMusic(Lib.music(t.id)); break;
        case 'music_stop': this.audio.stopMusic(); break;
        case 'music_fadeout': this.audio.fadeOutMusic(1500); break;
        case 'music_fadein': this.audio.fadeInMusic(1500); break;
        case 'sound': { const a = Lib.sound(t.id); if (a) this.audio.playSound(a.url, a.volume ?? 100, { fadeInMs: Number(a.fadeInMs) || 0, fadeOutMs: Number(a.fadeOutMs) || 0 }); break; }
        case 'sound_stop': this.audio.stopSounds(); break;
        case 'sound_fadeout': this.audio.fadeOutSounds(1500); break;
        case 'evidence': case 'evidence_icon': await this.showEvidence(t.id, t.cmd === 'evidence_icon', s, false, t.side); break;
        case 'evidence_hide': this.state.evidence = null; break;
        default: break;
      }
      return null;
    }

    async typeText(tokens, { s, mains, name, nameColor, speakEnabled, blipUrl, muted }) {
      const box = this.state.box;
      this.curSpeed = this.textSpeed();
      this.curBlip = this.blipFreq();
      let skip = false;
      if (this.manual) this.skipText = () => { skip = true; };
      const blipBuf = muted ? null : await this.track(this.audio.buffer(blipUrl));
      let lastBlip = -1e9;
      let t = this.now();
      const setTalking = (v) => { for (const m of mains) m.talking = v; };
      // громкость «бипа» у персонажа (в библиотеке), по умолчанию 100%
      const blipVol = mains[0] && mains[0].c.blipVolume != null ? Math.max(0, Number(mains[0].c.blipVolume)) / 100 : 1;
      // весь текст кадра сразу раскладываем по строкам (ещё не напечатанное — невидимо), чтобы слова не прыгали
      // с строки на строку во время печати — как на сайте
      for (const tok of tokens) if (tok.type === 'text') for (const ch of tok.text) box.chars.push({ ch, color: tok.color, fmt: tok.fmt });
      box.layout = null;
      try {
        for (const tok of tokens) {
          this.check(s);
          if (tok.type === 'cmd') {
            if (tok.cmd === 'pause') {
              if (tok.ms >= 100) setTalking(false);
              if (!skip) { await this.sleep(tok.ms, s); }
              t = this.now();
            } else {
              await this.runCommand(tok, s);
            }
            continue;
          }
          if (!tok.text.length) continue;
          // окно появляется, когда начинается текст; имя на табличке — тоже с этого момента
          box.visible = true;
          box.name = name;
          box.nameColor = nameColor || null;
          for (const ch of tok.text) {
            box.shown++;
            if (skip || this.curSpeed <= 0) continue;
            if (!/\s/.test(ch)) {
              if (speakEnabled) { setTalking(true); this.state.talkingUntil = this.now() + Math.max(80, this.curSpeed * 2.5); }
              const n = this.now();
              if (n - lastBlip >= this.curBlip && blipBuf) { this.audio.playBuffer(blipBuf, 0.6 * blipVol); lastBlip = n; }
            }
            t += this.curSpeed;
            await this.sleepUntil(t, s);
          }
        }
        box.shown = box.chars.length;
      } finally {
        this.skipText = null;
      }
    }

    // ---------- Отрисовка ----------
    destroy() { this.destroyed = true; cancelAnimationFrame(this.rafId); Player.instances.delete(this); }

    // Картинки, которые сейчас на экране (их нельзя выгружать при очистке памяти)
    liveImages() {
      const st = this.state || {};
      const out = [st.bg?.img, st.bg?.desk, st.popup?.img, st.evidence?.img, st.evidence?.box, st.bubble?.img];
      for (const c of st.chars || []) out.push(c.idle, c.speak, c.override);
      for (const x of st.presetPopups || []) out.push(x.img);
      return out.filter(Boolean);
    }

    loop() {
      if (this.destroyed) return;
      this.rafId = requestAnimationFrame(this.loop);
      if (this.virtual) return; // при экспорте рисует экспортёр
      this.tick(this.now());
    }

    tick(now) {
      if (this.anims.length) {
        const keep = [];
        for (const a of this.anims) {
          if (a.s !== this.session) { a.reject(CANCEL); continue; }
          if (a.done) continue;
          const t = Math.min(1, (now - a.start) / a.dur);
          if (a.virtual) { if (t < 1) { a.fn(t); keep.push(a); } continue; }
          a.fn(t);
          if (t >= 1) a.resolve(); else keep.push(a);
        }
        this.anims = keep;
      }
      if (this.noImages) return;
      this.draw(now);
    }

    // «Отпечаток» того, что сейчас нарисовано: если он не изменился, кадр видео можно не перерисовывать
    frameSig(now) {
      const st = this.state;
      if (st.shake || st.flash || this.loadingSince) return null;
      const ids = this.bmpIds || (this.bmpIds = new WeakMap());
      const bid = (b) => { if (!b) return 0; let v = ids.get(b); if (!v) { v = (this.bmpSeq = (this.bmpSeq || 0) + 1); ids.set(b, v); } return v; };
      const p = [this.W, this.H];
      if (st.bg && st.bg.img) p.push('b', bid(st.bg.img.frameAt(now, true)), st.bg.flipped ? 1 : 0, st.bg.desk ? bid(st.bg.desk.frameAt(now, true)) : 0);
      if (st.overlay) p.push('o', st.overlay.target, st.overlay.color, st.overlay.a.toFixed(3));
      if (st.bg && st.bg.wide) p.push('v', (Number(st.view) || 0).toFixed(3));
      const talking = now < st.talkingUntil;
      for (const ch of st.chars) {
        let img = ch.override; let t0 = ch.overrideStart;
        if (!img) { img = ch.talking && talking ? ch.speak : ch.idle; t0 = this.epochOf(img); }
        p.push('c', img ? bid(this.charBmp(ch, img, now, t0)) : 0, (st.charAlpha[ch.slot] ?? 1).toFixed(3), ch.flipped ? 1 : 0);
      }
      const b = st.box;
      p.push('t', b.visible ? 1 : 0, b.shown, b.chars.length, b.name, b.center ? 1 : 0, this.tbKey || '');
      if (this.tb && this.tb.box) p.push(bid(this.tb.box.frameAt(now, true)));
      if (st.bubble && st.bubble.img) {
        if (st.bubble.shake && now - st.bubble.start < BUBBLE_SHAKE_MS + 20) return null;
        p.push('u', bid(st.bubble.img.frameAt(now - st.bubble.start, false)), st.bubble.fullscreen ? 1 : 0);
      }
      if (st.filter) p.push('f', st.filter.sig, (st.filterK ?? 1).toFixed(3));
      if (st.popupOut) return null; // картинка гаснет
      if (st.popup && st.popup.img) {
        const fx = pfx(st.popup);
        if (fx.fadeInMs > 0 && now - st.popup.shownAt < fx.fadeInMs + 20) return null; // проявляется
        p.push('pp', bid(st.popup.img.frameAt(now - st.popup.start, true)), fx.opacity.toFixed(3), fx.blend);
      }
      p.push('co', st.charOpacity ?? 1);
      for (const x of st.presetPopups) if (x.img) p.push('pr', bid(x.img.frameAt(now - x.start, false)));
      if (st.evidence) {
        if (st.evidence.icon && now - st.evidence.start < 220) return null;
        p.push('e', st.evidence.id, st.evidence.icon ? 1 : 0, this.evidenceLeft() ? 1 : 0, st.evidence.img ? bid(st.evidence.img.frameAt(now, true)) : 0);
      }
      return p.join('|');
    }

    // Сдвиг тряски в момент now
    shakeOffset(sh, now, H) {
      const e = (now - sh.start) / sh.dur;
      if (e >= 1) return null;
      const k = sh.motion === 'impact' || sh.motion === 'jolt' ? (1 - e) * (1 - e) : sh.motion === 'bubble' ? 1 - e * 0.25 : 1 - e * 0.5;
      const amp = sh.amp * H * (sh.motion === 'quake' ? 1.4 : 1) * k;
      const tt = (now - sh.start) / 16 + sh.seed;
      const rx = Math.sin(tt * 2.1) * 0.6 + Math.sin(tt * 5.3) * 0.4;
      const ry = Math.cos(tt * 2.7) * 0.6 + Math.sin(tt * 4.1) * 0.4;
      return { dx: sh.motion !== 'vertical' ? rx * amp : 0, dy: sh.motion !== 'horizontal' ? ry * amp : 0 };
    }

    draw(now) {
      const g = this.g;
      const { W, H } = this;
      const st = this.state;
      if (this.sigSkip) {
        const sig = this.frameSig(now);
        if (sig && sig === this.lastSig) { this.lastDrawChanged = false; return; }
        this.lastSig = sig;
        this.lastDrawChanged = true;
      }
      g.save();
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      this.updateCamera(now);

      // тряска сцены
      let dx = 0; let dy = 0;
      if (st.shake) {
        const o = this.shakeOffset(st.shake, now, H);
        if (!o) st.shake = null; else { dx = o.dx; dy = o.dy; }
      }
      const ov = st.overlay && st.overlay.a > 0 ? st.overlay : null;
      const drawOverlay = (full) => { g.fillStyle = hexA(ov.color, Math.min(1, ov.a)); if (full) g.fillRect(0, 0, W, H); else g.fillRect(-W, -H, W * 3, H * 3); };
      const filter = st.filter && (st.filterK ?? 1) > 0 ? this.cssFilter(st.filter, st.filterK ?? 1) : null;
      // слой сцены с фильтрами: bit — 1 (фон и стол) или место персонажа
      const layer = (bit, fn) => {
        if (!filter) { fn(); return; }
        const css = filter.cssFor(bit);
        const tints = filter.tintsFor(bit);
        if (!tints.length) { if (css) g.filter = css; fn(); g.filter = 'none'; return; }
        this.drawTinted(css, tints, fn);
      };
      // при тряске края кадра раньше открывали чёрные полосы (особенно заметно в 9:16) —
      // подкладываем неподвижный фон со столом, сдвинутая сцена рисуется поверх
      const wv = this.wideView();
      if ((dx || dy) && st.bg && st.bg.img) {
        g.save();
        this.zoomScene(wv);
        layer(1, () => {
          this.drawBgLayer(st.bg.img, st.bg, now);
          if (st.bg.desk) this.drawBgLayer(st.bg.desk, st.bg, now);
        });
        g.restore();
      }
      g.save();
      g.translate(dx, dy);
      this.zoomScene(wv);
      // фон
      if (st.bg && st.bg.img) {
        layer(1, () => this.drawBgLayer(st.bg.img, st.bg, now));
      }
      if (ov && ov.target === 'background') drawOverlay(false);
      // персонажи
      const talking = now < st.talkingUntil;
      for (const ch of st.chars) {
        let img = ch.override;
        let t0 = ch.overrideStart;
        if (!img) { img = ch.talking && talking ? ch.speak : ch.idle; t0 = this.epochOf(img); }
        if (!img) continue;
        const bmp = this.charBmp(ch, img, now, t0);
        if (!bmp || !bmp.width) continue;
        // прозрачность персонажа кадра (например, призрак) умножается на затемнение
        const alpha = (st.charAlpha[ch.slot] ?? 1) * (ch.isMain && st.charOpacity != null ? st.charOpacity : 1);
        if (alpha <= 0) continue;
        g.globalAlpha = Math.min(1, alpha);
        layer(ch.slot, () => this.drawCharacter(bmp, ch));
        g.globalAlpha = 1;
      }
      // стол: фильтр фона действует и на него
      if (st.bg && st.bg.desk) {
        layer(1, () => this.drawBgLayer(st.bg.desk, st.bg, now));
      }
      if (ov && ov.target === 'scene') drawOverlay(false);
      g.restore();

      // улика
      if (st.evidence && st.evidence.img) this.drawEvidence(now);
      // всплывающие картинки: под окном текста (у своей картинки можно включить «поверх окна текста»)
      const drawPopup = (pp, alpha) => {
        const bmp = pp.img.frameAt(now - pp.start, true);
        if (!bmp || !bmp.width || alpha <= 0) return;
        const a = pp.asset;
        const { bx, bw } = this.popupBox(a);
        const w = (bw * (a.resize || 0)) / 100;
        const hh = (w * bmp.height) / bmp.width;
        if (w <= 0) return;
        const x = a.center ? (W - w) / 2 : bx + (bw * (a.posX || 0)) / 100;
        const y = a.center ? (H - hh) / 2 : (H * (a.posY || 0)) / 100;
        g.save();
        g.globalAlpha = Math.max(0, Math.min(1, alpha));
        g.globalCompositeOperation = blendOf(pfx(pp).blend);
        g.drawImage(bmp, x + dx, y + dy, w, hh);
        g.restore();
      };
      const drawPopups = (above) => {
        if (st.popupOut && st.popupOut.img && !!st.popupOut.asset.aboveTextbox === above) {
          const o = st.popupOut; const k = (now - o.outAt) / pfx(o).fadeOutMs;
          if (k >= 1) st.popupOut = null; else drawPopup(o, pfx(o).opacity * (1 - Math.max(0, k)));
        }
        if (st.popup && st.popup.img && !!st.popup.asset.aboveTextbox === above) {
          const fx = pfx(st.popup);
          const fin = fx.fadeInMs > 0 ? Math.min(1, Math.max(0, (now - st.popup.shownAt) / fx.fadeInMs)) : 1;
          drawPopup(st.popup, fx.opacity * fin);
        }
        for (const x of st.presetPopups) {
          if (!x.img || !!x.above !== above) continue;
          const bmp = x.img.frameAt(now - x.start, false);
          if (!bmp || !bmp.width) continue;
          if (x.url === TESTIMONY_LABEL) g.drawImage(bmp, 0, 0, W, H);
          else { const hh = Math.min(H, (W * bmp.height) / bmp.width); g.drawImage(bmp, 0, (H - hh) / 2, W, hh); }
        }
      };
      drawPopups(false);
      // окно текста
      if (st.box.visible) this.drawTextbox(now);
      drawPopups(true);
      if (ov && ov.target !== 'background' && ov.target !== 'scene') drawOverlay(true);

      // выкрик
      if (st.bubble && st.bubble.img) {
        const bmp = st.bubble.img.frameAt(now - st.bubble.start, false);
        if (bmp && bmp.width) {
          let bx = 0; let by = 0;
          if (st.bubble.shake) { const o = this.shakeOffset({ start: st.bubble.start, dur: BUBBLE_SHAKE_MS, amp: BUBBLE_SHAKE_AMP, motion: 'bubble', seed: 7 }, now, H); if (o) { bx = o.dx; by = o.dy; } }
          if (st.bubble.fullscreen) g.drawImage(bmp, bx, by, W, H);
          else {
            let w = W * 0.75;
            let hh = (bmp.height * w) / bmp.width;
            if (hh > H) { hh = H; w = (bmp.width * hh) / bmp.height; }
            g.drawImage(bmp, (W - w) / 2 + bx, (H - hh) / 2 + by, w, hh);
          }
        }
      }
      // индикатор загрузки (только в окне программы, не в видео)
      if (this.loadingSince && !this.virtual && performance.now() - this.loadingSince > 350) {
        const fs = Math.round(H * 0.035);
        g.font = `600 ${fs}px ${this.fontFamily}`;
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(W - fs * 7.2, fs * 0.5, fs * 6.7, fs * 1.6);
        g.fillStyle = '#fff';
        g.textBaseline = 'middle';
        g.fillText(tx('Загрузка') + '.'.repeat(1 + Math.floor(performance.now() / 300) % 3), W - fs * 6.8, fs * 1.3);
      }
      // вспышка
      if (st.flash) {
        const e = (now - st.flash.start) / st.flash.dur;
        if (e >= 1) st.flash = null;
        else { g.fillStyle = hexA(st.flash.color || (this.project && this.project.options && this.project.options.flashColor) || '#ffffff', 1 - e); g.fillRect(0, 0, W, H); }
      }
      g.restore();
    }

    // Сторона значка улики: тег [#evdi…l/r] > настройка кадра > настройка проекта > по говорящему (как на сайте)
    evidenceLeft() {
      const st = this.state;
      const fixed = (st.evidence && st.evidence.side) || st.frameEvSide || (this.project && this.project.options && this.project.options.evidenceSide);
      if (fixed === 'left') return true;
      if (fixed === 'right') return false;
      const main = st.chars.find((c) => c.isMain);
      const side = main?.c?.side;
      const flipped = !!main?.flipped;
      return (side !== 'prosecution' && flipped) || (side === 'prosecution' && !flipped);
    }

    // Улика: на весь экран (на чёрном) или значком в углу
    drawEvidence(now) {
      const g = this.g;
      const { W, H } = this;
      const ev = this.state.evidence;
      const bmp = ev.img.frameAt(now, true);
      if (!bmp || !bmp.width) return;
      const o = (this.project && this.project.options) || {};
      if (!ev.icon) {
        // как на сайте — на чёрном; у улики можно включить «без чёрного фона» (прозрачные места видны насквозь)
        if (!(ev.asset && ev.asset.transparentBg)) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
        if (W >= H) {
          // как на сайте: ширина 100 %, высота не больше кадра
          let hh = (bmp.height * W) / bmp.width;
          if (hh > H) hh = H;
          g.drawImage(bmp, 0, 0, W, hh);
        } else {
          // 9:16: картинка под 16:9 — по «сцене» 16:9 (края обрезаются), вертикальная — по кадру; без искажений, по центру
          const { bx, bw } = this.mediaBox(bmp);
          let w = bw; let hh = (bmp.height * w) / bmp.width;
          if (hh > H) { hh = H; w = (bmp.width * hh) / bmp.height; }
          g.drawImage(bmp, bx + (bw - w) / 2, (H - hh) / 2, w, hh);
        }
        return;
      }
      const left = this.evidenceLeft();
      const evBase = W < H ? Math.min(this.stage().w, W * 2) : W; // в 9:16 значок улики не мельчит
      const maxW = (176 * evBase) / 960;
      const boxBmp = ev.box ? ev.box.frameAt(now, true) : null;
      let bw = maxW; let bh = maxW;
      if (boxBmp && boxBmp.width) { bw = Math.min(maxW, boxBmp.width * (evBase / 960)); bh = (boxBmp.height * bw) / boxBmp.width; }
      // появление значка: 'scale' — как на objection.lol (вырастает из точки за 0,2 с), 'slide' — выезжает сбоку,
      // 'drop' — опускается сверху, 'fade' — проявляется
      const anim = o.evidenceAnim || 'scale';
      const t = Math.min(1, (now - ev.start) / 200);
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);
      const x0 = left ? W * 0.01 : W - W * 0.01 - bw;
      const y0 = H * 0.01;
      let x = x0; let y = y0; let sc = 1; let alpha = 1;
      if (anim === 'slide') { x = x0 + (left ? -1 : 1) * (1 - t) * (bw + W * 0.01); alpha = t; }
      else if (anim === 'drop') { y = y0 - (1 - ease) * (bh + y0); }
      else if (anim === 'fade') alpha = t;
      else sc = ease;
      if (sc <= 0.001 || alpha <= 0) return;
      g.save();
      g.globalAlpha = alpha;
      if (sc !== 1) { g.translate(x + bw / 2, y + bh / 2); g.scale(sc, sc); g.translate(-(x + bw / 2), -(y + bh / 2)); }
      if (boxBmp && boxBmp.width) g.drawImage(boxBmp, x, y, bw, bh);
      let iw = bw * 0.875; let ih = (bmp.height * iw) / bmp.width;
      if (ih > bh * 0.875) { ih = bh * 0.875; iw = (bmp.width * ih) / bmp.height; }
      g.drawImage(bmp, x + (bw - iw) / 2, y + (bh - ih) / 2, iw, ih);
      g.restore();
    }

    // Фильтр кадра. Если у него задано плавное появление/снятие (fadeInMs/fadeOutMs), сила меняется постепенно
    applyFilter(nf, s) {
      const st = this.state;
      const old = st.filter;
      const token = (this.filterToken = (this.filterToken || 0) + 1);
      const run = (ms, fn) => this.animate(ms, (t) => { if (this.filterToken === token) fn(t); }, s).catch(() => {});
      if (nf && old && nf.sig === old.sig) { st.filter = nf; if (st.filterK < 1 && !(nf.fadeInMs > 0)) st.filterK = 1; else if (st.filterK < 1) { const from = st.filterK; run(nf.fadeInMs * (1 - from), (t) => { st.filterK = from + (1 - from) * t; }); } return; }
      if (!nf) {
        if (old && old.fadeOutMs > 0 && st.filterK > 0) {
          const from = st.filterK;
          run(old.fadeOutMs, (t) => { st.filterK = from * (1 - t); if (t >= 1) { st.filter = null; st.filterK = 1; } });
        } else { st.filter = null; st.filterK = 1; }
        return;
      }
      st.filter = nf;
      if (nf.fadeInMs > 0) { st.filterK = 0; run(nf.fadeInMs, (t) => { st.filterK = t; }); } else st.filterK = 1;
    }

    // Набор фильтров → CSS-строка и цветные наложения для каждого слоя (фон/стол — бит 1, персонаж — бит места)
    cssFilter(set, k = 1) {
      const cache = new Map();
      const forBit = (bit) => {
        let r = cache.get(bit);
        if (r) return r;
        const css = []; const tints = [];
        for (const e of set.list) {
          if (!(normTarget(e.target) & bit)) continue;
          if (e.type === 'tint') { const op = Math.max(0, Math.min(100, Number(e.amount ?? 50))) / 100 * k; if (op > 0) tints.push({ color: e.color || '#ff8800', blend: blendOf(e.blend || 'multiply'), alpha: op }); continue; }
          const c = cssOne(e, k);
          if (c) css.push(c);
        }
        r = { css: css.length ? css.join(' ') : null, tints };
        cache.set(bit, r);
        return r;
      };
      return { cssFor: (bit) => forBit(bit).css, tintsFor: (bit) => forBit(bit).tints };
    }

    // Слой с цветным наложением: рисуется отдельно, закрашивается в своём режиме наложения и обрезается по своей форме
    drawTinted(css, tints, fn) {
      const main = this.g;
      const cw = main.canvas.width; const chh = main.canvas.height;
      const mk = (c) => { if (!c) c = document.createElement('canvas'); if (c.width !== cw || c.height !== chh) { c.width = cw; c.height = chh; } return c; };
      this.tintA = mk(this.tintA); this.tintB = mk(this.tintB);
      const A = this.tintA.getContext('2d'); const B = this.tintB.getContext('2d');
      A.setTransform(1, 0, 0, 1, 0, 0); A.globalAlpha = 1; A.globalCompositeOperation = 'source-over'; A.filter = 'none'; A.clearRect(0, 0, cw, chh);
      A.setTransform(main.getTransform());
      A.globalAlpha = main.globalAlpha;
      A.imageSmoothingEnabled = main.imageSmoothingEnabled;
      if (css) A.filter = css;
      this.g = A;
      try { fn(); } finally { this.g = main; }
      A.setTransform(1, 0, 0, 1, 0, 0); A.filter = 'none'; A.globalAlpha = 1;
      B.setTransform(1, 0, 0, 1, 0, 0); B.globalAlpha = 1; B.filter = 'none';
      B.globalCompositeOperation = 'copy'; B.drawImage(this.tintA, 0, 0);
      for (const t of tints) { B.globalCompositeOperation = t.blend; B.globalAlpha = Math.min(1, t.alpha); B.fillStyle = t.color; B.fillRect(0, 0, cw, chh); }
      B.globalAlpha = 1; B.globalCompositeOperation = 'destination-in'; B.drawImage(this.tintA, 0, 0);
      B.globalCompositeOperation = 'source-over';
      main.save();
      main.setTransform(1, 0, 0, 1, 0, 0); main.globalAlpha = 1; main.filter = 'none';
      main.drawImage(this.tintB, 0, 0);
      main.restore();
    }

    // Сцена (фон и персонажи). В вертикальном видео (9:16) сцена остаётся 16:9 по высоте кадра
    // и обрезается по бокам, чтобы ничего не растягивалось.
    // Рамка для картинок поверх сцены (своя картинка кадра, улика на весь экран). В вертикальном кадре картинка,
    // сделанная под 16:9, считается от «сцены» 16:9 по центру кадра (края обрезаются), а вертикальная — от кадра.
    // Рамка своей картинки кадра. Размер и положение — в % от «сцены» 16:9 (как на сайте), в вертикальном кадре
    // сцена по центру и шире кадра; картинка с «размер от кадра» (sizeBase: 'frame') считается от самого кадра.
    popupBox(a) {
      const { W, H } = this;
      if (W >= H || (a && a.sizeBase === 'frame')) return { bx: 0, bw: W };
      const bw = (H * 16) / 9;
      return { bx: (W - bw) / 2, bw };
    }
    mediaBox(bmp) {
      const { W, H } = this;
      if (W >= H || !bmp || !bmp.width) return { bx: 0, bw: W };
      const ar = bmp.width / bmp.height;
      if (ar <= (W / H + 16 / 9) / 2) return { bx: 0, bw: W };
      const bw = (H * 16) / 9;
      return { bx: (W - bw) / 2, bw };
    }

    stage() {
      const { W, H } = this;
      if (W >= H) return { x: 0, w: W };
      const w = (H * 16) / 9;
      return { x: this.camX != null ? this.camX : (W - w) / 2, w };
    }
    // Середина непрозрачной части картинки по горизонтали (0..1), считается один раз на картинку
    focusOf(img, bmp) {
      this.focusCache = this.focusCache || new WeakMap();
      const key = img || bmp;
      if (this.focusCache.has(key)) return this.focusCache.get(key);
      let f = 0.5;
      try {
        const w = 64; const h = Math.max(1, Math.round((bmp.height * w) / bmp.width));
        const c = new OffscreenCanvas(w, h);
        const cg = c.getContext('2d', { willReadFrequently: true });
        cg.drawImage(bmp, 0, 0, w, h);
        const d = cg.getImageData(0, 0, w, h).data;
        let sum = 0; let n = 0;
        for (let x = 0; x < w; x++) {
          let col = 0;
          for (let y = 0; y < h; y++) col += d[(y * w + x) * 4 + 3];
          sum += col * (x + 0.5); n += col;
        }
        if (n > 0) f = sum / n / w;
      } catch (e) { /* оставим середину */ }
      this.focusCache.set(key, f);
      return f;
    }
    // В вертикальном видео «камера» смотрит на говорящего: сцена сдвигается, чтобы он был по центру
    updateCamera(now) {
      const { W, H } = this;
      this.camX = null;
      if (W >= H) return;
      const sw = (H * 16) / 9;
      const ch = this.state.chars.find((c) => c.isMain);
      let cx = sw / 2;
      if (ch) {
        // по первому кадру позы «молчит», чтобы камера не дёргалась от анимации и разговора
        const img = ch.idle;
        const bmp = img && img.frameAt(0, true);
        if (bmp && bmp.width) {
          const v = this.wideView();
          const r = this.charRect(bmp, ch, v.wv);
          r.x += v.ox + v.spotX;
          if (v.z > 1) { r.x *= v.z; r.w *= v.z; }
          const f = this.focusOf(img, bmp); // где на картинке сам персонаж (у спрайтов «на весь кадр» он не по центру)
          cx = r.x + r.w * (ch.flipped ? 1 - f : f);
        }
      }
      this.camX = Math.max(W - sw, Math.min(0, W / 2 - cx));
    }
    // Насколько поднять окно текста (в вертикальном видео внизу кнопки TikTok/Shorts)
    textboxLift() {
      const o = (this.project && this.project.options) || {};
      // текстбокс на всю высоту кадра (вертикальный или «на оба формата») сам знает, где ему быть — его не поднимаем
      const full = this.tb && this.tb.style && this.tbRect().full;
      const pct = o.textboxLift ?? (this.W < this.H && !full ? 15 : 0);
      return (this.H * (Number(pct) || 0)) / 100;
    }

    drawBgLayer(img, bg, now) {
      const g = this.g;
      const { H } = this;
      const { x: SX, w: W } = this.stage();
      const bmp = img.frameAt(now, true);
      if (!bmp || !bmp.width) return;
      const v = bg.wide ? this.wideView() : null;
      const w = v && v.wide ? v.pw : W;
      g.save();
      g.translate(SX + (v ? v.ox : 0), 0);
      if (bg.flipped) { g.translate(w, 0); g.scale(-1, 1); }
      g.drawImage(bmp, 0, 0, w, H);
      g.restore();
    }

    drawCharacter(bmp, ch) {
      const g = this.g;
      const { x: SX, w: W } = this.stage();
      // на широком фоне персонажи стоят на панораме и едут вместе с ней
      const v = this.wideView();
      let { x, y, w, h } = this.charRect(bmp, ch, v.wv);
      x += SX + v.ox + v.spotX;
      if (ch.flipped) {
        g.save();
        g.translate(x + w, y);
        g.scale(-1, 1);
        g.drawImage(bmp, 0, 0, w, h);
        g.restore();
      } else {
        g.drawImage(bmp, x, y, w, h);
      }
    }

    // Где персонаж на сцене шириной W (правила objection.lol)
    charRect(bmp, ch, W) {
      const { H } = this;
      const c = ch.c;
      const e = ch.entry;
      const offX = (c.offsetX || 0) + (e?.offsetX || 0);
      const offY = (c.offsetY || 0) + (e?.offsetY || 0);
      const size = e?.size ?? c.size ?? 100;
      const h = (H * size) / 100;
      let w = (bmp.width * h) / bmp.height;
      if (c.limitWidth && w > W) w = W;
      let side = SIDES_LEFT.includes(c.side) ? 'left' : c.side === 'prosecution' ? 'right' : 'center';
      if (c.alignment === 1) side = 'left'; else if (c.alignment === 2) side = 'right';
      if (ch.flipped) side = side === 'left' ? 'right' : side === 'right' ? 'left' : side;
      let x;
      if (side === 'left') x = (W * offX) / 100;
      else if (side === 'right') x = W - w - (W * offX) / 100;
      else { const l = (W * offX) / 100; x = l + (W - l - w) / 2; }
      const y = (H * offY) / 100;
      return { x, y, w, h };
    }

    // Где на кадре лежит текстбокс (картинка «на весь кадр»): по ширине кадра, а если картинка вытянута сильнее
    // кадра (вертикальный текстбокс в горизонтальном проекте) — по высоте, по центру. rx, rw — левый край и ширина.
    // Горизонтальный текстбокс в вертикальном проекте: если всё нарисованное умещается в середине картинки
    // (по краям пусто — бокс сделан «на оба формата»), картинка растягивается по высоте кадра и края обрезаются;
    // иначе — по ширине кадра.
    // Как картинка текстбокса ложится в кадр (style.fit):
    //  • 'auto' (по умолчанию):
    //    – горизонтальный кадр: вертикальная картинка — по высоте, по центру; горизонтальная — по ширине
    //      (стандартные 960×640 в 16:9 — как на objection.lol);
    //    – вертикальный кадр: нарисованное занимает всю ширину кадра (пустые края и верх уходят за кадр, низ на месте).
    //      Так горизонтальная картинка «с пустыми краями» и вырезанная из неё середина выглядят одинаково
    //      и без полос по бокам, даже если середина уже 9:16 (например, 534×1080 под экран телефона);
    //  • 'width' — картинка по ширине кадра; 'height' — по высоте кадра (края обрезаются);
    //  • 'content' — нарисованное по ширине кадра в любом проекте.
    // Формат, под который сделан текстбокс (style.designFor): 'auto' — по картинке, 'any' — ни под какой
    designKey() {
      const sty = (this.tb && this.tb.style) || {};
      const k = sty.designFor;
      if (k === 'any') return null;
      if (k && k !== 'auto') return k;
      return guessDesign(this.tb && this.tb.box);
    }
    // Текстбокс сделан под формат кадра — показывается как есть: картинка по ширине кадра, проценты и шрифт
    // от самой картинки, без подгонок под другой формат
    tbAsIs() {
      const k = this.designKey();
      if (!k) return false;
      const [a, b] = k.split(':').map(Number);
      const r = a / b;
      return Math.abs(this.W / this.H - r) / r < 0.02;
    }

    tbRect() {
      const { W, H } = this;
      const img = this.tb && this.tb.box;
      if (!img || !img.w || !img.h) return { rx: 0, rw: W, vertical: false, full: false };
      if (this.tbAsIs()) return { rx: 0, rw: W, vertical: img.h > img.w, full: (W * img.h) / img.w >= H * 0.98, asIs: true };
      const fit = (!this.ignoreFit && this.tb.style && this.tb.style.fit) || 'auto';
      const fr = W / H; const ir = img.w / img.h;
      let rw = W;
      let cx = 0.5; // какая точка картинки (доля ширины) стоит по центру кадра
      const byContent = () => {
        const [a, b] = this.opaqueSpan(img);
        if (b - a >= 0.98) return W;
        cx = (a + b) / 2;
        // не крупнее полутора «по высоте» — чтобы узкая полоска не раздувалась на весь кадр
        return Math.min((H * ir) * 1.5, W / (b - a));
      };
      if (fit === 'width') rw = W;
      else if (fit === 'height') rw = H * ir;
      else if (fit === 'content') rw = byContent();
      else if (fr < 1) rw = byContent();
      else if (ir < 1 && ir < fr - 0.005) rw = H * ir;
      const rx = W / 2 - rw * cx;
      return { rx, rw, vertical: img.h > img.w, full: (rw * img.h) / img.w >= H * 0.98 };
    }
    // Где по горизонтали на картинке есть непрозрачные пиксели: [от, до] в долях ширины (считается один раз)
    opaqueSpan(img) {
      this.spanCache = this.spanCache || new WeakMap();
      if (this.spanCache.has(img)) return this.spanCache.get(img);
      let r = [0, 1];
      try {
        const bmp = img.frameAt(0, true);
        if (bmp && bmp.width) {
          const w = Math.min(bmp.width, 1024); const h = Math.max(1, Math.min(256, Math.round((bmp.height * w) / bmp.width)));
          const c = new OffscreenCanvas(w, h);
          const cg = c.getContext('2d', { willReadFrequently: true });
          cg.drawImage(bmp, 0, 0, w, h);
          const d = cg.getImageData(0, 0, w, h).data;
          let a = -1; let b = -1;
          for (let x = 0; x < w; x++) {
            let on = false;
            for (let y = 0; y < h && !on; y++) if (d[(y * w + x) * 4 + 3] > 8) on = true;
            if (on) { if (a < 0) a = x; b = x + 1; }
          }
          if (a >= 0) r = [a / w, b / w];
          this.spanCache.set(img, r);
        }
      } catch (e) { /* считаем, что картинка заполнена целиком */ }
      return r;
    }

    // Система координат текстбокса. Проценты (слева/сверху/ширина) и размеры шрифтов задаются:
    //  • layoutBase '16:9' (по умолчанию, как на objection.lol): от «кадра 16:9» высотой с картинку, по её центру.
    //    Шрифт — от высоты картинки (как на сайте: 960×540). Тогда вертикальная картинка, вырезанная из середины
    //    горизонтальной, с теми же настройками выглядит так же, а текст в 9:16 не сжимается;
    //  • layoutBase 'image': от самой картинки (для текстбоксов, нарисованных под вертикальное видео с нуля);
    //    шрифт — от её ширины (960, у вертикальной — 540).
    tbFrame() {
      const { H } = this;
      const sty = (this.tb && this.tb.style) || {};
      const img = this.tb && this.tb.box;
      const { rx, rw, vertical, full, asIs } = this.tbRect();
      const rh = img ? (rw * img.h) / img.w : (rw * 2) / 3;
      // горизонтальная картинка — всегда как на сайте: проценты и шрифт от её ширины (960);
      // текстбокс под формат кадра — тоже от самой картинки
      const image = asIs || sty.layoutBase === 'image' || !vertical;
      const vw = image ? rw : (rh * 16) / 9;
      const size = image ? (vertical ? rw / 540 : rw / 960) : rh / 540;
      return { rx, rw, rh, vx: rx + rw / 2 - vw / 2, vw, size, y0: H - rh, full, vertical };
    }

    // Геометрия окна текста: встроенное окно или текстбокс в формате objection.lol
    textGeometry() {
      const { W, H } = this;
      const tb = this.tb && this.tb.style ? this.tb : null;
      const center = this.state.box.center;
      if (!tb) {
        // классическое окно objection.lol: чёрное полупрозрачное снизу на 25% высоты, Verdana,
        // шрифт уменьшается, если реплика не влезает (см. layoutText)
        const portrait = W < H;
        // в вертикальном видео текст крупнее, а окно — по высоте трёх строк
        const size = (W / 960) * (portrait ? 1.6 : 1);
        const bw = Math.max(1, 2 * size);
        const fs = 35.25 * size;
        const boxH = portrait ? Math.min(H * 0.25, fs * 1.5 * 3 + bw * 2 + fs * 0.3) : H * 0.25;
        const boxY = H - boxH;
        const padX = W * 0.01;
        return {
          styled: false, classic: true, size, bw, boxX: 0, boxY, boxW: W, boxH,
          fs, fs0: fs, lineH: fs * 1.5, font: `${fs}px Verdana, "DejaVu Sans", sans-serif`, family: 'Verdana, "DejaVu Sans", sans-serif',
          // в вертикальном видео справа кнопки TikTok/Shorts — текст заканчивается раньше
          x: bw + padX, y: boxY + bw, w: W - 2 * bw - 2 * padX - (portrait ? W * 0.14 : 0), textH: boxH - 2 * bw,
          align: center ? 'center' : 'left',
          colors: { r: '#F77337', g: '#00F61C', b: '#6BC7F6', def: '#FFFFFF' },
          letter: 0, word: 0,
        };
      }
      const sty = tb.style;
      const t = sty.text || {};
      const img = tb.box;
      // размеры — в системе координат текстбокса (tbFrame), а не кадра
      const { rx, rw, rh: ch, vx, vw, size, y0 } = this.tbFrame();
      const fs = (t.fontSize || 30) * size;
      // без своего межстрочного на сайте действует 1.5 (наследуется от страницы)
      const lh = (t.lineHeight || 1.5) * fs;
      const left = center ? (t.leftCenter ?? t.left ?? 5) : (t.left ?? 5);
      const width = center ? (t.widthCenter ?? t.width ?? 90) : (t.width ?? 90);
      const top = center ? (t.topCenter ?? t.top ?? 70) : (t.top ?? 70);
      const hx = (c) => (c ? '#' + String(c).replace('#', '') : null);
      const family = window.Assets.Fonts.css(t.fontUrl, this.fontFamily);
      return {
        styled: true, size, y0, ch, fs, lineH: lh, rx, rw, vx, vw, family,
        font: `${fs}px ${family}`,
        outline: t.outlineWidth > 0 ? { w: t.outlineWidth * size, color: hexOr(t.outlineColor, '#000000') } : null,
        x: vx + (vw * left) / 100, y: y0 + (ch * top) / 100, w: (vw * width) / 100,
        boxH: (t.height ?? 3.6) * fs, textH: (t.height ?? 3.6) * fs,
        maxLines: Math.max(1, Math.floor((t.height ?? 3.6) * fs / lh + 0.02)),
        align: center ? 'center' : (t.textAlignment === 'center' ? 'center' : t.textAlignment === 'right' || t.textAlignment === 'end' ? 'right' : 'left'),
        colors: { r: hx(sty.red) || '#F77337', g: hx(sty.green) || '#00F61C', b: hx(sty.blue) || '#6BC7F6', def: hx(sty.defaultColor) || '#FFFFFF' },
        // на сайте интервалы заданы в em от размера страницы (16 px) и умножены на масштаб кадра
        letter: (sty.letterSpacing || 0) * size * 16, word: (sty.wordSpacing || 0) * size * 16,
      };
    }

    // Высота букв шрифта над и под базовой линией (как их видит браузер при вёрстке)
    fontMetrics(g, font) {
      this.fmCache = this.fmCache || new Map();
      let m = this.fmCache.get(font);
      if (m) return m;
      g.save();
      g.font = font;
      const t = g.measureText('Hgйё');
      const fsz = parseFloat((font.match(/([\d.]+)px/) || [])[1]) || 16;
      m = { a: t.fontBoundingBoxAscent ?? fsz * 0.8, d: t.fontBoundingBoxDescent ?? fsz * 0.2 };
      g.restore();
      if (this.fmCache.size > 50) this.fmCache.clear();
      this.fmCache.set(font, m);
      return m;
    }
    // Где базовая линия строки высотой lineH, если её верх — top (как в CSS: шрифт по центру строки)
    baselineIn(g, font, top, lineH) {
      const m = this.fontMetrics(g, font);
      return top + (lineH - (m.a + m.d)) / 2 + m.a;
    }

    // Шрифт буквы с оформлением ([#/i], [#/bd], [#/sz150])
    fontFor(geo, fmt) {
      if (!fmt) return geo.font;
      const fam = geo.family || geo.font.replace(/^.*?px\s+/, '');
      return `${fmt.i ? 'italic ' : ''}${fmt.b ? 'bold ' : ''}${geo.fs * (fmt.z || 1)}px ${fam}`;
    }
    fmtKey(c) { const f = c.fmt; return f ? `${f.i ? 'i' : ''}${f.b ? 'b' : ''}${f.z || ''}` : ''; }
    // Ширина букв a..b с учётом оформления
    measureChars(g, geo, chars, a, b) {
      let w = 0;
      let i = a;
      while (i < b) {
        const key = this.fmtKey(chars[i]);
        let j = i + 1;
        while (j < b && this.fmtKey(chars[j]) === key) j++;
        if (key) g.font = this.fontFor(geo, chars[i].fmt);
        w += g.measureText(chars.slice(i, j).map((x) => x.ch).join('')).width;
        if (key) g.font = geo.font;
        i = j;
      }
      return w;
    }

    applyTextFont(g, geo) {
      g.font = geo.font;
      if ('letterSpacing' in g) g.letterSpacing = (geo.letter || 0) + 'px';
      if ('wordSpacing' in g) g.wordSpacing = (geo.word || 0) + 'px';
    }

    layoutText() {
      const geo0 = this.textGeometry();
      if (!geo0.classic) return this.layoutWith(geo0);
      // классическое окно: уменьшаем шрифт, пока реплика не влезет (как на сайте — до 7 px при ширине 960)
      let fs = geo0.fs0;
      const min = 7 * geo0.size;
      for (;;) {
        const geo = { ...geo0, fs, lineH: fs * 1.5, font: `${fs}px ${geo0.family}` };
        const lay = this.layoutWith(geo);
        const total = lay.heights ? lay.heights.reduce((a, b) => a + b, 0) : lay.lines.length * geo.lineH;
        if (total <= geo.textH + 0.5 || fs <= min) return lay;
        fs = Math.max(min, fs - Math.max(0.25, fs * 0.03));
      }
    }

    layoutWith(geo) {
      const box = this.state.box;
      const g = this.g;
      g.save();
      this.applyTextFont(g, geo);
      const maxW = geo.w;
      const lines = [[]];
      const chars = box.chars;
      let lineW = 0;
      let i = 0;
      const fancy = chars.some((c) => c.fmt);
      const widthOf = fancy ? (a, b) => this.measureChars(g, geo, chars, a, b) : (a, b) => g.measureText(chars.slice(a, b).map((x) => x.ch).join('')).width;
      while (i < chars.length) {
        const ch = chars[i].ch;
        if (ch === '\n') { lines.push([]); lineW = 0; i++; continue; }
        let j = i;
        if (/\s/.test(ch)) j = i + 1;
        else while (j < chars.length && !/\s/.test(chars[j].ch)) j++;
        const ww = widthOf(i, j);
        const cur = lines[lines.length - 1];
        if (lineW + ww > maxW && cur.length > 0 && !/\s/.test(ch)) {
          while (cur.length && /\s/.test(chars[cur[cur.length - 1]].ch)) cur.pop();
          lines.push([]);
          lineW = 0;
        }
        const line = lines[lines.length - 1];
        if (ww > maxW) {
          for (let k = i; k < j; k++) {
            const cw = widthOf(k, k + 1);
            if (lineW + cw > maxW && line.length) { lines.push([]); lineW = 0; }
            lines[lines.length - 1].push(k);
            lineW += cw;
          }
        } else if (!(line.length === 0 && /\s/.test(ch))) {
          for (let k = i; k < j; k++) line.push(k);
          lineW += ww;
        }
        i = j;
      }
      g.restore();
      // высота строки растёт, если в ней есть крупные буквы ([#/sz150])
      const zs = lines.map((ln) => ln.reduce((m, k) => Math.max(m, (chars[k].fmt && chars[k].fmt.z) || 1), 1));
      const heights = fancy ? zs.map((z) => geo.lineH * Math.max(1, z)) : null;
      box.layout = { lines, geo, count: chars.length, key: this.tbKey, heights, zs };
      return box.layout;
    }

    // Загружает картинки и шрифты текущего текстбокса
    async prepareTextbox() {
      const sty = this.previewStyle || window.Assets.Lib.textbox(this.charTextbox != null ? this.charTextbox : this.textboxId);
      const key = sty ? (this.previewStyle ? 'p' + this.previewRev : String(sty.id)) + '@' + this.H + '#' + (ImageCache.epoch || 0) : '0';
      const tbAlive = !this.tb || (ImageCache.alive(this.tb.box) && ImageCache.alive(this.tb.plate) && ImageCache.alive(this.tb.next));
      if (this.tbKey === key && (this.tb || !sty) && tbAlive) return;
      if (!sty) { this.tb = null; this.tbKey = key; return; }
      const [box, plate, next] = await Promise.all([
        sty.url ? this.img(sty.url, 0) : null,
        sty.nameplate && sty.nameplate.url ? this.img(sty.nameplate.url, 0) : null,
        sty.nextButton && sty.nextButton.url ? this.img(sty.nextButton.url, 0) : null,
      ]);
      if (!this.noImages) await this.track(window.Assets.Fonts.ensure([sty.text && sty.text.fontUrl, sty.nameplate && sty.nameplate.fontUrl]));
      this.fmCache = null;
      // картинки текстбокса не должны выгружаться из памяти, пока он используется
      if (this.tb) for (const im of [this.tb.box, this.tb.plate, this.tb.next]) if (im && ![box, plate, next].includes(im)) ImageCache.sticky.delete(im);
      for (const im of [box, plate, next]) if (im) ImageCache.sticky.add(im);
      this.tb = { style: sty, box, plate, next };
      this.tbKey = key;
    }

    drawTextbox(now) {
      const g = this.g;
      const box = this.state.box;
      const lay = box.layout && box.layout.count === box.chars.length && box.layout.key === this.tbKey ? box.layout : this.layoutText();
      const { geo } = lay;
      const { W, H } = this;
      g.save();
      g.translate(0, -this.textboxLift());
      if (!geo.styled) {
        const { size, bw } = geo;
        // окно
        g.fillStyle = 'rgba(0, 0, 0, 0.75)';
        roundRect(g, bw / 2, geo.boxY + bw / 2, W - bw, geo.boxH - bw, 6 * size);
        g.fill();
        ridge(g, bw, '#888888');
        // табличка с именем
        if (box.name) {
          const nfs = 28 * size;
          const nfont = `${nfs}px ${geo.family}`;
          g.font = nfont;
          const pad = 7 * size;
          const nw = g.measureText(box.name).width + pad * 2 + bw * 2;
          const nh = nfs * 1.5 + bw * 2;
          const ny = geo.boxY + H * 0.005 - nh;
          g.fillStyle = 'rgb(5, 5, 100)';
          roundRect(g, bw / 2, ny + bw / 2, nw - bw, nh - bw, 7 * size);
          g.fill();
          ridge(g, bw, '#888888');
          g.fillStyle = box.nameColor || '#fff';
          g.textBaseline = 'alphabetic';
          g.textAlign = 'left';
          g.fillText(box.name, bw + pad, this.baselineIn(g, nfont, ny + bw, nfs * 1.5));
        }
      } else {
        const tb = this.tb;
        if (!(ImageCache.alive(tb.box) && ImageCache.alive(tb.plate)) && !this.tbReloading && !this.virtual) {
          this.tbReloading = true;
          this.tbKey = null;
          this.prepareTextbox().finally(() => { this.tbReloading = false; });
        }
        const sty = tb.style;
        const np = sty.nameplate || {};
        const showName = !!box.name && !sty.hideName;
        g.globalAlpha = sty.opacity ?? 1;
        const boxImg = np.replaceBox && showName && tb.plate ? tb.plate : tb.box;
        if (boxImg) {
          const bmp = boxImg.frameAt(now, true);
          if (bmp && bmp.width) {
            g.globalAlpha = (sty.opacity ?? 1) * (sty.imageOpacity ?? 1);
            const hh = (geo.rw * bmp.height) / bmp.width;
            g.drawImage(bmp, geo.rx, H - hh, geo.rw, hh);
          }
        }
        g.globalAlpha = sty.opacity ?? 1;
        if (showName) {
          let pch = geo.ch;
          if (tb.plate) {
            const pb = tb.plate.frameAt(now, true);
            if (pb && pb.width) {
              pch = (geo.rw * pb.height) / pb.width;
              if (!np.replaceBox) g.drawImage(pb, geo.rx, H - pch, geo.rw, pch);
            }
          }
          const nfs = (np.fontSize || 26) * geo.size;
          const nfont = `${nfs}px ${window.Assets.Fonts.css(np.fontUrl, this.fontFamily)}`;
          g.font = nfont;
          if ('letterSpacing' in g) g.letterSpacing = ((np.letterSpacing || 0) * geo.size * nfs) + 'px';
          g.textBaseline = 'alphabetic';
          const right = (geo.vw * (np.right ?? 30)) / 100;
          const wdt = (geo.vw * (np.width ?? 100)) / 100;
          const ny = this.baselineIn(g, nfont, H - pch + (pch * (np.top ?? 62)) / 100, nfs * 1.5);
          const al = np.textAlignment || 'center';
          const R = geo.vx + geo.vw;
          let nx;
          if (al === 'center') { g.textAlign = 'center'; nx = R - right - wdt / 2; }
          else if (al === 'right' || al === 'end') { g.textAlign = 'right'; nx = R - right; }
          else { g.textAlign = 'left'; nx = R - right - wdt; }
          // обводка имени
          if (np.outlineWidth > 0) {
            g.lineJoin = 'round'; g.miterLimit = 2;
            g.lineWidth = np.outlineWidth * geo.size * 2;
            g.strokeStyle = hexOr(np.outlineColor, '#000000');
            g.strokeText(box.name, nx, ny);
          }
          // цвет имени: у персонажа свой, иначе — из текстбокса
          g.fillStyle = box.nameColor || (np.color ? '#' + String(np.color).replace('#', '') : '#fff');
          g.fillText(box.name, nx, ny);
          if ('letterSpacing' in g) g.letterSpacing = '0px';
        }
      }
      // текст
      this.applyTextFont(g, geo);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      let lastShownLine = 0;
      lay.lines.forEach((ln, li) => { if (ln.some((k) => k < box.shown)) lastShownLine = li; });
      const LH = (li) => (lay.heights ? lay.heights[li] : geo.lineH);
      const tops = [];
      { let acc = 0; for (let li = 0; li < lay.lines.length; li++) { tops.push(acc); acc += LH(li); } }
      // как на сайте: у области текста своя высота; если напечатанное не влезает — прокрутка вниз
      const contentH = lay.lines.length ? tops[lastShownLine] + LH(lastShownLine) : 0;
      const scroll = contentH - geo.textH > 10 ? contentH - geo.textH : 0;
      let firstLine = 0;
      while (firstLine < lastShownLine && tops[firstLine] + LH(firstLine) <= scroll + 0.01) firstLine++;
      g.save();
      g.beginPath();
      g.rect(geo.x - geo.fs, geo.y, geo.w + geo.fs * 2, geo.textH);
      g.clip();
      const colorOf = (c) => (!c ? geo.colors.def : geo.colors[c] || c);
      const ol = geo.outline;
      if (ol) { g.lineJoin = 'round'; g.miterLimit = 2; g.lineWidth = ol.w * 2; g.strokeStyle = ol.color; }
      for (let li = firstLine; li <= lastShownLine && li < lay.lines.length; li++) {
        const ln = lay.lines[li];
        const z = lay.zs ? lay.zs[li] : 1;
        const y = this.baselineIn(g, z > 1 ? this.fontFor(geo, { z }) : geo.font, geo.y + tops[li] - scroll, LH(li));
        let x = geo.x;
        if (geo.align !== 'left') {
          const lw = lay.heights ? this.measureChars(g, geo, box.chars, ln[0] ?? 0, (ln[ln.length - 1] ?? -1) + 1) : g.measureText(ln.map((k) => box.chars[k].ch).join('')).width;
          x = geo.align === 'center' ? geo.x + (geo.w - lw) / 2 : geo.x + geo.w - lw;
        }
        let run = '';
        let runColor = null;
        let runFmt = null;
        let runKey = '';
        const flush = () => {
          if (!run) return;
          if (runFmt) g.font = this.fontFor(geo, runFmt);
          const rw = g.measureText(run).width;
          if (ol) g.strokeText(run, x, y);
          g.fillStyle = colorOf(runColor);
          g.fillText(run, x, y);
          if (runFmt && (runFmt.u || runFmt.s)) {
            const fsz = geo.fs * (runFmt.z || 1);
            const th = Math.max(1, fsz * 0.07);
            if (runFmt.u) g.fillRect(x, y + fsz * 0.12, rw, th);
            if (runFmt.s) g.fillRect(x, y - fsz * 0.3, rw, th);
          }
          if (runFmt) g.font = geo.font;
          x += rw;
          run = '';
        };
        for (const k of ln) {
          if (k >= box.shown) break;
          const c = box.chars[k];
          const key = (c.color || '') + '|' + this.fmtKey(c) + (c.fmt && c.fmt.u ? 'u' : '') + (c.fmt && c.fmt.s ? 's' : '');
          if (key !== runKey) { flush(); runKey = key; runColor = c.color; runFmt = c.fmt || null; }
          run += c.ch;
        }
        flush();
      }
      g.restore();
      // стрелка «дальше»
      if (this.manual && this.waitingClick && box.shown >= box.chars.length) {
        const a = (Math.sin(now / 160) + 1) / 2;
        g.shadowColor = 'transparent';
        let ax; let ay; let sz; let col = `rgba(255, 213, 96, ${0.6 + a * 0.4})`;
        if (geo.styled && this.tb.style.nextButton) {
          const nb = this.tb.style.nextButton;
          sz = (nb.iconSize || 3) * geo.size * 9;
          ax = geo.vx + (geo.vw * (nb.left ?? 90)) / 100 + a * sz * 0.3;
          ay = geo.y0 + (geo.ch * (nb.top ?? 80)) / 100 + sz * 0.5;
          if (nb.iconColor) col = '#' + String(nb.iconColor).replace('#', '');
        } else {
          // кнопка сайта: оранжевый квадрат с «»»
          const portrait = W < H;
          const bwid = W * 0.0833; const bh = portrait ? bwid * 0.675 : H * 0.1;
          const bx = W * 0.9075; const by = portrait ? geo.boxY - bh - W * 0.02 : H * 0.62;
          const grad = g.createLinearGradient(0, by, 0, by + bh);
          grad.addColorStop(0, '#af5000'); grad.addColorStop(1, '#731400');
          g.fillStyle = grad;
          roundRect(g, bx, by, bwid, bh, 3 * geo.size);
          g.fill();
          g.lineWidth = 5 * geo.size; g.strokeStyle = '#d88643'; g.stroke();
          sz = Math.min(bwid, bh) * 0.32;
          ax = bx + bwid / 2 - sz * 0.9 + a * sz * 0.2; ay = by + bh / 2;
          g.fillStyle = '#fff';
          for (const off of [0, sz * 0.8]) { g.beginPath(); g.moveTo(ax + off, ay - sz * 0.7); g.lineTo(ax + off + sz * 0.8, ay); g.lineTo(ax + off, ay + sz * 0.7); g.closePath(); g.fill(); }
          g.restore();
          return;
        }
        g.fillStyle = col;
        g.beginPath(); g.moveTo(ax, ay - sz * 0.6); g.lineTo(ax + sz, ay); g.lineTo(ax, ay + sz * 0.6); g.closePath(); g.fill();
      }
      g.restore();
    }

    // ---------- Статичный кадр для редактора ----------
    async showStill(i) {
      this.stop();
      const s = this.session;
      const old = this.state;
      this.resetState();
      if (!this.frames[i]) { this.state.box.visible = false; return; }
      // состояние от прошлых кадров (окно текста, затемнения, улики, значок «Testimony»)
      this.fastForward(i);
      // пока грузятся картинки, на экране остаётся прошлая картинка
      const fresh = this.state;
      this.state = { ...old, chars: (old.chars || []).map((c) => ({ ...c, talking: false })) };
      const done = () => { this.state = fresh; };
      const f = this.frames[i];
      const prev = this.frames[i - 1];
      const act = this.applyActions(f, true);
      if (parseText(f.text || '').some((t) => t.type === 'text' && t.text.length)) this.charTextbox = this.characterTextbox(Lib.char(f.characterId));
      await this.prepareTextbox();
      const scene = await this.buildScene(i);
      if (s !== this.session) return;
      const pp = f.popupId ? Lib.get('popups', f.popupId) : null;
      const ppImg = pp ? await this.img(pp.url, 0) : null;
      if (s !== this.session) return;
      done();
      const st = this.state;
      this.settleCharFades(i);
      st.bg = scene.bg;
      st.chars = scene.chars;
      st.charOpacity = f.charOpacity != null && f.charOpacity !== '' && Number(f.charOpacity) < 100 ? Math.max(0, Number(f.charOpacity)) / 100 : null;
      st.frameEvSide = f.evidenceSide === 'left' || f.evidenceSide === 'right' ? f.evidenceSide : null;
      st.wideSpot = this.wideSpotFor(f, scene.chars);
      if (f.transition && f.transition.left != null) st.bgLeft = Number(f.transition.left) || 0;
      st.view = st.bgLeft;
      st.filter = filterSet(f);
      st.filterK = 1;
      st.popupOut = null;
      st.popup = pp ? { asset: pp, img: ppImg, start: this.now(), shownAt: -1e9, fx: popupFx(pp, f) } : null;
      let ev = this.ffEvidence;
      let label = this.ffLabel;
      for (const a of f.actions || []) {
        if (a.actionId === 7 && a.actionParam === '3') label = true;
        if (a.actionId === 8 && a.actionParam === '1') label = false;
      }
      const tokens = parseText(f.text || '');
      for (const t of tokens) {
        if (t.atEnd) continue; // кадр ещё на экране
        if (t.cmd === 'evidence' || t.cmd === 'evidence_icon') ev = { id: t.id, icon: t.cmd === 'evidence_icon', side: t.side };
        if (t.cmd === 'evidence_hide') ev = null;
      }
      if (ev) await this.showEvidence(ev.id, ev.icon, s, true, ev.side);
      if (label) await this.addPresetPopup(TESTIMONY_LABEL);
      if (s !== this.session) return;
      if (st.evidence) st.evidence.start = -1e6;
      const box = st.box;
      const chars = [];
      for (const t of tokens) if (t.type === 'text') for (const ch of t.text) chars.push({ ch, color: t.color, fmt: t.fmt });
      if (chars.length) {
        if (!(prev && prev.mergeWithNext)) box.chars = [];
        box.chars.push(...chars);
        box.name = this.nameFor(f); box.nameColor = this.nameColorFor(f);
        box.visible = true;
      } else if (act.hideBox === true) box.visible = false;
      else if (act.hideBox === false) box.visible = true;
      box.shown = box.chars.length;
      box.center = act.center;
      box.layout = null;
    }
  }

  // рамка «ridge» как в CSS: снаружи светлее, внутри темнее (рисуется по текущему пути)
  function ridge(g, bw, color) {
    g.lineWidth = bw;
    g.strokeStyle = color;
    g.stroke();
    g.lineWidth = Math.max(0.5, bw / 2);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.stroke();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  Player.instances = new Set();
  window.Player = Player;
  window.PlayerUtil = { BLENDS, effectsOf, aspectOf, computeBackgrounds, sceneCharacters, applyAlias, findPair, POPUPS, MAX_PAIR, ALL_CHARS, normTarget, pairLimit, guessDesign, DESIGN_ASPECTS };
})();
