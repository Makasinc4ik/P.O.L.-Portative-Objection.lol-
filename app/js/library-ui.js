// Менеджер библиотеки: свои персонажи, фоны, музыка, звуки
'use strict';
(function () {
  const { h, modal, toast, confirmDialog, pickerDialog, progressDialog, fmtBytes } = window.UI;
  const { Lib, SYSTEM, Marks } = window.Assets;

  // Режимы наложения (для цветного фильтра и своих картинок)
  window.OOBlendOptions = () => [['source-over', tx('Обычное')], ['multiply', tx('Умножение')], ['screen', tx('Экран')], ['overlay', tx('Перекрытие')], ['soft-light', tx('Мягкий свет')], ['hard-light', tx('Жёсткий свет')], ['darken', tx('Замена тёмным')], ['lighten', tx('Замена светлым')], ['color-dodge', tx('Осветление основы')], ['color-burn', tx('Затемнение основы')], ['difference', tx('Разница')], ['exclusion', tx('Исключение')], ['hue', tx('Цветовой тон')], ['saturation', tx('Насыщенность')], ['color', tx('Цветность')], ['luminosity', tx('Светимость')]];

  const TABS = [
    { type: 'characters', label: tx('Персонажи'), icon: '🧑' },
    { type: 'backgrounds', label: tx('Фоны'), icon: '🏞' },
    { type: 'music', label: tx('Музыка'), icon: '🎵' },
    { type: 'sounds', label: tx('Звуки'), icon: '🔊' },
    { type: 'textboxes', label: tx('Текстбоксы'), icon: '💬' },
    { type: 'evidence', label: tx('Улики'), icon: '🔎' },
    { type: 'popups', label: tx('Картинки'), icon: '🖼' },
  ];
  const IMAGE_TYPES = ['backgrounds', 'evidence', 'popups'];
  const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
  const SIDES = [
    ['defense', tx('Защита')], ['prosecution', tx('Обвинение')], ['counsel', tx('Помощник защиты')],
    ['judge', tx('Судья')], ['witness', tx('Свидетель')], ['gallery', tx('Галерея')],
  ];
  const IMG_ACCEPT = 'image/png,image/gif,image/webp,image/jpeg,image/avif,.png,.gif,.webp,.jpg,.jpeg,.apng,.avif';
  const AUDIO_ACCEPT = 'audio/*,.mp3,.ogg,.opus,.wav,.m4a,.aac,.flac,.webm';

  function assetThumb(type, a) {
    if (type === 'characters') return a.iconUrl ? { url: a.iconUrl, kind: 'icon' } : { url: a.poses?.[0]?.idleImageUrl || '', kind: 'char' };
    if (type === 'backgrounds') return { url: a.url, kind: 'bg' };
    if (type === 'textboxes') return a.url ? { url: a.url, kind: 'tb' } : null;
    if (type === 'evidence' || type === 'popups') return a.url ? { url: a.url, kind: 'icon' } : null;
    return null;
  }
  // Список ресурсов вкладки (у текстбоксов — ещё и 4 стандартных стиля сайта)
  function listFor(type) { return type === 'textboxes' ? [...SYSTEM.textboxes, ...Lib.list('textboxes')] : Lib.list(type); }
  function getFor(type, id) { return type === 'textboxes' ? Lib.textbox(id) : Lib.get(type, id); }

  // Папки: «Стандартные» (с сайта, по умолчанию) и «Customs» — всё своё, в нём папки пользователя
  const STD = '__std';
  const CUSTOMS = '__customs';
  const TAG = '__tag:';
  function folderOf(a) { return a.isPreset ? null : (a.folder || ''); }
  function allFolders(type) {
    const set = new Set();
    const add = (f) => { if (!f) return; const parts = f.split('/'); for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/')); };
    for (const a of listFor(type)) if (!a.isPreset) add(a.folder);
    for (const f of (Lib.data.folders && Lib.data.folders[type]) || []) add(f);
    return [...set].sort((x, y) => x.localeCompare(y));
  }
  function inFolder(a, folder, type) {
    if (folder == null) return true;
    if (String(folder).startsWith(TAG)) return Marks.tags(type, a.id).includes(folder.slice(TAG.length));
    if (folder === STD) return !!a.isPreset;
    if (a.isPreset) return false;
    if (folder === CUSTOMS) return true;
    const f = a.folder || '';
    return f === folder || f.startsWith(folder + '/');
  }

  function sourceLabel(a) {
    if (a.isPreset) return tx('стандартный');
    if (a.source === 'objection.lol') return tx('с objection.lol');
    return tx('свой');
  }

  // Выбор файлов: системное окно программы (с «Все файлы»), иначе — обычный <input type=file>
  async function pickFiles(accept, multiple = false) {
    const kind = accept === AUDIO_ACCEPT ? 'audio' : accept === FONT_ACCEPT ? 'font' : 'image';
    if (window.api && window.api.lib && window.api.lib.pickPaths) {
      const paths = await window.api.lib.pickPaths(kind, multiple);
      return paths.map((p) => ({ path: p, name: p.split(/[\\/]/).pop() }));
    }
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, multiple: multiple || null, style: { display: 'none' } });
      inp.addEventListener('change', () => { resolve([...inp.files]); inp.remove(); });
      document.body.append(inp);
      inp.click();
    });
  }

  async function importFiles(files) {
    const out = [];
    for (const f of files) {
      const rel = f instanceof File ? await window.api.lib.importFile(f) : await window.api.lib.importPath(f.path);
      out.push({ rel, name: f.name.replace(/\.[^.]+$/, '') });
    }
    return out;
  }

  // Поле «файл» с предпросмотром
  function fileSlot({ value, kind = 'image', onChange, audio, allowClear = true }) {
    let cur = value || '';
    const prev = h('div', { class: 'prev' });
    const fname = h('div', { class: 'fname' });
    const playBtn = kind === 'audio' ? h('button', { class: 'btn small', type: 'button', onclick: () => audio && cur && audio.playSound(cur, 100) }, '▶') : null;
    function render() {
      prev.innerHTML = '';
      if (kind === 'image' && cur) prev.append(h('img', { src: Lib.url(cur) }));
      else prev.append(kind === 'audio' ? '🎵' : kind === 'font' ? 'Aa' : '—');
      fname.textContent = cur ? (cur.startsWith('.inbox/') ? tx('новый файл (сохранится вместе с ресурсом)') : Lib.isLocal(cur) ? cur.split('/').slice(-2).join('/') : cur) : tx('не выбран');
      fname.title = cur;
      if (playBtn) playBtn.disabled = !cur;
    }
    const pick = h('button', { class: 'btn small', type: 'button', onclick: async () => {
      const files = await pickFiles(kind === 'image' ? IMG_ACCEPT : kind === 'font' ? FONT_ACCEPT : AUDIO_ACCEPT);
      if (!files.length) return;
      const [r] = await importFiles(files);
      cur = r.rel; render(); onChange && onChange(cur, r.name);
    } }, tx('Выбрать файл…'));
    const clear = allowClear ? h('button', { class: 'btn small', type: 'button', title: tx('Убрать'), onclick: () => { cur = ''; render(); onChange && onChange(''); } }, '✕') : null;
    const el = h('div', { class: 'file-slot' }, prev, fname, playBtn, pick, clear);
    el.addEventListener('dragover', (e) => { e.preventDefault(); });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = [...e.dataTransfer.files];
      if (!files.length) return;
      const [r] = await importFiles(files);
      cur = r.rel; render(); onChange && onChange(cur, r.name);
    });
    render();
    el.set = (v) => { cur = v || ''; render(); };
    return el;
  }

  function menu(anchor, items) {
    const old = document.querySelector('.dropdown.libmenu');
    if (old) old.remove();
    const r = anchor.getBoundingClientRect();
    const m = h('div', { class: 'dropdown libmenu', style: { top: r.bottom + 4 + 'px', left: Math.min(r.left, window.innerWidth - 380) + 'px' } },
      items.map((it) => (it === '-' ? h('hr') : h('button', { onclick: () => { m.remove(); it.fn(); } }, it.label))));
    document.body.append(m);
    const close = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', close, true); } };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  }

  function field(label, control) { return h('div', { class: 'field' }, h('label', null, label), control); }
  function num(value, onInput, attrs = {}) {
    return h('input', { class: 'input', type: 'number', value: value ?? '', ...attrs, oninput: (e) => onInput(e.target.value === '' ? null : Number(e.target.value)) });
  }
  function txt(value, onInput, attrs = {}) {
    return h('input', { class: 'input', type: 'text', value: value ?? '', ...attrs, oninput: (e) => onInput(e.target.value) });
  }
  function sel(options, value, onChange) {
    const s = h('select', { class: 'input', onchange: (e) => onChange(e.target.value) },
      options.map(([v, l]) => h('option', { value: v }, l)));
    s.value = value ?? '';
    return s;
  }
  // Метки по играм (Trilogy, AJ, AAI…) — хранятся отдельно от ресурса и сохраняются сразу
  // встроенные текстбоксы сайта (id '1'…'4') — у них нет своей записи в библиотеке
  const isSystemTb = (type, id) => type === 'textboxes' && SYSTEM.textboxes.some((t) => t.id === String(id));
  function gameTagsField(type, a) {
    const Marks = window.Assets.Marks;
    const box = h('div', { class: 'tag-chips' });
    const render = () => {
      box.innerHTML = '';
      const own = new Set(Marks.ownTags(type, a.id));
      const auto = new Set(Marks.autoTags(type, a.id));
      for (const t of Marks.GAME_TAGS) {
        const on = own.has(t) || auto.has(t);
        box.append(h('button', { type: 'button', class: 'chip' + (on ? ' on' : '') + (auto.has(t) ? ' auto' : ''),
          title: (auto.has(t) ? tx('Поставлена сама — по тегу в названии (или стандартный персонаж сайта). ') : '') + (on ? tx('Щелчок убирает метку') : tx('Щелчок ставит метку')),
          onclick: async () => {
            const cur = Marks.tags(type, a.id);
            await Marks.setTags(type, a.id, on ? cur.filter((x) => x !== t) : [...cur, t]);
            render();
          } }, t));
      }
    };
    render();
    return h('div', { class: 'field' }, h('label', null, tx('Игра (метки; [Trilogy], [AJ], [AAI] и т. п. в названии ставят их сами)')), box);
  }

  function chk(label, value, onChange) {
    return h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!value, onchange: (e) => onChange(e.target.checked) }), label);
  }

  // Группировка картинок поз: "Name_idle.gif" + "Name_talk.gif" → одна поза
  function groupPoseFiles(list) {
    const groups = new Map();
    const re = /[\s_\-.()]*(idle|stand|talk|talking|speak|speaking|a|b)\)?$/i;
    for (const it of list) {
      const m = it.name.match(re);
      const base = (m ? it.name.slice(0, m.index) : it.name).trim() || it.name;
      const role = m ? m[1].toLowerCase() : '';
      const g = groups.get(base) || { name: base };
      if (['talk', 'talking', 'speak', 'speaking', 'b'].includes(role)) g.talk = it.rel;
      else g.idle = g.idle || it.rel;
      if (!['talk', 'talking', 'speak', 'speaking', 'b', 'idle', 'stand', 'a'].includes(role)) g.idle = it.rel;
      groups.set(base, g);
    }
    return [...groups.values()].map((g) => ({ name: g.name, idle: g.idle || g.talk, talk: g.talk || g.idle }));
  }

  function newPose(id, name = tx('Поза'), idle = '', talk = '') {
    return { id, name, idleImageUrl: idle, speakImageUrl: talk || idle, isSpeedlines: false, iconUrl: '', order: 0, poseStates: [], poseAudioTicks: [], poseFunctionTicks: [] };
  }

  // Полная длительность анимированной картинки, мс (0 — если не анимированная)
  async function gifDuration(rel) {
    if (!rel) return 0;
    try {
      const img = await window.Assets.ImageCache.get(rel, 48);
      return img && img.animated ? Math.round(img.total) : 0;
    } catch (e) { return 0; }
  }

  async function newIds(n) { const out = []; for (let i = 0; i < n; i++) out.push(await window.api.lib.newId()); return out; }

  // Цвет имени на табличке у персонажа (пусто — цвет из текстбокса)
  function nameColorField(a) {
    const inp = h('input', { class: 'input', type: 'color', value: '#' + String(a.nameColor || 'FFFFFF').replace('#', '').slice(0, 6), style: { height: '34px', padding: '2px', width: '54px', flex: 'none' } });
    const state = h('span', { class: 'muted', style: { fontSize: '12px' } });
    const clr = h('button', { class: 'btn small', type: 'button', title: tx('Как в текстбоксе') }, '✕');
    const sync = () => { state.textContent = a.nameColor ? '' : tx('как в текстбоксе'); clr.style.visibility = a.nameColor ? '' : 'hidden'; };
    inp.addEventListener('input', () => { a.nameColor = inp.value.replace('#', '').toUpperCase(); sync(); });
    clr.onclick = () => { delete a.nameColor; inp.value = '#ffffff'; sync(); };
    sync();
    return h('div', { class: 'field', style: { flex: 'none' } }, h('label', null, tx('Цвет имени')), h('div', { class: 'row', style: { alignItems: 'center', gap: '6px' } }, inp, clr, state));
  }

  // Предпросмотр позы: анимация перед позой (со звуками), затем «говорит» и «молчит»
  function posePreview(a, p, ctx) {
    const bg = Lib.bg(a.backgroundId);
    const img = h('img', { class: 'pose-prev-img', alt: '' });
    const stage = h('div', { class: 'pose-prev-stage' }, img);
    if (bg && bg.url) stage.style.backgroundImage = `url("${Lib.url(bg.url)}")`;
    const status = h('div', { class: 'muted', style: { minHeight: '20px', marginTop: '6px' } });
    let timers = [];
    const stopAll = () => { timers.forEach(clearTimeout); timers = []; ctx.audio.stopAll && ctx.audio.stopAll(); };
    // новый адрес на каждый показ, чтобы GIF начинался с начала
    let n = 0;
    const show = (url) => { if (!url) { img.removeAttribute('src'); return; } const u = Lib.url(url); img.src = u + (u.includes('#') ? '' : '#') + 'p' + (++n); };
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const playAnim = () => {
      stopAll();
      const pre = (p.poseStates || []).filter((x) => x.imageUrl && !x.playAtTextEnd);
      let t = 0;
      for (const ptk of (p.poseAudioTicks || []).filter((x) => !x.playAtTextEnd)) if (ptk.fileName) later(ptk.time || 0, () => ctx.audio.playSound(ptk.fileName, ptk.volume ?? 100));
      pre.forEach((st, i) => {
        later(t, () => { show(st.imageUrl); status.textContent = tx`Анимация: кадр ${i + 1} из ${pre.length}`; });
        t += Number(st.nextPoseDelay) || 1000;
      });
      later(t, () => { show(p.speakImageUrl || p.idleImageUrl); status.textContent = tx('Говорит'); });
      later(t + 2500, () => { show(p.idleImageUrl); status.textContent = tx('Молчит'); });
      if (!pre.length) status.textContent = tx('У позы нет анимации перед ней');
    };
    const m = modal({
      title: tx('Поза: ') + (p.name || tx('без названия')),
      body: [stage, status],
      foot: [
        h('button', { class: 'btn', onclick: playAnim }, tx('▶ Анимация позы')),
        h('button', { class: 'btn', onclick: () => { stopAll(); show(p.speakImageUrl || p.idleImageUrl); status.textContent = tx('Говорит'); } }, tx('Говорит')),
        h('button', { class: 'btn', onclick: () => { stopAll(); show(p.idleImageUrl); status.textContent = tx('Молчит'); } }, tx('Молчит')),
      ],
      onClose: stopAll,
    });
    playAnim();
    return m;
  }

  // ---------- Редакторы ----------
  function characterEditor(a, ctx) {
    const wrap = h('div');
    const posesBox = h('div');
    const bubblesBox = h('div');
    const bgBtn = h('button', { class: 'picker-btn', type: 'button' });
    function renderBg() {
      const bg = Lib.bg(a.backgroundId);
      bgBtn.innerHTML = '';
      bgBtn.append(bg ? UI.thumbImg(bg.url, 'bg') : h('span', null, '—'), h('span', { class: 'nm' }, bg ? bg.name : tx('Без фона')));
    }
    bgBtn.onclick = async () => {
      const r = await pickerDialog({ title: tx('Фон по умолчанию'), type: 'backgrounds', items: Lib.list('backgrounds').map((b) => ({ id: b.id, name: b.name, thumb: { url: b.url, kind: 'bg' }, sub: sourceLabel(b) })), selected: a.backgroundId, allowNone: true, noneLabel: tx('Без фона') });
      if (r) { a.backgroundId = r.value; renderBg(); }
    };
    renderBg();
    // свой текстбокс персонажа: пусто — как в проекте
    function tbButton() {
      const btn = h('button', { class: 'picker-btn', type: 'button' });
      const render = () => {
        btn.innerHTML = '';
        const v = a.textboxId;
        const t = v != null && v !== '' ? Lib.textbox(v) : null;
        const label = v == null || v === '' ? tx('Как в проекте') : String(v) === '0' ? tx('Классический (как на сайте)') : t ? t.name : tx`⚠ нет в библиотеке (${v})`;
        btn.append(t && t.url ? UI.thumbImg(t.url, 'tb', '💬') : h('span', null, '💬'), h('span', { class: 'nm' }, label));
      };
      btn.onclick = async () => {
        const items = [{ id: '0', name: tx('Классический (как на сайте)'), icon: '💬' },
          ...[...SYSTEM.textboxes, ...Lib.list('textboxes')].map((t) => ({ id: String(t.id), name: t.name + (t.isPreset ? tx(' (сайт)') : ''), thumb: t.url ? { url: t.url, kind: 'tb' } : null, icon: '💬' }))];
        const r = await pickerDialog({ title: tx('Текстбокс персонажа'), items, type: 'textboxes', selected: a.textboxId != null ? String(a.textboxId) : null, allowNone: true, noneLabel: tx('Как в проекте') });
        if (!r) return;
        if (r.value == null) delete a.textboxId; else a.textboxId = r.value;
        render();
      };
      render();
      return btn;
    }

    const blipOptions = [...SYSTEM.blips.map((b) => [b.url, b.label]), ['custom', tx('Свой файл…')]];
    const isSystemBlip = SYSTEM.blips.some((b) => b.url === a.blipUrl);
    const blipCustom = fileSlot({ value: isSystemBlip ? '' : a.blipUrl, kind: 'audio', audio: ctx.audio, onChange: (v) => { a.blipUrl = v || SYSTEM.blips[0].url; } });
    blipCustom.style.display = isSystemBlip || !a.blipUrl ? 'none' : '';
    const blipSel = sel(blipOptions, isSystemBlip || !a.blipUrl ? (a.blipUrl || SYSTEM.blips[0].url) : 'custom', (v) => {
      if (v === 'custom') blipCustom.style.display = '';
      else { blipCustom.style.display = 'none'; a.blipUrl = v; ctx.audio.playSound(v, 100); }
    });

    function renderPoses() {
      posesBox.innerHTML = '';
      a.poses.forEach((p, idx) => {
        const states = h('div');
        const ticks = h('div');
        const funcs = h('div');
        const renderStates = () => {
          states.innerHTML = '';
          (p.poseStates || []).forEach((st, k) => {
            // путь к файлу бывает длинным — настройки кадра стоят строкой ниже, а не сбоку
            states.append(h('div', { class: 'state-block' },
              fileSlot({ value: st.imageUrl, onChange: async (v) => {
                st.imageUrl = v;
                // длительность анимации берём из самой GIF/WebP
                const ms = await gifDuration(v);
                if (ms) { st.nextPoseDelay = ms; renderStates(); toast(tx`Длительность анимации: ${ms} мс`); }
              } }),
              h('div', { class: 'state-opts' },
                h('span', { class: 'opt' }, h('span', { class: 'muted' }, tx('Длительность, мс')),
                  h('div', { style: { width: '96px', flex: 'none' } }, num(st.nextPoseDelay, (v) => { if (v == null) delete st.nextPoseDelay; else st.nextPoseDelay = v; }, { title: tx('Длительность, мс. Пусто — длина самой GIF'), placeholder: tx('длина GIF') })),
                  h('button', { class: 'btn small', type: 'button', title: tx('Взять длительность из GIF/WebP'), onclick: async () => { const ms = await gifDuration(st.imageUrl); if (ms) { st.nextPoseDelay = ms; renderStates(); toast(tx`Длительность анимации: ${ms} мс`); } else toast(tx('Картинка не анимированная — длительность не определить')); } }, '⟳')),
                h('span', { class: 'opt' }, h('span', { class: 'muted' }, tx('Повторы')),
                  h('div', { style: { width: '70px', flex: 'none' } }, num(st.repeat, (v) => { if (!v) delete st.repeat; else st.repeat = Math.max(1, Math.round(v)); }, { title: tx('Сколько раз проиграть анимацию. Пусто — как записано в самой GIF (обычно один раз), после этого остаётся последний кадр'), placeholder: tx('авто'), min: 1 }))),
                h('span', { style: { flex: 1 } }),
                h('button', { class: 'btn small', type: 'button', title: tx('Убрать кадр анимации'), onclick: () => { p.poseStates.splice(k, 1); renderStates(); } }, '✕'))));
          });
        };
        const renderTicks = () => {
          ticks.innerHTML = '';
          (p.poseAudioTicks || []).forEach((t, k) => {
            ticks.append(h('div', { class: 'state-block' },
              fileSlot({ value: t.fileName, kind: 'audio', audio: ctx.audio, onChange: (v) => { t.fileName = v; } }),
              h('div', { class: 'state-opts' },
                h('span', { class: 'opt' }, h('span', { class: 'muted' }, tx('Через, мс')),
                  h('div', { style: { width: '96px', flex: 'none' } }, num(t.time, (v) => { t.time = v || 0; }, { title: tx('Через сколько мс после начала позы'), placeholder: '0' }))),
                h('span', { style: { flex: 1 } }),
                h('button', { class: 'btn small', type: 'button', title: tx('Убрать звук'), onclick: () => { p.poseAudioTicks.splice(k, 1); renderTicks(); } }, '✕'))));
          });
        };
        const renderFuncs = () => {
          funcs.innerHTML = '';
          (p.poseFunctionTicks || []).forEach((t, k) => {
            funcs.append(h('div', { class: 'list-row' },
              sel([['Shake', tx('Тряска')], ['Flash', tx('Вспышка')], ['Quake', tx('Землетрясение')]], t.functionName, (v) => { t.functionName = v; }),
              sel([['s', tx('Слабая')], ['m', tx('Средняя')], ['l', tx('Сильная')]], t.functionParam || 'm', (v) => { t.functionParam = v; }),
              num(t.time, (v) => { t.time = v || 0; }, { placeholder: tx('мс') }),
              h('button', { class: 'btn small', type: 'button', onclick: () => { p.poseFunctionTicks.splice(k, 1); renderFuncs(); } }, '✕')));
          });
        };
        renderStates(); renderTicks(); renderFuncs();
        const details = h('details', null,
          h('summary', { class: 'muted', style: { cursor: 'pointer', margin: '6px 0' } }, tx('Анимация перед позой, звуки и эффекты')),
          h('div', { class: 'lbl' }, tx('Кадры анимации перед позой (например, удар по столу)')), states,
          h('button', { class: 'btn small', type: 'button', onclick: () => { (p.poseStates = p.poseStates || []).push({ imageUrl: '' }); renderStates(); } }, tx('＋ кадр анимации')),
          h('div', { class: 'lbl', style: { marginTop: '10px' } }, tx('Звуки позы')), ticks,
          h('button', { class: 'btn small', type: 'button', onclick: () => { (p.poseAudioTicks = p.poseAudioTicks || []).push({ fileName: '', time: 0, volume: 100 }); renderTicks(); } }, tx('＋ звук')),
          h('div', { class: 'lbl', style: { marginTop: '10px' } }, tx('Эффекты позы')), funcs,
          h('button', { class: 'btn small', type: 'button', onclick: () => { (p.poseFunctionTicks = p.poseFunctionTicks || []).push({ functionName: 'Shake', functionParam: 'm', time: 0 }); renderFuncs(); } }, tx('＋ эффект')));
        posesBox.append(h('div', { class: 'pose-edit' },
          h('div', { class: 'ph' },
            h('b', { style: { width: '22px' } }, idx + 1),
            txt(p.name, (v) => { p.name = v; }, { placeholder: tx('Название позы') }),
            h('button', { class: 'btn small', type: 'button', title: tx('Посмотреть позу: анимация, затем «говорит» и «молчит»'), onclick: () => posePreview(a, p, ctx) }, '👁'),
            h('button', { class: 'btn small', type: 'button', title: tx('Выше'), disabled: idx === 0, onclick: () => { a.poses.splice(idx - 1, 0, a.poses.splice(idx, 1)[0]); renderPoses(); } }, '↑'),
            h('button', { class: 'btn small', type: 'button', title: tx('Ниже'), disabled: idx === a.poses.length - 1, onclick: () => { a.poses.splice(idx + 1, 0, a.poses.splice(idx, 1)[0]); renderPoses(); } }, '↓'),
            h('button', { class: 'btn small danger', type: 'button', onclick: () => { a.poses.splice(idx, 1); renderPoses(); } }, tx('Удалить'))),
          h('div', { class: 'lbl' }, tx('Молчит')), fileSlot({ value: p.idleImageUrl, onChange: (v) => { p.idleImageUrl = v; if (!p.speakImageUrl) p.speakImageUrl = v; } }),
          h('div', { class: 'lbl', style: { marginTop: '6px' } }, tx('Говорит')), fileSlot({ value: p.speakImageUrl, onChange: (v) => { p.speakImageUrl = v; } }),
          h('div', { style: { marginTop: '6px' } }, chk(tx('Поза на весь экран (без фона, например «линии скорости»)'), p.isSpeedlines, (v) => { p.isSpeedlines = v; })),
          details));
      });
    }
    function renderBubbles() {
      bubblesBox.innerHTML = '';
      a.speechBubbles = a.speechBubbles || [];
      a.speechBubbles.forEach((b, idx) => {
        bubblesBox.append(h('div', { class: 'pose-edit' },
          h('div', { class: 'ph' }, txt(b.name, (v) => { b.name = v; }, { placeholder: 'Objection!' }),
            h('button', { class: 'btn small danger', type: 'button', onclick: () => { a.speechBubbles.splice(idx, 1); renderBubbles(); } }, tx('Удалить'))),
          h('div', { class: 'lbl' }, tx('Картинка')), fileSlot({ value: b.imageUrl, onChange: (v) => { b.imageUrl = v; } }),
          h('div', { class: 'lbl', style: { marginTop: '6px' } }, tx('Звук')), fileSlot({ value: b.soundUrl, kind: 'audio', audio: ctx.audio, onChange: (v) => { b.soundUrl = v; } }),
          h('div', { class: 'row', style: { marginTop: '6px' } },
            field(tx('Длительность, мс'), num(b.duration ?? 1000, (v) => { b.duration = v || 1000; })),
            h('div', null, chk(tx('Тряска'), b.shake !== false, (v) => { b.shake = v; }), h('br'), chk(tx('На весь экран'), b.fullscreen, (v) => { b.fullscreen = v; })))));
      });
    }
    renderPoses();
    renderBubbles();

    wrap.append(
      h('div', { class: 'row' }, field(tx('Имя в списке'), txt(a.name, (v) => { a.name = v; })), field(tx('Имя на табличке'), txt(a.nameplate, (v) => { a.nameplate = v; })), nameColorField(a)),
      gameTagsField('characters', a),
      h('div', { class: 'row' },
        field(tx('Место'), sel(SIDES, a.side || 'witness', (v) => { a.side = v; })),
        field(tx('Выравнивание'), sel([['0', tx('По месту')], ['1', tx('Слева')], ['2', tx('Справа')]], String(a.alignment ?? 0), (v) => { a.alignment = Number(v); }))),
      h('div', { class: 'row' },
        field(tx('Размер, %'), num(a.size ?? 100, (v) => { a.size = v || 100; })),
        field(tx('Сдвиг X, %'), num(a.offsetX ?? 0, (v) => { a.offsetX = v || 0; })),
        field(tx('Сдвиг Y, %'), num(a.offsetY ?? 0, (v) => { a.offsetY = v || 0; }))),
      field(tx('Фон по умолчанию'), bgBtn),
      field(tx('Свой текстбокс (когда говорит этот персонаж)'), tbButton()),
      field(tx('Звук речи'), h('div', null, blipSel, h('div', { style: { marginTop: '6px' } }, blipCustom))),
      field(tx('Громкость «бипа», %'), num(a.blipVolume ?? 100, (v) => { if (v == null || v === 100) delete a.blipVolume; else a.blipVolume = Math.max(0, Math.min(300, v)); })),
      field(tx('Значок (необязательно)'), fileSlot({ value: a.iconUrl, onChange: (v) => { a.iconUrl = v; } })),
      h('div', { class: 'section' }, h('h4', null, tx('Позы')),
        h('div', { class: 'note' }, tx('Картинки: PNG, GIF, WebP (анимированные тоже). Можно выбрать сразу много файлов: пары вида «Имя_idle» и «Имя_talk» склеятся в одну позу.')),
        posesBox,
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn small', type: 'button', onclick: async () => { const [id] = await newIds(1); a.poses.push(newPose(id, tx('Поза ') + (a.poses.length + 1))); renderPoses(); } }, tx('＋ Пустая поза')),
          h('button', { class: 'btn small', type: 'button', onclick: async () => {
            const files = await pickFiles(IMG_ACCEPT, true);
            if (!files.length) return;
            const list = await importFiles(files);
            const groups = groupPoseFiles(list);
            const ids = await newIds(groups.length);
            a.poses = a.poses.filter((p) => p.idleImageUrl || p.speakImageUrl); // пустые позы убираем
            groups.forEach((g, k) => a.poses.push(newPose(ids[k], g.name, g.idle, g.talk)));
            renderPoses();
          } }, tx('＋ Позы из файлов…')))),
      h('div', { class: 'section' }, h('h4', null, tx('Выкрики (Objection! и т. п.)')), bubblesBox,
        h('button', { class: 'btn small', type: 'button', onclick: async () => { const [id] = await newIds(1); a.speechBubbles.push({ id, name: 'Objection!', imageUrl: '', soundUrl: '', duration: 1000, shake: true, fullscreen: false, order: a.speechBubbles.length }); renderBubbles(); } }, tx('＋ Выкрик'))));
    return wrap;
  }

  function backgroundEditor(a) {
    return h('div', null,
      field(tx('Название'), txt(a.name, (v) => { a.name = v; })),
      field(tx('Картинка фона'), fileSlot({ value: a.url, allowClear: false, onChange: (v, n) => { a.url = v; if (!a.name && n) a.name = n; } })),
      field(tx('Стол / передний план (PNG с прозрачностью, необязательно)'), fileSlot({ value: a.deskUrl, onChange: (v) => { a.deskUrl = v || null; } })),
      chk(tx('Широкий фон — панорама (например, зал суда со стойками защиты, свидетеля и обвинения на одной картинке)'), a.isWide, (v) => { a.isWide = v; }),
      gameTagsField('backgrounds', a));
  }

  function evidenceEditor(a, ctx) {
    return h('div', null,
      field(tx('Название'), txt(a.name, (v) => { a.name = v; })),
      field(tx('Картинка улики'), fileSlot({ value: a.url, allowClear: false, onChange: (v, n) => { a.url = v; if (!a.name && n) a.name = n; } })),
      h('div', { class: 'row' },
        field(tx('Своя рамка значка (пусто — стандартная)'), fileSlot({ value: a.boxUrl, onChange: (v) => { a.boxUrl = v || undefined; } })),
        field(tx('Свой звук появления (пусто — стандартный)'), fileSlot({ value: a.soundUrl, kind: 'audio', audio: ctx && ctx.audio, onChange: (v) => { a.soundUrl = v || undefined; } }))),
      a.soundUrl ? field(tx('Громкость звука, %'), num(a.soundVolume ?? 100, (v) => { a.soundVolume = Math.max(0, Math.min(200, v ?? 100)); })) : null,
      chk(tx('На весь экран — без чёрного фона (прозрачные места картинки видны насквозь)'), a.transparentBg, (v) => { if (v) a.transparentBg = true; else delete a.transparentBg; }),
      h('div', { class: 'note' }, tx('Рамка — картинка, внутрь которой ставится улика, когда она показывается значком в углу ([#evdi…]). Размер рамки считается от ширины кадра 960 px, как у стандартной. Свой звук играет и при показе на весь экран.')),
      a.id != null && (a.boxUrl || a.soundUrl) ? h('button', { class: 'btn small', type: 'button', title: tx('Скопировать рамку и звук этой улики во все свои улики'), onclick: async () => {
        const list = Lib.list('evidence').filter((x) => !x.isPreset && x.id !== a.id);
        if (!list.length) { UI.toast(tx('Других своих улик нет')); return; }
        if (!(await UI.confirmDialog(tx`Поставить эту рамку и звук всем своим уликам (${list.length})? Сначала сохраните эту улику, если меняли файлы.`, { ok: tx('Поставить') }))) return;
        for (const x of list) await Lib.upsert('evidence', { ...x, boxUrl: a.boxUrl, soundUrl: a.soundUrl, soundVolume: a.soundVolume });
        UI.toast(tx('Готово: ') + list.length);
      } }, tx('Применить рамку и звук ко всем уликам')) : null,
      h('div', { class: 'note' }, tx('В тексте кадра: [#evd') + (a.id || 'N') + tx('] — на весь экран, [#evdi') + (a.id || 'N') + tx('] — значком в углу, [#evdh] — убрать. Кнопка «🔎 Улика» над текстом кадра вставит тег сама.')));
  }

  function popupEditor(a, ctx) {
    const prev = h('div', { class: 'popup-prev' });
    const render = () => {
      prev.innerHTML = '';
      if (!a.url) return;
      const img = h('img', { src: Lib.url(a.url) });
      const w = a.resize || 0;
      Object.assign(img.style, a.center ? { width: w + '%', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' } : { width: w + '%', left: (a.posX || 0) + '%', top: (a.posY || 0) + '%' });
      img.style.opacity = a.opacity == null ? 1 : Math.max(0, Math.min(100, Number(a.opacity))) / 100;
      img.style.mixBlendMode = a.blend && a.blend !== 'source-over' ? a.blend : '';
      prev.append(img);
    };
    const n = (k, label, def) => field(label, num(a[k] ?? def, (v) => { a[k] = v ?? def; render(); }));
    render();
    return h('div', null,
      field(tx('Название'), txt(a.name, (v) => { a.name = v; })),
      field(tx('Картинка (PNG, GIF, WebP)'), fileSlot({ value: a.url, allowClear: false, onChange: (v, nm) => { a.url = v; if (!a.name && nm) a.name = nm; render(); } })),
      h('div', { class: 'row' }, n('resize', tx('Ширина, % кадра'), 30), n('posX', tx('Слева, %'), 0), n('posY', tx('Сверху, %'), 0)),
      chk(tx('По центру кадра'), a.center, (v) => { a.center = v; render(); }),
      chk(tx('Поверх окна текста (обычно картинка под окном)'), a.aboveTextbox, (v) => { a.aboveTextbox = v; }),
      field(tx('Режим наложения'), sel(window.OOBlendOptions(), a.blend || 'source-over', (v) => { if (v && v !== 'source-over') a.blend = v; else delete a.blend; render(); })),
      h('div', { class: 'row' },
        field(tx('Непрозрачность, %'), num(a.opacity ?? 100, (v) => { if (v == null || v >= 100) delete a.opacity; else a.opacity = Math.max(0, v); render(); }, { min: 0, max: 100 })),
        field(tx('Плавное появление, мс'), num(a.fadeInMs ?? '', (v) => { if (v > 0) a.fadeInMs = v; else delete a.fadeInMs; }, { placeholder: tx('0 — сразу') })),
        field(tx('Плавное исчезновение, мс'), num(a.fadeOutMs ?? '', (v) => { if (v > 0) a.fadeOutMs = v; else delete a.fadeOutMs; }, { placeholder: tx('0 — сразу') }))),
      h('div', { class: 'note' }, tx('Например, мягкая виньетка: непрозрачность 60 %, появление и исчезновение по 800 мс. В отдельном кадре эти значения можно поменять в настройках кадра.')),
      field(tx('В вертикальном проекте (9:16) ширина и положение считаются от'), sel([['scene', tx('сцены 16:9 по центру кадра — как в горизонтальном проекте')], ['frame', tx('самого кадра 9:16 — для картинок, сделанных под вертикальный кадр')]], a.sizeBase || 'scene', (v) => { if (v === 'frame') a.sizeBase = 'frame'; else delete a.sizeBase; })),
      h('div', { class: 'note' }, tx('От сцены: картинка выглядит так же, как в горизонтальном проекте (вертикальная картинка шириной ~32 % по центру занимает весь кадр 9:16, у широкой обрезаются края). От кадра: 100 % — вся ширина кадра 9:16.')),
      prev,
      h('div', { class: 'note' }, tx('Картинка показывается поверх сцены с кадра, где она выбрана («Своя картинка» в настройках кадра), до следующего кадра с персонажем. GIF крутится без перерывов, даже если стоит на нескольких кадрах подряд (например, снег).')),
      h('div', { class: 'section' }, h('h4', null, tx('Как заставка (вроде Witness Testimony)')),
        h('div', { class: 'note' }, tx('Эту же картинку можно показать заставкой: на весь кадр, со звуком, текст ждёт, пока она не кончится. В кадре: «Картинки поверх сцены» → «Встроенная/заставка» → эта картинка.')),
        field(tx('Звук заставки (необязательно)'), fileSlot({ value: a.introSound, kind: 'audio', audio: ctx.audio, onChange: (v) => { if (v) a.introSound = v; else delete a.introSound; } })),
        h('div', { class: 'row' },
          field(tx('Звук через, мс'), num(a.introSoundTime ?? 0, (v) => { a.introSoundTime = v || 0; })),
          field(tx('Громкость звука, %'), num(a.introVolume ?? 100, (v) => { a.introVolume = v ?? 100; })),
          field(tx('Длительность, мс (пусто — длина GIF)'), num(a.introDuration ?? '', (v) => { if (v) a.introDuration = v; else delete a.introDuration; })))));
  }

  // Длительность звука/музыки (по метаданным файла, без полного декодирования); кэш на время работы
  const DUR = new Map();
  let durActive = 0; const durQueue = [];
  function audioDuration(url) {
    if (!url) return Promise.resolve(null);
    if (DUR.has(url)) return DUR.get(url);
    const p = new Promise((resolve) => { durQueue.push({ url, resolve }); pumpDur(); });
    DUR.set(url, p);
    return p;
  }
  function pumpDur() {
    while (durActive < 4 && durQueue.length) {
      const { url, resolve } = durQueue.shift();
      durActive++;
      const el = new Audio();
      el.preload = 'metadata';
      let done = false;
      const fin = (v) => { if (done) return; done = true; durActive--; el.removeAttribute('src'); el.load(); resolve(v); pumpDur(); };
      el.onloadedmetadata = () => fin(Number.isFinite(el.duration) ? el.duration : null);
      el.onerror = () => fin(null);
      setTimeout(() => fin(null), 8000);
      el.src = Lib.url(url);
    }
  }
  const fmtDur = (sec) => { if (sec == null) return ''; const m = Math.floor(sec / 60); const ss = Math.round(sec % 60); return m + ':' + String(ss === 60 ? 59 : ss).padStart(2, '0'); };
  // Простой плеер: кнопка, ползунок перемотки и время
  function audioPlayer(url, volume) {
    const el = new Audio(Lib.url(url));
    el.preload = 'metadata';
    el.volume = Math.max(0, Math.min(1, (volume ?? 100) / 100));
    el.className = 'oo-player';
    const btn = h('button', { class: 'btn small', type: 'button' }, '▶');
    const bar = h('input', { type: 'range', min: 0, max: 1000, value: 0, style: { flex: 1 } });
    const time = h('span', { class: 'muted', style: { minWidth: '92px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, '0:00 / …');
    const upd = () => { time.textContent = fmtDur(el.currentTime) + ' / ' + (Number.isFinite(el.duration) ? fmtDur(el.duration) : '…'); if (!bar._drag && el.duration) bar.value = Math.round((el.currentTime / el.duration) * 1000); };
    el.addEventListener('timeupdate', upd); el.addEventListener('loadedmetadata', upd);
    el.addEventListener('play', () => { btn.textContent = '⏸'; }); el.addEventListener('pause', () => { btn.textContent = '▶'; }); el.addEventListener('ended', () => { btn.textContent = '▶'; });
    btn.onclick = () => { document.querySelectorAll('.audio-player').forEach((p) => p !== wrap && p._audio && p._audio.pause()); if (el.paused) el.play().catch(() => {}); else el.pause(); };
    bar.addEventListener('input', () => { bar._drag = true; if (el.duration) { el.currentTime = (bar.value / 1000) * el.duration; upd(); } });
    bar.addEventListener('change', () => { bar._drag = false; });
    const wrap = h('div', { class: 'audio-player picker-line', style: { alignItems: 'center' } }, btn, bar, time);
    wrap._audio = el;
    return wrap;
  }

  function audioEditor(a, ctx, isMusic) {
    return h('div', null,
      field(tx('Название'), txt(a.name, (v) => { a.name = v; })),
      field(tx('Файл'), fileSlot({ value: a.url, kind: 'audio', audio: ctx.audio, allowClear: false, onChange: (v, n) => { a.url = v; if (!a.name && n) a.name = n; } })),
      field(tx('Громкость, %'), num(a.volume ?? 100, (v) => { a.volume = Math.max(0, Math.min(200, v ?? 100)); })),
      a.url ? field(tx('Прослушать (ползунок — перемотка)'), audioPlayer(a.url, a.volume)) : null,
      isMusic ? null : h('div', { class: 'row' },
        field(tx('Плавное появление, мс'), num(a.fadeInMs ?? 0, (v) => { if (v > 0) a.fadeInMs = Math.min(60000, v); else delete a.fadeInMs; })),
        field(tx('Плавное угасание, мс'), num(a.fadeOutMs ?? 0, (v) => { if (v > 0) a.fadeOutMs = Math.min(60000, v); else delete a.fadeOutMs; }))),
      isMusic ? null : h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => ctx.audio && a.url && ctx.audio.playSound(a.url, a.volume ?? 100, { fadeInMs: a.fadeInMs, fadeOutMs: a.fadeOutMs }) }, tx('▶ Прослушать с появлением и угасанием')), h('button', { class: 'btn small', type: 'button', onclick: () => ctx.audio && ctx.audio.stopSounds() }, tx('■ Остановить (с угасанием)'))),
      h('div', { class: 'note' }, isMusic ? tx('Музыка зацикливается целиком. В тексте кадра: [#bgm') + (a.id || 'N') + ']'
        : tx('В тексте кадра: [#bgs') + (a.id || 'N') + tx(']. Угасание — к концу звука и при остановке ([#bgss], [#bgsfo]). На objection.lol появления и угасания звуков нет.')));
  }

  function newTextbox(id) {
    return {
      id, name: '', url: '', imageOpacity: 1, opacity: 1, wordSpacing: 0, letterSpacing: 0, source: 'custom',
      defaultColor: 'FFFFFF', red: 'F77337', green: '00F61C', blue: '6BC7F6',
      nameplate: { url: '', replaceBox: false, top: 62.9, right: 31.7, width: 100, fontSize: 29, fontUrl: '', color: 'FFFFFF', textAlignment: 'center', letterSpacing: 0 },
      text: { fontUrl: '', fontSize: 34, left: 23.2, top: 69, width: 67, height: 4.5, lineHeight: 1.2, textAlignment: 'left', leftCenter: null, topCenter: null, widthCenter: null },
      nextButton: { top: 75.7, left: 91, iconSize: 3.75, iconColor: 'FFD560' },
    };
  }

  // Редактор текстбокса (формат objection.lol): большой предпросмотр сверху, ползунки,
  // область текста и табличку можно двигать мышью прямо на предпросмотре.
  function textboxEditor(a, ctx) {
    a.nameplate = a.nameplate || {}; a.text = a.text || {}; a.nextButton = a.nextButton || {};
    const ro = !!a.isPreset;
    // Предпросмотр редактора — в пропорциях самой картинки текстбокса (вертикальный 9:16 редактируется
    // и в горизонтальном проекте). Пока картинка не загружена — в пропорциях проекта.
    let ar = 16 / 9;
    let wholeFrame = localStorage.getItem('oo.tbWholeFrame') === '1';
    let wholeChk = null;
    let designAuto = null;
    const cv = h('canvas', { class: 'tb-preview' });
    const pl = new window.Player(cv, ctx.audio);
    pl.project = { options: { aspectRatio: ctx.aspectRatio || '16:9', textboxLift: 0 }, aliases: [], pairs: [], groups: [{ frames: [] }] };
    pl.frames = [];
    const sizeFor = (r) => (r < 1 ? [540, Math.round(540 / r)] : [Math.round(540 * r), 540]);
    pl.setSize(...sizeFor(ar));
    let el = null;
    // предпросмотр редактора — в пропорциях картинки (настройка «как вписывать» здесь не действует)
    pl.ignoreFit = true;
    const fitAspect = () => {
      const img = pl.tb && pl.tb.box;
      if (!img || !img.w || !img.h) return;
      // вертикальная картинка при разметке «кадр 16:9»: по умолчанию предпросмотр крупно, в пропорциях картинки;
      // галка «Весь кадр 16:9» показывает её посередине кадра 16:9 (видны рамки, вылезающие за картинку)
      const vertical = img.h > img.w;
      // текстбокс под конкретный формат — предпросмотр в этом формате, как он будет выглядеть в таком проекте
      const guess = window.PlayerUtil.guessDesign(img);
      const key = a.designFor === 'any' ? null : (a.designFor && a.designFor !== 'auto' ? a.designFor : guess);
      if (designAuto) designAuto.textContent = tx('Определить по картинке') + (guess ? tx` (сейчас: ${guess})` : tx(' (не похоже ни на один)'));
      let nar;
      if (key) { const [x, y] = key.split(':').map(Number); nar = x / y; }
      else nar = vertical && a.layoutBase !== 'image' && wholeFrame ? 16 / 9 : img.w / img.h;
      if (wholeChk) wholeChk.style.display = !key && vertical && a.layoutBase !== 'image' ? '' : 'none';
      if (Math.abs(nar - ar) > 0.005) { ar = nar; pl.setSize(...sizeFor(ar)); setBox(); }
      if (el) el.classList.toggle('vertical', ar < 1);
    };
    pl.previewStyle = a;
    pl.previewRev = 0;
    let showName = true;
    let center = false;
    const sample = window.Tags.parseText(tx('Обычный текст, [#/r]красный[/#], [#/g]зелёный[/#] и [#/b]синий[/#] цвет. Длинная реплика, чтобы проверить переносы строк и сколько их помещается в окно.'));
    const chars = [];
    for (const t of sample) if (t.type === 'text') for (const c of t.text) chars.push({ ch: c, color: t.color, fmt: t.fmt });
    const setBox = () => { pl.state.box = { visible: true, name: showName ? tx('Феникс') : '', chars, shown: chars.length, center, layout: null }; };
    setBox();
    const bgA = Lib.list('backgrounds')[0];
    if (bgA) window.Assets.ImageCache.get(bgA.url, 540).then((img) => { if (img) pl.state.bg = { img, desk: null, wide: false, flipped: false }; });

    // рамки областей поверх предпросмотра
    const textArea = h('div', { class: 'tb-area text', title: tx('Область текста — тяните, чтобы сдвинуть; уголок — размер') }, h('div', { class: 'tb-handle' }));
    const nameArea = h('div', { class: 'tb-area name', title: tx('Имя на табличке — тяните, чтобы сдвинуть') });
    const nextArea = h('div', { class: 'tb-area next', title: tx('Стрелка «дальше»') });
    const stage = h('div', { class: 'tb-stage' }, cv, ro ? null : textArea, ro ? null : nameArea, ro ? null : nextArea);
    const controls = [];
    const syncControls = () => { for (const c of controls) c.sync(); };
    // рамки считаются из той же геометрии, что у проигрывателя (tbFrame), в пикселях холста → % от сцены
    const frame = () => (pl.tb && pl.tb.style ? pl.tbFrame() : null);
    const plateH = (f) => { const pimg = pl.tb && pl.tb.plate; return pimg ? (f.rw * pimg.h) / pimg.w : f.rh; };
    const placeAreas = () => {
      const f = frame();
      if (!f) return;
      const W = pl.W; const H = pl.H;
      const px = (v) => (v / W) * 100 + '%';
      const py = (v) => (v / H) * 100 + '%';
      const t = a.text;
      const fs = (t.fontSize || 30) * f.size;
      const left = center ? (t.leftCenter ?? t.left ?? 5) : (t.left ?? 5);
      const top = center ? (t.topCenter ?? t.top ?? 70) : (t.top ?? 70);
      const width = center ? (t.widthCenter ?? t.width ?? 90) : (t.width ?? 90);
      Object.assign(textArea.style, { left: px(f.vx + (f.vw * left) / 100), width: px((f.vw * width) / 100), top: py(f.y0 + (f.rh * top) / 100), height: py((t.height ?? 3.6) * fs) });
      const np = a.nameplate;
      const pch = plateH(f);
      const nfs = (np.fontSize || 26) * f.size;
      const R = f.vx + f.vw; const nw = (f.vw * (np.width ?? 100)) / 100;
      Object.assign(nameArea.style, { right: 'auto', left: px(R - (f.vw * (np.right ?? 30)) / 100 - nw), width: px(nw), top: py(H - pch + (pch * (np.top ?? 62)) / 100), height: py(nfs * 1.5), display: showName && !a.hideName ? '' : 'none' });
      const nb = a.nextButton;
      const sz = (nb.iconSize || 3) * 9 * f.size;
      Object.assign(nextArea.style, { left: px(f.vx + (f.vw * (nb.left ?? 90)) / 100), top: py(f.y0 + (f.rh * (nb.top ?? 80)) / 100), width: px(sz), height: py(sz * 1.1) });
    };
    let t;
    const refresh = () => {
      placeAreas();
      clearTimeout(t);
      t = setTimeout(async () => { pl.previewRev++; pl.tbKey = null; await pl.prepareTextbox(); setBox(); fitAspect(); placeAreas(); }, 60);
    };
    // перетаскивание мышью
    const drag = (el, onMove) => {
      el.addEventListener('pointerdown', (e) => {
        if (ro) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const r = stage.getBoundingClientRect();
        const resize = e.target.classList.contains('tb-handle');
        let lx = e.clientX; let ly = e.clientY;
        const move = (ev) => {
          const dx = ((ev.clientX - lx) / r.width) * 100;
          const dy = ((ev.clientY - ly) / r.height) * 100;
          lx = ev.clientX; ly = ev.clientY;
          onMove(dx, dy, resize);
          syncControls();
          refresh();
        };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    };
    const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
    // сдвиг мышью (в % сцены) → в единицы текстбокса
    const toPx = (dx, dy) => [(dx / 100) * pl.W, (dy / 100) * pl.H];
    drag(textArea, (dx, dy, resize) => {
      const f = frame(); if (!f) return;
      const [x, y] = toPx(dx, dy);
      const T = a.text;
      const kL = center ? 'leftCenter' : 'left'; const kT = center ? 'topCenter' : 'top'; const kW = center ? 'widthCenter' : 'width';
      if (resize) {
        T[kW] = round(Math.max(1, (T[kW] ?? T.width ?? 90) + (x / f.vw) * 100));
        const fs = (T.fontSize || 30) * f.size;
        T.height = round(Math.max(0.5, (T.height ?? 3.6) + y / fs), 2);
      } else {
        T[kL] = round((T[kL] ?? T.left ?? 5) + (x / f.vw) * 100);
        T[kT] = round((T[kT] ?? T.top ?? 70) + (y / f.rh) * 100);
      }
    });
    drag(nameArea, (dx, dy) => {
      const f = frame(); if (!f) return;
      const [x, y] = toPx(dx, dy);
      const np = a.nameplate;
      np.right = round((np.right ?? 30) - (x / f.vw) * 100);
      np.top = round((np.top ?? 62) + (y / plateH(f)) * 100);
    });
    drag(nextArea, (dx, dy) => {
      const f = frame(); if (!f) return;
      const [x, y] = toPx(dx, dy);
      const nb = a.nextButton;
      nb.left = round((nb.left ?? 90) + (x / f.vw) * 100);
      nb.top = round((nb.top ?? 80) + (y / f.rh) * 100);
    });

    // ползунок + число
    const slider = (o, k, label, min, max, step, def) => {
      const get = () => (typeof o === 'function' ? o() : o)[k];
      const num = h('input', { class: 'input', type: 'number', min, max, step, disabled: ro, style: { width: '76px', flex: 'none' } });
      const rng = h('input', { type: 'range', min, max, step, disabled: ro, style: { flex: 1, minWidth: 0 } });
      const sync = () => { const v = get(); num.value = v ?? ''; rng.value = v ?? def; num.placeholder = String(def); };
      const set = (v) => { const tgt = typeof o === 'function' ? o() : o; if (v === '' || v == null) tgt[k] = null; else tgt[k] = Number(v); sync(); refresh(); };
      rng.addEventListener('input', () => set(rng.value));
      num.addEventListener('change', () => set(num.value));
      sync();
      controls.push({ sync });
      return h('div', { class: 'slider-row' }, h('label', null, label), rng, num);
    };
    const color = (o, k, label, def = 'FFFFFF') => h('div', { class: 'field' }, h('label', null, label), h('input', { class: 'input', type: 'color', disabled: ro, value: '#' + String(o[k] || def).replace('#', '').padEnd(6, 'F').slice(0, 6), style: { height: '34px', padding: '2px' }, oninput: (e) => { o[k] = e.target.value.replace('#', '').toUpperCase(); refresh(); } }));
    const align = (o, label) => h('div', { class: 'field' }, h('label', null, label), sel([['left', tx('Слева')], ['center', tx('По центру')], ['right', tx('Справа')]], o.textAlignment === 'start' ? 'left' : (o.textAlignment || 'left'), (v) => { o.textAlignment = v; refresh(); }));
    const file = (o, k, kind) => fileSlot({ value: o[k], kind, onChange: (v) => { o[k] = v; refresh(); } });
    const T = () => a.text;
    const sec = (title, open, ...kids) => h('details', { class: 'section tb-sec', open: open || null }, h('summary', null, title), ...kids);
    el = h('div', { class: 'tb-editor' },
      h('div', { class: 'tb-preview-wrap' }, stage,
        h('div', { class: 'toolbar', style: { marginTop: '6px' } },
          chk(tx('С именем'), true, (v) => { showName = v; setBox(); placeAreas(); }),
          chk(tx('Текст по центру (действие «по центру»)'), false, (v) => { center = v; refresh(); }),
          (wholeChk = h('span', { style: { display: 'none' }, title: tx('Показать вертикальную картинку посередине кадра 16:9 — видно рамки, которые выходят за картинку') },
            chk(tx('Весь кадр 16:9'), wholeFrame, (v) => { wholeFrame = v; localStorage.setItem('oo.tbWholeFrame', v ? '1' : '0'); fitAspect(); placeAreas(); }))),
          ro ? null : h('span', { class: 'muted' }, tx('Рамки можно двигать мышью')))),
      ro ? null : h('div', { class: 'field' }, h('label', null, tx('Название')), txt(a.name, (v) => { a.name = v; })),
      ro ? null : sec(tx('Картинки'), !a.url,
        h('div', { class: 'note' }, tx('Картинки окна и таблички — во весь кадр, с прозрачностью (как на objection.lol, например 1920×1080; для вертикального видео — 1080×1920 или середина горизонтальной). Горизонтальная картинка с пустыми краями в вертикальном проекте растягивается по высоте, края обрезаются.')),
        h('div', { class: 'lbl' }, tx('Окно текста')), file(a, 'url', 'image'),
        h('div', { class: 'lbl', style: { marginTop: '6px' } }, tx('Табличка с именем')), file(a.nameplate, 'url', 'image'),
        h('div', { style: { margin: '6px 0' } }, chk(tx('Табличка — это окно целиком (показывать её вместо окна, когда есть имя)'), a.nameplate.replaceBox, (v) => { a.nameplate.replaceBox = v; refresh(); })),
        h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', null, tx('Текстбокс сделан под формат')),
          (() => {
            const se = sel([['auto', tx('Определить по картинке')], ...window.PlayerUtil.DESIGN_ASPECTS.map((k) => [k, k]), ['any', tx('Ни под какой (подстраивать под проект)')]], a.designFor || 'auto', (v) => { if (v === 'auto') delete a.designFor; else a.designFor = v; refresh(); });
            designAuto = se.querySelector('option[value="auto"]');
            return se;
          })()),
        h('div', { class: 'note' }, tx('В проекте этого формата текстбокс показывается как есть: картинка по ширине кадра, проценты и шрифт — от самой картинки, никаких подгонок. В проекте другого формата — подгоняется по настройкам ниже. Предпросмотр редактора — в формате текстбокса.')),
        h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', null, tx('В проекте другого формата: проценты и размеры шрифта считаются от')),
          sel([['16:9', tx('кадра 16:9 по высоте картинки (как на objection.lol)')], ['image', tx('самой картинки (вертикальный текстбокс с нуля)')]], a.layoutBase === 'image' ? 'image' : '16:9', (v) => { if (v === 'image') a.layoutBase = 'image'; else delete a.layoutBase; refresh(); })),
        h('div', { class: 'note' }, tx('«Кадр 16:9»: вертикальная картинка, вырезанная из середины горизонтальной, работает с теми же настройками, что и горизонтальная, и в проекте любого формата выглядит одинаково. Для горизонтальной картинки эта настройка ничего не меняет: всё считается от её ширины, как на сайте.')),
        h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', null, tx('В проекте другого формата картинка вписывается')),
          sel([['auto', tx('Автоматически')], ['width', tx('По ширине кадра')], ['height', tx('По высоте кадра (края обрезаются)')], ['content', tx('Нарисованное — по ширине кадра (пустые края за кадром)')]], a.fit || 'auto', (v) => { if (v === 'auto') delete a.fit; else a.fit = v; refresh(); })),
        h('div', { class: 'note' }, tx('Автоматически: в вертикальном проекте нарисованное занимает всю ширину кадра (пустые края и верх картинки уходят за кадр) — горизонтальная картинка с пустыми краями и вырезанная из неё середина выглядят одинаково; в горизонтальном проекте вертикальная картинка — по высоте, горизонтальная — по ширине, как на objection.lol. Посмотреть результат — в предпросмотре кадра проекта.')),
        slider(a, 'imageOpacity', tx('Непрозрачность картинки'), 0, 1, 0.01, 1),
        slider(a, 'opacity', tx('Непрозрачность окна'), 0, 1, 0.01, 1)),
      sec(tx('Текст'), true,
        ro ? null : h('div', { class: 'lbl' }, tx('Шрифт (TTF, OTF, WOFF)')), ro ? null : file(a.text, 'fontUrl', 'font'),
        slider(T, 'fontSize', tx('Размер шрифта'), 6, 120, 0.5, 30),
        slider(T, 'lineHeight', tx('Межстрочный'), 0.6, 3, 0.01, 1.5),
        slider(T, 'height', tx('Высота, строк·размер'), 0.5, 12, 0.01, 3.6),
        slider(T, 'left', tx('Слева, %'), -10, 100, 0.1, 5),
        slider(T, 'top', tx('Сверху, %'), -10, 110, 0.1, 70),
        slider(T, 'width', tx('Ширина, %'), 1, 120, 0.1, 90),
        h('div', { class: 'lbl', style: { marginTop: '8px' } }, tx('Когда текст по центру (пусто — как обычно)')),
        slider(T, 'leftCenter', tx('Слева, %'), -10, 100, 0.1, a.text.left ?? 5),
        slider(T, 'topCenter', tx('Сверху, %'), -10, 110, 0.1, a.text.top ?? 70),
        slider(T, 'widthCenter', tx('Ширина, %'), 1, 120, 0.1, a.text.width ?? 90),
        h('div', { class: 'row' }, align(a.text, tx('Выравнивание'))),
        slider(a, 'letterSpacing', tx('Между буквами'), -0.2, 0.6, 0.005, 0),
        slider(a, 'wordSpacing', tx('Между словами'), -1, 4, 0.05, 0),
        slider(T, 'outlineWidth', tx('Обводка, px'), 0, 12, 0.25, 0),
        h('div', { class: 'row' }, color(a.text, 'outlineColor', tx('Цвет обводки'), '000000'))),
      sec(tx('Цвета текста'), false,
        h('div', { class: 'row' }, color(a, 'defaultColor', tx('Обычный')), color(a, 'red', tx('Красный')), color(a, 'green', tx('Зелёный')), color(a, 'blue', tx('Синий')))),
      sec(tx('Имя на табличке'), false,
        h('div', { style: { margin: '4px 0 6px' } }, chk(tx('Не показывать имя персонажа (имя нарисовано на картинке или не нужно)'), !!a.hideName, (v) => { if (v) a.hideName = true; else delete a.hideName; refresh(); })),
        ro ? null : h('div', { class: 'lbl' }, tx('Шрифт имени')), ro ? null : file(a.nameplate, 'fontUrl', 'font'),
        slider(a.nameplate, 'fontSize', tx('Размер'), 6, 100, 0.5, 26),
        slider(a.nameplate, 'top', tx('Сверху, %'), -10, 110, 0.1, 62),
        slider(a.nameplate, 'right', tx('Справа, %'), -50, 110, 0.1, 30),
        slider(a.nameplate, 'width', tx('Ширина, %'), 1, 120, 0.1, 100),
        slider(a.nameplate, 'letterSpacing', tx('Между буквами'), -0.2, 0.6, 0.005, 0),
        h('div', { class: 'row' }, align(a.nameplate, tx('Выравнивание')), color(a.nameplate, 'color', tx('Цвет имени'))),
        h('div', { class: 'note' }, tx('У персонажа может быть свой цвет имени (в редакторе персонажа) — он важнее этого.')),
        slider(a.nameplate, 'outlineWidth', tx('Обводка, px'), 0, 12, 0.25, 0),
        h('div', { class: 'row' }, color(a.nameplate, 'outlineColor', tx('Цвет обводки'), '000000'))),
      sec(tx('Стрелка «дальше» (в режиме «По клику»)'), false,
        slider(a.nextButton, 'top', tx('Сверху, %'), -10, 110, 0.1, 80),
        slider(a.nextButton, 'left', tx('Слева, %'), -10, 110, 0.1, 90),
        slider(a.nextButton, 'iconSize', tx('Размер'), 0.5, 12, 0.05, 3),
        h('div', { class: 'row' }, color(a.nextButton, 'iconColor', tx('Цвет')))));
    el.classList.toggle('vertical', ar < 1);
    refresh();
    return { el, player: pl };
  }

  // ---------- Окно библиотеки ----------
  function openLibrary(ctx, startTab = 'characters', focusId = null) {
    let tab = startTab;
    let filter = 'all';
    let selectedId = focusId;
    let draft = null;
    let curFolder = null; // null — все
    const extraKeys = new Set(); // Ctrl+клик: дополнительные папки/метки (ресурс должен подходить под все)
    let previewPlayer = null;
    const multi = new Set();
    const tabsEl = h('div', { class: 'tabs' });
    const foldersEl = h('div', { class: 'lib-folders' });
    const moveSel = h('select', { class: 'input', style: { width: '200px', display: 'none' }, onchange: async (e) => {
      const v = e.target.value;
      if (v === '__') return;
      let target = v;
      if (v === '__new') { target = await UI.promptDialog(tx('Новая папка'), curFolder || ''); if (!target) { e.target.value = '__'; return; } }
      await moveTo([...multi], target === '__none' ? '' : target);
      e.target.value = '__';
    } });
    const search = h('input', { class: 'input', type: 'search', placeholder: tx('Поиск…'), style: { width: '200px' } });
    const filterSel = sel([['all', tx('Все')], ['fav', tx('★ Избранное')], ['custom', tx('Свои')], ['site', tx('С objection.lol')], ['preset', tx('Стандартные')]], 'all', (v) => { filter = v; renderList(); });
    // роль персонажа — фильтр сочетается с папкой/меткой слева и с фильтром выше (например, AJ Trilogy + свидетели)
    let role = '';
    const roleSel = sel([['', tx('Все роли')], ...Object.entries(Marks.ROLES)], '', (v) => { role = v; renderList(); });
    roleSel.title = tx('Роль персонажа');
    let sortMode = localStorage.getItem('oo.lib.sort') || 'default';
    let view = localStorage.getItem('oo.lib.view') || 'grid';
    let sizes = null;
    const sortSel = sel(Marks.SORTS, sortMode, async (v) => { sortMode = v; localStorage.setItem('oo.lib.sort', v); sizes = null; renderList(); });
    sortSel.style.width = '170px';
    sortSel.title = tx('Сортировка (избранное всегда сверху)');
    const viewBtn = h('button', { class: 'btn small', title: tx('Плитка / список'), onclick: () => { view = view === 'list' ? 'grid' : 'list'; localStorage.setItem('oo.lib.view', view); viewBtn.textContent = view === 'list' ? '▦' : '☰'; renderList(); } }, view === 'list' ? '▦' : '☰');
    filterSel.style.width = '160px';
    const grid = h('div', { class: 'grid' });
    const bulkBar = h('div', { class: 'bulkbar hidden' });
    let lastClicked = null;
    const editBox = h('div', { class: 'lib-edit' });
    const countEl = h('span', { class: 'muted' });
    search.addEventListener('input', () => renderList());

    const addBtn = h('button', { class: 'btn primary small', onclick: () => addNew() }, tx('＋ Добавить'));
    const addFilesBtn = h('button', { class: 'btn small', onclick: () => addFromFiles() }, tx('＋ Из файлов…'));
    const packBtn = h('button', { class: 'btn small', onclick: async () => {
      const added = await window.api.lib.importPack(isUserFolder(curFolder) ? curFolder : '');
      if (added.length) { await Lib.load(); toast(tx('Импортировано: ') + added.length); renderList(); }
    } }, tx('Импорт пакета…'));
    const presetBtn = h('button', { class: 'btn small', onclick: () => downloadPresets(ctx).then(() => renderList()) }, tx('⬇ Стандартные с objection.lol'));
    const folderBtn = h('button', { class: 'btn small', title: tx('Открыть папку библиотеки в проводнике'), onclick: () => window.api.lib.openFolder() }, tx('📂 Папка на диске'));
    const codeBtn = h('button', { class: 'btn small', title: tx('Скачать персонажа с objection.lol по коду доступа (нужен вход на сайт)'), onclick: async () => {
      if (!ctx.downloadByCode) return;
      const r = await ctx.downloadByCode(tab === 'textboxes' ? 'textboxes' : 'characters', isUserFolder(curFolder) ? curFolder : tx('По коду доступа'));
      if (r) { renderFolders(); renderList(); }
    } }, tx('🔑 По коду доступа…'));
    const moreBtn = h('button', { class: 'btn small', onclick: (e) => menu(e.currentTarget, [
      { label: tx('📥 Импорт пакета ресурса (.oopack)…'), fn: () => packBtn.click() },
      tab !== 'textboxes' && tab !== 'evidence' && tab !== 'popups' ? { label: tx('⬇ Стандартные с objection.lol…'), fn: () => presetBtn.click() } : null,
      { label: tx('🧹 Найти дубликаты…'), fn: () => dupBtn.click() },
      { label: tx('🩺 Проверить библиотеку (убрать ресурсы без файлов)'), fn: async () => {
        const r = await window.api.lib.checkFiles();
        await Lib.load();
        toast(r.removed.length || r.fixedPoses ? tx`Убрано ресурсов: ${r.removed.length}${r.fixedPoses ? tx`, поз без картинок: ${r.fixedPoses}` : ''}` : tx('Всё в порядке: у всех ресурсов есть файлы'), 6000);
        renderTabs(); renderFolders(); renderList(); if (draft && !getFor(tab, draft.id)) { draft = null; renderEditor(); }
      } },
      '-',
      { label: tx('📂 Открыть папку библиотеки на диске'), fn: () => window.api.lib.openFolder() },
      ctx.openLibraryDir ? { label: tx('🚚 Сменить папку библиотеки (перенести ресурсы)…'), fn: () => ctx.openLibraryDir() } : null,
    ].filter(Boolean)) }, tx('Ещё ▾'));
    const tbSiteBtn = h('button', { class: 'btn small', title: tx('Скачать текстбокс с objection.lol по его ID'), onclick: async () => {
      const id = await UI.promptDialog(tx('ID текстбокса на objection.lol (например, fd32ac1c-34a6-…)'), '');
      if (!id || !id.trim()) return;
      try {
        const r = await runDownload(tx('Скачивание текстбокса'), () => window.api.download.project({ options: { chatbox: id.trim() }, groups: [], pairs: [] }, isUserFolder(curFolder) ? curFolder : ''));
        if (r.errors && r.errors.length) toast(tx('Не найден: ') + r.errors[0], 6000); else toast(tx('Готово'));
      } catch (e) { toast(tx('Ошибка: ') + e.message, 6000); }
      renderFolders(); renderList();
    } }, tx('⬇ С objection.lol по ID…'));
    function isUserFolder(f) { return f && f !== STD && f !== CUSTOMS && !String(f).startsWith(TAG); }

    const dupBtn = h('button', { class: 'btn small', title: tx('Найти одинаковые ресурсы'), onclick: () => openDuplicates(tab, ctx, () => { renderFolders(); renderList(); }) }, tx('Дубликаты…'));
    const zipBtn = h('button', { class: 'btn small', title: tx('Персонажи из ZIP-архива с папкой спрайтов'), onclick: async () => {
      const r = await window.api.lib.importZip(curFolder || '');
      if (!r) return;
      await Lib.load();
      renderFolders(); renderList(); renderTabsCountsOnly();
      const names = r.added.map((a) => a.name).join(', ');
      toast(r.added.length ? tx`Добавлено персонажей: ${r.added.length} (${names})` : tx('В архиве не нашлось картинок'), 6000);
      if (r.added.length === 1) { selectedId = r.added[0].id; draft = JSON.parse(JSON.stringify(Lib.char(selectedId))); renderList(); renderEditor(); }
    } }, tx('＋ Из ZIP…'));
    const body = h('div', { class: 'lib-layout' },
      foldersEl,
      h('div', { class: 'lib-list' },
        h('div', { class: 'toolbar' }, addBtn, addFilesBtn, zipBtn, window.api.mobile ? null : codeBtn, tbSiteBtn, moreBtn),
        h('div', { class: 'toolbar' }, search, filterSel, roleSel, sortSel, viewBtn, countEl, h('span', { class: 'muted hint' }, tx('Ctrl+клик — выделить несколько, Shift+клик — подряд'))),
        bulkBar,
        grid),
      editBox);
    const m = modal({ title: tx('Библиотека ресурсов'), wide: true, body: [body], onClose: () => { document.querySelectorAll('.audio-player').forEach((p) => p._audio && p._audio.pause()); if (previewPlayer) previewPlayer.destroy(); ctx.audio.stopAll(); ctx.onLibraryChanged && ctx.onLibraryChanged(); } });
    m.el.insertBefore(tabsEl, m.body);
    if (!document.body.classList.contains('mobile')) m.body.style.overflow = 'hidden'; // на телефоне прокручивается всё окно целиком

    // Ctrl+Z — отменить последнее действие в библиотеке (удаление, перенос в папку, изменение, папки)
    const onUndoKey = async (e) => {
      if (!(e.ctrlKey || e.metaKey) || !(e.code === 'KeyZ' || e.key.toLowerCase() === 'z') || e.shiftKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      if (document.querySelectorAll('.modal-wrap').length > 1) return; // открыто другое окно поверх библиотеки
      e.preventDefault(); e.stopPropagation();
      const r = await window.api.lib.undo();
      if (!r) { toast(tx('Отменять нечего')); return; }
      await Lib.load();
      window.Assets.ImageCache.clear && window.Assets.ImageCache.clear();
      if (r.type && r.type !== tab && TABS.some((t) => t.type === r.type)) { tab = r.type; curFolder = null; }
      selectedId = null; draft = null; multi.clear();
      renderTabs(); renderFolders(); renderList(); renderEditor();
      toast(tx('Отменено: ') + r.label + (r.left ? tx` (можно отменить ещё ${r.left})` : ''));
    };
    document.addEventListener('keydown', onUndoKey, true);
    m.done.then(() => document.removeEventListener('keydown', onUndoKey, true));

    function renderTabs() {
      tabsEl.innerHTML = '';
      for (const t of TABS) {
        tabsEl.append(h('button', { class: t.type === tab ? 'on' : '', onclick: () => { tab = t.type; selectedId = null; draft = null; curFolder = null; extraKeys.clear(); multi.clear(); renderTabs(); renderFolders(); renderList(); renderEditor(); } }, `${t.icon} ${t.label} (${listFor(t.type).length})`));
      }
      addFilesBtn.style.display = tab === 'characters' || tab === 'textboxes' ? 'none' : '';
      zipBtn.style.display = tab === 'characters' ? '' : 'none';
      tbSiteBtn.style.display = tab === 'textboxes' ? '' : 'none';
      codeBtn.style.display = tab === 'characters' || tab === 'textboxes' ? '' : 'none';
    }

    function filtered() {
      const q = search.value.trim().toLowerCase();
      const list = listFor(tab).filter((a) => {
        if (filter === 'custom' && (a.isPreset || a.source === 'objection.lol')) return false;
        if (filter === 'site' && (a.isPreset || a.source !== 'objection.lol')) return false;
        if (filter === 'preset' && !a.isPreset) return false;
        if (filter === 'fav' && !Marks.fav(tab, a.id)) return false;
        if (role && tab === 'characters' && (a.side || 'witness') !== role) return false;
        if (!inFolder(a, curFolder, tab)) return false;
        for (const k of extraKeys) if (!inFolder(a, k, tab)) return false;
        return !q || (a.name || '').toLowerCase().includes(q) || String(a.id) === q || Marks.tags(tab, a.id).some((t) => t.toLowerCase().includes(q));
      });
      const def = (x, y) => (x.isPreset ? 1 : 0) - (y.isPreset ? 1 : 0) || (y.source === 'objection.lol' ? 0 : 1) - (x.source === 'objection.lol' ? 0 : 1) || (x.name || '').localeCompare(y.name || '');
      return Marks.sort(tab, list, sortMode, sizes, def);
    }
    async function editTags(a) {
      const known = Marks.allTags(tab);
      const v = await UI.promptDialog(tx('Метки через запятую — ресурс может быть сразу в нескольких «папках»-метках') + (known.length ? tx('\nУже есть: ') + known.join(', ') : ''), Marks.tags(tab, a.id).join(', '));
      if (v == null) return;
      await Marks.setTags(tab, a.id, v.split(',').map((x) => x.trim()).filter(Boolean));
      renderFolders(); renderList();
    }

    async function renderList() {
      roleSel.style.display = tab === 'characters' ? '' : 'none';
      if (tab !== 'characters') { role = ''; roleSel.value = ''; }
      if ((sortMode === 'big' || sortMode === 'small') && !sizes) sizes = await Marks.sizes(tab);
      grid.innerHTML = '';
      grid.className = 'grid' + (view === 'list' ? ' as-list' : '');
      const list = filtered();
      countEl.textContent = list.length + tx(' шт.');
      const icon = TABS.find((t) => t.type === tab).icon;
      // все карточки, порциями по мере прокрутки (раньше показывались только первые 600)
      UI.appendProgressive(grid, list, (a) => {
        const th = assetThumb(tab, a);
        const card = h('div', { class: 'card' + (a.id === selectedId ? ' sel' : ''), title: `${a.name} (id ${a.id})` },
          h('div', { class: 'pic' + (tab === 'characters' ? ' sq' : '') }, th && th.url ? UI.thumbImg(th.url, th.kind, icon) : h('span', { class: 'ico' }, icon)),
          h('div', { class: 'cap' }, a.name || '—', (() => {
            const tg = h('div', { class: 'tag' }, (tab === 'characters' ? (Marks.ROLES[a.side] || tx('Свидетель')) + ' · ' : '') + sourceLabel(a) + ' · id ' + a.id + (view === 'list' && a.folder ? ' · 📁 ' + a.folder : '') + (sizes && sizes[a.id] ? ' · ' + UI.fmtBytes(sizes[a.id]) : ''));
            // у музыки и звуков — длительность
            if ((tab === 'music' || tab === 'sounds') && a.url) audioDuration(a.url).then((d) => { if (d != null) tg.textContent = '⏱ ' + fmtDur(d) + ' · ' + tg.textContent; });
            return tg;
          })(),
            Marks.tags(tab, a.id).length ? h('div', { class: 'tag tags' }, Marks.tags(tab, a.id).map((t) => '🏷' + t).join(' ')) : null));
        if (!isSystemTb(tab, a.id)) {
          const fav = Marks.fav(tab, a.id);
          card.append(h('div', { class: 'card-tools' },
            h('button', { class: 'ct-btn' + (fav ? ' on' : ''), title: fav ? tx('Убрать из избранного') : tx('В избранное (показывается первым и в окнах выбора)'), onclick: async (e) => { e.stopPropagation(); await Marks.toggleFav(tab, a.id); grid.__keep = grid.__shown || 0; renderList(); } }, fav ? '★' : '☆'),
            h('button', { class: 'ct-btn', title: tx('Метки'), onclick: (e) => { e.stopPropagation(); editTags(a); } }, '🏷')));
        }
        if (multi.has(a.id)) card.classList.add('multi');
        card.dataset.id = a.id;
        card.draggable = true;
        card.addEventListener('dragstart', (e) => {
          const ids = multi.size && multi.has(a.id) ? [...multi] : [a.id];
          e.dataTransfer.setData('text/oo-assets', JSON.stringify(ids));
          e.dataTransfer.effectAllowed = 'move';
        });
        card.onclick = (e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            if (e.shiftKey && lastClicked != null) {
              const ids = list.map((x) => x.id);
              const i1 = ids.indexOf(lastClicked); const i2 = ids.indexOf(a.id);
              if (i1 >= 0 && i2 >= 0) for (let k = Math.min(i1, i2); k <= Math.max(i1, i2); k++) if (!list[k].isPreset) multi.add(ids[k]);
            } else if (!a.isPreset) {
              if (multi.has(a.id)) multi.delete(a.id); else multi.add(a.id);
            } else toast(tx('Стандартные ресурсы нельзя выделять для перемещения и удаления'));
            lastClicked = a.id;
            markCards();
            updateMoveSel();
            return;
          }
          lastClicked = a.id;
          multi.clear(); updateMoveSel();
          selectedId = a.id; draft = JSON.parse(JSON.stringify(a)); grid.__keep = grid.__shown || 0; renderList(); renderEditor();
        };
        return card;
      }, 300, Math.max(grid.__keep || 0, list.findIndex((x) => x.id === selectedId) + 60));
      grid.__keep = 0;
      if (!list.length) {
        grid.append(h('div', { class: 'muted', style: { gridColumn: '1/-1', padding: '16px', lineHeight: 1.6 } },
          tx('Здесь пока пусто. «Добавить» создаёт свой ресурс, «Стандартные с objection.lol» скачивает встроенных персонажей, фоны и музыку, пока сайт работает.')));
      }
      renderTabsCountsOnly();
    }
    function markCards() { for (const c of grid.querySelectorAll('.card')) c.classList.toggle('multi', multi.has(Number(c.dataset.id)) || multi.has(c.dataset.id)); }
    function updateMoveSel() {
      bulkBar.innerHTML = '';
      bulkBar.classList.toggle('hidden', !multi.size);
      if (multi.size) {
        bulkBar.append(h('b', null, tx`Выбрано: ${multi.size}`), moveSel,
          h('button', { class: 'btn small danger', onclick: async () => {
            const ids = [...multi];
            const used = ctx.isAssetUsed ? ids.reduce((n, id) => n + ctx.isAssetUsed(tab, id), 0) : 0;
            const ok = await confirmDialog(tx`Удалить выбранные ресурсы (${ids.length}) вместе с их файлами?` + (used ? tx`\nНекоторые из них используются в открытом проекте (${used} раз).` : ''), { ok: tx('Удалить'), danger: true });
            if (!ok) return;
            const n = await window.api.lib.removeMany(tab, ids);
            await Lib.load();
            multi.clear();
            if (draft && ids.includes(draft.id)) { draft = null; selectedId = null; }
            toast(tx('Удалено: ') + n);
            renderTabs(); renderFolders(); renderList(); renderEditor(); updateMoveSel();
          } }, tx('🗑 Удалить выбранные')),
          h('button', { class: 'btn small', onclick: () => { for (const a of filtered()) if (!a.isPreset) multi.add(a.id); markCards(); updateMoveSel(); } }, tx('Выделить все')),
          h('button', { class: 'btn small', onclick: () => { multi.clear(); markCards(); updateMoveSel(); } }, tx('✕ Снять')));
      }
      moveSel.style.display = multi.size ? '' : 'none';
      moveSel.innerHTML = '';
      moveSel.append(h('option', { value: '__' }, tx`Переместить выбранные (${multi.size}) в…`), h('option', { value: '__none' }, tx('Customs (без папки)')),
        allFolders(tab).map((f) => h('option', { value: f }, f)), h('option', { value: '__new' }, tx('＋ Новая папка…')));
      moveSel.value = '__';
    }

    async function moveTo(ids, folder) {
      const real = ids.filter((id) => !getFor(tab, id)?.isPreset);
      if (!real.length) { toast(tx('Стандартные ресурсы не перемещаются — их можно только скопировать')); return; }
      const target = isUserFolder(folder) ? folder : '';
      await window.api.lib.setFolder(tab, real, target);
      await Lib.load();
      if (draft && real.includes(draft.id)) { const a = getFor(tab, draft.id); if (a) draft = JSON.parse(JSON.stringify(a)); }
      multi.clear(); updateMoveSel();
      toast(tx`Перемещено: ${real.length} → ${target ? 'Customs/' + target : 'Customs'}`);
      renderFolders(); renderList(); renderEditor();
    }

    function renderFolders() {
      foldersEl.innerHTML = '';
      const list = listFor(tab);
      const count = (f) => list.filter((a) => inFolder(a, f, tab)).length;
      const entry = (key, label, depth = 0, icon = '📁', title = '') => {
        const el = h('div', { class: 'folder' + (curFolder === key || extraKeys.has(key) ? ' on' : ''), style: { paddingLeft: 8 + depth * 14 + 'px' }, title: (title || label) + (key !== null ? tx('\nCtrl+клик — добавить к выбранному (например, две метки или папка + метка)') : '') },
          h('span', { class: 'fi' }, icon), h('span', { class: 'fn' }, label), h('span', { class: 'fc' }, count(key)));
        el.onclick = (e) => {
          // Ctrl+клик: показываются ресурсы, подходящие сразу под всё выбранное
          if ((e.ctrlKey || e.metaKey) && key !== null && curFolder !== null && key !== curFolder) {
            if (extraKeys.has(key)) extraKeys.delete(key); else extraKeys.add(key);
          } else { curFolder = key; extraKeys.clear(); }
          multi.clear(); updateMoveSel(); renderFolders(); renderList();
        };
        if (key !== null && key !== STD) {
          el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/oo-assets') || (String(key).startsWith(TAG) && e.dataTransfer.types.includes('text/oo-tag'))) { e.preventDefault(); el.classList.add('drop'); } });
          el.addEventListener('dragleave', () => el.classList.remove('drop'));
          if (String(key).startsWith(TAG)) {
            // метки можно перетаскивать, чтобы важные были сверху (порядок общий для библиотеки и окон выбора)
            el.draggable = true;
            el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/oo-tag', key.slice(TAG.length)); e.dataTransfer.effectAllowed = 'move'; });
          }
          el.addEventListener('drop', (e) => {
            e.preventDefault(); el.classList.remove('drop');
            const dragTag = e.dataTransfer.getData('text/oo-tag');
            if (dragTag && String(key).startsWith(TAG)) { Marks.moveTag(tab, dragTag, key.slice(TAG.length)).then(() => renderFolders()); return; }
            try {
              const ids = JSON.parse(e.dataTransfer.getData('text/oo-assets'));
              if (String(key).startsWith(TAG)) {
                const t = key.slice(TAG.length);
                Promise.all(ids.map((id) => Marks.setTags(tab, id, [...Marks.tags(tab, id), t]))).then(() => { toast(tx`Метка «${t}» добавлена: ${ids.length}`); renderFolders(); renderList(); });
              } else moveTo(ids, key);
            } catch (err) { /* */ }
          });
        }
        return el;
      };
      foldersEl.append(entry(null, tx('Все'), 0, '🗂'));
      if (count(STD)) foldersEl.append(entry(STD, tx('Стандартные'), 0, '⭐', tx('Ресурсы objection.lol по умолчанию')));
      foldersEl.append(entry(CUSTOMS, 'Customs', 0, '📦', tx('Всё своё и скачанное для проектов')));
      for (const f of allFolders(tab)) foldersEl.append(entry(f, f.split('/').pop(), f.split('/').length, '📁', 'Customs/' + f));
      const tags = Marks.allTags(tab);
      if (tags.length) foldersEl.append(h('div', { class: 'pick-side-h', title: tx('Порядок меняется перетаскиванием') }, tx('Метки ⇅')));
      for (const t of tags) foldersEl.append(entry(TAG + t, t, 0, '🏷', tx`Метка «${t}». Ресурсы, перетащенные сюда, получают эту метку и остаются в своих папках. Саму метку можно перетащить выше или ниже.`));
      if (curFolder && String(curFolder).startsWith(TAG) && !tags.includes(curFolder.slice(TAG.length))) curFolder = null;
      const isReal = isUserFolder(curFolder);
      foldersEl.append(h('div', { class: 'folder-tools' },
        h('button', { class: 'btn small', title: tx('Новая папка внутри Customs'), onclick: async () => {
          const name = await UI.promptDialog(tx('Название папки') + (isReal ? tx` (внутри «${curFolder}»)` : tx(' (в Customs)')), '');
          if (!name) return;
          const full = (isReal ? curFolder + '/' : '') + name.replace(/\//g, '-').trim();
          const cur = (Lib.data.folders && Lib.data.folders[tab]) || [];
          await window.api.lib.setFolders(tab, [...cur, full]);
          Lib.data.folders = Lib.data.folders || {}; Lib.data.folders[tab] = [...cur, full];
          curFolder = full; renderFolders(); renderList();
        } }, tx('＋ Папка')),
        isReal ? h('button', { class: 'btn small', title: tx('Переименовать папку'), onclick: async () => {
          const old = curFolder;
          const name = await UI.promptDialog(tx('Новое название папки'), old.split('/').pop());
          if (!name) return;
          const nw = old.split('/').slice(0, -1).concat(name.replace(/\//g, '-').trim()).join('/');
          await renameFolder(old, nw);
          curFolder = nw; renderFolders(); renderList();
        } }, '✎') : null,
        isReal ? h('button', { class: 'btn small', title: tx('Удалить папку'), onclick: async () => {
          const old = curFolder;
          const parent = old.split('/').slice(0, -1).join('/');
          const inside = Lib.list(tab).filter((a) => !a.isPreset && ((a.folder || '') === old || (a.folder || '').startsWith(old + '/')));
          let mm;
          mm = modal({
            title: tx('Удалить папку «') + old + '»',
            body: h('div', { style: { lineHeight: 1.5 } }, tx`В папке ресурсов: ${inside.length}.`),
            foot: [h('button', { class: 'btn', onclick: () => mm.close(null) }, tx('Отмена')),
              h('button', { class: 'btn', onclick: () => mm.close('keep') }, tx`Только папку (ресурсы — в «${parent || 'Customs'}»)`),
              h('button', { class: 'btn danger', disabled: !inside.length, onclick: () => mm.close('all') }, tx('Вместе с ресурсами и файлами'))],
          });
          const v = await mm.done;
          if (!v) return;
          if (v === 'all') {
            const used = ctx.isAssetUsed ? inside.reduce((n, a) => n + ctx.isAssetUsed(tab, a.id), 0) : 0;
            if (used && !(await confirmDialog(tx`Ресурсы из этой папки используются в открытом проекте (${used} раз). Всё равно удалить?`, { ok: tx('Удалить'), danger: true }))) return;
            await window.api.lib.removeMany(tab, inside.map((a) => a.id));
            const cur = ((Lib.data.folders && Lib.data.folders[tab]) || []).filter((f) => f !== old && !f.startsWith(old + '/'));
            await window.api.lib.setFolders(tab, cur);
            await Lib.load();
            if (draft && inside.some((a) => a.id === draft.id)) { draft = null; selectedId = null; renderEditor(); }
            toast(tx`Папка удалена, ресурсов удалено: ${inside.length}`);
            renderTabs();
          } else await renameFolder(old, parent);
          curFolder = parent || CUSTOMS; renderFolders(); renderList();
        } }, '🗑') : null));
    }

    async function renameFolder(old, nw) {
      const ids = [];
      const byFolder = new Map();
      for (const a of Lib.list(tab)) {
        const f = a.folder || '';
        if (f === old || f.startsWith(old + '/')) {
          const nf = (nw + f.slice(old.length)).replace(/^\//, '');
          if (!byFolder.has(nf)) byFolder.set(nf, []);
          byFolder.get(nf).push(a.id);
          ids.push(a.id);
        }
      }
      for (const [nf, list] of byFolder) await window.api.lib.setFolder(tab, list, nf);
      const cur = ((Lib.data.folders && Lib.data.folders[tab]) || []).map((f) => (f === old || f.startsWith(old + '/') ? (nw + f.slice(old.length)).replace(/^\//, '') : f));
      await window.api.lib.setFolders(tab, cur);
      await Lib.load();
    }

    function renderTabsCountsOnly() {
      [...tabsEl.children].forEach((b, i) => { b.textContent = `${TABS[i].icon} ${TABS[i].label} (${listFor(TABS[i].type).length})`; });
    }

    function renderEditor() {
      editBox.querySelectorAll('.audio-player').forEach((p) => p._audio && p._audio.pause());
      editBox.innerHTML = '';
      editBox.classList.toggle('open', !!draft);
      if (draft && document.body.classList.contains('mobile')) { const mb = editBox.closest('.modal-body'); if (mb) mb.scrollTop = 0; }
      if (!draft) {
        editBox.append(h('div', { class: 'muted', style: { padding: '20px 4px', lineHeight: 1.6 } }, tx('Здесь редактируется выбранный слева ресурс.')));
        return;
      }
      // телефон: редактор открыт поверх списка — кнопка возврата к списку
      if (document.body.classList.contains('mobile')) {
        editBox.append(h('div', { class: 'lib-edit-back' }, h('button', { class: 'btn small', onclick: () => { draft = null; selectedId = null; renderList(); renderEditor(); } }, tx('← К списку'))));
      }
      if (previewPlayer) { previewPlayer.destroy(); previewPlayer = null; }
      const isNew = !getFor(tab, draft.id);
      const sysPreset = tab === 'textboxes' && draft.isPreset;
      let form;
      if (tab === 'characters') form = characterEditor(draft, ctx);
      else if (tab === 'backgrounds') form = backgroundEditor(draft);
      else if (tab === 'textboxes') { const r = textboxEditor(draft, ctx); form = r.el; previewPlayer = r.player; }
      else if (tab === 'evidence') form = evidenceEditor(draft, ctx);
      else if (tab === 'popups') form = popupEditor(draft, ctx);
      else form = audioEditor(draft, ctx, tab === 'music');
      // метки по играм — у всех ресурсов (у персонажей и фонов они уже в форме)
      if (!['characters', 'backgrounds'].includes(tab) && draft.id != null && !isSystemTb(tab, draft.id)) form.append(gameTagsField(tab, draft));
      const save = h('button', { class: 'btn primary', onclick: async () => {
        if (tab === 'characters') {
          draft.poses = draft.poses.filter((p) => p.idleImageUrl || p.speakImageUrl);
          for (const p of draft.poses) { if (!p.idleImageUrl) p.idleImageUrl = p.speakImageUrl; if (!p.speakImageUrl) p.speakImageUrl = p.idleImageUrl; }
          if (!draft.poses.length) { toast(tx('Нужна хотя бы одна поза с картинкой')); return; }
        }
        if (tab !== 'characters' && !draft.url) { toast(tab === 'textboxes' ? tx('Не выбрана картинка окна') : tx('Не выбран файл')); return; }
        if (!draft.name) draft.name = tx('Без названия');
        if (isNew) {
          const dups = await window.api.lib.findDuplicates(tab, draft);
          if (dups.length && !(await confirmDup(dups))) return;
        }
        if (!draft.isPreset) draft.source = draft.source === 'objection.lol' && !isNew ? 'edited' : (draft.source || 'custom');
        const saved = await Lib.upsert(tab, draft);
        selectedId = saved.id;
        draft = JSON.parse(JSON.stringify(saved));
        toast(tx('Сохранено'));
        renderFolders(); renderList(); renderEditor();
      } }, isNew ? tx('Создать') : tx('Сохранить'));
      if (draft.isPreset) save.style.display = 'none';
      const show = isNew || sysPreset ? null : h('button', { class: 'btn', title: tx('Показать файлы ресурса в проводнике'), onclick: () => window.api.lib.showAsset(tab, draft.id) }, '📂');
      const del = isNew || sysPreset ? null : h('button', { class: 'btn danger', onclick: async () => {
        const used = ctx.isAssetUsed ? ctx.isAssetUsed(tab, draft.id) : 0;
        const ok = await confirmDialog(tx`Удалить «${draft.name}» из библиотеки?` + (used ? tx`\nОн используется в открытом проекте (${used} раз).` : ''), { ok: tx('Удалить'), danger: true });
        if (!ok) return;
        await Lib.remove(tab, draft.id);
        draft = null; selectedId = null;
        renderList(); renderEditor();
      } }, tx('Удалить'));
      const dup = isNew ? null : h('button', { class: 'btn', onclick: async () => {
        const copy = JSON.parse(JSON.stringify(draft));
        copy.id = await window.api.lib.newId();
        copy.name = (copy.name || '') + tx(' (копия)');
        delete copy.isPreset; copy.source = 'custom';
        if (copy.poses) { const ids = await newIds(copy.poses.length); copy.poses.forEach((p, i) => { p.id = ids[i]; }); }
        if (copy.speechBubbles) { const ids = await newIds(copy.speechBubbles.length); copy.speechBubbles.forEach((b, i) => { b.id = ids[i]; }); }
        const saved = await Lib.upsert(tab, copy);
        selectedId = saved.id; draft = JSON.parse(JSON.stringify(saved));
        renderList(); renderEditor();
      } }, tx('Копия'));
      const exp = isNew || sysPreset ? null : h('button', { class: 'btn', title: tx('Сохранить ресурс одним файлом, чтобы передать другу'), onclick: async () => {
        const p = await window.api.lib.exportAsset(tab, draft.id);
        if (p) toast(tx('Сохранено: ') + p);
      } }, tx('Экспорт…'));
      if (isNew && !draft.folder && isUserFolder(curFolder)) draft.folder = curFolder;
      const dl = h('datalist', { id: 'folderList' }, allFolders(tab).map((f) => h('option', { value: f })));
      const folderField = draft.isPreset ? h('div', { class: 'note' }, tx('Стандартный ресурс: менять его нельзя, но можно сделать копию («Копия») и уже её настроить.')) : h('div', { class: 'field' }, h('label', null, tx('Папка (внутри Customs)')),
        h('input', { class: 'input', list: 'folderList', value: draft.folder || '', placeholder: 'Customs', oninput: (e) => { const v = e.target.value.trim().replace(/^\/+|\/+$/g, ''); if (v) draft.folder = v; else delete draft.folder; } }), dl);
      editBox.append(
        h('div', { class: 'insp-title' }, isNew ? tx('Новый ресурс') : (draft.name || '—'), h('span', { class: 'muted', style: { fontWeight: 400, fontSize: '12px' } }, isNew ? '' : 'id ' + draft.id)),
        folderField,
        form,
        h('div', { class: 'toolbar', style: { marginTop: '14px', position: 'sticky', bottom: 0, background: 'var(--panel)', padding: '8px 0' } }, save, dup, exp, show, h('div', { class: 'spacer' }), del));
    }

    // Файл совпадает байт в байт с уже добавленным — спросить, что делать
    async function confirmDup(dups, newName) {
      const list = dups.map((d) => `• «${d.name || d.id}»` + (d.file ? tx`\n   файл: ${d.file}` : '')).join('\n');
      return confirmDialog(tx`${newName ? tx`Файл «${newName}»` : tx('Этот файл')} в точности совпадает (байт в байт) с тем, что уже есть в библиотеке:\n${list}\n\nДобавить ещё одну копию?`, { ok: tx('Всё равно добавить'), cancel: tx('Не добавлять') });
    }

    async function addNew() {
      const id = await window.api.lib.newId();
      if (tab === 'characters') {
        const [pid] = await newIds(1);
        draft = { id, name: '', nameplate: '', side: 'witness', alignment: 0, offsetX: 0, offsetY: 0, size: 100, limitWidth: false, blipUrl: SYSTEM.blips[0].url, backgroundId: null, iconUrl: '', poses: [newPose(pid, tx('Обычная'))], speechBubbles: [], source: 'custom' };
      } else if (tab === 'backgrounds') draft = { id, name: '', url: '', deskUrl: null, isWide: false, source: 'custom' };
      else if (tab === 'textboxes') draft = newTextbox(id);
      else if (tab === 'evidence') draft = { id, name: '', url: '', isIcon: false, source: 'custom' };
      else if (tab === 'popups') draft = { id, name: '', url: '', resize: 30, posX: 0, posY: 0, center: true, source: 'custom' };
      else draft = { id, name: '', url: '', volume: 100, source: 'custom' };
      selectedId = null;
      renderList(); renderEditor();
    }

    async function addFromFiles() {
      const files = await pickFiles(IMAGE_TYPES.includes(tab) ? IMG_ACCEPT : AUDIO_ACCEPT, true);
      if (!files.length) return;
      const list = await importFiles(files);
      let last = null;
      let skipped = 0;
      for (const it of list) {
        const dups = await window.api.lib.findDuplicates(tab, { id: -1, url: it.rel });
        if (dups.length && !(await confirmDup(dups, it.name))) { skipped++; continue; }
        const id = await window.api.lib.newId();
        const asset = tab === 'backgrounds' ? { id, name: it.name, url: it.rel, deskUrl: null, isWide: false, source: 'custom' }
          : tab === 'evidence' ? { id, name: it.name, url: it.rel, isIcon: false, source: 'custom' }
            : tab === 'popups' ? { id, name: it.name, url: it.rel, resize: 30, posX: 0, posY: 0, center: true, source: 'custom' }
              : { id, name: it.name, url: it.rel, volume: 100, source: 'custom' };
        if (isUserFolder(curFolder)) asset.folder = curFolder;
        last = await Lib.upsert(tab, asset);
      }
      toast(tx('Добавлено: ') + (list.length - skipped) + (skipped ? tx`, пропущено дубликатов: ${skipped}` : ''), 5000);
      if (last) { selectedId = last.id; draft = JSON.parse(JSON.stringify(last)); }
      renderTabs(); renderFolders(); renderList(); renderEditor();
    }

    renderTabs();
    renderFolders();
    renderList();
    if (focusId) { const a = Lib.get(tab, focusId); if (a) draft = JSON.parse(JSON.stringify(a)); }
    renderEditor();
    return m;
  }

  // ---------- Дубликаты ----------
  async function openDuplicates(type, ctx, onDone) {
    const label = TABS.find((t) => t.type === type).label.toLowerCase();
    const pd = progressDialog(tx('Поиск дубликатов'));
    pd.hideCancel();
    pd.set(tx('Сравнение файлов…'), 0.5);
    let groups;
    try { groups = await window.api.lib.duplicates(type); } finally { pd.close(); }
    if (!groups.length) { toast(tx`Дубликатов среди ресурсов «${label}» не найдено`); return; }
    const choice = groups.map((g) => {
      // по умолчанию оставляем свой → с сайта → стандартный; среди равных — используемый в проекте
      const rank = (id) => { const a = Lib.get(type, id); return (a?.isPreset ? 0 : a?.source === 'objection.lol' ? 1 : 2) * 1000 + (ctx.isAssetUsed ? ctx.isAssetUsed(type, id) : 0); };
      return [...g].sort((x, y) => rank(y) - rank(x))[0];
    });
    const body = h('div');
    const render = () => {
      body.innerHTML = '';
      body.append(h('div', { class: 'note' }, tx`Найдено групп одинаковых ресурсов: ${groups.length}. В каждой группе отмечается, какой оставить. Остальные удалятся, а проекты, где они использовались, будут показывать оставленный.`));
      groups.forEach((g, gi) => {
        body.append(h('div', { class: 'pose-edit' }, h('div', { class: 'grid' }, g.map((id) => {
          const a = Lib.get(type, id);
          const th = assetThumb(type, a || {});
          const used = ctx.isAssetUsed ? ctx.isAssetUsed(type, id) : 0;
          const card = h('div', { class: 'card' + (choice[gi] === id ? ' sel' : ''), title: tx('Оставить этот') },
            h('div', { class: 'pic' + (type === 'characters' ? ' sq' : '') }, th && th.url ? UI.thumbImg(th.url, th.kind) : h('span', { class: 'ico' }, TABS.find((t) => t.type === type).icon)),
            h('div', { class: 'cap' }, (choice[gi] === id ? '✔ ' : '') + (a?.name || id),
              h('div', { class: 'tag' }, `${sourceLabel(a || {})} · id ${id}${a?.folder ? ' · ' + a.folder : ''}${used ? tx(' · в проекте: ') + used : ''}`)));
          card.onclick = () => { choice[gi] = id; render(); };
          return card;
        }))));
      });
    };
    render();
    let m;
    m = modal({
      title: tx('Дубликаты: ') + label, wide: true, body,
      foot: [h('button', { class: 'btn', onclick: () => m.close(false) }, tx('Отмена')),
        h('button', { class: 'btn primary', onclick: () => m.close(true) }, tx('Объединить все группы'))],
    });
    if (!(await m.done)) return;
    let removed = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const keep = choice[gi];
      const rm = groups[gi].filter((id) => id !== keep);
      await window.api.lib.merge(type, keep, rm);
      removed += rm.length;
    }
    await Lib.load();
    toast(tx`Удалено дубликатов: ${removed}`, 5000);
    onDone && onDone();
  }

  // ---------- Загрузка с сайта ----------
  async function runDownload(title, fn) {
    const pd = progressDialog(title);
    pd.onCancel(() => { window.api.download.cancel(); pd.set(tx('Остановка…')); });
    const off = window.api.download.onProgress((p) => {
      if (p.phase === 'meta') pd.set(p.label || tx('Получение списка…'), 0.02);
      if (p.phase === 'files') pd.set(tx`Скачано файлов: ${p.done} из ${p.total}` + (p.failed ? tx` (ошибок: ${p.failed})` : ''), p.total ? p.done / p.total : 1);
    });
    try {
      const r = await fn();
      await Lib.load();
      return r;
    } catch (e) {
      throw e;
    } finally {
      off();
      pd.close();
    }
  }

  async function downloadPresets(ctx) {
    const ok = await confirmDialog(tx('Скачать стандартных персонажей, фоны, музыку и звуки с objection.lol?\n\nЭто около 2–3 тысяч файлов, понадобится интернет и несколько сотен мегабайт на диске. Потом всё будет работать без интернета.\n\nРесурсы Ace Attorney принадлежат Capcom — используйте их только для себя.'), { ok: tx('Скачать') });
    if (!ok) return;
    try {
      const r = await runDownload(tx('Скачивание стандартных ресурсов'), () => window.api.download.presets());
      showReport(r, tx('Стандартные ресурсы скачаны'));
      ctx.onLibraryChanged && ctx.onLibraryChanged();
    } catch (e) {
      UI.toast(tx('Не получилось: ') + e.message, 6000);
    }
  }

  function showReport(r, title) {
    const lines = [h('p', null, r.cancelled ? tx`Скачивание остановлено. Скачано файлов: ${r.done ?? 0} из ${r.total}. Остальное можно докачать позже — при следующем открытии проекта программа предложит это снова.` : tx`Файлов обработано: ${r.total}. Ошибок: ${r.failed}.`)];
    if (r.assets != null) lines.unshift(h('p', null, tx`Ресурсов проекта: ${r.assets}.`));
    if (r.errors && r.errors.length) lines.push(h('div', { class: 'note warn' }, tx('Не найдены на сайте: '), r.errors.slice(0, 12).join('; ')));
    if (r.failedUrls && r.failedUrls.length) {
      lines.push(h('div', { class: 'note warn' }, tx('Не скачались (сайт-хранилище не отвечает или файл удалён). Можно повторить позже — уже скачанное не потеряется:'),
        h('div', { style: { fontSize: '11.5px', marginTop: '6px', wordBreak: 'break-all', maxHeight: '160px', overflow: 'auto' } }, r.failedUrls.slice(0, 20).map((u) => h('div', null, u)))));
    }
    const m = modal({ title, body: lines, foot: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'OK')] });
    return m.done;
  }

  window.LibraryUI = { listFor, getFor, newTextbox, textboxEditor, posePreview, folderOf, allFolders, inFolder, openLibrary, runDownload, showReport, downloadPresets, fileSlot, pickFiles, importFiles, sourceLabel };
})();
