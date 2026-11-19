// Редактор сцен: список кадров, настройки кадра, файлы проекта
'use strict';
(function () {
  const { h, toast, modal, confirmDialog, pickerDialog, progressDialog, fmtBytes } = window.UI;
  const { Lib, ImageCache, AudioEngine, SYSTEM } = window.Assets;
  const { parseText, plainText, previewText } = window.Tags;
  const { openLibrary, runDownload, showReport, sourceLabel } = window.LibraryUI;
  const { aspectOf, applyAlias, findPair } = window.PlayerUtil;

  // сколько кадров на странице (0 — все сразу)
  let PER_PAGE = Number(localStorage.getItem('oo.framesPerPage') ?? 20);
  if (!Number.isFinite(PER_PAGE) || PER_PAGE < 0) PER_PAGE = 20;
  const perPage = () => PER_PAGE || 1e9;
  const $ = (id) => document.getElementById(id);

  const App = {
    project: null,
    filePath: null,
    fileName: null,
    dirty: false,
    sel: 0,
    page: 0,
    search: '',
    undo: [],
    redo: [],
    multi: new Set(), // выделенные кадры (Ctrl/Shift + клик)
    clip: null, // скопированные кадры
  };
  window.App = App;
  const EASE_LIST = [['', tx('Линейно')], ['ease', 'Ease'], ['easeIn', 'Ease in'], ['easeOut', 'Ease out'], ['easeInOut', 'Ease in out'],
    ['easeInSine', 'Sine in'], ['easeOutSine', 'Sine out'], ['easeInOutSine', 'Sine in out'], ['easeInQuad', 'Quad in'], ['easeOutQuad', 'Quad out'], ['easeInOutQuad', 'Quad in out'],
    ['easeInCubic', 'Cubic in'], ['easeOutCubic', 'Cubic out'], ['easeInOutCubic', 'Cubic in out'], ['easeInQuart', 'Quart in'], ['easeOutQuart', 'Quart out'], ['easeInOutQuart', 'Quart in out'],
    ['easeInQuint', 'Quint in'], ['easeOutQuint', 'Quint out'], ['easeInOutQuint', 'Quint in out'], ['easeInExpo', 'Expo in'], ['easeOutExpo', 'Expo out'], ['easeInOutExpo', 'Expo in out'],
    ['easeInCirc', 'Circ in'], ['easeOutCirc', 'Circ out'], ['easeInOutCirc', 'Circ in out'], ['spring', tx('Пружина')]];
  App._t = { wrapColor, copyFrames, pasteFrames, moveFramesTo, liteFrame }; // для автотестов

  // ---------- Формат проекта ----------
  function uuid() { return crypto.randomUUID(); }
  function newProject() {
    return {
      id: uuid(), type: 'scene', aliases: [],
      groups: [{ id: uuid(), comments: {}, name: 'Main', type: 'normal', frames: [{ id: 1, text: '', actions: [] }] }],
      pairs: [],
      options: { autoplaySpeed: 500, chatbox: '0', continueSoundUrl: '', textBlipFrequency: 64, textSpeed: 35, aspectRatio: '16:9', ...defaultOptions() },
      nextFrameId: 2, version: 5, freeFrameIds: [],
    };
  }
  // Настройки, которые можно сохранить в пресет и сделать «по умолчанию» для новых проектов
  const OPTION_KEYS = ['textSpeed', 'textBlipFrequency', 'autoplaySpeed', 'chatbox', 'textStartDelay', 'aspectRatio', 'useCharacterTextboxes', 'textboxLift', 'strictCharacterFades', 'flashColor', 'siteCompat', 'evidenceAnim', 'evidenceSide'];
  function pickOptions(o) { const r = {}; for (const k of OPTION_KEYS) if (o[k] !== undefined) r[k] = o[k]; return r; }
  function defaultOptions() {
    const d = Lib.data && Lib.data.presets && (Lib.data.presets.optionsDefault || [])[0];
    return d && d.options ? JSON.parse(JSON.stringify(d.options)) : {};
  }
  function encodeProject(p) {
    const bytes = new TextEncoder().encode(JSON.stringify(p));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function decodeProject(text) {
    const t = text.trim();
    if (t.startsWith('{')) return JSON.parse(t);
    const bin = atob(t.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function normalizeProject(p) {
    if (!p.groups || !p.groups.length) p.groups = [{ id: uuid(), comments: {}, name: 'Main', type: 'normal', frames: [] }];
    p.aliases = p.aliases || [];
    p.pairs = p.pairs || [];
    p.options = { autoplaySpeed: 500, chatbox: '0', textBlipFrequency: 64, textSpeed: 35, aspectRatio: '3:2', ...(p.options || {}) };
    const fr = p.groups[0].frames;
    let max = 0;
    for (const f of fr) { f.actions = f.actions || []; if (f.text == null) f.text = ''; max = Math.max(max, f.id || 0); }
    for (const f of fr) if (!f.id) f.id = ++max;
    p.nextFrameId = Math.max(p.nextFrameId || 1, max + 1);
    if (!fr.length) fr.push({ id: p.nextFrameId++, text: '', actions: [] });
    return p;
  }
  const frames = () => App.project.groups[0].frames;

  // ---------- Undo ----------
  function snapshot() { return JSON.stringify({ g: App.project.groups, a: App.project.aliases, p: App.project.pairs, o: App.project.options, n: App.project.nextFrameId }); }
  function pushUndo() {
    App.undo.push(snapshot());
    if (App.undo.length > 80) App.undo.shift();
    App.redo = [];
  }
  function restore(snap) {
    const s = JSON.parse(snap);
    Object.assign(App.project, { groups: s.g, aliases: s.a, pairs: s.p, options: s.o, nextFrameId: s.n });
    App.sel = Math.min(App.sel, frames().length - 1);
    projectChanged();
  }
  function undo() { if (!App.undo.length) return; App.redo.push(snapshot()); restore(App.undo.pop()); toast(tx('Отменено')); }
  function redoFn() { if (!App.redo.length) return; App.undo.push(snapshot()); restore(App.redo.pop()); toast(tx('Повторено')); }

  function textboxOptions() {
    return [['0', tx('Классический (как на сайте)')], ...SYSTEM.textboxes.map((t) => [t.id, t.name + tx(' (сайт)')]), ...Lib.list('textboxes').map((t) => [String(t.id), t.name])];
  }

  // ---------- Состояние ----------
  function markDirty() {
    App.dirty = true;
    updateTitle();
    scheduleAutosave();
  }
  function sceneTitle() {
    return App.sceneName || (App.fileName || '').replace(/\.(objection|json|txt)$/i, '') || tx('Новая сцена');
  }
  function updateTitle() {
    const name = sceneTitle();
    $('projectTitle').textContent = (App.dirty ? '● ' : '') + name;
    document.title = name + ' — Objection Offline';
  }
  let autosaveTimer;
  let poseTab = null; // чья поза открыта в инспекторе кадра с парой (id персонажа); null — говорящий
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autosave, 1500);
    scheduleSceneSave();
  }
  function autosave() {
    try {
      localStorage.setItem('oo.autosave', JSON.stringify({ project: App.project, filePath: App.filePath, fileName: App.fileName, dirty: App.dirty, sel: App.sel, sceneId: App.sceneId, sceneName: App.sceneName }));
    } catch (e) { console.warn('autosave', e); }
  }

  // ---------- «Сцены»: каждый проект сам сохраняется в библиотеку ----------
  let sceneTimer = null;
  let sceneSaving = Promise.resolve();
  function scheduleSceneSave() {
    clearTimeout(sceneTimer);
    sceneTimer = setTimeout(() => { sceneTimer = null; saveSceneNow(); }, 2500);
  }
  // Миниатюра сцены: фон и персонаж первого кадра, где они есть
  let thumbCache = { key: null, url: null };
  async function sceneThumb() {
    try {
      const fr = frames();
      const bgs = App.player.bgIndex || [];
      const i = Math.max(0, fr.findIndex((f, k) => Lib.bg(f.backgroundId || bgs[k]) || Lib.char(f.characterId)));
      const f = fr[i];
      if (!f) return null;
      const bg = Lib.bg(f.backgroundId || bgs[i]);
      const c = Lib.char(f.characterId);
      const pose = c ? Lib.pose(c, f.poseId) : null;
      const key = [bg && bg.url, pose && pose.idleImageUrl, App.project.options.aspectRatio].join('|');
      if (thumbCache.key === key) return thumbCache.url;
      const ar = Math.max(0.5, aspectOf(App.project.options));
      const w = 192; const hh = Math.round(w / ar);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = hh;
      const g = cv.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, w, hh);
      const [bi, ci] = await Promise.all([bg ? ImageCache.get(bg.url, hh) : null, pose ? ImageCache.get(pose.idleImageUrl, hh) : null]);
      const sw = Math.max(w, (hh * 16) / 9); const sx = (w - sw) / 2;
      const b1 = bi && bi.frameAt(0, true); if (b1 && b1.width) g.drawImage(b1, sx, 0, sw, hh);
      const c1 = ci && ci.frameAt(0, true);
      if (c1 && c1.width) { const ch = (hh * (c.size || 100)) / 100; const cw = (c1.width * ch) / c1.height; g.drawImage(c1, sx + (sw - cw) / 2, (hh * (c.offsetY || 0)) / 100, cw, ch); }
      if (bg && bg.deskUrl) { const di = await ImageCache.get(bg.deskUrl, hh); const d1 = di && di.frameAt(0, true); if (d1 && d1.width) g.drawImage(d1, sx, 0, sw, hh); }
      thumbCache = { key, url: cv.toDataURL('image/jpeg', 0.7) };
      return thumbCache.url;
    } catch (e) { return null; }
  }
  function saveSceneNow() {
    if (!App.project) return sceneSaving;
    if (!App.sceneId) App.sceneId = uuid();
    const meta = { id: App.sceneId, name: sceneTitle(), frames: frames().length, filePath: App.filePath || null, fileName: App.fileName || null, aspect: App.project.options.aspectRatio || '3:2' };
    const text = JSON.stringify(App.project);
    sceneSaving = sceneSaving.then(async () => { const t = await sceneThumb(); if (t) meta.thumb = t; return window.api.scenes.save(meta, text); }).catch((e) => console.warn('scene save', e));
    return sceneSaving;
  }
  // сохранить незаписанные изменения перед переключением на другую сцену
  async function flushScene() {
    if (sceneTimer) { clearTimeout(sceneTimer); sceneTimer = null; await saveSceneNow(); }
    await sceneSaving;
  }

  function projectChanged() {
    App.player.setProject(App.project);
    markDirty();
    renderFrames();
    renderInspector();
    showStill();
  }

  function setProject(p, { path = null, name = null, dirty = false, sceneId = null, sceneName = null } = {}) {
    App.player.stop();
    App.sceneId = sceneId;
    App.sceneName = sceneName;
    App.multi.clear();
    App.project = normalizeProject(p);
    App.filePath = path;
    App.fileName = name;
    App.dirty = dirty;
    App.sel = 0;
    App.page = 0;
    App.undo = []; App.redo = [];
    App.player.resetState();
    ImageCache.clear();
    App.player.setProject(App.project);
    updateTitle();
    renderFrames();
    renderInspector();
    showStill();
    autosave();
  }

  // ---------- Миниатюры ----------
  function thumbFor(f, idx) {
    const ar = aspectOf(App.project.options);
    const box = h('div', { class: 'thumb', style: ar < 1 ? { height: '120px', width: Math.round(120 * ar) + 'px' } : { height: Math.round(150 / ar) + 'px' }, title: tx('Настройки сцены (Ctrl/Shift + клик — выделить несколько)'), onclick: (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; select(idx); } });
    const bgId = f.backgroundId || App.player.bgIndex[idx];
    const bg = Lib.bg(bgId);
    const c = Lib.char(f.characterId);
    const pose = c ? Lib.pose(c, f.poseId) : null;
    if (pose?.isSpeedlines) box.append(h('img', { class: 'tb-bg', src: Lib.url(SYSTEM.speedlines), loading: 'lazy' }));
    else if (bg) box.append(h('img', { class: 'tb-bg', src: Lib.url(bg.url), loading: 'lazy', style: (f.flipped & 1) ? { transform: 'scaleX(-1)' } : null }));
    if (pose) box.append(h('img', { class: 'tb-ch', src: Lib.url(pose.idleImageUrl), loading: 'lazy', style: charCss(c, f.flipped & 2, null) }));
    if (bg && bg.deskUrl && !pose?.isSpeedlines) box.append(h('img', { class: 'tb-bg', src: Lib.url(bg.deskUrl), loading: 'lazy' }));
    if (!bg && !pose) box.append(h('div', { class: 'tb-none' }, f.characterId ? tx('нет в библиотеке') : tx('пусто')));
    return box;
  }
  function charCss(c, flipped, entry) {
    const offX = (c.offsetX || 0) + (entry?.offsetX || 0);
    const offY = (c.offsetY || 0) + (entry?.offsetY || 0);
    const size = entry?.size ?? c.size ?? 100;
    let side = ['defense', 'counsel'].includes(c.side) ? 'left' : c.side === 'prosecution' ? 'right' : 'center';
    if (c.alignment === 1) side = 'left'; else if (c.alignment === 2) side = 'right';
    if (flipped) side = side === 'left' ? 'right' : side === 'right' ? 'left' : side;
    const st = { height: size + '%', top: offY + '%' };
    if (side === 'left') st.left = offX + '%';
    else if (side === 'right') st.right = offX + '%';
    else Object.assign(st, { left: offX + '%', right: 0, margin: '0 auto' });
    if (flipped) st.transform = 'scaleX(-1)';
    return st;
  }

  // ---------- Список кадров ----------
  function visibleIndexes() {
    const q = App.search.trim().toLowerCase();
    const all = frames().map((f, i) => i);
    if (!q) return all;
    return all.filter((i) => (frames()[i].text || '').toLowerCase().includes(q));
  }

  function renderFrames() {
    const list = $('frameList');
    const idxs = visibleIndexes();
    const pages = Math.max(1, Math.ceil(idxs.length / perPage()));
    App.page = Math.max(0, Math.min(App.page, pages - 1));
    const slice = idxs.slice(App.page * perPage(), App.page * perPage() + perPage());
    list.innerHTML = '';
    for (const i of slice) {
      list.append(frameCard(frames()[i], i));
      if (!App.search) {
        list.append(h('div', { class: 'add-row' },
          h('button', { class: 'add-frame', onclick: () => addFrame(i + 1) }, tx('＋ добавить кадр')),
          App.clip && App.clip.length ? h('button', { class: 'add-frame paste', title: tx('Вставить скопированные кадры сюда'), onclick: () => pasteFrames(i + 1) }, tx`📋 вставить кадр${App.clip.length > 1 ? tx('ы (') + App.clip.length + ')' : ''}`) : null));
      }
    }
    $('frameCount').textContent = tx`Кадров: ${frames().length}`;
    renderPager(pages);
    renderSelBar();
  }

  function renderPager(pages) {
    const p = $('pager');
    p.innerHTML = '';
    const go = (n) => { App.page = n; renderFrames(); $('frameList').scrollTop = 0; };
    p.append(h('button', { class: 'btn small', disabled: App.page === 0, onclick: () => go(0) }, '«'));
    p.append(h('button', { class: 'btn small', disabled: App.page === 0, onclick: () => go(App.page - 1) }, '‹'));
    const from = Math.max(0, App.page - 3);
    const to = Math.min(pages, from + 7);
    for (let i = from; i < to; i++) p.append(h('button', { class: 'btn small' + (i === App.page ? ' cur' : ''), onclick: () => go(i) }, i + 1));
    p.append(h('button', { class: 'btn small', disabled: App.page >= pages - 1, onclick: () => go(App.page + 1) }, '›'));
    p.append(h('button', { class: 'btn small', disabled: App.page >= pages - 1, onclick: () => go(pages - 1) }, '»'));
    p.append(h('span', { class: 'muted', style: { marginLeft: '8px' } }, tx`стр. ${App.page + 1} из ${pages}`));
    const sel = h('select', { class: 'input', title: tx('Кадров на странице'), style: { width: '96px', marginLeft: '8px' }, onchange: (e) => {
      PER_PAGE = Number(e.target.value);
      localStorage.setItem('oo.framesPerPage', String(PER_PAGE));
      App.page = 0; renderFrames(); ensureVisible(App.sel);
    } }, [[20, tx('по 20')], [50, tx('по 50')], [100, tx('по 100')], [200, tx('по 200')], [0, tx('все')]].map(([v, l]) => h('option', { value: v }, l)));
    sel.value = String(PER_PAGE);
    p.append(sel);
  }

  function badgesFor(f) {
    const b = [];
    const c = Lib.char(f.characterId);
    if (f.characterId) b.push(c ? applyAlias(c.nameplate || c.name, App.project.aliases) : tx('⚠ персонаж ') + f.characterId);
    if (f.speechBubble) {
      const bb = (c?.speechBubbles || []).find((x) => x.id === f.speechBubble || x.id === Lib.bubbleId(f.speechBubble)) || SYSTEM.bubbles.find((x) => x.id === f.speechBubble);
      b.push('💥 ' + (bb ? bb.name : tx('выкрик')));
    }
    if (f.fade) b.push('◐ ' + ({ fadeIn: tx('проявление'), fadeOut: tx('затемнение'), fadeOutIn: tx('затемн.+проявл.') }[f.fade.type] || 'fade'));
    if (f.pair) b.push('👥');
    if (f.moveToNext) b.push('⏭');
    if (f.mergeWithNext) b.push('⛓');
    if ((f.actions || []).some((a) => a.actionId === 1 && a.actionParam === '0')) b.push(tx('скрыть окно'));
    // всплывающие картинки и заставки — чтобы было видно прямо в списке, без прокликивания
    if (f.popupId) { const pp = Lib.get('popups', f.popupId); b.push('🖼 ' + (pp ? pp.name : tx('картинка'))); }
    for (const a of f.actions || []) {
      if (a.actionId === 7 && a.actionParam) {
        const v = String(a.actionParam);
        const nm = v.startsWith('c') ? (Lib.get('popups', Number(v.slice(1)))?.name || tx('своя')) : (window.PlayerUtil.POPUPS[v]?.name || v);
        b.push('📢 ' + nm);
      }
      if (a.actionId === 8) b.push(tx('📢 убрать значок'));
    }
    { const n = window.PlayerUtil.effectsOf(f).length; if (n === 1) b.push(tx('🎨 фильтр')); else if (n > 1) b.push(tx`🎨 фильтров: ${n}`); }
    if (f.transition && f.transition.duration > 0) b.push(tx('↔ переход'));
    return b;
  }

  // Границы тега, в котором стоит позиция pos: [начало, конец) или null
  function tagRangeAt(text, pos) {
    const re = /\[\/?#[^\[\]\n]*\]/g;
    let m;
    while ((m = re.exec(text))) {
      const a = m.index; const b = a + m[0].length;
      if (pos >= a && pos <= b && !(pos === b && text[pos] === '[')) return [a, b];
      if (a > pos) break;
    }
    return null;
  }

  function frameCard(f, idx) {
    const ta = h('textarea', { spellcheck: 'false', placeholder: tx('Текст реплики…'), value: f.text || '' });
    ta._undoPushed = false;
    ta.addEventListener('focus', () => { ta._undoPushed = false; if (App.sel !== idx) select(idx, { keepFocus: true }); });
    ta.addEventListener('input', () => {
      if (!ta._undoPushed) { pushUndo(); ta._undoPushed = true; }
      f.text = ta.value;
      markDirty();
      meta.textContent = metaText(f);
      clearTimeout(ta._t);
      ta._t = setTimeout(() => { if (App.sel === idx) showStill(); }, 350);
    });
    // правый клик по тегу ([#...] или [/#]) выделяет тег целиком
    ta.addEventListener('contextmenu', (e) => {
      const a = ta.selectionStart; const b = ta.selectionEnd;
      const range = tagRangeAt(ta.value, a === b ? a : Math.floor((a + b) / 2));
      if (!range) return;
      e.preventDefault();
      ta.focus();
      ta.setSelectionRange(range[0], range[1]);
    });
    const meta = h('div', { class: 'meta' }, metaText(f));
    const card = h('div', { class: 'frame' + (idx === App.sel ? ' sel' : '') + (App.multi.has(idx) ? ' multi' : ''), 'data-idx': idx },
      h('div', { class: 'frame-head' },
        h('span', { class: 'frame-num' }, idx + 1),
        h('button', { class: 'ib', title: tx('Копировать / переместить'), onclick: (e) => popMenu(e.currentTarget, [
          { label: tx('Копировать кадр (без текста и эффектов)'), fn: () => copyFrames(false, idx) },
          { label: tx('Копировать кадр полностью'), fn: () => copyFrames(true, idx) },
          '-',
          { label: tx('Дублировать ниже'), fn: () => dupFrame(idx) },
          { label: tx('Переместить на позицию…'), fn: async () => {
            const n = await askNumber(tx`Куда переместить кадр ${idx + 1}? (номер, 1–${frames().length})`, idx + 1);
            if (n != null) moveFramesTo(App.multi.has(idx) ? selectedIdxs() : [idx], Math.max(0, Math.min(frames().length, n - 1)) + (n - 1 > idx ? 1 : 0));
          } },
        ]) }, '⧉'),
        h('button', { class: 'ib', title: tx('Выше'), onclick: () => moveFrame(idx, -1) }, '↑'),
        h('button', { class: 'ib', title: tx('Ниже'), onclick: () => moveFrame(idx, 1) }, '↓'),
        h('div', { class: 'badges' }, badgesFor(f).map((t) => h('span', { class: 'badge' }, t))),
        h('div', { class: 'spacer' }),
        h('button', { class: 'ib', title: tx('Проиграть отсюда'), onclick: () => { select(idx); play(idx); } }, '▶'),
        h('button', { class: 'ib', title: tx('Удалить кадр'), onclick: () => deleteFrame(idx) }, '🗑')),
      h('div', { class: 'frame-body' },
        thumbFor(f, idx),
        h('div', { class: 'frame-text' }, tagBar(ta, f, idx), ta, meta)));
    card.addEventListener('mousedown', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target === card || e.target.classList.contains('frame-head') || e.target.classList.contains('frame-num')) select(idx);
    });
    // перетаскивание кадра за его заголовок
    const head = card.querySelector('.frame-head');
    head.draggable = true;
    head.title = tx('Перетаскивание меняет место кадра');
    head.addEventListener('dragstart', (e) => {
      const idxs = App.multi.has(idx) ? selectedIdxs() : [idx];
      e.dataTransfer.setData('text/oo-frames', JSON.stringify(idxs));
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    head.addEventListener('dragend', () => { card.classList.remove('dragging'); document.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); });
    card.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('text/oo-frames')) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      card.classList.toggle('drop-after', after);
      card.classList.toggle('drop-before', !after);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', (e) => {
      const raw = e.dataTransfer.getData('text/oo-frames');
      if (!raw) return;
      e.preventDefault();
      const after = card.classList.contains('drop-after');
      card.classList.remove('drop-before', 'drop-after');
      moveFramesTo(JSON.parse(raw), idx + (after ? 1 : 0));
    });
    // Ctrl + клик — добавить/убрать кадр из выделения, Shift + клик — выделить подряд
    card.addEventListener('click', (e) => {
      if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
      if (e.target.closest('textarea, input, select, button')) return;
      e.preventDefault();
      toggleMulti(idx, e.shiftKey);
    });
    return card;
  }

  function metaText(f) {
    const t = previewText(f.text || '').replace(/\n/g, ' ⏎ ');
    const len = plainText(f.text || '').length;
    return len ? tx`${len} симв.` : tx('без текста');
    void t;
  }

  // ---------- Вставка тегов ----------
  // Замена куска текста реплики так, чтобы она попала в историю правок поля: Ctrl+Z прямо в поле её отменяет
  // (присваивание ta.value историю поля сбрасывает, и отменить вставленный тег можно было только вне поля)
  function replaceText(ta, s, e, text) {
    ta._undoPushed = true; // снимок для общей отмены уже сделан
    ta.focus();
    ta.setSelectionRange(s, e);
    let ok = false;
    try { ok = document.execCommand(text ? 'insertText' : 'delete', false, text); } catch { ok = false; }
    if (!ok || ta.value.slice(s, s + text.length) !== text) ta.setRangeText(text, s, Math.min(e, ta.value.length), 'end');
  }
  function insertAtCursor(ta, f, before, after = '') {
    pushUndo();
    const s = ta.selectionStart ?? ta.value.length;
    const e = ta.selectionEnd ?? s;
    const v = ta.value;
    replaceText(ta, s, e, before + v.slice(s, e) + after);
    const pos = s + before.length + (e - s) + after.length;
    ta.focus();
    ta.setSelectionRange(after ? s + before.length : pos, after ? s + before.length + (e - s) : pos);
    f.text = ta.value;
    markDirty();
    showStill();
  }

  // Покрасить выделенный текст. Теги внутри выделения (паузы, звуки…) цвет «огибает», как на сайте:
  // [#/g]Однажды[/#][#p300][#/g] пиво[/#]. Старые цвета внутри выделения заменяются.
  // Убирает из куска текста только цвет: чисто цветные [#/r]…[/#] — целиком (вместе с их закрывающим тегом),
  // у смешанных ([#/bd r]) остаётся оформление. Оформление ([#/i], [#/u]…) и теги, открытые/закрытые за пределами
  // куска, не трогаются.
  const FMT_ITEM = /^(i|u|s|bd|sz\d{1,3})$/;
  function stripColor(txt) {
    const re = /\[#\/([^\]]*)\]|\[\/#\]/g;
    const parts = [];
    let last = 0; let m;
    while ((m = re.exec(txt))) {
      if (m.index > last) parts.push({ t: 'text', s: txt.slice(last, m.index) });
      parts.push(m[1] !== undefined ? { t: 'open', s: m[0], spec: m[1] } : { t: 'close', s: m[0] });
      last = re.lastIndex;
    }
    if (last < txt.length) parts.push({ t: 'text', s: txt.slice(last) });
    const stack = [];
    for (const p of parts) {
      if (p.t === 'open') stack.push(p);
      else if (p.t === 'close' && stack.length) { const o = stack.pop(); o.pair = p; }
    }
    for (const p of parts) {
      if (p.t !== 'open' || !p.pair) continue;
      const items = p.spec.trim().split(/[\s,;+]+/).filter(Boolean);
      const keep = items.filter((x) => FMT_ITEM.test(x.toLowerCase()));
      if (!keep.length) { p.s = ''; p.pair.s = ''; }
      else if (keep.length !== items.length) p.s = `[#/${keep.join(' ')}]`;
    }
    return parts.map((p) => p.s).join('');
  }

  function wrapColor(ta, f, code) {
    const s0 = ta.selectionStart ?? ta.value.length;
    const e0 = ta.selectionEnd ?? s0;
    if (s0 === e0) { if (code) insertAtCursor(ta, f, `[#/${code}]`, '[/#]'); return; }
    pushUndo();
    const v = ta.value;
    const inner = stripColor(v.slice(s0, e0));
    const out = inner.split(/(\[#[^\]]*\]|\[\/#\])/).map((piece) => {
      if (!piece || /^\[#[^\]]*\]$/.test(piece) || piece === '[/#]' || !code) return piece;
      return `[#/${code}]${piece}[/#]`;
    }).join('');
    replaceText(ta, s0, e0, out);
    ta.focus();
    ta.setSelectionRange(s0, s0 + out.length);
    f.text = ta.value;
    markDirty();
    showStill();
  }

  // Оформление выделенного текста: [#/i]…[/#] и т. п. (вложения разрешены, цвет внутри сохраняется)
  function wrapFormat(ta, f, code) {
    const s0 = ta.selectionStart ?? ta.value.length;
    const e0 = ta.selectionEnd ?? s0;
    if (s0 === e0) { insertAtCursor(ta, f, `[#/${code}]`, '[/#]'); return; }
    pushUndo();
    const v = ta.value;
    const out = `[#/${code}]${v.slice(s0, e0)}[/#]`;
    replaceText(ta, s0, e0, out);
    ta.focus();
    ta.setSelectionRange(s0, s0 + out.length);
    f.text = ta.value;
    markDirty();
    showStill();
  }
  const siteCompat = () => !!(App.project && App.project.options && App.project.options.siteCompat);

  function popMenu(anchor, items) {
    const old = document.querySelector('.dropdown.tagmenu');
    if (old) old.remove();
    const r = anchor.getBoundingClientRect();
    const menu = h('div', { class: 'dropdown tagmenu', style: { top: r.bottom + 4 + 'px', left: Math.min(r.left, window.innerWidth - 320) + 'px' } },
      items.map((it) => it === '-' ? h('hr') : h('button', { onclick: () => { menu.remove(); it.fn(); } }, it.label, it.kbd ? h('kbd', null, it.kbd) : null)));
    document.body.append(menu);
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close, true); } };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  }

  async function askNumber(title, def) {
    const v = await UI.promptDialog(title, String(def), { type: 'number' });
    if (v == null || v === '') return null;
    const n = Math.round(Number(v));
    return Number.isNaN(n) ? null : n;
  }

  // Своя пауза: ползунок с шагом 50 мс (и поле для точного числа); последнее значение запоминается
  function askPause() {
    return new Promise((resolve) => {
      let v = Number(localStorage.getItem('oo.lastPause')) || 500;
      let done = false;
      const out = h('div', { class: 'pause-val' });
      const rng = h('input', { type: 'range', min: 0, max: 5000, step: 50, style: { flex: 1 } });
      const num = h('input', { class: 'input', type: 'number', min: 0, max: 60000, step: 50, style: { width: '96px', flex: 'none' } });
      const set = (x, from) => {
        v = Math.max(0, Math.min(60000, Math.round(Number(x) || 0)));
        if (from !== 'rng') rng.value = Math.min(5000, v);
        if (from !== 'num') num.value = v;
        out.textContent = v >= 1000 ? tx`${v} мс (${(v / 1000).toLocaleString('ru-RU')} с)` : tx`${v} мс`;
      };
      rng.addEventListener('input', () => set(rng.value, 'rng'));
      num.addEventListener('input', () => set(num.value, 'num'));
      const ok = () => { done = true; localStorage.setItem('oo.lastPause', String(v)); m.close(); resolve(v); };
      num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      rng.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      const m = modal({
        title: tx('Своя пауза'),
        body: [
          out,
          h('div', { class: 'slider-row' }, h('label', { style: { width: 'auto' } }, tx('Длительность')), rng, num),
          h('div', { class: 'note' }, tx('Шаг ползунка — 50 мс (до 5 с). В поле можно ввести любое число, в том числе больше 5 с. Стрелки ← → на ползунке тоже двигают по 50 мс.')),
        ],
        foot: [h('button', { class: 'btn primary', onclick: ok }, tx('Вставить'))],
        onClose: () => { if (!done) resolve(null); },
      });
      set(v);
      setTimeout(() => rng.focus(), 0);
    });
  }

  function tagBar(ta, f, idx) {
    const B = (label, title, fn) => h('button', { title, onclick: (e) => fn(e.currentTarget) }, label);
    return h('div', { class: 'tagbar' },
      B(tx('⏸ Пауза'), tx('Пауза в тексте'), (el) => popMenu(el, [100, 200, 300, 500, 1000, 2000].map((ms) => ({ label: ms + tx(' мс'), fn: () => insertAtCursor(ta, f, `[#p${ms}]`) })).concat(['-', { label: tx('Своя… (ползунок)'), fn: async () => { const n = await askPause(); if (n != null) insertAtCursor(ta, f, `[#p${n}]`); } }]))),
      B(tx('🎨 Цвет'), tx('Покрасить выделенный текст'), (el) => popMenu(el, [
        { label: tx('🟠 Красный'), fn: () => wrapColor(ta, f, 'r') },
        { label: tx('🟢 Зелёный'), fn: () => wrapColor(ta, f, 'g') },
        { label: tx('🔵 Синий'), fn: () => wrapColor(ta, f, 'b') },
        { label: tx('Свой цвет…'), fn: () => pickColor((hex) => wrapColor(ta, f, 'c' + hex.replace('#', ''))) },
        { label: tx('Убрать цвет у выделенного'), fn: () => wrapColor(ta, f, null) },
      ])),
      siteCompat() ? null : B(tx('𝐀 Оформление'), tx('Курсив, подчёркивание, зачёркивание, жирный, размер (своё, на objection.lol не работает)'), (el) => popMenu(el, [
        { label: tx('𝘐 Курсив'), fn: () => wrapFormat(ta, f, 'i') },
        { label: tx('U̲ Подчёркнутый'), fn: () => wrapFormat(ta, f, 'u') },
        { label: tx('S̶ Зачёркнутый'), fn: () => wrapFormat(ta, f, 's') },
        { label: tx('𝐁 Жирный'), fn: () => wrapFormat(ta, f, 'bd') },
        '-',
        ...[[70, tx('Мельче (70 %)')], [130, tx('Крупнее (130 %)')], [160, tx('Крупно (160 %)')], [200, tx('Очень крупно (200 %)')]].map(([z, l]) => ({ label: l, fn: () => wrapFormat(ta, f, 'sz' + z) })),
        { label: tx('Свой размер…'), fn: async () => { const n = await askNumber(tx('Размер, % от обычного'), 150); if (n) wrapFormat(ta, f, 'sz' + Math.max(20, Math.min(400, Math.round(n)))); } },
      ])),
      B(tx('⏩ Скорость'), tx('Скорость печати (мс на букву)'), (el) => popMenu(el, [[10, tx('очень быстро')], [20, tx('быстро')], [35, tx('обычно')], [60, tx('медленно')], [100, tx('очень медленно')], [0, tx('мгновенно')]].map(([v, l]) => ({ label: `${l} (${v})`, fn: () => insertAtCursor(ta, f, `[#ts${v}]`) })))),
      B(tx('⚡ Вспышка'), tx('Вспышка (цвет по умолчанию — из настроек проекта)'), (el) => {
        const sizes = [['s', tx('Слабая')], ['m', tx('Средняя')], ['l', tx('Сильная')]];
        popMenu(el, sizes.map(([v, l]) => ({ label: l, fn: () => insertAtCursor(ta, f, `[#f${v}]`) }))
          .concat(siteCompat() ? [] : ['-', ...sizes.map(([v, l]) => ({ label: tx`${l}, свой цвет…`, fn: () => pickColor((hex) => insertAtCursor(ta, f, `[#f${v}c${hex.replace('#', '').toUpperCase()}]`)) }))]));
      }),
      B(tx('📳 Тряска'), tx('Тряска экрана'), (el) => popMenu(el, [
        { label: tx('Слабая'), fn: () => insertAtCursor(ta, f, '[#ss]') },
        { label: tx('Средняя'), fn: () => insertAtCursor(ta, f, '[#sm]') },
        { label: tx('Сильная'), fn: () => insertAtCursor(ta, f, '[#sl]') },
        '-',
        { label: tx('Удар (impact), 300 мс'), fn: () => insertAtCursor(ta, f, '[#sm300:impact]') },
        { label: tx('Землетрясение (quake), 1 с'), fn: () => insertAtCursor(ta, f, '[#sl1000:quake]') },
        { label: tx('По горизонтали, 500 мс'), fn: () => insertAtCursor(ta, f, '[#sm500:horizontal]') },
        { label: tx('Своя длительность…'), fn: async () => { const n = await askNumber(tx('Длительность тряски, мс'), 600); if (n != null) insertAtCursor(ta, f, `[#sm${n}:default]`); } },
        '-',
        { label: tx('⚡ Слабая тряска + вспышка'), fn: () => insertAtCursor(ta, f, '[#ss][#fs]') },
        { label: tx('⚡ Средняя тряска + вспышка'), fn: () => insertAtCursor(ta, f, '[#sm][#fm]') },
        { label: tx('⚡ Сильная тряска + вспышка'), fn: () => insertAtCursor(ta, f, '[#sl][#fl]') },
        { label: tx('⚡ Удар + вспышка'), fn: () => insertAtCursor(ta, f, '[#sm300:impact][#fm]') },
      ])),
      B(tx('🔎 Улика'), tx('Показать улику'), (el) => popMenu(el, [
        { label: tx('Улика на весь экран…'), fn: async () => { const id = await pickEvidence(); if (id != null) insertAtCursor(ta, f, `[#evd${id}]`); } },
        { label: tx('Улика значком в углу…'), fn: async () => { const id = await pickEvidence(); if (id != null) insertAtCursor(ta, f, `[#evdi${id}]`); } },
        { label: tx('Улика значком слева…'), fn: async () => { const id = await pickEvidence(); if (id != null) insertAtCursor(ta, f, `[#evdi${id}l]`); } },
        { label: tx('Улика значком справа…'), fn: async () => { const id = await pickEvidence(); if (id != null) insertAtCursor(ta, f, `[#evdi${id}r]`); } },
        { label: tx('Убрать улику'), fn: () => insertAtCursor(ta, f, '[#evdh]') },
        { label: tx('Убрать улику в конце кадра'), fn: () => insertAtCursor(ta, f, '[#evdhe]') },
      ])),
      B(tx('🎵 Музыка'), tx('Музыка'), (el) => popMenu(el, [
        { label: tx('Включить музыку…'), fn: async () => { const id = await pickAudio('music'); if (id != null) insertAtCursor(ta, f, `[#bgm${id}]`); } },
        { label: tx('Плавно выключить'), fn: () => insertAtCursor(ta, f, '[#bgmfo]') },
        { label: tx('Выключить сразу'), fn: () => insertAtCursor(ta, f, '[#bgms]') },
        { label: tx('Плавно включить (после выключения)'), fn: () => insertAtCursor(ta, f, '[#bgmfi]') },
        '-',
        { label: tx('Плавно выключить в конце кадра'), fn: () => insertAtCursor(ta, f, '[#bgmfoe]') },
        { label: tx('Выключить в конце кадра'), fn: () => insertAtCursor(ta, f, '[#bgmse]') },
      ])),
      B(tx('🔊 Звук'), tx('Звуковой эффект'), (el) => popMenu(el, [
        { label: tx('Звук…'), fn: async () => { const id = await pickAudio('sounds'); if (id != null) insertAtCursor(ta, f, `[#bgs${id}]`); } },
        { label: tx('Остановить все звуки'), fn: () => insertAtCursor(ta, f, '[#bgss]') },
        { label: tx('Плавно заглушить звуки'), fn: () => insertAtCursor(ta, f, '[#bgsfo]') },
        '-',
        { label: tx('Остановить звуки в конце кадра'), fn: () => insertAtCursor(ta, f, '[#bgsse]') },
        { label: tx('Плавно заглушить в конце кадра'), fn: () => insertAtCursor(ta, f, '[#bgsfoe]') },
      ])));
  }

  function pickColor(cb) {
    const inp = h('input', { type: 'color', value: '#ffc700', style: { position: 'fixed', left: '-100px' } });
    document.body.append(inp);
    inp.addEventListener('change', () => { cb(inp.value); inp.remove(); });
    inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 500));
    inp.click();
  }

  async function pickEvidence() {
    const items = Lib.list('evidence').map((a) => ({ id: a.id, name: a.name || (tx('Улика ') + a.id), thumb: { url: a.url, kind: 'icon' }, sub: sourceLabel(a) + ' · ' + a.id }));
    if (!items.length) { toast(tx('В библиотеке нет улик. Улики добавляются во вкладке «Улики»')); return null; }
    const r = await pickerDialog({ title: tx('Улика'), items, type: 'evidence' });
    return r ? r.value : null;
  }

  async function pickAudio(type) {
    const items = Lib.list(type).map((a) => ({ id: a.id, name: a.name, icon: type === 'music' ? '🎵' : '🔊', sub: sourceLabel(a) + ' · ' + a.id }));
    const r = await pickerDialog({
      title: type === 'music' ? tx('Музыка') : tx('Звук'), items, type,
      onPreview: (it) => { const a = Lib.get(type, it.id); if (type === 'music') App.audio.playMusic(a); else App.audio.playSound(a.url, a.volume ?? 100); },
      extra: h('button', { class: 'btn small', onclick: () => App.audio.stopAll() }, tx('■ Стоп')),
    });
    App.audio.stopAll();
    return r ? r.value : null;
  }

  // ---------- Выделение нескольких кадров ----------
  function toggleMulti(idx, range) {
    if (!App.multi.size) App.multi.add(App.sel);
    if (range) {
      const a = Math.min(App.sel, idx); const b = Math.max(App.sel, idx);
      for (let i = a; i <= b; i++) App.multi.add(i);
    } else if (App.multi.has(idx) && App.multi.size > 1) App.multi.delete(idx);
    else App.multi.add(idx);
    if (!range) { App.sel = idx; renderInspector(); showStill(); }
    markMulti();
  }
  function clearMulti() { if (!App.multi.size) return; App.multi.clear(); markMulti(); }
  function markMulti() {
    document.querySelectorAll('.frame').forEach((el) => {
      const i = Number(el.dataset.idx);
      el.classList.toggle('multi', App.multi.has(i));
      el.classList.toggle('sel', i === App.sel);
    });
    renderSelBar();
  }
  function selectedIdxs() { return App.multi.size ? [...App.multi].sort((a, b) => a - b) : [App.sel]; }
  function renderSelBar() {
    const bar = $('selBar');
    bar.innerHTML = '';
    const n = App.multi.size;
    const clipN = App.clip ? App.clip.length : 0;
    if (!n && !clipN) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const B = (label, title, fn, cls = '') => h('button', { class: 'btn small ' + cls, title, onclick: fn }, label);
    if (n) {
      bar.append(h('b', null, tx`Выбрано кадров: ${n}`),
        B(tx('Копировать'), 'Ctrl+C', () => copyFrames()),
        B(tx('Вырезать'), 'Ctrl+X', () => cutFrames()),
        B(tx('Дублировать'), tx('Копии сразу после выделенных'), () => dupFrames()),
        B(tx('Удалить'), 'Delete', () => deleteFrames(), 'danger'));
    }
    if (clipN) bar.append(B(tx`Вставить ${clipN} после кадра ${Math.max(...selectedIdxs()) + 1}`, 'Ctrl+V', () => pasteFrames()));
    bar.append(h('div', { class: 'spacer' }));
    if (n) bar.append(B(tx('Выделить все'), 'Ctrl+A', () => { frames().forEach((f, i) => App.multi.add(i)); markMulti(); }), B('✕', tx('Снять выделение (Esc)'), () => clearMulti()));
    else bar.append(B('✕', tx('Очистить буфер кадров'), () => { App.clip = null; renderSelBar(); }));
  }
  function cloneFrame(f) { const c = JSON.parse(JSON.stringify(f)); c.id = App.project.nextFrameId++; return c; }
  // Копирование кадров. Не полностью (как «Copy frame» на сайте) — только персонаж, поза, фон, отражение,
  // звук речи, имя и пара; без текста, затемнений, эффектов и действий.
  function liteFrame(f) {
    const out = { text: '', actions: [] };
    for (const k of ['characterId', 'poseId', 'backgroundId', 'flipped', 'blip', 'customName', 'pair']) if (f[k] != null) out[k] = JSON.parse(JSON.stringify(f[k]));
    return out;
  }
  function copyFrames(full = true, idx = null) {
    const idxs = idx != null && !App.multi.has(idx) ? [idx] : selectedIdxs();
    App.clip = idxs.map((i) => (full ? JSON.parse(JSON.stringify(frames()[i])) : liteFrame(frames()[i])));
    renderFrames();
    toast(tx`Скопировано кадров: ${App.clip.length}${full ? '' : tx(' (без текста)')} — «📋 вставить кадр» между кадрами`);
  }
  function cutFrames() {
    copyFrames();
    deleteFrames(true);
  }
  function pasteFrames(atIdx = null) {
    if (!App.clip || !App.clip.length) return;
    pushUndo();
    const at = atIdx != null ? atIdx : Math.max(...selectedIdxs()) + 1;
    const list = App.clip.map(cloneFrame);
    frames().splice(at, 0, ...list);
    App.multi = new Set(list.map((f, k) => at + k));
    App.sel = at;
    projectChanged();
    ensureVisible(at);
    toast(tx`Вставлено кадров: ${list.length}`);
  }
  // Переместить кадры (по порядку) так, чтобы они встали перед позицией `to` (в старых номерах)
  function moveFramesTo(idxs, to) {
    idxs = [...new Set(idxs)].sort((a, b) => a - b);
    const fr = frames();
    if (!idxs.length) return;
    pushUndo();
    const moving = idxs.map((i) => fr[i]);
    const before = idxs.filter((i) => i < to).length;
    for (const i of [...idxs].reverse()) fr.splice(i, 1);
    const at = Math.max(0, Math.min(fr.length, to - before));
    fr.splice(at, 0, ...moving);
    App.multi = idxs.length > 1 ? new Set(moving.map((f, k) => at + k)) : new Set();
    App.sel = at;
    projectChanged();
    ensureVisible(at);
  }

  function dupFrames() {
    pushUndo();
    const idxs = selectedIdxs();
    const at = idxs[idxs.length - 1] + 1;
    const list = idxs.map((i) => cloneFrame(frames()[i]));
    frames().splice(at, 0, ...list);
    App.multi = new Set(list.map((f, k) => at + k));
    App.sel = at;
    projectChanged();
    ensureVisible(at);
  }
  function deleteFrames(silent) {
    const idxs = selectedIdxs();
    if (idxs.length >= frames().length) { toast(tx('Нельзя удалить все кадры')); return; }
    pushUndo();
    for (const i of [...idxs].reverse()) frames().splice(i, 1);
    App.multi.clear();
    App.sel = Math.min(idxs[0], frames().length - 1);
    projectChanged();
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) document.activeElement.blur(); // иначе Ctrl+Z уйдёт в поле текста
    if (!silent) toast(tx`Удалено кадров: ${idxs.length} (Ctrl+Z — вернуть)`);
  }

  // ---------- Операции с кадрами ----------
  function select(idx, { keepFocus = false } = {}) {
    if (idx < 0 || idx >= frames().length) return;
    const prev = App.sel;
    App.sel = idx;
    if (App.multi.size) { App.multi.clear(); markMulti(); }
    document.querySelectorAll('.frame.sel').forEach((el) => el.classList.remove('sel'));
    const el = document.querySelector(`.frame[data-idx="${idx}"]`);
    if (el) el.classList.add('sel');
    if (prev !== idx || !keepFocus) renderInspector();
    if (!App.player.playing) showStill();
  }

  function ensureVisible(idx) {
    const pos = visibleIndexes().indexOf(idx);
    if (pos < 0) return;
    const page = Math.floor(pos / perPage());
    if (page !== App.page) { App.page = page; renderFrames(); }
    const el = document.querySelector(`.frame[data-idx="${idx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function newFrameLike(base) {
    const f = { id: App.project.nextFrameId++, text: '', actions: [] };
    if (base) {
      if (base.characterId) { f.characterId = base.characterId; f.poseId = base.poseId; }
      if (base.backgroundId) f.backgroundId = base.backgroundId;
      if (base.flipped) f.flipped = base.flipped;
      if (base.pair) f.pair = JSON.parse(JSON.stringify(base.pair));
    }
    return f;
  }

  function addFrame(at) {
    pushUndo();
    const base = frames()[at - 1] || frames()[at];
    frames().splice(at, 0, newFrameLike(base));
    App.sel = at;
    projectChanged();
    ensureVisible(at);
    const ta = document.querySelector(`.frame[data-idx="${at}"] textarea`);
    if (ta) ta.focus();
  }
  function dupFrame(idx) {
    pushUndo();
    const copy = JSON.parse(JSON.stringify(frames()[idx]));
    copy.id = App.project.nextFrameId++;
    frames().splice(idx + 1, 0, copy);
    App.sel = idx + 1;
    projectChanged();
    ensureVisible(idx + 1);
  }
  async function deleteFrame(idx) {
    if (frames().length <= 1) { toast(tx('Нельзя удалить единственный кадр')); return; }
    pushUndo();
    frames().splice(idx, 1);
    App.sel = Math.min(idx, frames().length - 1);
    projectChanged();
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) document.activeElement.blur(); // иначе Ctrl+Z уйдёт в поле текста
    toast(tx('Кадр удалён (Ctrl+Z — вернуть)'));
  }
  function moveFrame(idx, d) {
    const j = idx + d;
    if (j < 0 || j >= frames().length) return;
    pushUndo();
    const [f] = frames().splice(idx, 1);
    frames().splice(j, 0, f);
    App.sel = j;
    projectChanged();
    ensureVisible(j);
  }

  function refreshCard(idx) {
    const el = document.querySelector(`.frame[data-idx="${idx}"]`);
    if (!el) return;
    const nc = frameCard(frames()[idx], idx);
    el.replaceWith(nc);
  }

  // Изменение кадра из инспектора
  function edit(fn, { rerenderInspector = false } = {}) {
    pushUndo();
    const f = frames()[App.sel];
    fn(f);
    for (const k of Object.keys(f)) if (f[k] === null || f[k] === undefined || f[k] === '' || f[k] === false) if (k !== 'text') delete f[k];
    App.player.setProject(App.project);
    markDirty();
    refreshCard(App.sel);
    if (rerenderInspector) renderInspector();
    showStill();
  }

  // ---------- Инспектор ----------
  function renderInspector() {
    const box = $('inspector');
    box.innerHTML = '';
    const f = frames()[App.sel];
    if (!f) return;
    const c = Lib.char(f.characterId);
    const field = (label, ctl) => h('div', { class: 'field' }, h('label', null, label), ctl);
    const chk = (label, val, fn) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!val, onchange: (e) => fn(e.target.checked) }), label);

    // персонаж
    const pair = findPair(App.project, f);
    const members = pairMembers(pair);
    const charBtn = h('button', { class: 'picker-btn', onclick: async () => {
      // в кадре с парой говорить может только участник пары — как на сайте
      const src = pair && members.length ? [...new Map(members.filter((m) => m.c).map((m) => [m.c.id, m.c])).values()] : Lib.list('characters');
      const items = src.map((a) => ({ id: a.id, name: a.name, thumb: a.iconUrl ? { url: a.iconUrl, kind: 'icon' } : { url: a.poses?.[0]?.idleImageUrl, kind: 'char' }, sub: sourceLabel(a) }));
      const r = await pickerDialog({ title: pair ? tx`Кто говорит (участники пары «${pair.name || tx('Пара')}»)` : tx('Персонаж'), items, type: 'characters', selected: f.characterId, allowNone: !pair, noneLabel: tx('Без персонажа') });
      if (!r) return;
      edit((fr) => {
        if (r.value == null) { delete fr.characterId; delete fr.poseId; delete fr.speechBubble; }
        else { fr.characterId = r.value; const nc = Lib.char(r.value); fr.poseId = nc?.poses?.[0]?.id; delete fr.speechBubble; }
      }, { rerenderInspector: true });
    } },
    c ? UI.thumbImg(c.iconUrl || c.poses?.[0]?.idleImageUrl, c.iconUrl ? 'icon' : 'char', '👤') : h('span', null, '👤'),
    h('span', { class: 'nm' }, c ? c.name : f.characterId ? tx`⚠ Нет в библиотеке (id ${f.characterId})` : tx('Без персонажа')));

    // фон
    const bgAuto = Lib.bg(App.player.bgIndex[App.sel]);
    const bg = Lib.bg(f.backgroundId);
    const bgBtn = h('button', { class: 'picker-btn', onclick: async () => {
      const items = Lib.list('backgrounds').map((a) => ({ id: a.id, name: a.name, thumb: { url: a.url, kind: 'bg' }, sub: sourceLabel(a) }));
      const r = await pickerDialog({ title: tx('Фон'), items, type: 'backgrounds', selected: f.backgroundId, allowNone: true, noneLabel: tx('Авто (фон персонажа)') });
      if (!r) return;
      edit((fr) => {
        if (r.value == null) delete fr.backgroundId; else fr.backgroundId = r.value;
        const nb = Lib.bg(fr.backgroundId || App.player.bgIndex[App.sel]);
        if (!nb || !nb.isWide) delete fr.transition; // переход бывает только у широких фонов (как на сайте)
      }, { rerenderInspector: true });
    } },
    (bg || bgAuto) ? UI.thumbImg((bg || bgAuto).url, 'bg', '🏞') : h('span', null, '🏞'),
    h('span', { class: 'nm' }, bg ? bg.name : f.backgroundId ? tx`⚠ Нет в библиотеке (id ${f.backgroundId})` : tx('Авто') + (bgAuto ? ` — ${bgAuto.name}` : '')));

    // широкий фон: какая часть видна и плавный переход (как Transition на objection.lol)
    const wideSec = (() => {
      const wb = bg || bgAuto;
      if (!wb || !wb.isWide) return null;
      const tr = f.transition || null;
      const prevF = App.project.groups[0] && frames()[App.sel - 1];
      const prevBg = prevF ? (prevF.backgroundId || App.player.bgIndex[App.sel - 1]) : null;
      const canPan = prevF && String(prevBg) === String(f.backgroundId || App.player.bgIndex[App.sel]);
      const setLeft = (v) => edit((fr) => {
        if (v == null) { if (fr.transition) { delete fr.transition.left; if (!(fr.transition.duration > 0)) delete fr.transition; } return; }
        fr.transition = { duration: 0, easing: null, ...(fr.transition || {}), left: v };
      }, { rerenderInspector: true });
      // подсказка: где стоит персонаж кадра (защита — слева, свидетель — центр, обвинение — справа)
      const spot = f.wideSpot || (c ? (c.side === 'defense' ? 'defense' : c.side === 'prosecution' || c.side === 'counsel' ? 'prosecution' : 'witness') : 'witness');
      const sideLeft = spot === 'defense' ? 0 : spot === 'prosecution' ? 100 : 50;
      const spotSel = h('select', { class: 'input', onchange: (e) => edit((fr) => { if (e.target.value) fr.wideSpot = e.target.value; else delete fr.wideSpot; }, { rerenderInspector: true }) },
        [['', tx('По роли персонажа') + (c ? ` (${({ defense: tx('защита'), prosecution: tx('обвинение'), witness: tx('свидетель') })[spot] || tx('свидетель')})` : '')], ['defense', tx('У стойки защиты (слева)')], ['witness', tx('У стойки свидетеля (центр)')], ['prosecution', tx('У стойки обвинения (справа)')]]
          .map(([v, l]) => h('option', { value: v, selected: (f.wideSpot || '') === v || null }, l)));
      const cur = tr && tr.left != null ? Number(tr.left) : null;
      const slider = h('input', { type: 'range', min: 0, max: 100, step: 1, value: cur ?? 0, style: { flex: 1 }, onchange: (e) => setLeft(Number(e.target.value)) });
      const pos = (v, label, title) => h('button', { class: 'btn small' + (cur === v ? ' primary' : ''), title, onclick: () => setLeft(v) }, label);
      const dur = h('input', { class: 'input', type: 'number', min: 0, step: 100, value: tr && tr.duration ? tr.duration : '', placeholder: tx('0 — без перехода'), disabled: !canPan || null,
        onchange: (e) => edit((fr) => { const d = Math.max(0, Number(e.target.value) || 0); fr.transition = { left: cur ?? 0, easing: null, ...(fr.transition || {}), duration: d }; }, { rerenderInspector: true }) });
      const ease = h('select', { class: 'input', disabled: !canPan || !(tr && tr.duration > 0) || null, onchange: (e) => edit((fr) => { fr.transition = { left: cur ?? 0, duration: 0, ...(fr.transition || {}), easing: e.target.value || null }; }) },
        EASE_LIST.map(([v, l]) => h('option', { value: v, selected: (tr && (tr.easing || '')) === v || null }, l)));
      return h('div', { class: 'section' }, h('h4', null, tx('Широкий фон')),
        h('div', { class: 'hint' }, tx('Панорама целиком (например, зал суда со всеми стойками). Персонажи стоят у «своей» стойки: защита — слева, свидетель — в центре, обвинение — справа; пары и сдвиги считаются внутри стойки. Что видно в кадре, сохраняется на следующих кадрах, пока его не поменяют.')),
        field(tx('Где стоят персонажи кадра'), spotSel),
        chk(tx('Панорама под 4:3 (DS) — приблизить, чтобы по краям стоек не было размытых кусков (обрезает сверху и снизу; действует для этого фона везде)'), window.Assets.Marks.get('backgrounds', wb.id).zoom43,
          async (v) => { const M = window.Assets.Marks; await M.set('backgrounds', wb.id, { ...M.get('backgrounds', wb.id), zoom43: v }); App.player.setProject(App.project); showStill(); }),
        h('div', { class: 'picker-line', style: { alignItems: 'center', margin: '6px 0' } },
          pos(0, tx('⇤ Защита'), tx('Левый край (0%)')), pos(50, tx('Свидетель'), tx('Середина (50%)')), pos(100, tx('Обвинение ⇥'), tx('Правый край (100%)')),
          h('button', { class: 'btn small', title: tx('Показать стойку, у которой стоят персонажи кадра'), onclick: () => setLeft(sideLeft) }, tx('🎯 К персонажу')),
          h('button', { class: 'btn small', title: tx('Не менять: как на прошлом кадре'), onclick: () => setLeft(null) }, '✕')),
        h('div', { class: 'picker-line', style: { alignItems: 'center' } }, slider, h('span', { class: 'muted', style: { minWidth: '92px' } }, cur == null ? tx('как раньше') : cur + '%')),
        h('div', { class: 'row' }, field(tx('Переход (едет камера), мс'), dur), field(tx('Плавность'), ease)),
        canPan ? null : h('div', { class: 'hint' }, tx('Плавный переход работает, только если на прошлом кадре тот же фон.')));
    })();

    // позы: говорящего и (если в кадре пара) остальных участников — вкладками, как на сайте:
    // выбрал вкладку участника, щёлкнул позу — сохранилось
    const poseTile = (p, sel, onclick) => h('div', { class: 'pose' + (sel ? ' sel' : ''), title: p.name, onclick },
      UI.thumbImg(p.iconUrl || p.idleImageUrl, p.iconUrl ? 'icon' : 'char', '🧍'), h('span', null, p.name));
    const others = [];
    if (pair && c) for (const m of members) if (m.c && m.c.id !== c.id && !others.some((o) => o.id === m.c.id)) others.push(m.c);
    const tabChar = others.find((o) => o.id === poseTab) || null;
    const poses = h('div', { class: 'poses' });
    if (c && !tabChar) {
      for (const p of c.poses) poses.append(poseTile(p, p.id === Lib.pose(c, f.poseId)?.id, () => edit((fr) => { fr.poseId = p.id; }, { rerenderInspector: true })));
    } else if (tabChar) {
      const cur = f.pair?.poseIds?.[tabChar.id];
      const setPairPose = (pid) => edit((fr) => {
        fr.pair = fr.pair || { id: f.pair.id, poseIds: {} };
        fr.pair.poseIds = { ...(fr.pair.poseIds || {}) };
        if (pid == null) delete fr.pair.poseIds[tabChar.id]; else fr.pair.poseIds[tabChar.id] = pid;
      }, { rerenderInspector: true });
      poses.append(h('div', { class: 'pose pose-keep' + (cur == null ? ' sel' : ''), title: tx('Поза не меняется: как в прошлом кадре с этим персонажем'), onclick: () => setPairPose(null) }, h('b', null, '↺'), h('span', null, tx('Как в прошлый раз'))));
      for (const p of tabChar.poses) poses.append(poseTile(p, cur != null && Number(cur) === p.id, () => setPairPose(p.id)));
    }
    const tabBtn = (ch, label, active, onclick) => h('button', { class: 'btn small pose-tab' + (active ? ' primary' : ''), type: 'button', onclick },
      UI.thumbImg(ch.poses?.[0]?.iconUrl || ch.poses?.[0]?.idleImageUrl, ch.poses?.[0]?.iconUrl ? 'icon' : 'char', ''), h('span', null, label));
    const poseTabs = c && others.length ? h('div', { class: 'pose-tabs' },
      tabBtn(c, c.name + tx(' (говорит)'), !tabChar, () => { poseTab = null; renderInspector(); }),
      others.map((o) => {
        const pid = f.pair?.poseIds?.[o.id];
        const pn = pid != null ? Lib.pose(o, pid)?.name : null;
        return tabBtn(o, o.name + (pn ? ' · ' + pn : ''), tabChar === o, () => { poseTab = o.id; renderInspector(); });
      })) : null;
    const allTalk = h('span', { title: pair ? tx('В этом кадре губами шевелят все участники пары, а не только говорящий') : tx('Работает в кадре с парой персонажей') },
      chk(tx('Говорят все в паре'), !!(pair && f.pairAllTalk), (v) => edit((fr) => { if (v) fr.pairAllTalk = true; else delete fr.pairAllTalk; })));
    if (!pair) { allTalk.style.opacity = '.5'; const inp = allTalk.querySelector('input'); if (inp) inp.disabled = true; }
    const poseBlock = c ? h('div', { class: 'field' },
      h('label', null, others.length ? (tabChar ? tx('Поза в паре: ') + tabChar.name : tx('Поза говорящего')) : tx('Поза')),
      poseTabs, poses, h('div', { class: 'checks' }, allTalk),
      others.length ? h('div', { class: 'hint' }, tx('Вкладки — участники пары: выбрать участника, щёлкнуть позу. «Как в прошлый раз» — поза не меняется.')) : null) : null;

    // выкрик
    const bubbles = [...(c?.speechBubbles || [])];
    if (!bubbles.length && c?.isPreset) bubbles.push(...SYSTEM.bubbles);
    const bubbleSel = h('select', { class: 'input', onchange: (e) => edit((fr) => { fr.speechBubble = e.target.value ? Number(e.target.value) : null; }) },
      h('option', { value: '' }, tx('Нет')), bubbles.map((b) => h('option', { value: b.id }, b.name)));
    bubbleSel.value = f.speechBubble ? Lib.bubbleId(f.speechBubble) : '';

    // пара
    const pairSel = h('select', { class: 'input', onchange: (e) => edit((fr) => {
      fr.pair = e.target.value ? { id: e.target.value, poseIds: {} } : null;
      // говорящим может быть только участник пары
      const np = findPair(App.project, fr);
      if (np && np.pairs.length && !np.pairs.some((x) => x.characterId === fr.characterId)) {
        const nc = Lib.char(np.pairs[0].characterId);
        if (nc) { fr.characterId = nc.id; fr.poseId = nc.poses?.[0]?.id; delete fr.speechBubble; }
      }
    }, { rerenderInspector: true }) },
      h('option', { value: '' }, tx('Нет')), (App.project.pairs || []).map((p) => h('option', { value: p.id }, p.name || tx('Пара'))));
    pairSel.value = f.pair?.id || '';

    // блип
    const blipSel = h('select', { class: 'input', onchange: (e) => edit((fr) => { fr.blip = e.target.value ? Number(e.target.value) : null; }) },
      h('option', { value: '' }, tx('Как у персонажа')), SYSTEM.blips.map((b) => h('option', { value: b.id }, b.label)));
    blipSel.value = f.blip || '';

    // затемнение
    const fade = f.fade || {};
    const fadeType = h('select', { class: 'input', onchange: (e) => edit((fr) => {
      if (!e.target.value) fr.fade = null;
      else fr.fade = { target: 'everything', duration: 500, color: '#000', ...(fr.fade || {}), type: e.target.value };
    }, { rerenderInspector: true }) },
    [['', tx('Нет')], ['fadeIn', tx('Проявление из цвета')], ['fadeOut', tx('Затемнение в цвет')], ['fadeOutIn', tx('Затемнение и проявление')]].map(([v, l]) => h('option', { value: v }, l)));
    fadeType.value = fade.type || '';
    const fadeTarget = h('select', { class: 'input', onchange: (e) => edit((fr) => { fr.fade.target = e.target.value; if (e.target.value === 'characters') fr.fade.characters = fr.fade.characters || 2; }, { rerenderInspector: true }) },
      [['everything', tx('Весь экран')], ['scene', tx('Сцена (без окна текста)')], ['background', tx('Только фон')], ['characters', tx('Персонажи (прозрачность)')]].map(([v, l]) => h('option', { value: v }, l)));
    fadeTarget.value = fade.target || 'everything';
    // кого затемнять: у каждого участника пары своё место (бит), как на сайте
    const fadeBits = Number(fade.characters ?? 2);
    const whoList = pair && members.length ? members.map((m) => [m.slot, `${m.idx + 1}. ` + (m.c ? m.c.name : 'id ' + m.entry.characterId) + (m.entry.characterId === f.characterId ? tx(' (говорит)') : '')]) : [[2, tx('Персонаж кадра')]];
    const fadeWho = h('div', { class: 'checks' }, whoList.map(([bit, label]) => chk(label, fadeBits & bit, (v) => edit((fr) => { fr.fade.characters = (Number(fr.fade.characters ?? 2) & ~bit) | (v ? bit : 0); }))));
    const fadeDur = h('input', { class: 'input', type: 'number', value: fade.duration ?? 500, onchange: (e) => edit((fr) => { fr.fade.duration = Number(e.target.value) || 0; }) });
    const fadeColor = h('input', { class: 'input', type: 'color', value: normHex(fade.color || '#000000'), style: { height: '34px', padding: '2px' }, onchange: (e) => edit((fr) => { fr.fade.color = e.target.value; }) });

    // фильтры: основной (f.effect — как на сайте) и дополнительные (f.extraEffects); плавность общая и хранится в основном
    const effList = window.PlayerUtil.effectsOf(f);
    const effDefaults = { 'hue-rotate': 180, contrast: 150, saturate: 200, tint: 50, blur: 4, 'blur-radial': 40, 'blur-edges': 60, sharpen: 50, vignette: 60, grain: 30 };
    const PCT_TYPES = ['tint', 'blur-radial', 'blur-edges', 'sharpen', 'vignette', 'grain'];
    const editEffects = (fn) => edit((fr) => {
      const L = window.PlayerUtil.effectsOf(fr).map((e) => ({ ...e }));
      const fi = fr.effect && fr.effect.fadeInMs; const fo = fr.effect && fr.effect.fadeOutMs;
      fn(L);
      for (const e of L) { delete e.fadeInMs; delete e.fadeOutMs; }
      if (L.length) { if (fi) L[0].fadeInMs = fi; if (fo) L[0].fadeOutMs = fo; }
      fr.effect = L[0] || null;
      if (L.length > 1) fr.extraEffects = L.slice(1); else delete fr.extraEffects;
    }, { rerenderInspector: true });
    const effTypes = [['grayscale', tx('Чёрно-белый')], ['sepia', tx('Сепия')], ['invert', tx('Негатив')], ['sepia-invert', tx('Сепия + негатив')], ['hue-rotate', tx('Сдвиг оттенка')], ['brightness', tx('Яркость')], ['contrast', tx('Контрастность')], ['saturate', tx('Насыщенность')], ['tint', tx('Цвет с наложением')], ['vignette', tx('Виньетка')], ['grain', tx('Зерно / шум')], ['blur', tx('Размытие')], ['blur-radial', tx('Радиальное размытие')], ['blur-edges', tx('Размытие по краям')], ['sharpen', tx('Резкость')]];
    const effRow = (eff, idx) => {
      const typeSel = h('select', { class: 'input', onchange: (e) => editEffects((L) => {
        const t = e.target.value;
        const n = { target: L[idx].target ?? 63, type: t, amount: effDefaults[t] ?? 100 };
        if (t === 'tint') { n.color = L[idx].color || '#ff8800'; n.blend = L[idx].blend || 'multiply'; }
        if (t === 'vignette') n.color = '#000000';
        L[idx] = n;
      }) }, effTypes.map(([v, l]) => h('option', { value: v }, l)));
      typeSel.value = eff.type;
      const amount = h('input', { class: 'input', type: 'number', min: PCT_TYPES.includes(eff.type) || eff.type === 'blur' ? 0 : undefined, max: PCT_TYPES.includes(eff.type) ? 100 : eff.type === 'blur' ? 60 : undefined, step: eff.type === 'blur' ? 0.5 : undefined, value: eff.amount ?? (effDefaults[eff.type] ?? 100), onchange: (e) => editEffects((L) => { L[idx].amount = Number(e.target.value) || 0; }) });
      const amountLabel = eff.type === 'hue-rotate' ? tx('Градусы') : eff.type === 'tint' ? tx('Непрозрачность, %') : eff.type === 'blur' ? tx('Радиус, пикс. (для 720p)') : ['brightness', 'contrast', 'saturate'].includes(eff.type) ? tx('Уровень, % (100 — без изменений)') : tx('Сила, %');
      const color = eff.type === 'tint' || eff.type === 'vignette' ? h('input', { class: 'input', type: 'color', value: normHex(eff.color || (eff.type === 'vignette' ? '#000000' : '#ff8800')), style: { height: '34px', padding: '2px' }, onchange: (e) => editEffects((L) => { L[idx].color = e.target.value; }) }) : null;
      const blend = eff.type === 'tint' ? h('select', { class: 'input', onchange: (e) => editEffects((L) => { L[idx].blend = e.target.value; }) }, window.OOBlendOptions().map(([v, l]) => h('option', { value: v }, l))) : null;
      if (blend) blend.value = eff.blend || 'multiply';
      // к чему применить: фон и каждый участник пары отдельно (битовая маска, как на сайте)
      const bits = window.PlayerUtil.normTarget(eff.target);
      const target = h('div', { class: 'checks' },
        [[1, tx('Фон')], ...whoList].map(([bit, label]) => chk(label, bits & bit, (v) => editEffects((L) => {
          const ALL = window.PlayerUtil.ALL_CHARS;
          let t = window.PlayerUtil.normTarget(L[idx].target);
          if (bit === 2 && !(pair && members.length)) t = v ? t | ALL : t & ~ALL; // одиночный персонаж — все места персонажей
          else t = v ? t | bit : t & ~bit;
          L[idx].target = t;
        }))));
      const tools = h('div', { class: 'eff-tools' },
        idx > 0 ? h('button', { class: 'btn small', title: tx('Выше'), onclick: () => editEffects((L) => { [L[idx - 1], L[idx]] = [L[idx], L[idx - 1]]; }) }, '↑') : null,
        h('button', { class: 'btn small', title: tx('Убрать фильтр'), onclick: () => editEffects((L) => { L.splice(idx, 1); }) }, '✕'));
      return h('div', { class: 'eff-item' },
        h('div', { class: 'row' }, field(effList.length > 1 ? tx`Фильтр ${idx + 1}` : tx('Тип'), typeSel), field(amountLabel, amount), tools),
        color ? h('div', { class: 'row' }, field(tx('Цвет'), color), blend ? field(tx('Режим наложения'), blend) : h('div')) : null,
        field(tx('К чему'), target));
    };
    const effAdd = h('button', { class: 'btn small', onclick: () => editEffects((L) => { L.push({ type: L.length ? 'contrast' : 'grayscale', amount: L.length ? 150 : 100, target: 63 }); }) }, effList.length ? tx('＋ Ещё фильтр') : tx('＋ Добавить фильтр'));
    const eff = f.effect || {};
    const effIn = h('input', { class: 'input', type: 'number', min: 0, step: 100, placeholder: tx('0 — сразу'), value: eff.fadeInMs || '', onchange: (e) => edit((fr) => { const v = Math.max(0, Number(e.target.value) || 0); if (v) fr.effect.fadeInMs = v; else delete fr.effect.fadeInMs; }) });
    const effOut = h('input', { class: 'input', type: 'number', min: 0, step: 100, placeholder: tx('0 — сразу'), value: eff.fadeOutMs || '', title: tx('Когда следующий кадр уже без этих фильтров, они снимаются плавно за это время'), onchange: (e) => edit((fr) => { const v = Math.max(0, Number(e.target.value) || 0); if (v) fr.effect.fadeOutMs = v; else delete fr.effect.fadeOutMs; }) });

    // действия
    const actGet = (id) => (f.actions || []).find((a) => a.actionId === id);
    const actSet = (id, param) => edit((fr) => {
      fr.actions = (fr.actions || []).filter((a) => a.actionId !== id);
      if (param !== null && param !== undefined) fr.actions.push({ actionId: id, actionParam: String(param) });
    });
    const boxSel = h('select', { class: 'input', onchange: (e) => actSet(1, e.target.value === '' ? null : e.target.value) },
      [['', tx('Как обычно')], ['0', tx('Скрыть, пока кто-то не заговорит')], ['1', tx('Показать')]].map(([v, l]) => h('option', { value: v }, l)));
    boxSel.value = actGet(1)?.actionParam ?? '';
    const numAct = (id, placeholder) => h('input', { class: 'input', type: 'number', placeholder, value: actGet(id)?.actionParam ?? '', onchange: (e) => actSet(id, e.target.value === '' ? null : e.target.value) });

    box.append(...[
      h('div', { class: 'insp-title' }, tx`Кадр ${App.sel + 1}`, h('span', { class: 'muted', style: { fontWeight: 400, fontSize: '12px' } }, tx`из ${frames().length}`)),
      h('div', { class: 'row' }, field(tx('Персонаж'), h('div', { class: 'picker-line' }, charBtn,
        c ? h('button', { class: 'btn small', title: tx('Открыть этого персонажа в библиотеке (позы, выкрики, звук речи…)'), onclick: () => openLibrary(libCtx(), 'characters', c.id) }, '✎') : null)), field(tx('Фон'), bgBtn)),
      wideSec,
      poseBlock,
      h('div', { class: 'row' },
        field(tx('Выкрик перед репликой'), bubbleSel),
        field(tx('Своё имя на табличке («.» — скрыть)'), h('input', { class: 'input', value: f.customName || '', placeholder: c ? applyAlias(c.nameplate || c.name, App.project.aliases) : '', onchange: (e) => edit((fr) => { fr.customName = e.target.value; }) }))),
      h('div', { class: 'checks' },
        ...(pair && members.length ? members.map((m) => chk(tx`Отразить: ${m.idx + 1}. ` + (m.c ? m.c.name : 'id ' + m.entry.characterId), f.flipped & m.slot, (v) => edit((fr) => { fr.flipped = (fr.flipped || 0) & ~m.slot | (v ? m.slot : 0); })))
          : [chk(tx('Отразить персонажа'), f.flipped & 2, (v) => edit((fr) => { fr.flipped = (fr.flipped || 0) & ~2 | (v ? 2 : 0); }))]),
        chk(tx('Отразить фон'), f.flipped & 1, (v) => edit((fr) => { fr.flipped = (fr.flipped || 0) & ~1 | (v ? 1 : 0); })),
        chk(tx('Не шевелить губами'), f.doNotTalk, (v) => edit((fr) => { fr.doNotTalk = v; })),
        chk(tx('Без анимации позы'), f.noPoseAnimation, (v) => edit((fr) => { fr.noPoseAnimation = v; })),
        h('span', { title: tx('Текст начинается сразу, не дожидаясь конца анимации позы (на сайте — Skip Animation Delay)') }, chk(tx('Не ждать анимацию позы'), f.noPauseForAnimation, (v) => edit((fr) => { fr.noPauseForAnimation = v; }))),
        chk(tx('Сразу к следующему кадру'), f.moveToNext, (v) => edit((fr) => { fr.moveToNext = v; })),
        chk(tx('Склеить текст со следующим'), f.mergeWithNext, (v) => edit((fr) => { fr.mergeWithNext = v; })),
        chk(tx('Текст по центру'), !!actGet(9), (v) => actSet(9, v ? '' : null)),
        chk(tx('Вне кадра (показать только выкрик)'), !!actGet(6), (v) => actSet(6, v ? '' : null))),
      c ? (() => {
        // прозрачность персонажа этого кадра (призраки и т. п.); 100 % — обычный
        const cur = f.charOpacity != null ? Number(f.charOpacity) : 100;
        const lab = h('span', { class: 'muted', style: { width: '52px', textAlign: 'right' } }, cur + ' %');
        const rng = h('input', { type: 'range', min: 0, max: 100, step: 5, value: cur, style: { flex: 1 },
          oninput: (e) => { lab.textContent = e.target.value + ' %'; },
          onchange: (e) => edit((fr) => { const v = Number(e.target.value); if (v >= 100) delete fr.charOpacity; else fr.charOpacity = v; }) });
        return field(tx('Непрозрачность персонажа кадра (меньше 100 % — полупрозрачный, например призрак)'), h('div', { class: 'picker-line', style: { alignItems: 'center' } }, rng, lab));
      })() : null,
      h('div', { class: 'section' }, h('h4', null, tx('Окно текста и речь')),
        h('div', { class: 'row' }, field(tx('Окно текста'), boxSel), field(tx('Звук речи'), blipSel)),
        h('div', { class: 'row' }, field(tx('Текстбокс с этого кадра'), textboxButton(actGet(12)?.actionParam ?? null, (v) => actSet(12, v), tx('Не менять'))), h('div')),
        h('div', { class: 'row' },
          field(tx('Скорость текста дальше, мс/буква'), numAct(13, String(App.project.options.textSpeed ?? 35))),
          field(tx('Частота «бипа», мс'), numAct(14, String(App.project.options.textBlipFrequency ?? 64))),
          field(tx('Пауза между кадрами, мс'), numAct(15, String(App.project.options.autoplaySpeed ?? 500))))),
      h('div', { class: 'section' }, h('h4', null, tx('Затемнение')),
        h('div', { class: 'row' }, field(tx('Тип'), fadeType), f.fade ? field(tx('Что'), fadeTarget) : null),
        f.fade ? h('div', { class: 'row' }, field(tx('Длительность, мс'), fadeDur), f.fade.target !== 'characters' ? field(tx('Цвет'), fadeColor) : field(tx('Кого'), fadeWho)) : null,
        f.fade && f.fade.target !== 'characters' && f.fade.type === 'fadeOut'
          ? chk(tx('Только на этот кадр (со следующего кадра снова видно)'), f.fade.onlyThisFrame, (v) => edit((fr) => { if (v) fr.fade.onlyThisFrame = true; else delete fr.fade.onlyThisFrame; })) : null,
        f.fade && f.fade.target === 'characters' && f.fade.type === 'fadeOut' ? h('div', null,
          chk(tx('Только на этот кадр (со следующего кадра персонаж снова виден)'), f.fade.onlyThisFrame, (v) => edit((fr) => { if (v) fr.fade.onlyThisFrame = true; else delete fr.fade.onlyThisFrame; })),
          h('div', { class: 'hint' }, App.project.options.strictCharacterFades
            ? tx('Затемнение держится на этом месте пары, пока не будет «Проявления» — даже если в кадрах другие персонажи (как на сайте; меняется в настройках проекта).')
            : tx('Затемнение держится, пока на этом месте тот же персонаж и нет «Проявления». Если в следующих кадрах на этом месте другой персонаж — он виден сразу.'))) : null),
      h('div', { class: 'section' }, h('h4', null, tx('Фильтр')),
        effList.map(effRow),
        h('div', { class: 'row' }, effAdd),
        effList.length > 1 ? h('div', { class: 'hint' }, tx('Фильтры накладываются по порядку сверху вниз.')) : null,
        effList.length ? h('div', { class: 'row' }, field(tx('Плавно наложить, мс'), effIn), field(tx('Плавно снять после, мс'), effOut)) : null),
      h('div', { class: 'section' }, h('h4', null, tx('Пара персонажей')),
        h('div', { class: 'row' }, field(tx('Пара'), pairSel), h('div', { class: 'field' }, h('button', { class: 'btn small', onclick: () => (pair ? openPairEditor(pair, f) : openSettings('pairs')) }, pair ? tx('Настроить эту пару…') : tx('Настроить пары…')))),
        pair ? h('div', { class: 'row' }, h('button', { class: 'btn small', title: tx('Копия пары с теми же персонажами — в ней можно поменять положение, не трогая остальные кадры'), onclick: () => {
          pushUndo();
          const np = clonePair(pair);
          f.pair = { ...(f.pair || {}), id: np.id };
          markDirty(); App.player.setProject(App.project); renderFrames(); renderInspector(); showStill();
          openPairEditor(np, f);
        } }, tx('⧉ Копия пары для этого кадра'))) : null,
        pair ? h('div', { class: 'hint' }, tx('Позы участников и «Говорят все в паре» — в разделе «Поза» выше.')) : null),
      popupSection(f, actGet, actSet),
    ].filter(Boolean));
  }
  const field = (label, ctl) => h('div', { class: 'field' }, h('label', null, label), ctl);
  // Участники пары: место (бит) у каждого — по порядку в паре
  function pairMembers(pair) {
    if (!pair) return [];
    return (pair.pairs || []).slice(0, window.PlayerUtil.pairLimit(App.project)).map((entry, idx) => ({ entry, idx, slot: 2 << idx, c: Lib.char(entry.characterId) }));
  }

  // Всплывающие картинки: встроенные (Witness Testimony…) и свои из библиотеки
  function popupSection(f, actGet, actSet) {
    const POP = window.PlayerUtil.POPUPS;
    const pre = h('select', { class: 'input', onchange: (e) => actSet(7, e.target.value || null) },
      h('option', { value: '' }, tx('Нет')), Object.entries(POP).map(([v, d]) => h('option', { value: v }, d.name)),
      Lib.list('popups').length ? h('optgroup', { label: tx('Свои заставки (из «Картинок»)') }, Lib.list('popups').map((p) => h('option', { value: 'c' + p.id }, p.name || tx('Картинка ') + p.id))) : null);
    pre.value = actGet(7)?.actionParam ?? '';
    const rm = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: actGet(8)?.actionParam === '1', onchange: (e) => actSet(8, e.target.checked ? '1' : null) }), tx('Убрать значок «Testimony»'));
    const own = Lib.get('popups', f.popupId);
    const ownBtn = h('button', { class: 'picker-btn', onclick: async () => {
      const items = Lib.list('popups').map((a) => ({ id: a.id, name: a.name, thumb: { url: a.url, kind: 'icon' }, sub: sourceLabel(a) }));
      if (!items.length) { toast(tx('В библиотеке нет своих картинок. Они добавляются во вкладке «Картинки»')); return; }
      const r = await pickerDialog({ title: tx('Своя картинка поверх сцены'), items, type: 'popups', selected: f.popupId, allowNone: true, noneLabel: tx('Нет') });
      if (r) edit((fr) => { fr.popupId = r.value; }, { rerenderInspector: true });
    } }, own ? UI.thumbImg(own.url, 'icon') : h('span', null, '🖼'), h('span', { class: 'nm' }, own ? own.name : f.popupId ? tx`⚠ нет в библиотеке (id ${f.popupId})` : tx('Нет')));
    // прозрачность и плавность своей картинки в этом кадре (пусто — как в самой картинке)
    const fxNum = (k, label, def, opts = {}) => {
      const cur = f.popupFx && f.popupFx[k] != null ? f.popupFx[k] : '';
      return field(label, h('input', { class: 'input', type: 'number', min: 0, max: opts.max, step: opts.step || 50, value: cur,
        placeholder: def == null || def === '' ? (opts.none || '') : tx`${def} (из картинки)`,
        onchange: (e) => edit((fr) => {
          const v = e.target.value === '' ? null : Math.max(0, Math.min(opts.max || 600000, Number(e.target.value)));
          fr.popupFx = { ...(fr.popupFx || {}) };
          if (v == null || Number.isNaN(v)) delete fr.popupFx[k]; else fr.popupFx[k] = v;
          if (!Object.keys(fr.popupFx).length) delete fr.popupFx;
        }) }));
    };
    const fxRow = own ? h('div', { class: 'row' },
      fxNum('opacity', tx('Непрозрачность в этом кадре, %'), own.opacity ?? 100, { max: 100, step: 5 }),
      fxNum('fadeInMs', tx('Появление, мс'), own.fadeInMs, { none: tx('0 (из картинки)') }),
      fxNum('fadeOutMs', tx('Исчезновение, мс'), own.fadeOutMs, { none: tx('0 (из картинки)') })) : null;
    const ppBlend = own ? h('select', { class: 'input', onchange: (e) => edit((fr) => {
      fr.popupFx = { ...(fr.popupFx || {}) };
      if (e.target.value) fr.popupFx.blend = e.target.value; else delete fr.popupFx.blend;
      if (!Object.keys(fr.popupFx).length) delete fr.popupFx;
    }) }, [['', tx('Как в картинке')], ...window.OOBlendOptions()].map(([v, l]) => h('option', { value: v }, l))) : null;
    if (ppBlend) ppBlend.value = (f.popupFx && f.popupFx.blend) || '';
    const evSide = h('select', { class: 'input', onchange: (e) => edit((fr) => { if (e.target.value) fr.evidenceSide = e.target.value; else delete fr.evidenceSide; }) },
      h('option', { value: '' }, tx('Как в настройках проекта')), h('option', { value: 'left' }, tx('Слева')), h('option', { value: 'right' }, tx('Справа')));
    evSide.value = f.evidenceSide || '';
    return h('div', { class: 'section' }, h('h4', null, tx('Картинки поверх сцены')),
      h('div', { class: 'row' }, field(tx('Заставка перед текстом (Witness Testimony и т. п.)'), pre), field(tx('Своя картинка (до смены кадра)'), ownBtn)),
      rm,
      fxRow,
      ppBlend ? h('div', { class: 'row' }, field(tx('Режим наложения в этом кадре'), ppBlend), h('div')) : null,
      fxRow ? h('div', { class: 'note' }, tx('Пустое поле — значение из самой картинки. Исчезновение срабатывает, когда картинка уходит после этого кадра.')) : null,
      h('div', { class: 'row' }, field(tx('Значок улики в этом кадре'), evSide), h('div')),
      h('div', { class: 'note' }, tx('Сторона значка закрепляется на время кадра, чтобы при быстрой смене кадров он не прыгал. Для отдельного момента — тег [#evdi…l] (слева) или [#evdi…r] (справа), меню «🔎 Улика».')));
  }
  // Кнопка выбора текстбокса с поиском
  function textboxButton(value, onPick, noneLabel = tx('Классический (как на сайте)')) {
    const cur = value == null ? null : Lib.textbox(value);
    const label = value == null ? noneLabel : String(value) === '0' ? tx('Классический (как на сайте)') : cur ? cur.name + (cur.isPreset ? tx(' (сайт)') : '') : tx`⚠ нет в библиотеке (${value})`;
    return h('button', { class: 'picker-btn', onclick: async () => {
      const list = [...SYSTEM.textboxes, ...Lib.list('textboxes')];
      const items = [{ id: '0', name: tx('Классический (как на сайте)'), icon: '💬' }, ...list.map((t) => ({ id: String(t.id), name: t.name + (t.isPreset ? tx(' (сайт)') : ''), thumb: t.url ? { url: t.url, kind: 'tb' } : null, icon: '💬', sub: t.isPreset ? tx('стандартный') : sourceLabel(t) }))];
      const r = await pickerDialog({ title: tx('Текстбокс'), items, type: 'textboxes', selected: value == null ? null : String(value), allowNone: noneLabel !== tx('Классический (как на сайте)'), noneLabel });
      if (r) onPick(r.value == null ? null : r.value);
    } }, cur && cur.url ? UI.thumbImg(cur.url, 'tb', '💬') : h('span', null, '💬'), h('span', { class: 'nm' }, label));
  }

  function normHex(c) {
    let x = (c || '#000').replace('#', '');
    if (x.length === 3) x = x.split('').map((k) => k + k).join('');
    return '#' + x.padEnd(6, '0').slice(0, 6);
  }

  // ---------- Предпросмотр ----------
  let stillTimer;
  function showStill() {
    clearTimeout(stillTimer);
    stillTimer = setTimeout(() => { if (!App.player.playing) App.player.showStill(App.sel); }, 30);
  }

  function play(from) {
    App.audio.resume();
    if ($('chkFull').checked) enterFullscreen();
    App.player.playFrom(from, { manual: $('chkManual').checked, resumeMusic: $('chkResumeMusic').checked });
  }
  // Экономия памяти: через минуту без действий или когда окно свёрнуто — выгружаем всё, кроме того, что на экране
  function setupMemoryTrim() {
    const { ImageCache } = window.Assets;
    let last = performance.now();
    const touch = () => { last = performance.now(); };
    for (const ev of ['mousedown', 'keydown', 'wheel']) document.addEventListener(ev, touch, { passive: true, capture: true });
    App.player.on('frame', touch);
    const busy = () => App.exporting || [...window.Player.instances].some((p) => p.playing);
    const trim = () => {
      if (busy()) return;
      const keep = new Set(ImageCache.sticky);
      for (const p of window.Player.instances) for (const img of p.liveImages()) keep.add(img);
      const before = ImageCache.pinned;
      ImageCache.pinned = keep;
      ImageCache.trim();
      ImageCache.pinned = before;
      App.audio.evictAudio(true);
    };
    setInterval(() => { if (document.hidden || performance.now() - last > 60000) trim(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) setTimeout(() => { if (document.hidden) trim(); }, 4000); });
    App.trimMemory = trim;
  }

  // Просмотр на весь экран. Холст остаётся 720p и растягивается: при смене размера пришлось бы заново
  // раскодировать все картинки под новую высоту (медленно и вдвое больше памяти)
  function enterFullscreen() {
    if (document.fullscreenElement) return;
    $('stage').requestFullscreen().catch(() => {});
  }
  function exitFullscreen() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    // вышли из полноэкранного (Esc или конец сцены): обычный размер и стоп
    if (App.player.playing) App.player.stop();
    showStill();
  });

  // ---------- Файлы ----------
  async function confirmDiscard() {
    // все изменения и так сохраняются в «Сцены» — достаточно дописать последние
    await flushScene();
    return true;
  }

  async function doNew() {
    if (!(await confirmDiscard())) return;
    setProject(newProject());
  }

  async function doOpen(file) {
    if (!(await confirmDiscard())) return;
    const r = file || await window.api.project.open();
    if (!r) return;
    let p;
    try { p = decodeProject(r.text); } catch (e) { toast(tx('Не удалось прочитать файл проекта'), 5000); return; }
    if (r.bundle) await Lib.load(); // ресурсы из архива уже в библиотеке
    if (p.type && p.type !== 'scene') {
      await confirmDialog(tx('Это интерактивное «дело» (Case). Пока поддерживаются только сцены — откроется первая группа кадров как обычная сцена.'), { ok: tx('Понятно'), cancel: tx('Отмена') });
      p.type = 'scene';
    }
    // этот файл уже открывали — продолжаем ту же сцену в «Моих сценах»
    let sceneId = null;
    if (r.path) { try { const same = (await window.api.scenes.list()).find((x) => x.filePath === r.path); if (same) sceneId = same.id; } catch (e) { /* */ } }
    setProject(p, { path: r.path, name: r.name, sceneId });
    saveSceneNow();
    if (r.bundle) {
      toast(tx`Проект с ресурсами: добавлено в библиотеку ${r.bundle.added}, уже были ${r.bundle.skipped}`, 7000);
    }
    checkMissing(true);
  }

  async function doSave(as = false) {
    const text = encodeProject(App.project);
    const r = await window.api.project.save({ path: as ? null : App.filePath, text, suggestedName: (App.fileName || 'project').replace(/\.objection$/i, '') });
    if (!r) return false;
    App.filePath = r.path;
    App.fileName = r.name;
    App.dirty = false;
    updateTitle();
    autosave();
    saveSceneNow();
    toast(tx('Сохранено: ') + r.name);
    return true;
  }

  function missingSummary() {
    const ids = { characters: new Set(), backgrounds: new Set(), music: new Set(), sounds: new Set(), evidence: new Set(), popups: new Set() };
    let notDownloaded = 0;
    for (const f of frames()) {
      if (f.characterId) ids.characters.add(f.characterId);
      if (f.backgroundId) ids.backgrounds.add(f.backgroundId);
      if (f.popupId) ids.popups.add(f.popupId);
      for (const t of parseText(f.text || '')) {
        if (t.cmd === 'music') ids.music.add(t.id);
        if (t.cmd === 'sound') ids.sounds.add(t.id);
        if (t.cmd === 'evidence' || t.cmd === 'evidence_icon') ids.evidence.add(t.id);
      }
    }
    for (const p of App.project.pairs || []) for (const e of p.pairs || []) ids.characters.add(e.characterId);
    const missing = {};
    for (const [type, set] of Object.entries(ids)) {
      missing[type] = [...set].filter((id) => !Lib.get(type, id));
      for (const id of set) {
        const a = Lib.get(type, id);
        if (!a) continue;
        const urls = type === 'characters' ? [a.blipUrl, ...a.poses.flatMap((p) => [p.idleImageUrl, p.speakImageUrl, ...(p.poseStates || []).map((s) => s.imageUrl)])]
          : type === 'backgrounds' ? [a.url, a.deskUrl] : [a.url];
        if (urls.some((u) => u && !Lib.isAvailableOffline(u))) notDownloaded++;
      }
    }
    const boxIds = new Set();
    const ch = App.project.options.chatbox;
    if (ch != null && !/^[0-4]$/.test(String(ch))) boxIds.add(String(ch));
    for (const f of frames()) for (const a of f.actions || []) if (a.actionId === 12 && a.actionParam && !/^[0-4]$/.test(String(a.actionParam))) boxIds.add(String(a.actionParam));
    missing.textboxes = [...boxIds].filter((id) => !Lib.textbox(id));
    const total = Object.values(missing).reduce((s, l) => s + l.length, 0);
    return { missing, total, notDownloaded };
  }

  async function checkMissing(afterOpen = false) {
    const s = missingSummary();
    if (!s.total && !s.notDownloaded) { if (!afterOpen) toast(tx('Все ресурсы проекта уже есть в библиотеке')); return; }
    const parts = [];
    if (s.missing.characters.length) parts.push(tx`персонажей: ${s.missing.characters.length}`);
    if (s.missing.backgrounds.length) parts.push(tx`фонов: ${s.missing.backgrounds.length}`);
    if (s.missing.music.length) parts.push(tx`музыки: ${s.missing.music.length}`);
    if (s.missing.sounds.length) parts.push(tx`звуков: ${s.missing.sounds.length}`);
    if (s.missing.textboxes.length) parts.push(tx`текстбоксов: ${s.missing.textboxes.length}`);
    if (s.missing.evidence.length) parts.push(tx`улик: ${s.missing.evidence.length}`);
    if (s.missing.popups.length) parts.push(tx`картинок: ${s.missing.popups.length}`);
    if (s.notDownloaded) parts.push(tx`не до конца скачанных ресурсов: ${s.notDownloaded}`);
    const ok = await confirmDialog(tx`В библиотеке не хватает ресурсов этого проекта (${parts.join(', ')}).\n\nСкачать их с objection.lol? Нужен интернет. После этого проект будет открываться без интернета.`, { ok: tx('Скачать'), cancel: tx('Позже') });
    if (!ok) return;
    try {
      const folder = (App.fileName || '').replace(/\.[^.]+$/, '').trim() || tx('Проект');
      const r = await runDownload(tx('Скачивание ресурсов проекта'), () => window.api.download.project(App.project, folder));
      onLibraryChanged();
      await showReport(r, tx('Ресурсы проекта'));
    } catch (e) {
      toast(tx('Не получилось скачать: ') + e.message, 6000);
    }
  }

  function onLibraryChanged() {
    App.player.stop();
    App.player.resetState();
    ImageCache.clear();
    App.player.setProject(App.project);
    renderFrames();
    renderInspector();
    showStill();
  }


  // ---------- Окно «Сцены» ----------
  async function openScenes() {
    await flushScene();
    let list = [];
    let archived = false;
    let page = 0;
    let perPage = Number(localStorage.getItem('oo.scenesPerPage')) || 10;
    const search = h('input', { class: 'input', type: 'search', placeholder: tx('Поиск по названию…'), style: { maxWidth: '260px' } });
    const tabBtns = h('div', { class: 'tabs', style: { margin: 0 } });
    const listEl = h('div', { class: 'scene-list' });
    const pager = h('div', { class: 'pager' });
    const per = h('select', { class: 'input', style: { width: '80px' } }, [5, 10, 20, 30, 40, 50].map((n) => h('option', { value: n }, n)));
    per.value = String(perPage);
    per.onchange = () => { perPage = Number(per.value); localStorage.setItem('oo.scenesPerPage', perPage); page = 0; render(); };
    const reload = async () => { list = await window.api.scenes.list(); render(); };
    const fmtDate = (t) => { try { return new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    const B = (label, title, fn, cls = '') => h('button', { class: 'btn small ' + cls, title, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
    function render() {
      tabBtns.innerHTML = '';
      const nAct = list.filter((x) => !x.archived).length;
      const nArc = list.length - nAct;
      tabBtns.append(
        h('button', { class: archived ? '' : 'on', onclick: () => { archived = false; page = 0; render(); } }, tx`Сцены (${nAct})`),
        h('button', { class: archived ? 'on' : '', onclick: () => { archived = true; page = 0; render(); } }, tx`Архив (${nArc})`));
      const q = search.value.trim().toLowerCase();
      const items = list.filter((x) => !!x.archived === archived && (!q || (x.name || '').toLowerCase().includes(q))).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      const pages = Math.max(1, Math.ceil(items.length / perPage));
      page = Math.min(page, pages - 1);
      listEl.innerHTML = '';
      for (const it of items.slice(page * perPage, page * perPage + perPage)) {
        const cur = it.id === App.sceneId;
        const row = h('div', { class: 'scene-row' + (cur ? ' cur' : ''), title: tx('Открыть'), onclick: () => openScene(it) },
          h('div', { class: 'scene-thumb' }, it.thumb ? h('img', { src: it.thumb }) : h('span', { class: 'ico' }, '🎬')),
          h('div', { class: 'scene-info' },
            h('div', { class: 'scene-name' }, (cur ? '● ' : '') + (it.name || tx('Без названия'))),
            h('div', { class: 'muted' }, tx`${it.frames || 0} кадр. · ${it.aspect || ''} · изменено ${fmtDate(it.updated)}${it.size ? ' · ' + fmtBytes(it.size) : ''}`)),
          h('div', { class: 'scene-actions' },
            B(tx('Открыть'), tx('Открыть сцену'), () => openScene(it), 'primary'),
            B('✎', tx('Переименовать'), async () => {
              const n = await UI.promptDialog(tx('Название сцены'), it.name || '');
              if (!n) return;
              await window.api.scenes.update(it.id, { name: n.trim() });
              if (it.id === App.sceneId) { App.sceneName = n.trim(); updateTitle(); autosave(); }
              reload();
            }),
            B('⧉', tx('Копия сцены'), async () => {
              const text = await window.api.scenes.get(it.id);
              await window.api.scenes.save({ ...it, id: uuid(), name: (it.name || tx('Сцена')) + tx(' (копия)'), filePath: null, archived: false }, text);
              toast(tx('Копия создана'));
              reload();
            }),
            B('💾', tx('Сохранить в файл .objection'), async () => {
              const p = JSON.parse(await window.api.scenes.get(it.id));
              const r = await window.api.project.save({ path: null, text: encodeProject(p), suggestedName: it.name || 'scene' });
              if (r) toast(tx('Сохранено: ') + r.name);
            }),
            archived ? B('↩', tx('Вернуть из архива'), async () => { await window.api.scenes.update(it.id, { archived: false }); reload(); })
              : B('📦', tx('В архив'), async () => { await window.api.scenes.update(it.id, { archived: true }); reload(); }),
            B('🗑', tx('Удалить навсегда'), async () => {
              if (it.id === App.sceneId) { toast(tx('Эта сцена сейчас открыта. Удалить можно только закрытую сцену')); return; }
              if (!(await confirmDialog(tx`Удалить сцену «${it.name || tx('Без названия')}» навсегда?`, { ok: tx('Удалить'), danger: true }))) return;
              await window.api.scenes.remove(it.id);
              reload();
            }, 'danger')));
        listEl.append(row);
      }
      if (!items.length) listEl.append(h('div', { class: 'muted', style: { padding: '20px', lineHeight: 1.6 } }, archived ? tx('В архиве пусто.') : tx('Здесь будут все сцены. Каждая сцена сохраняется сюда сама во время редактирования.')));
      // страницы: 1 2 3 … N
      pager.innerHTML = '';
      const go = (n) => { page = n; render(); };
      pager.append(h('button', { class: 'btn small', disabled: page === 0, onclick: () => go(page - 1) }, '‹'));
      const nums = new Set([0, pages - 1, page - 1, page, page + 1].filter((n) => n >= 0 && n < pages));
      let last = -1;
      for (const n of [...nums].sort((a, b) => a - b)) {
        if (n - last > 1) pager.append(h('span', { class: 'muted' }, '…'));
        pager.append(h('button', { class: 'btn small' + (n === page ? ' cur' : ''), onclick: () => go(n) }, n + 1));
        last = n;
      }
      pager.append(h('button', { class: 'btn small', disabled: page >= pages - 1, onclick: () => go(page + 1) }, '›'), h('div', { class: 'spacer' }), h('span', { class: 'muted' }, tx('на странице:')), per);
    }
    async function openScene(it) {
      if (it.id === App.sceneId) { m.close(); return; }
      await flushScene();
      let p;
      try { p = JSON.parse(await window.api.scenes.get(it.id)); } catch (e) { toast(tx('Не удалось открыть сцену: ') + e.message, 6000); return; }
      m.close();
      setProject(p, { path: it.filePath || null, name: it.fileName || null, sceneId: it.id, sceneName: it.name || null });
      checkMissing(true);
    }
    search.addEventListener('input', () => { page = 0; render(); });
    const m = modal({
      title: tx('Сцены'), wide: true,
      body: [h('div', { class: 'toolbar' }, tabBtns, h('div', { class: 'spacer' }), search,
        h('button', { class: 'btn small primary', onclick: async () => { m.close(); await doNew(); } }, tx('＋ Новая сцена')),
        h('button', { class: 'btn small', onclick: async () => { m.close(); await doOpen(); } }, tx('Открыть файл…'))),
      listEl, pager],
    });
    await reload();
  }
  App.openScenes = openScenes;

  // ---------- Совместимость с objection.lol: что в проекте сайт не поймёт ----------
  function compatIssues(project) {
    const out = [];
    const frames = project.groups.flatMap((g) => g.frames);
    const add = (n, what) => out.push({ n, what });
    const at = (i) => tx`кадр ${i + 1}`;
    frames.forEach((f, i) => {
      const t = f.text || '';
      if (/\[#f[sml]\s*(?:c|#|:)\s*#?[0-9a-f]{3,6}\]/i.test(t)) add(i, tx`${at(i)}: вспышка своего цвета — на сайте будет обычная`);
      if (window.Tags.parseText(t).some((x) => x.type === 'text' && x.fmt)) add(i, tx`${at(i)}: оформление текста (курсив, размер…) — на сайте не работает`);
      if (f.wideSpot) add(i, tx`${at(i)}: своя стойка на широком фоне — на сайте персонажи встанут по-своему`);
      if (f.effect && (f.effect.fadeInMs || f.effect.fadeOutMs)) add(i, tx`${at(i)}: плавный фильтр — на сайте включится сразу`);
      if (Array.isArray(f.extraEffects) && f.extraEffects.some((e) => e && e.type)) add(i, tx`${at(i)}: несколько фильтров — на сайте будет только первый`);
      if (window.PlayerUtil.effectsOf(f).some((e) => !['grayscale', 'sepia', 'invert', 'hue-rotate', 'brightness'].includes(e.type))) add(i, tx`${at(i)}: фильтр, которого нет на сайте (контрастность, насыщенность, «Сепия + негатив», наложение, виньетка, зерно, размытие, резкость)`);
      if (f.popupFx && f.popupFx.blend) add(i, tx`${at(i)}: режим наложения картинки — на сайте его нет`);
      if (f.fade && f.fade.onlyThisFrame) add(i, tx`${at(i)}: затемнение «только на этот кадр» — на сайте останется`);
      if ((f.actions || []).some((a) => a.actionId === 7 && String(a.actionParam || '').startsWith('c'))) add(i, tx`${at(i)}: своя заставка — на сайте не покажется`);
      if (f.charOpacity != null && Number(f.charOpacity) < 100) add(i, tx`${at(i)}: полупрозрачный персонаж — на сайте будет обычный`);
      const pp = f.popupId ? Lib.get('popups', f.popupId) : null;
      if (pp && pp.blend && pp.blend !== 'source-over') add(i, tx`${at(i)}: режим наложения картинки «${pp.name}» — на сайте его нет`);
      if (pp && pp.fill) add(i, tx`${at(i)}: картинка «${pp.name}» растянута на весь кадр — на сайте она будет своего размера`);
      if (pp && ((pp.opacity != null && Number(pp.opacity) < 100) || Number(pp.fadeInMs) > 0 || Number(pp.fadeOutMs) > 0)) add(i, tx`${at(i)}: прозрачность или плавное появление картинки «${pp.name}» — на сайте её нет`);
      if (f.pairAllTalk && f.pair) add(i, tx`${at(i)}: «Говорят все в паре» — на сайте говорит только один персонаж`);
      if (f.popupFx && Object.keys(f.popupFx).some((k) => k !== 'blend')) add(i, tx`${at(i)}: своя прозрачность или плавность картинки в кадре — на сайте её нет`);
      if (f.evidenceSide) add(i, tx`${at(i)}: сторона значка улики закреплена в кадре — на сайте она зависит от говорящего`);
      if (/\[#(bgmse|bgmfoe|bgsse|bgsfoe|evdhe)\]/i.test(t)) add(i, tx`${at(i)}: тег «в конце кадра» ([#…e]) — на сайте его нет`);
      if (/\[#bgsfoe?\]/i.test(t)) add(i, tx`${at(i)}: плавное заглушение звуков [#bgsfo] — на сайте его нет`);
      for (const x of window.Tags.parseText(t)) {
        if (x.cmd !== 'sound') continue;
        const a = Lib.sound(x.id);
        if (a && (Number(a.fadeInMs) > 0 || Number(a.fadeOutMs) > 0)) add(i, tx`${at(i)}: у звука «${a.name}» плавное появление/угасание — на сайте звук играет как есть`);
      }
      if (/\[#evdi\d+\s*[lr]\]/i.test(t)) add(i, tx`${at(i)}: значок улики со стороной ([#evdi…l/r]) — на сайте сторона зависит от говорящего`);
      for (const x of window.Tags.parseText(t)) {
        if (x.cmd !== 'evidence') continue;
        const e = Lib.get('evidence', x.id);
        if (e && e.transparentBg) add(i, tx`${at(i)}: улика «${e.name}» на весь экран без чёрного фона — на сайте фон будет чёрным`);
      }
      const c = Lib.char(f.characterId);
      if (c && c.nameColor) add(i, tx`${at(i)}: свой цвет имени у «${c.name}» — на сайте будет цвет текстбокса`);
    });
    const po = project.options || {};
    if (po.evidenceAnim && po.evidenceAnim !== 'scale') add(-1, tx('настройки проекта: своё появление значка улики — на сайте он вырастает из точки'));
    if (po.evidenceSide && po.evidenceSide !== 'auto') add(-1, tx('настройки проекта: значок улики закреплён с одной стороны — на сайте сторона зависит от говорящего'));
    for (const p of project.pairs || []) if ((p.pairs || []).length > 5) add(-1, tx`пара «${p.name || p.id}»: ${p.pairs.length} персонажей — на сайте покажутся только первые 5`);
    return out;
  }
  function showCompatReport() {
    const list = compatIssues(App.project);
    // одинаковые замечания про цвет имени — одной строкой
    const seen = new Set();
    const rows = list.filter((x) => { const k = x.what.replace(/^кадр \d+: /, ''); if (/цвет имени|картинки «/.test(k)) { if (seen.has(k)) return false; seen.add(k); } return true; });
    modal({
      title: tx('Совместимость с objection.lol'),
      body: [
        rows.length ? h('div', { class: 'note' }, tx`Найдено: ${rows.length}. Остальное в проекте сайт поддерживает.`) : h('div', { class: 'note' }, tx('✓ Всё в проекте есть и на objection.lol.')),
        rows.length ? h('div', { class: 'compat-list' }, rows.slice(0, 300).map((x) => h('div', { class: 'compat-row' + (x.n >= 0 ? ' link' : ''), onclick: () => { if (x.n >= 0) { ensureVisible(x.n); select(x.n); document.querySelector(`.frame[data-idx="${x.n}"]`)?.scrollIntoView({ block: 'center' }); } } }, x.what))) : null,
        h('div', { class: 'note' }, tx('Свои текстбоксы переносятся на сайт отдельно; их обводка, скрытое имя и разметка «от картинки» там не работают.')),
      ],
    });
  }

  // ---------- Размер текста реплик в списке кадров (настройка программы, не проекта) ----------
  const FRAME_FONT_DEF = 13.5;
  function applyFrameFont() {
    let v = Number(localStorage.getItem('oo.frameFont'));
    if (!(v >= 10 && v <= 32)) v = FRAME_FONT_DEF;
    document.documentElement.style.setProperty('--frame-font', v + 'px');
    return v;
  }
  function openFrameFontDialog() {
    const cur = applyFrameFont();
    const num = h('input', { class: 'input', type: 'number', min: 10, max: 32, step: 0.5, value: cur, style: { width: '80px', flex: 'none' } });
    const rng = h('input', { type: 'range', min: 10, max: 32, step: 0.5, value: cur, style: { flex: 1 } });
    const set = (v) => {
      v = Math.max(10, Math.min(32, Number(v) || FRAME_FONT_DEF));
      num.value = v; rng.value = v;
      if (v === FRAME_FONT_DEF) localStorage.removeItem('oo.frameFont'); else localStorage.setItem('oo.frameFont', String(v));
      applyFrameFont();
    };
    rng.addEventListener('input', () => set(rng.value));
    num.addEventListener('change', () => set(num.value));
    modal({
      title: tx('Размер текста в списке кадров'),
      body: [
        h('div', { class: 'note' }, tx('Меняется только шрифт реплик в левой панели программы, на видео это не влияет. Настройка общая для всех проектов.')),
        h('div', { class: 'slider-row' }, h('label', null, tx('Размер, px')), rng, num),
      ],
      foot: [h('button', { class: 'btn', onclick: () => set(FRAME_FONT_DEF) }, tx('↺ Как было (') + FRAME_FONT_DEF + ')')],
    });
  }

  // ---------- Настройки проекта ----------
  function openSettings(tab = 'main') {
    const o = App.project.options;
    pushUndo();
    const field = (label, ctl) => h('div', { class: 'field' }, h('label', null, label), ctl);
    const numIn = (key, def) => h('input', { class: 'input', type: 'number', value: o[key] ?? def, onchange: (e) => { o[key] = Number(e.target.value) || def; markDirty(); } });
    const ar = h('select', { class: 'input', onchange: (e) => { o.aspectRatio = e.target.value; markDirty(); } },
      [['16:9', tx('16:9 (широкий, для YouTube)')], ['21:9', tx('21:9 (кино, ультраширокий)')], ['4:3', '4:3 (Nintendo DS)'], ['3:2', '3:2 (GBA / iOS)'], ['9:16', tx('9:16 (вертикальное: TikTok, Shorts)')]].map(([v, l]) => h('option', { value: v }, l)));
    ar.value = o.aspectRatio || '3:2';

    const aliasBox = h('div');
    // список имён с табличек: сначала персонажи этого проекта, потом вся библиотека; уже заменённые не показываем
    const allNames = () => {
      const used = new Set();
      for (const f of App.project.groups.flatMap((g) => g.frames)) { const c = Lib.char(f.characterId); if (c) used.add(c.nameplate || c.name); for (const e of f.pair ? (App.project.pairs.find((p) => p.id === f.pair.id)?.pairs || []) : []) { const pc = Lib.char(e.characterId); if (pc) used.add(pc.nameplate || pc.name); } }
      const rest = new Set();
      for (const c of Lib.list('characters')) { const n = c.nameplate || c.name; if (n && !used.has(n)) rest.add(n); }
      const cmp = (a, b) => a.localeCompare(b);
      return { project: [...used].filter(Boolean).sort(cmp), library: [...rest].sort(cmp) };
    };
    const renderAliases = () => {
      aliasBox.innerHTML = '';
      const names = allNames();
      App.project.aliases.forEach((a, i) => {
        const free = (arr) => { const taken = new Set(App.project.aliases.filter((x, j) => j !== i).map((x) => x.from)); return arr.filter((n) => !taken.has(n)); };
        const same = Lib.list('characters').filter((c) => (c.nameplate || c.name) === a.from);
        aliasBox.append(h('div', { class: 'list-row' },
          UI.comboInput({
            value: a.from, placeholder: tx('Имя на табличке (из списка)'),
            title: same.length > 1 ? tx`Это имя у ${same.length} персонажей — заменится у всех: ` + same.map((c) => c.name).join(', ') : '',
            groups: () => [{ title: tx('В этом проекте'), items: free(names.project) }, { title: tx('Вся библиотека'), items: free(names.library) }],
            onInput: (v) => { a.from = v; markDirty(); },
            onPick: () => renderAliases(),
          }),
        h('span', null, '→'),
        h('input', { class: 'input', value: a.to, placeholder: tx('Заменить на'), oninput: (e) => { a.to = e.target.value; markDirty(); } }),
        h('button', { class: 'btn small', onclick: () => { App.project.aliases.splice(i, 1); markDirty(); renderAliases(); } }, '✕')));
      });
    };
    renderAliases();

    const pairBox = h('div');
    const renderPairs = () => {
      pairBox.innerHTML = '';
      App.project.pairs.forEach((p, i) => {
        const faces = (p.pairs || []).map((e) => { const c = Lib.char(e.characterId); return c ? UI.thumbImg(c.iconUrl || c.poses?.[0]?.idleImageUrl, c.iconUrl ? 'icon' : 'char', '👤') : h('span', null, '?'); });
        pairBox.append(h('div', { class: 'list-row pair-row' },
          h('input', { class: 'input', value: p.name || '', placeholder: tx('Название пары'), style: { flex: 1 }, oninput: (e) => { p.name = e.target.value; markDirty(); } }),
          h('div', { class: 'pair-faces' }, faces.length ? faces : h('span', { class: 'muted' }, tx('пусто'))),
          h('button', { class: 'btn small primary', onclick: () => openPairEditor(p, null, renderPairs) }, tx('Настроить…')),
          h('button', { class: 'btn small', title: tx('Сохранить пару в пресеты (будет доступна во всех проектах)'), onclick: async () => {
            const name = await UI.promptDialog(tx('Название пресета пары'), p.name || tx('Пара'));
            if (!name) return;
            await savePreset('pairs', { name: name.trim(), pairs: JSON.parse(JSON.stringify(p.pairs || [])) });
            toast(tx('Пара сохранена в пресеты'));
          } }, '💾'),
          h('button', { class: 'btn small', title: tx('Копия пары (то же самое, отдельно настраивается)'), onclick: () => { clonePair(p); markDirty(); renderPairs(); } }, '⧉'),
          h('button', { class: 'btn small danger', onclick: () => { App.project.pairs.splice(i, 1); markDirty(); renderPairs(); } }, '✕')));
      });
    };
    renderPairs();

    // кнопка «по умолчанию» показывает, совпадают ли текущие настройки с сохранёнными умолчаниями
    const sameAsDefault = () => {
      const d = defaultOptions(); const cur = pickOptions(o);
      if (!Object.keys(d).length) return false;
      return OPTION_KEYS.every((k) => JSON.stringify(cur[k] ?? null) === JSON.stringify(d[k] ?? null));
    };
    const defBtn = h('button', { class: 'btn small', onclick: async () => {
      await window.api.lib.setPresets('optionsDefault', [{ name: 'default', options: pickOptions(o) }]);
      (Lib.data.presets = Lib.data.presets || {}).optionsDefault = [{ name: 'default', options: pickOptions(o) }];
      toast(tx('Теперь новые проекты создаются с этими настройками'));
      refreshDef();
    } });
    const refreshDef = () => {
      const same = sameAsDefault();
      const has = Object.keys(defaultOptions()).length > 0;
      defBtn.textContent = same ? tx('✓ Это настройки по умолчанию') : has ? tx('⭐ По умолчанию для новых (изменено)') : tx('⭐ По умолчанию для новых');
      defBtn.classList.toggle('primary', !same && has);
      defBtn.title = same ? tx('Новые проекты создаются ровно с такими настройками') : has ? tx('Настройки отличаются от сохранённых умолчаний — нажатие сохранит текущие') : tx('Новые проекты будут создаваться с этими настройками');
    };
    refreshDef();
    const optPresetBar = h('div', { class: 'toolbar', style: { marginBottom: '8px' } },
      h('button', { class: 'btn small', title: tx('Скорость текста, паузы, текстбокс, соотношение сторон — в пресет, чтобы потом применить к другому проекту'), onclick: async () => {
        const name = await UI.promptDialog(tx('Название пресета настроек'), tx('Пресет настроек'));
        if (!name) return;
        await savePreset('options', { name: name.trim(), options: pickOptions(o) });
        toast(tx('Настройки сохранены в пресет'));
      } }, tx('💾 Настройки в пресет…')),
      h('button', { class: 'btn small', onclick: async () => {
        const pr = await pickPreset('options', tx('Применить пресет настроек'), (x) => describeOptions(x.options || {}));
        if (!pr) return;
        Object.assign(o, JSON.parse(JSON.stringify(pr.options || {})));
        markDirty(); m.close(); openSettings();
        toast(tx`Применён пресет «${pr.name}»`);
      } }, tx('📂 Из пресета…')),
      defBtn,
      defaultOptions() && Object.keys(defaultOptions()).length ? h('button', { class: 'btn small', title: tx('Новые проекты снова со стандартными настройками сайта'), onclick: async () => {
        await window.api.lib.setPresets('optionsDefault', []);
        Lib.data.presets.optionsDefault = [];
        toast(tx('Новые проекты — со стандартными настройками'));
      } }, tx('↺ Сбросить умолчания')) : null);
    const m = modal({
      title: tx('Настройки проекта'),
      body: [
        optPresetBar,
        h('div', { class: 'row' }, field(tx('Соотношение сторон'), ar), field(tx('Скорость текста, мс/буква'), numIn('textSpeed', 35))),
        h('div', { class: 'row' }, field(tx('Окно текста (текстбокс)'), (() => {
          const wrap = h('div');
          const put = () => { wrap.innerHTML = ''; wrap.append(textboxButton(String(o.chatbox ?? '0'), (v) => { o.chatbox = v ?? '0'; markDirty(); put(); })); };
          put();
          return wrap;
        })()), field(tx('Пауза перед текстом, мс'), h('input', { class: 'input', type: 'number', min: 0, value: o.textStartDelay ?? 300, title: tx('На objection.lol текст начинается примерно через 300 мс после появления персонажа'), onchange: (e) => { o.textStartDelay = Math.max(0, Number(e.target.value) || 0); markDirty(); } }))),
        h('div', { class: 'row' }, field(tx('Частота «бипа», мс (не меньше 25)'), numIn('textBlipFrequency', 64)), field(tx('Пауза между кадрами, мс'), numIn('autoplaySpeed', 500))),
        h('div', { class: 'row' }, field(tx('Цвет вспышек по умолчанию ([#fs], [#fm], [#fl] и вспышки поз; у отдельной вспышки свой цвет — [#fmcFF0000])'), h('div', { class: 'picker-line', style: { alignItems: 'center' } },
          h('input', { type: 'color', value: o.flashColor || '#ffffff', oninput: (e) => { if (e.target.value.toLowerCase() === '#ffffff') delete o.flashColor; else o.flashColor = e.target.value; markDirty(); } }),
          h('button', { class: 'btn small', type: 'button', onclick: (e) => { delete o.flashColor; e.target.previousSibling.value = '#ffffff'; markDirty(); } }, tx('Белый')))), h('div')),
        h('div', { class: 'row' },
          field(tx('Значок улики ([#evdiN]): появление'), h('select', { class: 'input', onchange: (e) => { if (e.target.value === 'scale') delete o.evidenceAnim; else o.evidenceAnim = e.target.value; markDirty(); showStill(); } },
            [['scale', tx('Вырастает из точки (как на objection.lol)')], ['slide', tx('Выезжает сбоку')], ['drop', tx('Опускается сверху')], ['fade', tx('Проявляется')]].map(([v, l]) => h('option', { value: v, selected: (o.evidenceAnim || 'scale') === v || null }, l)))),
          field(tx('Значок улики: сторона'), h('select', { class: 'input', onchange: (e) => { if (e.target.value === 'auto') delete o.evidenceSide; else o.evidenceSide = e.target.value; markDirty(); showStill(); } },
            [['auto', tx('По говорящему (как на objection.lol)')], ['left', tx('Всегда слева')], ['right', tx('Всегда справа')]].map(([v, l]) => h('option', { value: v, selected: (o.evidenceSide || 'auto') === v || null }, l))))),
        h('div', { class: 'section', style: { margin: '6px 0' } },
          h('label', { class: 'chk', title: tx('Проект для переноса на objection.lol: в паре не больше 5 персонажей, в меню тегов нет своих функций (цветные вспышки, оформление текста)') },
            h('input', { type: 'checkbox', checked: !!o.siteCompat, onchange: (e) => { if (e.target.checked) o.siteCompat = true; else delete o.siteCompat; markDirty(); renderFrames(); showStill(); if (e.target.checked) showCompatReport(); } }),
            tx('Совместимость с objection.lol (только то, что умеет сайт)')),
          h('button', { class: 'btn small', style: { marginTop: '4px' }, onclick: () => showCompatReport() }, tx('Проверить проект на совместимость…'))),
        h('label', { class: 'chk', style: { margin: '4px 0' }, title: tx('На objection.lol затемнённое место пары остаётся пустым, пока не сделать «Проявление», даже если на нём уже другой персонаж. По умолчанию программа сбрасывает затемнение, когда на месте меняется персонаж.') },
          h('input', { type: 'checkbox', checked: !!o.strictCharacterFades, onchange: (e) => { if (e.target.checked) o.strictCharacterFades = true; else delete o.strictCharacterFades; markDirty(); } }),
          tx('Затемнение персонажей строго как на сайте (держится, даже если в кадре уже другие персонажи)')),
        h('label', { class: 'chk', style: { margin: '4px 0' }, title: tx('Если у персонажа в библиотеке выбран свой текстбокс, он включается, когда говорит этот персонаж. Если выключено — у всех один текстбокс проекта.') },
          h('input', { type: 'checkbox', checked: o.useCharacterTextboxes !== false, onchange: (e) => { if (e.target.checked) delete o.useCharacterTextboxes; else o.useCharacterTextboxes = false; markDirty(); } }),
          tx('Свои текстбоксы персонажей (задаются в библиотеке, у персонажа)')),
        h('div', { class: 'row' }, field(tx('Поднять окно текста, % высоты кадра'), h('input', { class: 'input', type: 'number', min: 0, max: 60, placeholder: tx('авто (9:16 — 15, иначе 0; вертикальный текстбокс не поднимается)'), value: o.textboxLift ?? '', title: tx('Для вертикального видео: внизу экрана TikTok/Shorts кнопки закрывают текст'), onchange: (e) => { if (e.target.value === '') delete o.textboxLift; else o.textboxLift = Math.max(0, Math.min(60, Number(e.target.value) || 0)); markDirty(); } })), h('div')),
        h('div', { class: 'section', id: 'aliasSec' }, h('h4', null, tx('Замена имён на табличках')),
          h('div', { class: 'note' }, tx('Например, «Phoenix» → «Максим»: у всех кадров с этим именем на табличке будет новое. Имя выбирается из списка: сначала персонажи этого проекта, потом вся библиотека. Если имя одинаковое у нескольких персонажей, заменится у всех (как на сайте).')),
          aliasBox, h('div', { class: 'toolbar' },
            h('button', { class: 'btn small', onclick: () => { App.project.aliases.push({ from: '', to: '' }); renderAliases(); } }, tx('＋ Замена')),
            h('button', { class: 'btn small', title: tx('Сохранить все замены имён в пресет'), onclick: async () => {
              const list = App.project.aliases.filter((a) => a.from);
              if (!list.length) { toast(tx('Нет замен для сохранения')); return; }
              const name = await UI.promptDialog(tx('Название пресета замен'), tx('Замены имён'));
              if (!name) return;
              await savePreset('aliases', { name: name.trim(), list: JSON.parse(JSON.stringify(list)) });
              toast(tx('Замены сохранены в пресеты'));
            } }, tx('💾 В пресеты…')),
            h('button', { class: 'btn small', title: tx('Добавить замены из пресета'), onclick: async () => {
              const pr = await pickPreset('aliases', tx('Замены имён из пресета'), (x) => (x.list || []).map((a) => `${a.from} → ${a.to}`).join(', '));
              if (!pr) return;
              for (const a of pr.list || []) {
                const ex = App.project.aliases.find((x) => x.from === a.from);
                if (ex) ex.to = a.to; else App.project.aliases.push({ from: a.from, to: a.to });
              }
              markDirty(); renderAliases();
            } }, tx('📂 Из пресета…')))),
        h('div', { class: 'section', id: 'pairSec' }, h('h4', null, tx('Пары персонажей')),
          h('div', { class: 'note' }, tx('Пара показывает несколько персонажей сразу (до 10; на objection.lol — до 5, лишние там не покажутся). Говорит тот, кто выбран в кадре, остальные стоят рядом. «Настроить…» — расстановка с предпросмотром.')),
          pairBox, h('div', { class: 'toolbar' },
            h('button', { class: 'btn small', onclick: () => { const np = { id: uuid(), name: tx('Пара ') + (App.project.pairs.length + 1), pairs: [] }; App.project.pairs.push(np); markDirty(); renderPairs(); openPairEditor(np, null, renderPairs); } }, tx('＋ Пара')),
            h('button', { class: 'btn small', onclick: async () => {
              const pr = await pickPreset('pairs', tx('Пара из пресета'), (x) => tx`${(x.pairs || []).length} перс.: ` + (x.pairs || []).map((e) => Lib.char(e.characterId)?.name || e.characterId).join(', '));
              if (!pr) return;
              App.project.pairs.push({ id: uuid(), name: pr.name, pairs: JSON.parse(JSON.stringify(pr.pairs || [])) });
              markDirty(); renderPairs();
            } }, tx('📂 Пара из пресета…')))),
      ],
      onClose: () => { App.player.setProject(App.project); renderFrames(); renderInspector(); showStill(); },
    });
    if (tab === 'pairs') setTimeout(() => m.el.querySelector('#pairSec').scrollIntoView(), 50);
    // любое изменение в окне — пересчитать, совпадает ли с умолчаниями
    for (const ev of ['input', 'change', 'click']) m.el.addEventListener(ev, () => setTimeout(refreshDef, 0));
  }

  function describeOptions(x) {
    const parts = [];
    if (x.textSpeed != null) parts.push(tx`текст ${x.textSpeed} мс`);
    if (x.autoplaySpeed != null) parts.push(tx`пауза ${x.autoplaySpeed} мс`);
    if (x.textBlipFrequency != null) parts.push(tx`бип ${x.textBlipFrequency} мс`);
    if (x.textStartDelay != null) parts.push(tx`перед текстом ${x.textStartDelay} мс`);
    if (x.aspectRatio) parts.push(x.aspectRatio);
    return parts.join(', ');
  }
  // ---------- Пресеты пар и замен имён (общие для всех проектов, хранятся в библиотеке) ----------
  async function savePreset(kind, item) {
    const P = (Lib.data.presets = Lib.data.presets || {});
    const list = (P[kind] = P[kind] || []);
    const i = list.findIndex((x) => x.name === item.name);
    if (i >= 0) {
      if (!(await confirmDialog(tx`Пресет «${item.name}» уже есть. Заменить?`, { ok: tx('Заменить') }))) return;
      list[i] = item;
    } else list.push(item);
    await window.api.lib.setPresets(kind, list);
  }
  function pickPreset(kind, title, describe) {
    return new Promise((resolve) => {
      let m;
      const body = h('div');
      const render = () => {
        body.innerHTML = '';
        const list = (Lib.data.presets && Lib.data.presets[kind]) || [];
        if (!list.length) body.append(h('div', { class: 'muted', style: { padding: '12px' } }, tx('Пресетов пока нет. Сохранение — кнопкой 💾.')));
        list.forEach((x, i) => body.append(h('div', { class: 'list-row', style: { alignItems: 'center' } },
          h('div', { style: { flex: 1, minWidth: 0 } }, h('b', null, x.name), h('div', { class: 'muted', style: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, describe(x))),
          h('button', { class: 'btn small primary', onclick: () => { resolve(x); m.close(); } }, tx('Добавить')),
          h('button', { class: 'btn small danger', title: tx('Удалить пресет'), onclick: async () => {
            if (!(await confirmDialog(tx`Удалить пресет «${x.name}»?`, { ok: tx('Удалить'), danger: true }))) return;
            list.splice(i, 1);
            await window.api.lib.setPresets(kind, list);
            render();
          } }, '🗑'))));
      };
      render();
      m = modal({ title, body, onClose: () => resolve(null) });
    });
  }

  // копия пары — сразу после исходной
  function clonePair(p) {
    const np = JSON.parse(JSON.stringify(p));
    np.id = uuid();
    const base = (p.name || tx('Пара')).replace(/ \(\d+\)$/, '');
    let n = 2;
    while (App.project.pairs.some((x) => x.name === `${base} (${n})`)) n++;
    np.name = `${base} (${n})`;
    const i = App.project.pairs.indexOf(p);
    App.project.pairs.splice(i < 0 ? App.project.pairs.length : i + 1, 0, np);
    return np;
  }

  // ---------- Редактор пары с предпросмотром ----------
  function openPairEditor(pair, frame, onDone) {
    if (frame) pushUndo(); // из настроек проекта отмена уже запомнена
    pair.pairs = pair.pairs || [];
    const ar = aspectOf(App.project.options);
    const cv = h('canvas', { class: 'pair-preview' });
    const pp = new window.Player(cv, App.audio);
    pp.setSize(Math.round(405 * ar), 405);
    const poses = {}; // позы для предпросмотра
    for (const e of pair.pairs) {
      const c = Lib.char(e.characterId);
      if (frame && frame.characterId === e.characterId) poses[e.characterId] = frame.poseId;
      else if (frame?.pair?.poseIds?.[e.characterId] != null) poses[e.characterId] = frame.pair.poseIds[e.characterId];
      else if (c) poses[e.characterId] = c.poses?.[0]?.id;
    }
    let bgId = frame ? (frame.backgroundId || App.player.bgIndex[App.sel]) : null;
    let speaker = frame?.characterId ?? pair.pairs[0]?.characterId;
    let t;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const sp = pair.pairs.some((e) => e.characterId === speaker) ? speaker : pair.pairs[0]?.characterId;
        const pf = { id: 1, text: '', actions: [], flipped: frame?.flipped || 0, characterId: sp, poseId: poses[sp], pair: { id: pair.id, poseIds: { ...poses } }, backgroundId: bgId || Lib.char(sp)?.backgroundId || undefined };
        pp.project = { ...App.project, groups: [{ frames: [pf] }] };
        pp.frames = [pf];
        pp.bgIndex = [pf.backgroundId];
        pp.showStill(0);
      }, 40);
    };
    const changed = () => { markDirty(); refresh(); };
    const bgBtn = h('button', { class: 'btn small', onclick: async () => {
      const r = await pickerDialog({ title: tx('Фон для предпросмотра'), type: 'backgrounds', items: Lib.list('backgrounds').map((b) => ({ id: b.id, name: b.name, thumb: { url: b.url, kind: 'bg' } })), selected: bgId, allowNone: true, noneLabel: tx('Фон персонажа') });
      if (r) { bgId = r.value; refresh(); }
    } }, tx('🏞 Фон предпросмотра…'));
    const list = h('div', { class: 'pair-members' });
    const slider = (e, key, label, min, max, step, def) => {
      const val = e[key] ?? def;
      const num = h('input', { class: 'input', type: 'number', min, max, step, value: val, style: { width: '74px', flex: 'none' } });
      const rng = h('input', { type: 'range', min, max, step, value: val, style: { flex: 1 } });
      const set = (v) => { e[key] = Number(v); num.value = v; rng.value = v; changed(); };
      rng.addEventListener('input', () => set(rng.value));
      num.addEventListener('change', () => set(num.value === '' ? def : num.value));
      return h('div', { class: 'slider-row' }, h('label', null, label), rng, num);
    };
    const render = () => {
      list.innerHTML = '';
      pair.pairs.forEach((e, k) => {
        const c = Lib.char(e.characterId);
        const poseSel = c ? h('select', { class: 'input', title: tx('Поза (только для предпросмотра; в кадре позы выбираются в настройках кадра)'), onchange: (ev) => { poses[e.characterId] = Number(ev.target.value); refresh(); } }, c.poses.map((p) => h('option', { value: p.id }, p.name))) : null;
        if (poseSel && poses[e.characterId] != null) poseSel.value = String(poses[e.characterId]);
        list.append(h('div', { class: 'pose-edit' },
          h('div', { class: 'ph' },
            h('b', { style: { width: '22px' } }, k + 1),
            h('button', { class: 'picker-btn', style: { flex: 1 }, onclick: async () => {
              const r = await pickerDialog({ title: tx('Персонаж пары'), type: 'characters', items: Lib.list('characters').map((a) => ({ id: a.id, name: a.name, thumb: a.iconUrl ? { url: a.iconUrl, kind: 'icon' } : { url: a.poses?.[0]?.idleImageUrl, kind: 'char' }, sub: sourceLabel(a) })), selected: e.characterId });
              if (r && r.value) { e.characterId = r.value; poses[r.value] = Lib.char(r.value)?.poses?.[0]?.id; changed(); render(); }
            } }, c ? UI.thumbImg(c.iconUrl || c.poses?.[0]?.idleImageUrl, c.iconUrl ? 'icon' : 'char') : null, h('span', { class: 'nm' }, c ? c.name : 'id ' + e.characterId)),
            h('label', { class: 'chk', title: tx('Показать в предпросмотре как говорящего') }, h('input', { type: 'radio', name: 'pairSpeaker', checked: speaker === e.characterId, onchange: () => { speaker = e.characterId; refresh(); } }), tx('говорит')),
            h('button', { class: 'btn small', title: tx('Раньше (место в паре влияет на затемнение и отражение)'), disabled: k === 0, onclick: () => { pair.pairs.splice(k - 1, 0, pair.pairs.splice(k, 1)[0]); changed(); render(); } }, '↑'),
            h('button', { class: 'btn small', title: tx('Позже'), disabled: k === pair.pairs.length - 1, onclick: () => { pair.pairs.splice(k + 1, 0, pair.pairs.splice(k, 1)[0]); changed(); render(); } }, '↓'),
            h('button', { class: 'btn small danger', title: tx('Убрать из пары'), onclick: () => { pair.pairs.splice(k, 1); changed(); render(); } }, '✕')),
          poseSel ? h('div', { class: 'slider-row' }, h('label', null, tx('Поза')), poseSel) : null,
          slider(e, 'offsetX', tx('Сдвиг X, %'), -100, 100, 0.5, 0),
          slider(e, 'offsetY', tx('Сдвиг Y, %'), -100, 100, 0.5, 0),
          slider(e, 'size', tx('Размер, %'), 10, 300, 1, 100),
          slider(e, 'front', tx('Слой'), -10, 10, 1, 0)));
      });
      const lim = window.PlayerUtil.pairLimit(App.project);
      if (pair.pairs.length >= lim) list.append(h('div', { class: 'note' }, tx`В паре может быть не больше ${lim} персонажей${lim === 5 ? tx(' (включена совместимость с objection.lol)') : ''}.`));
      if (pair.pairs.length > lim) list.append(h('div', { class: 'note warn' }, tx`Персонажи после ${lim}-го не показываются.`));
      else if (pair.pairs.length > 5) list.append(h('div', { class: 'note' }, tx('На objection.lol в паре до 5 персонажей: если открыть этот проект на сайте, лишние не покажутся.')));
    };
    render();
    refresh();
    let m;
    m = modal({
      title: tx('Пара: ') + (pair.name || tx('без названия')), wide: true,
      body: h('div', { class: 'pair-editor' },
        h('div', { class: 'pair-left' }, cv,
          h('div', { class: 'toolbar', style: { marginTop: '8px' } }, bgBtn),
          h('div', { class: 'note' }, tx('Сдвиг X считается от «своего» края персонажа (защита — слева, обвинение — справа). Слой: у кого больше, тот впереди. Можно поставить одного и того же персонажа дважды.'))),
        h('div', { class: 'pair-right' },
          h('div', { class: 'field' }, h('label', null, tx('Название пары')), h('input', { class: 'input', value: pair.name || '', oninput: (e) => { pair.name = e.target.value; markDirty(); } })),
          list,
          h('button', { class: 'btn small', disabled: pair.pairs.length >= window.PlayerUtil.pairLimit(App.project), onclick: () => {
            if (pair.pairs.length >= window.PlayerUtil.pairLimit(App.project)) return;
            const cid = speaker ?? Lib.list('characters')[0]?.id;
            pair.pairs.push({ characterId: cid, front: 0, offsetX: 0, offsetY: 0, size: 100 });
            if (cid != null && poses[cid] == null) poses[cid] = Lib.char(cid)?.poses?.[0]?.id;
            changed(); render();
          } }, tx('＋ Персонаж')))),
      foot: [h('button', { class: 'btn primary', onclick: () => m.close() }, tx('Готово'))],
      onClose: () => { pp.destroy(); App.player.setProject(App.project); renderFrames(); renderInspector(); showStill(); onDone && onDone(); },
    });
  }

  // ---------- Экспорт ----------
  async function openExport() {
    App.player.stop();
    const fast = window.Exporter.fastSupported();
    const field = (label, ctl) => h('div', { class: 'field' }, h('label', null, label), ctl);
    const res = h('select', { class: 'input' }, [[144, '144p'], [240, '240p'], [360, '360p'], [480, '480p'], [720, '720p'], [1080, '1080p'], [1440, '1440p (2K)'], [2160, tx('2160p (4K) — долго, много памяти')], [4320, tx('4320p (8K) — очень долго, нужно 8+ ГБ ОЗУ')]].filter(([v]) => !(v > 2160 && window.api && window.api.arch === 'ia32') && !(v > 1440 && window.api && window.api.mobile)).map(([v, l]) => h('option', { value: v }, l)));
    res.value = localStorage.getItem('oo.exportRes') || '720';
    const ar = h('select', { class: 'input' }, [['', tx('Как в проекте (') + (App.project.options.aspectRatio || '3:2') + ')'], ['16:9', '16:9'], ['21:9', tx('21:9 (кино, ультраширокий)')], ['4:3', '4:3 (Nintendo DS)'], ['3:2', '3:2 (GBA / iOS)'], ['9:16', tx('9:16 (вертикальное)')]].map(([v, l]) => h('option', { value: v }, l)));
    const fps = h('select', { class: 'input' }, [[30, tx('30 кадров/с')], [60, tx('60 кадров/с')]].map(([v, l]) => h('option', { value: v }, l)));
    const resume = h('input', { type: 'checkbox', checked: $('chkResumeMusic').checked });
    const quality = h('select', { class: 'input' }, [['high', tx('Высокое')], ['medium', tx('Обычное (рекомендуется)')], ['small', tx('Сжатое')], ['tiny', tx('Очень сжатое (самый маленький файл)')]].map(([v, l]) => h('option', { value: v }, l)));
    quality.value = localStorage.getItem('oo.exportQuality2') || 'medium';
    const watch = h('input', { type: 'checkbox', checked: !!localStorage.getItem('oo.exportWatch') });
    const cq = h('input', { type: 'checkbox', checked: !!localStorage.getItem('oo.exportCQ') });
    // кодек — как в монтажных программах; недоступные на этом компьютере помечаем
    const CODEC_INFO = { auto: tx('Авто (H.264 — открывается везде)'), avc: tx('H.264 (AVC) — совместим со всеми плеерами и сайтами'), hevc: tx('H.265 (HEVC) — файл ~30% меньше, нужна поддержка видеокартой'), vp9: tx('VP9 — файл ~25% меньше, хорошо для YouTube/браузеров'), av1: tx('AV1 — самый маленький файл, кодирует медленнее; старые плееры не откроют') };
    const codec = h('select', { class: 'input' }, Object.entries(CODEC_INFO).map(([v, l]) => h('option', { value: v }, l)));
    codec.value = localStorage.getItem('oo.exportCodec') || 'auto';
    const codecNote = h('div', { class: 'muted', style: { fontSize: '12px', margin: '-6px 0 8px' } });
    window.Exporter.availableCodecs && window.Exporter.availableCodecs().then((av) => {
      for (const o of codec.options) if (o.value !== 'auto' && !av[o.value]) { o.textContent = CODEC_INFO[o.value] + tx(' — нет на этом компьютере'); }
      const updNote = () => { codecNote.textContent = codec.value !== 'auto' && !av[codec.value] ? tx('Этого кодека нет на этом компьютере — будет использован H.264.') : ''; };
      codec.addEventListener('change', updNote); updNote();
    }).catch(() => {});
    const from = h('input', { class: 'input', type: 'number', min: 1, max: frames().length, value: 1 });
    const to = h('input', { class: 'input', type: 'number', min: 1, max: frames().length, value: frames().length });
    const sizeInfo = h('span', { class: 'muted' });
    const est = estimateDuration(0, frames().length);
    const upd = () => {
      const a = ar.value ? aspectOf({ aspectRatio: ar.value }) : aspectOf(App.project.options);
      const { w, h: hh } = window.Exporter.sizeFor(Number(res.value), a);
      const vb = Math.round(window.Exporter.bitrateFor(w, hh, Number(fps.value), quality.value) * ((window.Exporter.CODECS[codec.value] || {}).eff || 1));
      const ab = window.Exporter.QUALITY[quality.value].audio;
      const secs = estimateDuration(Math.max(0, Number(from.value) - 1), Math.min(frames().length, Number(to.value)));
      // на статичных сценах кодек тратит намного меньше заданного — оценка сверху
      sizeInfo.textContent = tx`Размер кадра: ${w}×${hh} · поток до ${(vb / 1e6).toFixed(1)} Мбит/с · файл примерно до ${fmtBytes(((vb + ab) * secs) / 8)}`;
      if (Number(res.value) >= 2160) sizeInfo.textContent += ' · ⚠ ' + (Number(res.value) >= 4320 ? tx('8K: экспорт в разы дольше, нужно много оперативной памяти; не все видеокарты и плееры умеют 8K H.264') : tx('4K: экспорт заметно дольше и требует больше памяти'));
    };
    [res, ar, fps, quality, from, to, codec].forEach((el) => el.addEventListener('change', upd));
    upd();
    let m;
    const go = h('button', { class: 'btn primary', onclick: () => m.close({
      height: Number(res.value), fps: Number(fps.value), resumeMusic: resume.checked, quality: quality.value, watch: watch.checked, constQuality: cq.checked, codec: codec.value,
      aspect: ar.value ? aspectOf({ aspectRatio: ar.value }) : null,
      from: Math.max(0, Number(from.value) - 1), to: Math.min(frames().length, Number(to.value)),
    }) }, tx('Сохранить видео…'));
    m = modal({
      title: tx('Экспорт видео'),
      body: [
        h('div', { class: 'row' }, field(tx('Качество'), res), field(tx('Соотношение сторон'), ar), field(tx('Частота'), fps)),
        h('div', { class: 'row' }, field(tx('Качество и размер файла'), quality), field(tx('Кодек (файл всегда MP4)'), codec)),
        codecNote,
        h('div', { style: { margin: '-4px 0 10px' } }, sizeInfo),
        h('div', { class: 'row' }, field(tx('С кадра'), from), field(tx('По кадр'), to),
          h('div', { class: 'field' }, h('button', { class: 'btn small', onclick: () => { from.value = App.sel + 1; } }, tx('С выбранного')))),
        h('label', { class: 'chk', style: { margin: '2px 0 6px' } }, resume, tx('Если просмотр начинается не с первого кадра — включить музыку, которая играла раньше')),
        h('label', { class: 'chk', style: { margin: '2px 0 10px' } }, watch, tx('Смотреть видео во время экспорта, со звуком (экспорт идёт в реальном времени, как запись с экрана)')),
        h('label', { class: 'chk', style: { margin: '2px 0 10px' }, title: tx('Кодек держит одинаковое качество каждого кадра: тряска, вспышки и мягкие края GIF не рассыпаются на квадраты. Размер файла заранее неизвестен. Если видеокарта/система так не умеет — экспорт пойдёт обычным способом.') }, cq, tx('Постоянное качество (экспериментально — без «квадратов» на тряске; если не поддерживается, включится обычный режим)')),
        h('div', { class: 'note' }, fast
          ? tx`Видео рисуется кадр за кадром и кодируется видеокартой (если она не справится — процессором). Смотреть сцену целиком не нужно, получится обычный MP4 с перемоткой. Длина сцены примерно ${Math.max(1, Math.round(est / 60))} мин.`
          : tx('На этом компьютере нет кодировщика видео WebCodecs — видео будет записываться в реальном времени.')),
        missingSummary().total ? h('div', { class: 'note warn' }, tx('Некоторых ресурсов проекта нет в библиотеке — в видео их не будет. Файл → «Докачать ресурсы проекта».')) : null,
      ],
      foot: [h('button', { class: 'btn', onclick: () => m.close(null) }, tx('Отмена')), go],
    });
    const opts = await m.done;
    if (!opts) return;
    localStorage.setItem('oo.exportQuality2', opts.quality);
    localStorage.setItem('oo.exportRes', String(opts.height));
    localStorage.setItem('oo.exportCodec', opts.codec || 'auto');
    if (opts.constQuality) localStorage.setItem('oo.exportCQ', '1'); else localStorage.removeItem('oo.exportCQ');
    localStorage.setItem('oo.exportWatch', opts.watch ? '1' : '');
    const pd = exportProgress(opts.watch);
    App.exporting = true;
    const ctl = new AbortController();
    pd.onCancel(() => { ctl.abort(); pd.set(tx('Остановка…')); });
    try {
      const r = await window.Exporter.exportVideo(App.player, App.audio, {
        ...opts,
        suggestedName: (App.fileName || 'scene').replace(/\.objection$/i, ''),
        signal: ctl.signal,
        onProgress: (p) => pd.set(p.text || '', p.frac),
        onPreview: (c) => pd.preview(c),
      });
      pd.close();
      if (r) {
        const speed = r.took && r.seconds ? tx` за ${Math.round(r.took)} с (в ${(r.seconds / r.took).toFixed(1)} раза быстрее реального времени)` : '';
        toast(tx('Видео сохранено') + speed + (r.codecFallback ? tx(' (выбранного кодека нет — записано в ') + ((window.Exporter.CODECS[r.family] || {}).name || r.codec) + ')' : '') + ': ' + r.path, 8000);
      } else toast(tx('Экспорт отменён'));
    } catch (e) {
      pd.close();
      console.error(e);
      toast(tx('Ошибка экспорта: ') + (e && e.message ? e.message : e), 8000);
    }
    App.exporting = false;
    App.player.setProject(App.project);
    showStill();
  }

  // Окно хода экспорта с предпросмотром видео
  function exportProgress(big) {
    const label = h('div', null, tx('Подготовка…'));
    const bar = h('div');
    const cv = h('canvas', { class: 'export-preview' });
    const g = cv.getContext('2d');
    const cancelBtn = h('button', { class: 'btn' }, tx('Остановить'));
    const showBox = h('input', { type: 'checkbox', checked: true });
    const m = modal({ title: tx('Экспорт видео'), wide: big, body: [cv, h('label', { class: 'chk', style: { margin: '0 0 6px' } }, showBox, tx('Показывать видео')), label, h('div', { class: 'progress' }, bar)], foot: [cancelBtn], closable: false });
    showBox.addEventListener('change', () => { cv.style.display = showBox.checked ? '' : 'none'; });
    return {
      set(text, frac) { label.textContent = text; if (frac != null) bar.style.width = Math.round(frac * 100) + '%'; },
      preview(src) {
        if (!showBox.checked || !src.width) return;
        const w = big ? Math.min(960, src.width) : Math.min(560, src.width);
        const hh = Math.round((w * src.height) / src.width);
        if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
        g.drawImage(src, 0, 0, w, hh);
      },
      onCancel(fn) { cancelBtn.onclick = () => { cancelBtn.disabled = true; fn(); }; },
      close: () => m.close(),
    };
  }

  function estimateDuration(a, b) {
    let ms = 0;
    const o = App.project.options;
    let speed = o.textSpeed ?? 35;
    for (let i = a; i < b; i++) {
      const f = frames()[i];
      for (const a2 of f.actions || []) if (a2.actionId === 13) speed = Number(a2.actionParam) || speed;
      let sp = speed;
      for (const t of parseText(f.text || '')) {
        if (t.type === 'text') ms += t.text.length * sp;
        else if (t.cmd === 'pause') ms += t.ms;
        else if (t.cmd === 'text_speed') sp = t.value;
      }
      if (f.speechBubble) ms += 950;
      const hasText = plainText(f.text || '').length > 0;
      if (hasText) ms += o.textStartDelay ?? 300;
      if (!f.moveToNext && hasText) ms += o.autoplaySpeed ?? 500;
      ms += 30;
    }
    return ms / 1000;
  }

  // ---------- Привязка интерфейса ----------
  function bindUi() {
    const fileMenu = $('fileMenu');
    document.querySelector('[data-menu="file"]').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      fileMenu.style.left = r.left + 'px';
      fileMenu.classList.toggle('hidden');
      e.stopPropagation();
    });
    document.addEventListener('click', (e) => { if (!fileMenu.contains(e.target)) fileMenu.classList.add('hidden'); });
    fileMenu.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      fileMenu.classList.add('hidden');
      if (act === 'new') doNew();
      if (act === 'open') doOpen();
      if (act === 'save') doSave(false);
      if (act === 'saveas') doSave(true);
      if (act === 'bundle') exportBundle();
      if (act === 'download') checkMissing(false);
      if (act === 'libdir') openLibraryDirDialog();
      if (act === 'uifont') openFrameFontDialog();
      if (act === 'lang') switchLanguage();
      if (act === 'update') checkUpdates(true);
      if (act === 'code') downloadByCodeFlow('characters');
      if (act === 'mine') downloadMineFlow();
      if (act === 'login') loginFlow();
    });
    $('btnLibrary').onclick = () => openLibrary(libCtx());
    $('btnScenes').onclick = () => openScenes();
    $('btnSettings').onclick = () => openSettings();
    $('btnPlayAll').onclick = () => play(0);
    $('btnPlayHere').onclick = () => play(App.sel);
    $('btnStop').onclick = () => { App.player.stop(); showStill(); };
    $('btnExport').onclick = () => openExport();
    $('btnAddFrameTop').onclick = () => addFrame(0);
    $('frameSearch').addEventListener('input', (e) => { App.search = e.target.value; App.page = 0; renderFrames(); });
    if ($('btnFindReplace')) $('btnFindReplace').onclick = () => openFind(true);
    $('stage').addEventListener('click', () => { if (App.player.playing) App.player.click(); });
    $('chkManual').addEventListener('change', (e) => { localStorage.setItem('oo.manual', e.target.checked ? '1' : ''); });
    $('chkManual').checked = !!localStorage.getItem('oo.manual');
    $('chkResumeMusic').addEventListener('change', (e) => { localStorage.setItem('oo.resumeMusic', e.target.checked ? '1' : ''); });
    $('chkResumeMusic').checked = !!localStorage.getItem('oo.resumeMusic');

    App.player.on('frame', (i) => {
      $('playInfo').textContent = tx`Кадр ${i + 1} / ${frames().length}`;
      $('stageHint').classList.toggle('hidden', !App.player.manual);
    });
    App.player.on('end', () => { $('playInfo').textContent = tx('Готово'); $('stageHint').classList.add('hidden'); setTimeout(() => { if (!App.player.playing) exitFullscreen(); }, 800); });
    setupMemoryTrim();
    applyFrameFont();
    $('chkFull').checked = localStorage.getItem('oo.fullPreview') !== '0';
    $('chkFull').onchange = (e) => localStorage.setItem('oo.fullPreview', e.target.checked ? '1' : '0');
    App.player.on('stop', () => { $('playInfo').textContent = ''; $('stageHint').classList.add('hidden'); });

    // горячие клавиши по физической клавише (e.code): на русской раскладке e.key у Ctrl+Z — «я», и сочетания не срабатывали
    const isKey = (e, ch) => e.code === 'Key' + ch.toUpperCase() || e.key.toLowerCase() === ch;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) { e.preventDefault(); exitFullscreen(); return; }
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      const modalOpen = !!document.querySelector('.modal-wrap');
      if (e.ctrlKey && !e.altKey && isKey(e, 's')) { e.preventDefault(); doSave(e.shiftKey); return; }
      if (modalOpen) return;
      if (e.ctrlKey && !e.altKey && (isKey(e, 'f') || isKey(e, 'h'))) { e.preventDefault(); openFind(isKey(e, 'h')); return; }
      if (e.key === 'F3' && findPanel) { e.preventDefault(); findPanel.next(e.shiftKey ? -1 : 1); return; }
      if (e.ctrlKey && !e.altKey && isKey(e, 'o')) { e.preventDefault(); doOpen(); return; }
      if (e.ctrlKey && e.altKey && isKey(e, 'n')) { e.preventDefault(); doNew(); return; }
      if (e.ctrlKey && isKey(e, 'z') && !inField) { e.preventDefault(); if (e.shiftKey) redoFn(); else undo(); return; }
      if (e.ctrlKey && isKey(e, 'y') && !inField) { e.preventDefault(); redoFn(); return; }
      if (e.key === 'Escape' && App.player.playing) { App.player.stop(); showStill(); return; }
      if (inField) return;
      if (e.key === 'Escape' && App.multi.size) { clearMulti(); return; }
      if (e.ctrlKey && !e.altKey && isKey(e, 'c')) { e.preventDefault(); copyFrames(); return; }
      if (e.ctrlKey && !e.altKey && isKey(e, 'x')) { e.preventDefault(); cutFrames(); return; }
      if (e.ctrlKey && !e.altKey && isKey(e, 'v')) { e.preventDefault(); pasteFrames(); return; }
      if (e.ctrlKey && !e.altKey && isKey(e, 'a')) { e.preventDefault(); frames().forEach((f, i) => App.multi.add(i)); markMulti(); return; }
      if (e.key === 'Delete') { e.preventDefault(); deleteFrames(); return; }
      if (e.key === 'p' || e.key === 'з') { play(App.sel); }
      if (e.key === ' ' && App.player.playing) { e.preventDefault(); App.player.click(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = App.sel + (e.key === 'ArrowDown' ? 1 : -1);
        if (n >= 0 && n < frames().length) { select(n); ensureVisible(n); }
      }
    });
    window.addEventListener('beforeunload', () => autosave());

    // Перетаскивание файла проекта в окно
    // только файлы: обычное перетаскивание текста мышью внутри полей должно работать
    const hasFiles = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('drop', async (e) => {
      if (!hasFiles(e) || e.target.closest('.file-slot')) return;
      e.preventDefault();
      const f = [...e.dataTransfer.files].find((x) => /\.(objection|json|txt)$/i.test(x.name));
      if (f) doOpen({ path: null, name: f.name, text: await f.text() });
    });
  }

  function libCtx() {
    return {
      audio: App.audio,
      aspectRatio: App.project.options.aspectRatio || '16:9',
      onLibraryChanged,
      downloadByCode: downloadByCodeFlow,
      openLibraryDir: openLibraryDirDialog,
      isAssetUsed: (type, id) => {
        let n = 0;
        for (const f of frames()) {
          if (type === 'characters' && f.characterId === id) n++;
          if (type === 'backgrounds' && f.backgroundId === id) n++;
          if (type === 'music' && (f.text || '').includes(`[#bgm${id}]`)) n++;
          if (type === 'sounds' && (f.text || '').includes(`[#bgs${id}]`)) n++;
          if (type === 'textboxes' && (f.actions || []).some((a) => a.actionId === 12 && String(a.actionParam) === String(id))) n++;
          if (type === 'evidence' && new RegExp(`\\[#evdi?${id}[lr]?\\]`, 'i').test(f.text || '')) n++;
          if (type === 'popups' && f.popupId === id) n++;
        }
        if (type === 'textboxes' && String(App.project.options.chatbox) === String(id)) n++;
        return n;
      },
    };
  }

  // ---------- Вход на objection.lol, ресурсы по коду доступа ----------
  async function ensureLogin() {
    const st = await window.api.auth.status();
    if (st.loggedIn) return true;
    if (window.api.mobile) {
      await confirmDialog(tx('Вход на objection.lol в версии для Android пока не сделан. Ресурсы по коду доступа и ресурсы аккаунта скачиваются в версии для ПК; потом их можно перенести пакетом ресурса (.oopack) или вместе с проектом.'), { ok: tx('Понятно'), cancel: null });
      return false;
    }
    const ok = await confirmDialog(tx('Для этого нужно войти на objection.lol (как на сайте).\n\nОткроется окно сайта, вход выполняется там. Пароль вводится прямо на сайте: программа его не видит и не хранит, сохраняется только ключ входа (в зашифрованном виде).\n\nКогда вход выполнится, окно закроется само.'), { ok: tx('Открыть сайт') });
    if (!ok) return false;
    const r = await window.api.auth.login();
    if (!r.ok) { toast(tx('Вход не выполнен')); return false; }
    toast(tx('Вход выполнен') + (r.user ? ': ' + r.user : ''));
    return true;
  }
  async function loginFlow() {
    const st = await window.api.auth.status();
    if (!st.loggedIn) { await ensureLogin(); return; }
    const out = await confirmDialog(tx`Вход на objection.lol выполнен${st.user ? ': ' + st.user : ''}.\nВыйти из аккаунта?`, { ok: tx('Выйти'), cancel: tx('Оставить') });
    if (out) { await window.api.auth.logout(); toast(tx('Выход из аккаунта выполнен')); }
  }
  async function downloadByCodeFlow(kind = 'characters', folder = tx('По коду доступа')) {
    const code = await UI.promptDialog(kind === 'textboxes' ? tx('Код доступа текстбокса (с objection.lol)') : tx('Код доступа персонажа (например, KLZHYF)'), '');
    if (!code || !code.trim()) return null;
    if (!(await ensureLogin())) return null;
    try {
      const r = await runDownload(tx('Скачивание по коду ') + code.trim(), () => window.api.download.byCode(kind, code.trim(), folder));
      onLibraryChanged();
      toast(tx`Готово: «${r.name || r.id}»` + (r.failed ? tx` (не скачалось файлов: ${r.failed})` : ''), 6000);
      return r;
    } catch (e) {
      toast(tx('Не получилось: ') + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 8000);
      return null;
    }
  }
  async function downloadMineFlow() {
    if (!(await ensureLogin())) return;
    const ok = await confirmDialog(tx('Скачать все ресурсы аккаунта objection.lol (персонажей, фоны, музыку, звуки, текстбоксы, улики, картинки) в библиотеку? Они попадут в папку «С аккаунта objection.lol».'), { ok: tx('Скачать') });
    if (!ok) return;
    try {
      const r = await runDownload(tx('Скачивание ресурсов аккаунта'), () => window.api.download.mine(tx('С аккаунта objection.lol')));
      onLibraryChanged();
      await showReport(r, tx('Ресурсы аккаунта objection.lol'));
    } catch (e) { toast(tx('Не получилось: ') + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 8000); }
  }
  App.downloadByCode = downloadByCodeFlow;

  // ---------- Папка библиотеки и перенос из старых версий ----------
  async function openLibraryDirDialog() {
    const info = await window.api.lib.info();
    let m;
    if (window.api.mobile) {
      const shown = String(info.dir).replace(/^\/storage\/emulated\/0\//, tx('Внутренняя память/'));
      m = modal({
        title: tx('Папка библиотеки'),
        body: [
          h('div', { class: 'field' }, h('label', null, tx('Библиотека на телефоне')), h('div', { style: { wordBreak: 'break-all' } }, shown)),
          h('div', { class: 'note' }, tx('Библиотеку с ПК можно перенести целиком: подключить телефон к компьютеру кабелем и скопировать содержимое папки Library из «Документы/Objection Offline» в эту папку (с заменой), затем перезапустить приложение. Обратно — так же.')),
          h('div', { class: 'note' }, tx('Папка удаляется вместе с приложением. Перед удалением приложения её стоит скопировать на компьютер. Обновление приложения (установка новой версии поверх) библиотеку не трогает.')),
        ],
        foot: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'OK')],
      });
      return;
    }
    m = modal({
      title: tx('Папка библиотеки'),
      body: [
        h('div', { class: 'note' }, tx('Библиотека одна на все версии программы. Новую версию можно просто распаковать в любую папку — она увидит ту же библиотеку.')),
        h('div', { class: 'field' }, h('label', null, tx('Сейчас')), h('div', { style: { wordBreak: 'break-all' } }, info.dir)),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn', onclick: () => window.api.lib.openFolder() }, tx('📂 Открыть')),
          h('button', { class: 'btn', onclick: async () => {
            const ok = await confirmDialog(tx('Дальше выбирается новая папка. Если в ней уже есть библиотека, программа переключится на неё; если нет, текущая библиотека будет перенесена туда. Программа перезапустится.'), { ok: tx('Выбрать папку…') });
            if (!ok) return;
            const r = await window.api.lib.changeDir();
            if (r && r.error) toast(r.error, 6000);
          } }, tx('Сменить папку…')),
          h('button', { class: 'btn', onclick: async () => { m.close(); await importLegacyFlow(); } }, tx('Перенести из старой версии…'))),
      ],
      foot: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'OK')],
    });
  }

  async function importLegacyFlow(dir) {
    if (!dir) {
      const r = await window.api.lib.pickLegacy();
      if (!r) return;
      if (r.error) { toast(r.error, 6000); return; }
      dir = r;
    }
    try {
      const res = await runDownload(tx('Перенос библиотеки'), () => window.api.lib.importLegacy(dir));
      onLibraryChanged();
      toast(tx`Перенесено ресурсов: ${res.added}. Старую папку программы теперь можно удалить.`, 8000);
    } catch (e) { toast(tx('Не получилось перенести: ') + e.message, 8000); }
  }

  async function offerLegacyImport() {
    let list = [];
    try { list = await window.api.lib.legacyCandidates(); } catch (e) { return false; }
    if (!list.length) return false;
    const info = await window.api.lib.info();
    for (const c of list) {
      let m;
      m = modal({
        title: tx('Библиотека из прошлой версии'),
        body: [
          h('p', { style: { lineHeight: 1.5 } }, tx('Нашлась библиотека от старой версии программы:')),
          h('div', { class: 'note', style: { wordBreak: 'break-all' } }, c.dir, h('div', { class: 'muted' }, tx`ресурсов: ${c.count}`)),
          h('p', { style: { lineHeight: 1.5 } }, tx('Перенести её в общую папку? Тогда она будет доступна во всех версиях, и при следующих обновлениях ничего переносить не придётся.')),
          h('div', { class: 'muted', style: { wordBreak: 'break-all' } }, tx('Общая папка: ') + info.dir),
        ],
        foot: [h('button', { class: 'btn', onclick: () => m.close('no') }, tx('Не переносить')), h('button', { class: 'btn primary', onclick: () => m.close('yes') }, tx('Перенести'))],
      });
      const v = await m.done;
      if (v === 'yes') await importLegacyFlow(c.dir);
      else if (v === 'no') await window.api.lib.dismissLegacy(c.dir);
    }
    return true;
  }

  // ---------- Язык интерфейса ----------
  async function switchLanguage() {
    const to = window.OO_LANG === 'en' ? 'ru' : 'en';
    autosave();
    if (App.sceneId || App.project) { try { await saveSceneNow(); } catch (e) { /* */ } }
    if (window.api.setLang) { try { await window.api.setLang(to); } catch (e) { /* */ } }
    window.setUiLang(to);
  }

  // ---------- Проект с ресурсами (ZIP) — перенести на другое устройство без скачивания ----------
  async function exportBundle() {
    if (!window.api.project.exportBundle) return;
    const presets = localStorage.getItem('oo.bundle.presets') !== '0';
    const chkEl = h('input', { type: 'checkbox', checked: presets });
    const ok = await confirmDialog([
      h('p', null, tx('В архив попадут проект и все его ресурсы: персонажи, фоны, музыка, звуки, текстбоксы, улики и картинки. На другом устройстве (например, на телефоне) архив открывается через «Файл → Открыть…» или «Открыть с помощью» из Telegram — ресурсы сразу добавятся в библиотеку, скачивать ничего не нужно.')),
      h('label', { class: 'chk' }, chkEl, tx('Включить и стандартные ресурсы objection.lol (архив больше, зато на телефоне не нужно ничего докачивать)')),
    ], { ok: tx('Сохранить архив'), title: tx('Проект с ресурсами') });
    if (!ok) return;
    localStorage.setItem('oo.bundle.presets', chkEl.checked ? '1' : '0');
    const busy = modal({ title: tx('Проект с ресурсами'), body: [h('p', null, tx('Сборка архива…'))], foot: [] });
    try {
      const r = await window.api.project.exportBundle({ text: encodeProject(App.project), name: (App.fileName || 'project').replace(/\.objection$/i, ''), includePresets: chkEl.checked });
      busy.close();
      if (r) toast(tx`Сохранено: ${r.assets} ресурсов, ${r.files} файлов, ${fmtBytes(r.bytes)}`, 6000);
    } catch (e) { busy.close(); toast(tx('Не удалось сохранить архив: ') + e.message, 7000); }
  }
  App.exportBundle = exportBundle;

  // ---------- Найти и заменить во всех кадрах (Ctrl+F / Ctrl+H) ----------
  // По умолчанию теги [#…] и [/#] не трогаются — меняется только сам текст реплик.
  let findPanel = null;
  function findMatches(text, q, { cs, tags }) {
    const out = [];
    if (!q) return out;
    const src = cs ? text : text.toLowerCase(); const needle = cs ? q : q.toLowerCase();
    const tagSpans = [];
    if (!tags) { const re = /\[#[^\]]*\]|\[\/#\]/g; let m; while ((m = re.exec(text))) tagSpans.push([m.index, m.index + m[0].length]); }
    let i = 0;
    while ((i = src.indexOf(needle, i)) >= 0) {
      const end = i + needle.length;
      if (!tagSpans.some(([a, b]) => i < b && end > a)) out.push([i, end]);
      i = end > i ? end : i + 1;
    }
    return out;
  }
  function openFind(replaceMode) {
    if (findPanel) { findPanel.el.remove(); findPanel = null; }
    const opts = { cs: localStorage.getItem('oo.find.cs') === '1', tags: localStorage.getItem('oo.find.tags') === '1' };
    const q = h('input', { class: 'input', placeholder: tx('Найти'), value: localStorage.getItem('oo.find.q') || '' });
    const r = h('input', { class: 'input', placeholder: tx('Заменить на'), value: localStorage.getItem('oo.find.r') || '' });
    const info = h('div', { class: 'muted find-info' });
    let pos = { frame: App.sel ?? 0, at: -1 };
    const all = () => {
      const list = [];
      frames().forEach((f, fi) => { for (const [a, b] of findMatches(f.text || '', q.value, opts)) list.push({ fi, a, b }); });
      return list;
    };
    const count = () => { const n = all().length; const fr = new Set(all().map((x) => x.fi)).size; info.textContent = q.value ? (n ? tx`Найдено: ${n} (кадров: ${fr})` : tx('Не найдено')) : ''; return n; };
    const show = (m) => {
      App.select(m.fi);
      pos = { frame: m.fi, at: m.a };
      setTimeout(() => {
        const ta = document.querySelector(`.frame[data-idx="${m.fi}"] textarea`);
        if (ta) { ta.focus(); ta.setSelectionRange(m.a, m.b); const el = ta.closest('.frame'); if (el) el.scrollIntoView({ block: 'nearest' }); }
        q.focus();
      }, 30);
    };
    const next = (dir = 1) => {
      const list = all(); count();
      if (!list.length) return null;
      const key = (m) => m.fi * 1e7 + m.a;
      const cur = pos.frame * 1e7 + pos.at;
      let m = dir > 0 ? list.find((x) => key(x) > cur) : [...list].reverse().find((x) => key(x) < cur);
      if (!m) m = dir > 0 ? list[0] : list[list.length - 1];
      show(m);
      return m;
    };
    const replaceOne = () => {
      const list = all();
      const m = list.find((x) => x.fi === pos.frame && x.a === pos.at);
      if (!m) { next(1); return; }
      pushUndo();
      const f = frames()[m.fi];
      f.text = f.text.slice(0, m.a) + r.value + f.text.slice(m.b);
      markDirty(); renderFrames(); renderInspector(); showStill();
      pos = { frame: m.fi, at: m.a + r.value.length - 1 };
      next(1);
    };
    const replaceAll = () => {
      const list = all();
      if (!list.length) { count(); return; }
      pushUndo();
      const byFrame = new Map();
      for (const m of list) { if (!byFrame.has(m.fi)) byFrame.set(m.fi, []); byFrame.get(m.fi).push(m); }
      for (const [fi, ms] of byFrame) {
        const f = frames()[fi];
        let t = f.text;
        for (const m of ms.reverse()) t = t.slice(0, m.a) + r.value + t.slice(m.b);
        f.text = t;
      }
      markDirty(); renderFrames(); renderInspector(); showStill();
      count();
      info.textContent = tx`Заменено: ${list.length} (кадров: ${byFrame.size}). Отмена — Ctrl+Z.`;
    };
    const save = () => { localStorage.setItem('oo.find.q', q.value); localStorage.setItem('oo.find.r', r.value); };
    q.addEventListener('input', () => { save(); pos = { frame: App.sel ?? 0, at: -1 }; count(); });
    r.addEventListener('input', save);
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (e.target === r && e.ctrlKey) replaceAll(); else if (e.target === r) replaceOne(); else next(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    q.addEventListener('keydown', onKey); r.addEventListener('keydown', onKey);
    const optChk = (label, k, title) => h('label', { class: 'chk', title }, h('input', { type: 'checkbox', checked: opts[k], onchange: (e) => { opts[k] = e.target.checked; localStorage.setItem('oo.find.' + k, e.target.checked ? '1' : '0'); count(); } }), label);
    const close = () => { el.remove(); findPanel = null; };
    const el = h('div', { class: 'find-panel' },
      h('div', { class: 'find-row' }, q, h('button', { class: 'btn small', title: tx('Предыдущее (Shift+Enter)'), onclick: () => next(-1) }, '↑'), h('button', { class: 'btn small', title: tx('Следующее (Enter, F3)'), onclick: () => next(1) }, '↓'), h('button', { class: 'btn small', title: tx('Закрыть (Esc)'), onclick: close }, '✕')),
      h('div', { class: 'find-row' }, r, h('button', { class: 'btn small', onclick: replaceOne }, tx('Заменить')), h('button', { class: 'btn small primary', onclick: replaceAll }, tx('Заменить все'))),
      h('div', { class: 'find-row' }, optChk(tx('Учитывать регистр'), 'cs'), optChk(tx('Менять и внутри тегов'), 'tags', tx('Без галочки теги вроде [#bgm12] и [/#] не меняются'))),
      info);
    document.body.append(el);
    findPanel = { el, next };
    count();
    (replaceMode && q.value ? r : q).focus();
    q.select();
  }
  App.openFind = openFind;

  // ---------- Обучение: видеоуроки (список — app/tutorials.json и tutorials.json в репозитории на GitHub) ----------
  async function showHelp() {
    const list = h('div', { class: 'help-list' }, h('div', { class: 'muted' }, tx('Загрузка списка…')));
    const m = modal({ title: tx('Обучение'), body: [list], foot: [h('button', { class: 'btn', onclick: () => window.api.openExternal(REPO_URL) }, tx('Страница программы на GitHub'))] });
    let data = null;
    try { data = window.api.tutorials ? await window.api.tutorials() : null; } catch (e) { /* */ }
    if (!data) { try { const j = await (await fetch('tutorials.json', { cache: 'no-store' })).json(); data = { source: 'builtin', videos: j.videos || [] }; } catch (e) { /* */ } }
    const en = window.OO_LANG === 'en';
    const vids = (data && Array.isArray(data.videos) ? data.videos : []).filter((v) => v && v.url && /^https?:/i.test(v.url));
    list.textContent = '';
    if (!vids.length) {
      list.append(h('p', null, tx('Видеоуроки пока не добавлены — они появятся в этом окне.')));
      return m;
    }
    for (const v of vids) {
      const title = (en && v.title_en) || v.title || v.url;
      const note = (en && v.note_en) || v.note || '';
      list.append(h('button', { class: 'help-item', onclick: () => window.api.openExternal(v.url) },
        h('span', { class: 'help-play' }, '▶'),
        h('span', { class: 'help-text' }, h('b', null, title), note ? h('span', { class: 'muted' }, note) : null)));
    }
    if (data && data.source === 'builtin') list.append(h('div', { class: 'hint' }, tx('Список из программы (нет связи с GitHub — новых уроков может не быть).')));
    return m;
  }
  App.showHelp = showHelp;

  // ---------- Проверка обновлений (GitHub Releases) ----------
  const REPO_URL = 'https://github.com/Sandwich222/P.O.L.-Portative-Objection.lol-';
  const RELEASES_URL = REPO_URL + '/releases';
  function autoCheckUpdate() {
    if (!window.api.checkUpdate || localStorage.getItem('oo.updateAuto') === '0') return;
    const last = Number(localStorage.getItem('oo.updateChecked') || 0);
    if (Date.now() - last < 20 * 3600e3) return; // не чаще раза в день
    checkUpdates(false);
  }
  async function checkUpdates(manual) {
    if (!window.api.checkUpdate) return;
    if (manual) toast(tx('Проверка обновлений…'), 1500);
    const r = await window.api.checkUpdate().catch((e) => ({ ok: false, error: e.message, current: App.version }));
    if (r.ok) localStorage.setItem('oo.updateChecked', String(Date.now()));
    if (!manual && (!r.ok || !r.newer || localStorage.getItem('oo.updateSkip') === r.latest)) return;
    showUpdateDialog(r, manual);
  }
  App.checkUpdates = checkUpdates;
  function showUpdateDialog(r, manual) {
    let m;
    const ext = (url) => { window.api.openExternal(url); };
    const auto = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: localStorage.getItem('oo.updateAuto') !== '0', onchange: (e) => localStorage.setItem('oo.updateAuto', e.target.checked ? '1' : '0') }), tx('Проверять при запуске (не чаще раза в день)'));
    const body = [];
    if (!r.ok) body.push(h('p', null, tx('Не удалось проверить обновления.')), h('div', { class: 'note' }, r.error || ''));
    else if (r.newer) {
      body.push(h('p', { style: { lineHeight: 1.6 } }, tx`Доступна новая версия: ${r.latest}. Установлена: ${r.current}.`));
      if (r.name && r.name !== r.latest && r.name !== 'v' + r.latest) body.push(h('p', null, h('b', null, r.name)));
      if (r.notes) body.push(h('div', { class: 'note', style: { whiteSpace: 'pre-wrap', maxHeight: '260px', overflow: 'auto' } }, r.notes));
      body.push(h('div', { class: 'hint' }, r.asset ? tx`Файл для этой системы: ${r.asset.name}${r.asset.size ? ' (' + fmtBytes(r.asset.size) + ')' : ''}. Проекты и библиотека остаются на месте — новая версия ставится поверх старой или распаковывается рядом.` : tx('Файл для этой системы на странице выпуска не найден — подходящий архив выбирается вручную.')));
    } else if (!r.latest) body.push(h('p', null, tx`Установлена версия ${r.current}. В репозитории пока нет выпусков (Releases).`));
    else body.push(h('p', null, tx`Установлена последняя версия: ${r.current}.`));
    body.push(auto);
    const foot = [];
    if (r.ok && r.newer) {
      foot.push(h('button', { class: 'btn', onclick: () => { localStorage.setItem('oo.updateSkip', r.latest); m.close(); } }, tx('Пропустить эту версию')));
      foot.push(h('button', { class: 'btn', onclick: () => ext(r.url || RELEASES_URL) }, tx('Страница выпуска')));
      if (r.asset) foot.push(h('button', { class: 'btn primary', onclick: () => { ext(r.asset.url); m.close(); } }, tx('Скачать')));
    } else foot.push(h('button', { class: 'btn', onclick: () => ext(RELEASES_URL) }, tx('Открыть страницу выпусков')));
    m = modal({ title: r.ok && r.newer ? tx('Есть обновление') : tx('Проверка обновлений'), body, foot });
    return m;
  }
  App.showUpdateDialog = showUpdateDialog;

  // ---------- Телефон и планшет (Android) ----------
  // Узкий экран: сверху просмотр, ниже вкладки «Кадры» / «Кадр» (настройки выбранного кадра).
  // Кнопка «Назад» закрывает окна и полный экран; при открытой клавиатуре просмотр прячется.
  function setupMobile() {
    const body = document.body;
    body.classList.add('mobile', 'tab-frames');
    const short = { btnSettings: tx('Проект'), btnPlayAll: tx('⏮ С начала'), btnExport: tx('● Видео'), btnLibrary: tx('Библиотека') };
    for (const [id, t] of Object.entries(short)) if ($(id)) $(id).textContent = t;
    // вход на objection.lol пока не сделан — пункты, которым он нужен, не показываем
    for (const act of ['code', 'mine', 'login']) { const b = document.querySelector(`#fileMenu [data-act="${act}"]`); if (b) b.remove(); }
    // «С начала» — к остальным кнопкам просмотра, чтобы верхняя строка влезала в ширину телефона
    const pa = $('btnPlayAll');
    if (pa) { pa.className = 'tb small'; document.querySelector('.player-bar').prepend(pa); }
    // отмена/повтор: на телефоне нет Ctrl+Z
    const menu = document.querySelector('#topbar .menu');
    menu.prepend(h('button', { class: 'tb', id: 'btnUndo', title: tx('Отменить'), onclick: () => undo() }, '↶'), h('button', { class: 'tb', id: 'btnRedo', title: tx('Повторить'), onclick: () => redoFn() }, '↷'));
    // вкладки
    const tabFrames = h('button', { class: 'mt-btn', onclick: () => setTab('frames') }, tx('☰ Кадры'));
    const tabFrame = h('button', { class: 'mt-btn', onclick: () => setTab('frame') }, tx('⚙ Кадр'));
    const tabs = h('nav', { id: 'mobileTabs' }, tabFrames, tabFrame);
    $('layout').insertBefore(tabs, $('framesPane'));
    function setTab(t) {
      body.classList.toggle('tab-frames', t === 'frames');
      body.classList.toggle('tab-frame', t === 'frame');
      tabFrames.classList.toggle('on', t === 'frames');
      tabFrame.classList.toggle('on', t === 'frame');
      if (t === 'frames' && App.project) ensureVisible(App.sel);
    }
    App.mobileTab = setTab;
    setTab('frames');
    const upd = () => { tabFrame.textContent = App.sel >= 0 ? tx`⚙ Кадр ${App.sel + 1}` : tx('⚙ Кадр'); };
    setInterval(upd, 400);
    // клавиатура открыта (окно стало заметно ниже) — просмотр прячем, чтобы было видно, что печатается
    const vv = window.visualViewport;
    let full = window.innerHeight;
    const onResize = () => {
      const hgt = vv ? vv.height : window.innerHeight;
      if (hgt > full) full = hgt;
      const typing = /^(TEXTAREA|INPUT)$/.test((document.activeElement || {}).tagName || '') && hgt < full * 0.72;
      body.classList.toggle('kbd', typing);
    };
    (vv || window).addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => { full = 0; setTimeout(onResize, 300); });
    document.addEventListener('focusin', onResize);
    document.addEventListener('focusout', () => setTimeout(onResize, 100));
    // просмотр на весь экран: горизонтальный проект — повернуть экран
    document.addEventListener('fullscreenchange', () => {
      const o = window.OOApp && window.OOApp.setOrientation;
      if (!o) return;
      const vertical = /^9:16$/.test(String(App.project.options.aspectRatio || ''));
      window.OOApp.setOrientation(document.fullscreenElement ? (vertical ? 'portrait' : 'landscape') : 'auto');
    });
    // «Назад» на телефоне: меню → окно → полный экран → просмотр; иначе приложение сворачивается
    window.__ooBack = () => {
      const fm = $('fileMenu');
      if (fm && !fm.classList.contains('hidden')) { fm.classList.add('hidden'); return true; }
      const dd = [...document.querySelectorAll('.dropdown')].filter((d) => d !== fm && d.isConnected && getComputedStyle(d).display !== 'none');
      if (dd.length) { dd.forEach((d) => d.remove()); return true; }
      if (document.querySelector('.modal-wrap') || document.fullscreenElement || App.player.playing) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return true;
      }
      if (body.classList.contains('tab-frame')) { setTab('frames'); return true; }
      return false;
    };
  }

  // ---------- Старт ----------
  async function init() {
    await Lib.load();
    try { App.version = await window.api.version(); $('appVersion').textContent = 'Release ' + App.version + (window.api.arch === 'ia32' ? tx(' · 32 бит') : ''); } catch (e) { /* */ }
    App.audio = new AudioEngine();
    App.player = new window.Player($('screen'), App.audio);
    bindUi();
    if (window.api.setLang) window.api.setLang(window.OO_LANG).catch(() => {});
    if ($('btnLang')) { $('btnLang').textContent = window.OO_LANG === 'en' ? '🌐 RU' : '🌐 EN'; $('btnLang').title = window.OO_LANG === 'en' ? 'Русский язык интерфейса (Russian)' : 'English interface (английский)'; $('btnLang').onclick = () => switchLanguage(); }
    if ($('btnHelp')) $('btnHelp').onclick = () => showHelp();
    if (window.api.mobile) setupMobile();
    let restored = false;
    try {
      const saved = JSON.parse(localStorage.getItem('oo.autosave') || 'null');
      if (saved && saved.project) {
        setProject(saved.project, { path: saved.filePath, name: saved.fileName, dirty: saved.dirty, sceneId: saved.sceneId || null, sceneName: saved.sceneName || null });
        if (saved.sel) { App.sel = Math.min(saved.sel, frames().length - 1); ensureVisible(App.sel); renderInspector(); showStill(); }
        if (saved.sceneId) setTimeout(() => saveSceneNow(), 1500); // последние правки прошлого запуска — в «Сцены»
        restored = true;
      }
    } catch (e) { console.warn(e); }
    if (!restored) setProject(newProject());
    const openPath = async (p) => { try { await doOpen(await window.api.project.readPath(p)); } catch (e) { toast(tx('Не удалось открыть: ') + e.message, 5000); } };
    window.api.onOpenFile && window.api.onOpenFile(openPath);
    setTimeout(autoCheckUpdate, 6000);
    const lf = window.api.launchFile ? await window.api.launchFile() : null;
    if (lf) { await openPath(lf); return; }
    try {
      const chk = await window.api.lib.startupCheck();
      if (chk && chk.removed.length) toast(tx`Убрано из библиотеки ресурсов, чьи файлы удалены с диска: ${chk.removed.length}`, 7000);
    } catch (e) { /* */ }
    const offered = await offerLegacyImport();
    if (!offered && !Lib.list('characters').length) showWelcome();
    // системные файлы (голоса, выкрики, текстбоксы сайта) — докачать тихо, если есть интернет
    window.api.download.system().then((r) => { if (r && r.ok) Lib.load(); }).catch(() => {});
  }

  function showWelcome() {
    let m;
    m = modal({
      title: tx('Добро пожаловать в Objection Offline'),
      body: [
        h('p', { style: { lineHeight: 1.6 } }, tx('Это офлайн-редактор сцен в стиле Ace Attorney. Библиотека пока пустая. С чего начать:')),
        h('div', { class: 'note' }, h('b', null, tx('1. Открыть проект с objection.lol. ')), tx('Файл → Открыть → файл .objection. Программа предложит скачать нужных персонажей, фоны и музыку.')),
        h('div', { class: 'note' }, h('b', null, tx('2. Скачать стандартные ресурсы. ')), tx('Персонажи, фоны и музыка из игр, пока сайт работает (несколько сотен МБ).')),
        h('div', { class: 'note' }, h('b', null, tx('3. Добавить своих персонажей. ')), tx('Библиотека → Добавить. Подойдут PNG, GIF и WebP.')),
      ],
      foot: [
        h('button', { class: 'btn', title: 'Interface language / язык интерфейса', onclick: () => { m.close(); switchLanguage(); } }, window.OO_LANG === 'en' ? '🌐 Русский' : '🌐 English'),
        h('button', { class: 'btn', onclick: () => { m.close(); openLibrary(libCtx()); } }, tx('Открыть библиотеку')),
        h('button', { class: 'btn', onclick: () => { m.close(); window.LibraryUI.downloadPresets(libCtx()); } }, tx('Скачать стандартные')),
        h('button', { class: 'btn primary', onclick: () => { m.close(); doOpen(); } }, tx('Открыть проект…')),
      ],
    });
  }

  App.open = doOpen;
  App.select = (i) => { ensureVisible(i); select(i); };
  App.save = doSave;
  App.play = play;
  App.checkMissing = checkMissing;
  App.encodeProject = encodeProject;
  App.decodeProject = decodeProject;
  init().catch((e) => { console.error(e); document.body.prepend(h('div', { style: { background: '#a33', padding: '8px' } }, tx('Ошибка запуска: ') + e.message)); });
})();
