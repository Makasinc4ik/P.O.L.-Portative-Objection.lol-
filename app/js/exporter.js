// Экспорт видео.
// Основной способ — быстрый: сцена рендерится кадр за кадром в «виртуальном» времени,
// видео кодируется в H.264 (по возможности видеокартой) и пишется в обычный MP4 с перемоткой.
// Запасной способ — запись в реальном времени через MediaRecorder.
'use strict';
(function () {
  const { Lib } = window.Assets;
  const SR = 48000;

  // ---------- общее ----------
  // Качество / размер файла: бит на пиксель кадра
  const KEY_SEC = 10; // опорный кадр раз в 10 с: реже — меньше файл (перемотка всё равно работает)
  // Бит на пиксель: на сценах objection.lol (статичный фон, мало движения) разницы на глаз почти нет уже с 0.04
  // 0.0.12: битрейты подняты — на мягких краях GIF (полупрозрачность, градиенты) при старых значениях вылезали «квадраты»
  const QUALITY = { high: { bpp: 0.11, audio: 192000, avc: 20 }, medium: { bpp: 0.065, audio: 160000, avc: 24 }, small: { bpp: 0.04, audio: 128000, avc: 28 }, tiny: { bpp: 0.025, audio: 96000, avc: 32 } };
  function bitrateFor(w, h, fps, quality) { const q = QUALITY[quality] || QUALITY.high; return Math.max(Math.round(150000 * q.bpp / 0.065), Math.round(w * h * fps * q.bpp)); }
  function abortError() { return new DOMException('abort', 'AbortError'); }
  function sizeFor(height, ar) {
    // для вертикального видео «720p» — это ширина 720 (как у TikTok/Shorts: 1080×1920)
    if (ar < 1) { const w = Math.max(16, Math.round(height / 8) * 8); return { w, h: Math.round(height / ar / 2) * 2 }; }
    let w = Math.round((height * ar) / 8) * 8; // кратно 8 — так любят аппаратные кодеки
    let h = Math.round(height / 2) * 2;
    if (w < 16) w = 16;
    return { w, h };
  }

  const macroChannel = new MessageChannel();
  const macroQueue = [];
  macroChannel.port1.onmessage = () => { const r = macroQueue.shift(); if (r) r(); };
  function macrotask() { return new Promise((r) => { macroQueue.push(r); macroChannel.port2.postMessage(0); }); }

  // Дождаться, пока проигрыватель закончит все «настоящие» асинхронные дела (загрузка картинок и т. п.)
  async function settle(p) {
    for (;;) {
      await macrotask();
      if (p.pending.size) { await Promise.race([...p.pending]); continue; }
      await macrotask();
      if (!p.pending.size) return;
    }
  }

  function nextTimer(p) {
    const ts = p.virtual.timers;
    let best = -1;
    for (let i = 0; i < ts.length; i++) {
      if (best < 0 || ts[i].at < ts[best].at || (ts[i].at === ts[best].at && ts[i].seq < ts[best].seq)) best = i;
    }
    return best;
  }

  async function advanceTo(p, T) {
    for (;;) {
      await settle(p);
      const i = nextTimer(p);
      if (i < 0 || p.virtual.timers[i].at > T) break;
      const tm = p.virtual.timers.splice(i, 1)[0];
      p.virtual.t = Math.max(p.virtual.t, tm.at);
      if (tm.s === p.session) tm.resolve(); else tm.reject && tm.reject();
    }
    p.virtual.t = Math.max(p.virtual.t, T);
  }

  // Прогоняет сцену в виртуальном времени. onFrame(t, n) — рисование очередного кадра видео.
  async function runVirtual(player, { from, to, fps, onFrame, signal, onDryProgress, resumeMusic }) {
    let ended = false;
    let error = null;
    const onEnd = () => { ended = true; };
    const onErr = (e) => { error = e; ended = true; };
    player.on('end', onEnd);
    player.on('error', onErr);
    try {
      player.playFrom(from, { manual: false, end: to, tail: 700, resumeMusic: !!resumeMusic });
      if (!onFrame) {
        // «сухой» прогон: прыгаем от таймера к таймеру
        let steps = 0;
        for (;;) {
          await settle(player);
          if (ended) break;
          if (signal && signal.aborted) throw new DOMException('abort', 'AbortError');
          const i = nextTimer(player);
          if (i < 0) throw new Error(tx('Сцена зависла при подготовке (нет таймеров)'));
          const tm = player.virtual.timers.splice(i, 1)[0];
          player.virtual.t = Math.max(player.virtual.t, tm.at);
          player.tick(player.virtual.t);
          if (tm.s === player.session) tm.resolve();
          if (++steps % 400 === 0 && onDryProgress) onDryProgress(player.current);
        }
        if (error) throw error;
        return player.virtual.t;
      }
      let n = 0;
      let t = 0;
      for (;;) {
        if (signal && signal.aborted) throw new DOMException('abort', 'AbortError');
        t = (n * 1000) / fps;
        await advanceTo(player, t);
        if (error) throw error;
        await onFrame(t, n);
        n++;
        if (ended) break;
      }
      return t;
    } finally {
      player.listeners.end = (player.listeners.end || []).filter((f) => f !== onEnd);
      player.listeners.error = (player.listeners.error || []).filter((f) => f !== onErr);
    }
  }

  // ---------- звук: запись событий и офлайн-сведение ----------
  class RecordingAudio {
    constructor(real, player) { this.real = real; this.player = player; this.events = []; this.musicId = null; this.fading = false; }
    t() { return this.player.now() / 1000; }
    resume() { return Promise.resolve(); }
    buffer(url) { return this.real.buffer(url); }
    playBuffer(buf, volume = 1) { if (buf) this.events.push({ t: this.t(), type: 'sfx', buf, vol: volume }); return null; }
    playSound(url, volume = 100, fades = {}) { if (url) this.events.push({ t: this.t(), type: 'sfx', url, vol: volume / 100, fadeInMs: fades.fadeInMs || 0, fadeOutMs: fades.fadeOutMs || 0 }); return Promise.resolve(); }
    stopSounds() { this.events.push({ t: this.t(), type: 'sfx_stop' }); }
    fadeOutSounds(ms = 1500) { this.events.push({ t: this.t(), type: 'sfx_fadeout', ms }); }
    playMusic(asset) {
      if (!asset) return Promise.resolve();
      if (this.musicId === asset.id && !this.fading) return Promise.resolve();
      this.musicId = asset.id; this.fading = false;
      this.events.push({ t: this.t(), type: 'music', asset });
      return Promise.resolve();
    }
    stopMusic() { this.musicId = null; this.fading = false; this.events.push({ t: this.t(), type: 'music_stop' }); }
    fadeOutMusic(ms = 1000) { if (this.musicId == null) return; this.fading = true; this.events.push({ t: this.t(), type: 'music_fadeout', ms }); }
    fadeInMusic(ms = 1000) { this.events.push({ t: this.t(), type: 'music_fadein', ms }); }
    stopAll() { /* в записи не нужно */ }
  }

  // Сведение звука. Раньше это делал OfflineAudioContext, но на длинных сценах с тысячами «бипов»
  // он работал очень долго (каждый узел обрабатывается всё время) и его нельзя было остановить.
  // Теперь звук складывается вручную: быстро, по частям и с возможностью отмены.
  async function renderAudio(events, seconds, real, signal) {
    const N = Math.max(SR, Math.ceil(seconds * SR));
    const L = new Float32Array(N);
    const R = new Float32Array(N);
    for (const e of events) {
      if (signal && signal.aborted) throw abortError();
      if (e.type === 'sfx' && !e.buf) e.buf = await real.buffer(e.url);
      if (e.type === 'music') e.buf = await real.buffer(e.asset.url);
    }
    const sfxVol = real.sfxVolume ?? 1;
    const musVol = real.musicVolume ?? 1;
    // 1) раскладываем события по «дорожкам»
    const sfx = []; // {buf, t, end, vol}
    const music = []; // {buf, t, end, vol, loop, env:[[t,g]]}
    let cur = null;
    const endMusic = (t) => { if (cur) { cur.end = Math.min(cur.end, t); cur = null; } };
    for (const e of events) {
      const t = Math.max(0, e.t);
      if (e.type === 'sfx') {
        if (e.buf) {
          const env = window.Assets.soundEnvelope(e.buf.duration, e.fadeInMs, e.fadeOutMs);
          sfx.push({ buf: e.buf, t, end: t + e.buf.duration, vol: e.vol * sfxVol, fi: env.fi, fo: env.fo, cut: null });
        }
      } else if (e.type === 'sfx_stop' || e.type === 'sfx_fadeout') {
        // остановка: звук с угасанием гаснет плавно (как и при [#bgsfo]), остальные обрываются
        for (const x of sfx) {
          if (!(x.t <= t && x.end > t)) continue;
          const d = x.fo > 0 ? x.fo : e.type === 'sfx_fadeout' ? e.ms / 1000 : 0;
          if (d > 0) { if (!x.cut || t < x.cut.t) x.cut = { t, d }; x.end = Math.min(x.end, t + d); } else x.end = t;
        }
      } else if (e.type === 'music') {
        endMusic(t);
        if (!e.buf) continue;
        const lp = Lib.musicLoop(e.asset);
        const loop = lp && lp.end > lp.start && lp.end <= e.buf.duration ? lp : { start: 0, end: e.buf.duration };
        const vol = ((e.asset.volume ?? 100) / 100) * musVol;
        cur = { buf: e.buf, t, end: Infinity, vol, loop, env: [] };
        music.push(cur);
      } else if (e.type === 'music_stop') {
        endMusic(t);
      } else if (e.type === 'music_fadeout') {
        if (!cur) continue;
        const d = e.ms / 1000;
        cur.env.push([t, null, 'set'], [t + d, 0, 'ramp']);
        endMusic(t + d);
      } else if (e.type === 'music_fadein') {
        if (!cur) continue;
        const d = e.ms / 1000;
        cur.env.push([t, 0, 'set'], [t + d, cur.vol, 'ramp']);
      }
    }
    // громкость дорожки музыки в момент t (как setValueAtTime + linearRampToValueAtTime)
    const gainAt = (m, t) => {
      let pt = m.t; let pg = m.vol;
      for (const [et, ev, kind] of m.env) {
        const v = ev == null ? pg : ev;
        if (t < et) return kind === 'ramp' ? pg + (v - pg) * ((t - pt) / Math.max(1e-6, et - pt)) : pg;
        pt = et; pg = v;
      }
      return pg;
    };
    let work = 0;
    const tick = async () => { if (++work % 40 === 0) { await macrotask(); if (signal && signal.aborted) throw abortError(); } };
    // 2) звуки
    for (const x of sfx) {
      const b = x.buf;
      const k = b.sampleRate / SR;
      const c0 = b.getChannelData(0);
      const c1 = b.numberOfChannels > 1 ? b.getChannelData(1) : c0;
      const i0 = Math.floor(x.t * SR);
      const i1 = Math.min(N, Math.ceil(x.end * SR));
      const len = b.length;
      const dur = b.duration;
      const shaped = x.fi > 0 || x.fo > 0 || x.cut;
      // громкость звука в момент (секунды от начала звука)
      const gAt = (rel) => {
        let g = x.vol;
        if (x.fi > 0 && rel < x.fi) g *= rel / x.fi;
        if (x.fo > 0 && rel > dur - x.fo) g *= Math.max(0, (dur - rel) / x.fo);
        if (x.cut) { const a = x.t + rel - x.cut.t; if (a > 0) g *= Math.max(0, 1 - a / x.cut.d); }
        return g;
      };
      for (let i = i0; i < i1; i++) {
        const p = (i - i0) * k;
        const j = p | 0;
        const vol = shaped ? gAt((i - i0) / SR) : x.vol;
        if (j >= len - 1) { if (j < len) { L[i] += c0[j] * vol; R[i] += c1[j] * vol; } break; }
        const f = p - j;
        L[i] += (c0[j] + (c0[j + 1] - c0[j]) * f) * vol;
        R[i] += (c1[j] + (c1[j + 1] - c1[j]) * f) * vol;
      }
      await tick();
    }
    // 3) музыка (с зацикливанием)
    for (const m of music) {
      const b = m.buf;
      const k = b.sampleRate / SR;
      const c0 = b.getChannelData(0);
      const c1 = b.numberOfChannels > 1 ? b.getChannelData(1) : c0;
      const ls = m.loop.start * b.sampleRate;
      const le = Math.min(b.length - 1, m.loop.end * b.sampleRate);
      const span = Math.max(1, le - ls);
      const i0 = Math.floor(m.t * SR);
      const i1 = Math.min(N, m.end === Infinity ? N : Math.ceil(m.end * SR));
      const step = 1024;
      for (let a = i0; a < i1; a += step) {
        const bEnd = Math.min(i1, a + step);
        const g0 = gainAt(m, a / SR); const g1 = gainAt(m, bEnd / SR);
        for (let i = a; i < bEnd; i++) {
          let p = (i - i0) * k;
          if (p >= le) p = ls + ((p - ls) % span);
          const j = p | 0;
          const f = p - j;
          const g = g0 + (g1 - g0) * ((i - a) / step);
          L[i] += (c0[j] + ((c0[j + 1] ?? c0[j]) - c0[j]) * f) * g;
          R[i] += (c1[j] + ((c1[j + 1] ?? c1[j]) - c1[j]) * f) * g;
        }
        if ((a - i0) % (SR * 20) < step) { await macrotask(); if (signal && signal.aborted) throw abortError(); }
      }
    }
    const out = new AudioBuffer({ length: N, sampleRate: SR, numberOfChannels: 2 });
    out.copyToChannel(L, 0);
    out.copyToChannel(R, 1);
    return out;
  }

  async function pickAudioCodec(bitrate = 192000) {
    if (!window.AudioEncoder) return null;
    for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
      try {
        const r = await AudioEncoder.isConfigSupported({ codec, sampleRate: SR, numberOfChannels: 2, bitrate });
        if (r.supported) return { codec, mux, bitrate };
      } catch (e) { /* дальше */ }
    }
    return null;
  }

  async function encodeAudio(abuf, ac, signal) {
    const chunks = [];
    let err = null;
    const enc = new AudioEncoder({ output: (chunk, meta) => chunks.push({ chunk, meta }), error: (e) => { err = e; } });
    enc.configure({ codec: ac.codec, sampleRate: SR, numberOfChannels: 2, bitrate: ac.bitrate || 192000 });
    const L = abuf.getChannelData(0);
    const R = abuf.numberOfChannels > 1 ? abuf.getChannelData(1) : L;
    const N = abuf.length;
    const FR = 4800;
    for (let off = 0; off < N; off += FR) {
      const n = Math.min(FR, N - off);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(off, off + n), 0);
      data.set(R.subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off / SR) * 1e6), data });
      enc.encode(ad);
      ad.close();
      if (enc.encodeQueueSize > 40) await macrotask();
      if (err) throw err;
      if (signal && signal.aborted) { try { enc.close(); } catch (e) { /* */ } throw abortError(); }
    }
    await enc.flush();
    enc.close();
    if (err) throw err;
    return chunks;
  }

  // Кодеки на выбор (как в монтажных программах). Все — в MP4. «Эффективность» — во сколько раз
  // меньше битрейта нужно для того же качества, чем H.264.
  const CODECS = {
    avc: { name: 'H.264 (AVC)', eff: 1 },
    hevc: { name: 'H.265 (HEVC)', eff: 0.7 },
    vp9: { name: 'VP9', eff: 0.75 },
    av1: { name: 'AV1', eff: 0.6 },
  };
  function codecStrings(family, w, h) {
    const px = w * h;
    const big = px > 4096 * 2304;
    const mid = px > 1920 * 1088;
    switch (family) {
      case 'hevc': return big ? ['hvc1.1.6.L180.B0', 'hvc1.1.6.L183.B0', 'hev1.1.6.L180.B0'] : mid ? ['hvc1.1.6.L153.B0', 'hvc1.1.6.L150.B0', 'hev1.1.6.L153.B0'] : ['hvc1.1.6.L123.B0', 'hvc1.1.6.L120.B0', 'hvc1.1.6.L150.B0', 'hev1.1.6.L123.B0'];
      case 'vp9': return big ? ['vp09.00.61.08', 'vp09.00.60.08', 'vp09.00.51.08'] : ['vp09.00.41.08', 'vp09.00.40.08', 'vp09.00.51.08', 'vp09.00.31.08', 'vp09.00.21.08'];
      case 'av1': return big ? ['av01.0.16M.08', 'av01.0.17M.08', 'av01.0.13M.08'] : mid ? ['av01.0.12M.08', 'av01.0.13M.08'] : ['av01.0.08M.08', 'av01.0.09M.08', 'av01.0.12M.08', 'av01.0.05M.08', 'av01.0.04M.08'];
      default: return big
        ? ['avc1.64003C', 'avc1.64003D', 'avc1.64003E', 'avc1.4d003C', 'avc1.42e03C']
        : ['avc1.640033', 'avc1.640034', 'avc1.640032', 'avc1.640028', 'avc1.4d0033', 'avc1.4d0028', 'avc1.42e033', 'avc1.42e028', 'avc1.42e01f', 'avc1.42e01e'];
    }
  }
  // Выбранный кодек; если система его не умеет — по порядку H.264 → VP9 (поле fallback скажет об этом)
  async function pickCodec(family, w, h, fps, bitrate, software, qp) {
    const order = family && family !== 'auto' ? [family, ...['avc', 'vp9'].filter((x) => x !== family)] : ['avc', 'vp9'];
    for (const fam of order) {
      const br = Math.round(bitrate * (CODECS[fam].eff || 1));
      const r = fam === 'avc' ? await pickVideoConfig(w, h, fps, br, software, qp, true) : await pickFamily(fam, w, h, fps, br, software);
      if (r) return { ...r, family: fam, fallback: family && family !== 'auto' && fam !== family };
    }
    return null;
  }
  async function pickFamily(fam, w, h, fps, bitrate, software) {
    const extra = fam === 'hevc' ? { hevc: { format: 'hevc' } } : {};
    for (const hw of software ? ['prefer-software', 'no-preference'] : ['prefer-hardware', 'no-preference']) {
      for (const codec of codecStrings(fam, w, h)) {
        const cfg = { codec, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration: hw, latencyMode: 'quality', ...extra };
        try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, mux: fam, hw }; } catch (e) { /* дальше */ }
      }
    }
    return null;
  }
  // какие кодеки есть на этом компьютере (для окна экспорта)
  async function availableCodecs(w = 1280, h = 720, fps = 30) {
    const out = {};
    for (const fam of Object.keys(CODECS)) out[fam] = !!(fam === 'avc' ? await pickVideoConfig(w, h, fps, 4e6, false, null, true) : await pickFamily(fam, w, h, fps, 4e6, false));
    return out;
  }

  async function pickVideoConfig(w, h, fps, bitrate, software, qp, avcOnly) {
    if (!window.VideoEncoder) return null;
    // для 4K/8K нужен уровень H.264 5.2–6.2 (больше макроблоков в кадре), для мелких хватает 3.x
    const big = w * h > 4096 * 2304;
    const avc = big
      ? ['avc1.64003C', 'avc1.64003D', 'avc1.64003E', 'avc1.4d003C', 'avc1.42e03C']
      : ['avc1.640033', 'avc1.640034', 'avc1.640032', 'avc1.640028', 'avc1.4d0033', 'avc1.4d0028', 'avc1.42e033', 'avc1.42e028', 'avc1.42e01f', 'avc1.42e01e'];
    // 0.0.12: сначала пробуем режим «постоянного качества» (quantizer): тряска и мягкие края GIF
    // не превращаются в «квадраты», а статичные сцены остаются маленькими
    if (qp) {
      for (const hw of software ? ['prefer-software', 'no-preference'] : ['prefer-hardware', 'no-preference']) {
        for (const codec of avc) {
          const cfg = { codec, width: w, height: h, framerate: fps, hardwareAcceleration: hw, avc: { format: 'avc' }, bitrateMode: 'quantizer' };
          try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, mux: 'avc', hw, qp: { avc: { quantizer: qp.avc } } }; } catch (e) { /* дальше */ }
        }
      }
    }
    for (const hw of software ? ['prefer-software', 'no-preference'] : ['prefer-hardware', 'no-preference']) {
      for (const codec of avc) {
        const cfg = { codec, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration: hw, avc: { format: 'avc' }, latencyMode: 'quality' };
        try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, mux: 'avc', hw }; } catch (e) { /* дальше */ }
      }
    }
    if (avcOnly) return null;
    for (const codec of big ? ['vp09.00.61.08', 'vp09.00.60.08', 'vp09.00.51.08'] : ['vp09.00.41.08', 'vp09.00.40.08', 'vp09.00.31.08', 'vp09.00.21.08']) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality' };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, mux: 'vp9', hw: 'no-preference' }; } catch (e) { /* дальше */ }
    }
    return null;
  }

  function fastSupported() {
    return !!(window.VideoEncoder && window.AudioEncoder && window.OfflineAudioContext && window.Mp4Muxer);
  }

  // ---------- быстрый экспорт ----------
  async function exportFast(player, realAudio, opts, file) {
    const { from = 0, to = player.frames.length, height = 720, fps = 30, aspect, onProgress, signal, resumeMusic, software, onPreview, watch } = opts;
    const ar = aspect || window.PlayerUtil.aspectOf(player.project.options);
    const { w, h } = sizeFor(height, ar);
    const bitrate = opts.bitrate || bitrateFor(w, h, fps, opts.quality);
    const vcfg = await pickCodec(opts.codec || 'auto', w, h, fps, bitrate, software, opts.bitrate || !opts.constQuality ? null : (QUALITY[opts.quality] || QUALITY.high));
    const ac = await pickAudioCodec((QUALITY[opts.quality] || QUALITY.high).audio);
    if (!vcfg || !ac) return { unsupported: true };
    await window.api.video.reset(file.id);

    const saved = { W: player.W, H: player.H, audio: player.audio };
    const t0 = performance.now();
    let writes = Promise.resolve();
    let ok = false;
    let encoder = null;
    let prevVF = null;
    let live = null; // проигрывание звука при просмотре во время экспорта
    const stopLive = () => { if (live && live.src) { try { live.src.stop(); } catch (e) { /* */ } live.src = null; } };
    try {
      player.stop();
      // 1) сухой прогон — узнаём длительность и все звуки
      onProgress && onProgress({ phase: 'prepare', text: tx('Подготовка звука…'), frac: 0 });
      const rec = new RecordingAudio(realAudio, player);
      player.audio = rec;
      player.setVirtual(true);
      player.noImages = true;
      const total = from < to ? to - from : 1;
      const endMs = await runVirtual(player, { from, to, fps, signal, resumeMusic, onDryProgress: (i) => onProgress && onProgress({ phase: 'prepare', text: tx`Подготовка звука… кадр ${i + 1}`, frac: ((i - from) / total) * 0.1 }) });
      player.stop();
      const seconds = endMs / 1000 + 0.2;
      if (signal && signal.aborted) throw abortError();
      onProgress && onProgress({ phase: 'prepare', text: tx('Сведение звука…'), frac: 0.08 });
      const abuf = await renderAudio(rec.events, seconds, realAudio, signal);
      if (signal && signal.aborted) throw abortError();
      const audioChunks = await encodeAudio(abuf, ac, signal);

      // 2) рендер видео
      player.audio = new RecordingAudio(realAudio, player);
      player.noImages = false;
      player.setSize(w, h);
      player.setVirtual(true);
      const muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.StreamTarget({
          onData: (data, position) => {
            const copy = data.slice();
            writes = writes.then(() => window.api.video.write(file.id, copy.buffer, position));
          },
          chunked: true,
          chunkSize: 8 * 1024 * 1024,
        }),
        video: { codec: vcfg.mux, width: w, height: h, frameRate: fps },
        audio: { codec: ac.mux, numberOfChannels: 2, sampleRate: SR },
        fastStart: false,
        firstTimestampBehavior: 'offset',
      });
      let encErr = null;
      encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
      try { encoder.configure(vcfg.cfg); } catch (e) { throw Object.assign(new Error('encoder: ' + e.message), { hw: vcfg.hw }); }
      let reused = 0;
      let lastPreview = 0;
      if (watch) {
        // смотрим во время экспорта: видео не обгоняет реальное время, звук играет из уже сведённой дорожки
        await realAudio.resume();
        live = { t0: performance.now(), src: null, ctxT0: 0, offset: 0 };
        const startAudio = (offsetSec) => {
          stopLive();
          const src = realAudio.ctx.createBufferSource();
          src.buffer = abuf;
          src.connect(realAudio.master);
          src.start(0, Math.max(0, offsetSec));
          live.src = src; live.ctxT0 = realAudio.ctx.currentTime; live.offset = offsetSec;
        };
        live.start = startAudio;
        startAudio(0);
      }
      player.sigSkip = true;
      player.lastSig = null;
      let ai = 0;
      const feedAudio = (uptoUs) => {
        while (ai < audioChunks.length && audioChunks[ai].chunk.timestamp <= uptoUs) {
          muxer.addAudioChunk(audioChunks[ai].chunk, audioChunks[ai].meta);
          ai++;
        }
      };
      const totalFrames = Math.max(1, Math.ceil((endMs / 1000) * fps));
      const stats = { wait: 0, draw: 0, frame: 0, enc: 0, prep: performance.now() - t0 };
      let lastT = performance.now();
      const frameUs = 1e6 / fps;
      await runVirtual(player, {
        from, to, fps, signal, resumeMusic,
        onFrame: async (t, n) => {
          if (encErr) throw Object.assign(new Error('encoder: ' + (encErr.message || encErr)), { hw: vcfg.hw });
          let q = performance.now();
          stats.wait += q - lastT;
          player.tick(t);
          const q2 = performance.now(); stats.draw += q2 - q;
          const ts = { timestamp: Math.round(n * frameUs), duration: Math.round(frameUs) };
          const key = { keyFrame: n % (fps * KEY_SEC) === 0, ...(vcfg.qp || {}) };
          if (prevVF && !player.lastDrawChanged) {
            // на экране ничего не изменилось — берём прошлый кадр без чтения с холста
            const vf = new VideoFrame(prevVF, ts);
            encoder.encode(vf, key);
            vf.close();
            reused++;
          } else {
            if (prevVF) prevVF.close();
            prevVF = new VideoFrame(player.canvas, ts);
            encoder.encode(prevVF, key);
          }
          feedAudio(n * frameUs);
          q = performance.now(); stats.frame += q - q2;
          while (encoder.encodeQueueSize > 6) {
            await new Promise((r) => { encoder.addEventListener('dequeue', r, { once: true }); setTimeout(r, 1000); });
            if (encErr) throw Object.assign(new Error('encoder: ' + (encErr.message || encErr)), { hw: vcfg.hw });
            if (signal && signal.aborted) throw abortError();
          }
          lastT = performance.now(); stats.enc += lastT - q;
          if (watch && live) {
            // ждём реального времени; если компьютер не успевает — подтягиваем звук к картинке
            const wall = performance.now() - live.t0;
            if (t > wall) await new Promise((r) => setTimeout(r, t - wall));
            const audioPos = live.offset + (realAudio.ctx.currentTime - live.ctxT0);
            if (audioPos * 1000 - t > 300) { live.start(t / 1000); live.t0 = performance.now() - t; }
            if (onPreview) onPreview(player.canvas);
          } else if (onPreview && performance.now() - lastPreview > 150) {
            lastPreview = performance.now();
            onPreview(player.canvas);
          }
          if (n % 10 === 0 && onProgress) {
            const el = (performance.now() - t0) / 1000;
            onProgress({ phase: 'video', frame: player.current, frac: 0.1 + 0.9 * Math.min(1, n / totalFrames), text: tx`Кадр сцены ${player.current + 1} · видео ${Math.floor(t / 60000)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')} из ${Math.floor(endMs / 60000)}:${String(Math.floor(endMs / 1000) % 60).padStart(2, '0')} · прошло ${Math.round(el)} с` });
          }
        },
      });
      stopLive();
      await encoder.flush();
      if (encErr) throw Object.assign(new Error('encoder: ' + (encErr.message || encErr)), { hw: vcfg.hw });
      encoder.close();
      encoder = null;
      if (prevVF) prevVF.close();
      prevVF = null;
      stats.reused = reused;
      stats.frames = totalFrames;
      feedAudio(Infinity);
      muxer.finalize();
      await writes;
      ok = true;
      console.log('export stats', JSON.stringify(Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, Math.round(v)]))));
      return { path: file.path, ext: 'mp4', reused, frames: totalFrames, seconds: endMs / 1000, took: (performance.now() - t0) / 1000, hw: vcfg.hw, codec: vcfg.cfg.codec, family: vcfg.family, codecFallback: !!vcfg.fallback, mode: vcfg.qp ? "qp" : "bitrate", audio: ac.codec };
    } catch (e) {
      // остановка: сразу освобождаем кодировщик и кадры, не дожидаясь очереди
      if (encoder) { try { encoder.close(); } catch (err) { /* */ } encoder = null; }
      if (prevVF) { try { prevVF.close(); } catch (err) { /* */ } prevVF = null; }
      await writes.catch(() => {});
      if (e && e.name === 'AbortError') return null;
      throw e;
    } finally {
      stopLive();
      player.stop();
      player.sigSkip = false;
      player.setVirtual(false);
      player.noImages = false;
      player.audio = saved.audio;
      player.setSize(saved.W, saved.H);
      void ok;
    }
  }

  // ---------- запасной: запись в реальном времени ----------
  const MIME_CANDIDATES = [
    { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1,opus', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  function realtimeFormat() {
    return MIME_CANDIDATES.find((c) => window.MediaRecorder && MediaRecorder.isTypeSupported(c.mime)) || null;
  }

  async function exportRealtime(player, audio, opts) {
    const { from = 0, to = player.frames.length, height = 720, fps = 30, aspect, suggestedName, onProgress, signal } = opts;
    const fmt = realtimeFormat();
    if (!fmt) throw new Error(tx('Запись видео не поддерживается'));
    const file = await window.api.video.begin({ ext: fmt.ext, suggestedName });
    if (!file) return null;
    const ar = aspect || window.PlayerUtil.aspectOf(player.project.options);
    const { w, h } = sizeFor(height, ar);
    const oldW = player.W; const oldH = player.H;
    player.setSize(w, h);
    const vStream = player.canvas.captureStream(fps);
    const aStream = audio.recordStream();
    const stream = new MediaStream([...vStream.getVideoTracks(), ...aStream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: bitrateFor(w, h, fps, opts.quality), audioBitsPerSecond: (QUALITY[opts.quality] || QUALITY.high).audio });
    let writing = Promise.resolve();
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      writing = writing.then(async () => window.api.video.chunk(file.id, await e.data.arrayBuffer()));
    };
    const stopped = new Promise((r) => { rec.onstop = r; });
    let aborted = false;
    let onEnd; let onErr;
    const onFrame = (i) => onProgress && onProgress({ phase: 'video', frame: i, frac: (i - from) / Math.max(1, to - from), text: tx`Кадр ${i + 1} из ${to} (запись в реальном времени)` });
    player.on('frame', onFrame);
    const done = new Promise((resolve, reject) => {
      onEnd = () => resolve();
      onErr = (e) => reject(e);
      player.on('end', onEnd);
      player.on('error', onErr);
      if (signal) signal.addEventListener('abort', () => { aborted = true; player.stop(); resolve(); });
    });
    try {
      await player.preload(from, 8);
      rec.start(1000);
      player.playFrom(from, { manual: false, end: to, tail: 900 });
      await done;
      rec.stop();
      await stopped;
      await writing;
      if (aborted) { await window.api.video.abort(file.id); return null; }
      const path = await window.api.video.end(file.id, true);
      return { path, ext: fmt.ext, realtime: true };
    } catch (e) {
      try { rec.stop(); } catch (err) { /* */ }
      await window.api.video.abort(file.id);
      throw e;
    } finally {
      player.listeners.frame = (player.listeners.frame || []).filter((f) => f !== onFrame);
      player.listeners.end = (player.listeners.end || []).filter((f) => f !== onEnd);
      player.listeners.error = (player.listeners.error || []).filter((f) => f !== onErr);
      for (const t of vStream.getTracks()) t.stop();
      player.setSize(oldW, oldH);
    }
  }

  async function exportVideo(player, audio, opts) {
    // на время экспорта держим больше картинок и звуков (меньше повторных загрузок), после — освобождаем
    const IC = window.Assets.ImageCache;
    const ia32 = window.api && window.api.arch === 'ia32';
    IC.limit = Math.max(IC.baseLimit, (ia32 ? 350 : 1000) * 1024 * 1024);
    const abl = audio.bufLimit;
    audio.bufLimit = Math.max(abl || 0, (ia32 ? 200 : 600) * 1024 * 1024);
    try { return await exportVideoInner(player, audio, opts); } finally {
      IC.limit = IC.baseLimit;
      audio.bufLimit = abl;
      IC.evict();
      audio.evictAudio && audio.evictAudio();
    }
  }
  async function exportVideoInner(player, audio, opts) {
    if (!fastSupported()) return exportRealtime(player, audio, opts);
    const file = await window.api.video.begin({ ext: 'mp4', suggestedName: opts.suggestedName });
    if (!file) return null;
    try {
      let r;
      try {
        r = await exportFast(player, audio, opts, file);
      } catch (e) {
        if (e && e.hw === 'prefer-hardware') {
          // видеокарта не справилась — кодируем процессором
          console.warn(tx('Аппаратное кодирование не удалось, используется программное'), e);
          opts.onProgress && opts.onProgress({ text: tx('Видеокарта не справилась, кодирование идёт процессором…'), frac: 0 });
          r = await exportFast(player, audio, { ...opts, software: true }, file);
          if (r) r.fallback = true;
        } else throw e;
      }
      if (r && r.unsupported) { await window.api.video.abort(file.id); return exportRealtime(player, audio, opts); }
      if (!r) { await window.api.video.abort(file.id); return null; }
      await window.api.video.end(file.id, true);
      return r;
    } catch (e) {
      await window.api.video.abort(file.id).catch(() => {});
      throw e;
    }
  }

  window.Exporter = { exportVideo, exportFast, exportRealtime, fastSupported, sizeFor, bitrateFor, QUALITY, CODECS, availableCodecs, _renderAudio: renderAudio };
})();
