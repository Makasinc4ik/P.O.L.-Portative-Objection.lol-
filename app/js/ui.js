// Мелкие помощники интерфейса: создание элементов, окна, выбор из списка
'use strict';
(function () {
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
  }

  let toastTimer;
  function toast(msg, ms = 2800) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  // Модальное окно. Возвращает {el, body, close, done(promise)}
  function modal({ title, wide = false, body, foot, onClose, closable = true } = {}) {
    const root = document.getElementById('modalRoot');
    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });
    const bodyEl = h('div', { class: 'modal-body' }, body || '');
    const footEl = foot ? h('div', { class: 'modal-foot' }, foot) : null;
    const closeBtn = closable ? h('button', { class: 'btn small', onclick: () => close() }, tx('Закрыть')) : null;
    const box = h('div', { class: 'modal' + (wide ? ' wide' : '') },
      h('div', { class: 'modal-head' }, h('h3', null, title || ''), closeBtn),
      bodyEl, footEl);
    const wrap = h('div', { class: 'modal-wrap' }, box);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && closable) close(); });
    const onKey = (e) => { if (e.key === 'Escape' && closable) { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    root.append(wrap);
    function close(value) {
      if (!wrap.isConnected) return;
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      if (onClose) onClose(value);
      resolveDone(value);
    }
    return { el: box, body: bodyEl, foot: footEl, close, done };
  }

  function confirmDialog(text, { ok = tx('Да'), cancel = tx('Отмена'), danger = false } = {}) {
    let m;
    const okBtn = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => m.close(true) }, ok);
    m = modal({
      title: tx('Подтверждение'),
      body: h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.5 } }, text),
      foot: [cancel == null ? null : h('button', { class: 'btn', onclick: () => m.close(false) }, cancel), okBtn].filter(Boolean),
    });
    setTimeout(() => okBtn.focus(), 30);
    return m.done.then((v) => !!v);
  }

  function promptDialog(title, value = '', { type = 'text', placeholder = '' } = {}) {
    let m;
    const input = h('input', { class: 'input', type, value, placeholder });
    const submit = () => m.close(input.value);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    m = modal({
      title,
      body: input,
      foot: [h('button', { class: 'btn', onclick: () => m.close(null) }, tx('Отмена')), h('button', { class: 'btn primary', onclick: submit }, 'OK')],
    });
    setTimeout(() => { input.focus(); input.select(); }, 30);
    return m.done.then((v) => (v == null ? null : v));
  }

  // Выбор из сетки карточек с поиском
  // items: [{id, name, img?, icon?, sub?, thumb?}]
  // type — тип ресурса библиотеки: тогда слева разделы (избранное, стандартные, свои, папки, метки),
  // есть сортировка, вид «плитка/список», звёздочка «в избранное» и метки
  // Добавляет в сетку карточки порциями: первая порция сразу, следующие — когда прокрутка доходит до конца.
  // Так в списке видны все элементы (раньше показывались только первые несколько сотен).
  // initial — сколько показать сразу (например, чтобы после перерисовки не терялись уже прокрученные карточки)
  function appendProgressive(grid, list, makeCard, step = 300, initial = step) {
    if (grid.__progObs) { grid.__progObs.disconnect(); grid.__progObs = null; }
    let i = 0;
    let first = Math.max(step, initial);
    const tail = h('div', { class: 'muted prog-tail', style: { gridColumn: '1/-1', padding: '8px', textAlign: 'center' } });
    const more = () => {
      const end = Math.min(list.length, i + (first || step));
      first = 0;
      const frag = document.createDocumentFragment();
      for (; i < end; i++) { const el = makeCard(list[i], i); if (el) frag.append(el); }
      tail.remove();
      grid.append(frag);
      grid.__shown = i;
      if (i < list.length) { tail.textContent = tx`Показано ${i} из ${list.length} — дальше подгружается при прокрутке`; grid.append(tail); }
      else if (grid.__progObs) { grid.__progObs.disconnect(); grid.__progObs = null; }
    };
    more();
    if (i < list.length && 'IntersectionObserver' in window) {
      const obs = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) more(); }, { rootMargin: '400px' });
      obs.observe(tail);
      grid.__progObs = obs;
    } else if (i < list.length) { while (i < list.length) more(); }
  }

  function pickerDialog({ title, items, selected, allowNone = false, noneLabel = tx('Не выбрано'), onPreview, extra, type }) {
    let m;
    const Marks = window.Assets && window.Assets.Marks;
    const Lib = window.Assets && window.Assets.Lib;
    const smart = !!(type && Marks && Lib && Lib.data);
    const search = h('input', { class: 'input', type: 'search', placeholder: tx('Поиск…'), style: { maxWidth: '260px' } });
    const grid = h('div', { class: 'grid' });
    const side = h('div', { class: 'pick-side' });
    const LIMIT = 400;
    const assetOf = (it) => {
      if (!smart || it.id == null) return null;
      if (it.asset) return it.asset;
      return type === 'textboxes' ? Lib.textbox(it.id) : Lib.get(type, it.id);
    };
    let view = localStorage.getItem('oo.pick.view') || 'grid';
    let sortMode = localStorage.getItem('oo.pick.sort') || 'default';
    // разделы можно сочетать: Ctrl+клик добавляет раздел (показываются ресурсы, подходящие под все выбранные)
    let cats = new Set([(smart && localStorage.getItem('oo.pick.cat.' + type)) || 'all']);
    const setCats = (list) => { cats = new Set(list.length ? list : ['all']); localStorage.setItem('oo.pick.cat.' + type, [...cats][0]); };
    const inCats = (it) => [...cats].every((c) => inCat(it, c));
    let sizes = null;
    const isStd = (it) => { const a = assetOf(it); return !a || !!a.isPreset; };
    const folderOf = (it) => { const a = assetOf(it); return a && !a.isPreset ? (a.folder || '') : null; };
    const inCat = (it, c) => {
      if (c === 'all') return true;
      if (c === 'fav') return Marks.fav(type, it.id);
      if (c === 'std') return isStd(it);
      if (c === 'own') return !isStd(it);
      if (c.startsWith('f:')) { const f = folderOf(it); const k = c.slice(2); return f != null && (f === k || f.startsWith(k + '/')); }
      if (c.startsWith('t:')) return Marks.tags(type, it.id).includes(c.slice(2));
      if (c.startsWith('r:')) { const a = assetOf(it); return !!a && (a.side || 'witness') === c.slice(2); }
      return true;
    };
    const matches = (it, q) => !q || (it.name || '').toLowerCase().includes(q) || String(it.id) === q || (it.sub || '').toLowerCase().includes(q)
      || (smart && Marks.tags(type, it.id).some((t) => t.toLowerCase().includes(q)));
    function renderSide() {
      side.innerHTML = '';
      if (!smart) return;
      const count = (c) => items.filter((it) => inCat(it, c)).length;
      const entry = (c, label, icon, depth = 0) => {
        const n = count(c);
        const el = h('div', { class: 'folder' + (cats.has(c) ? ' on' : ''), style: { paddingLeft: 8 + depth * 12 + 'px' }, title: label + tx(' (Ctrl+клик — добавить к выбранным разделам)') },
          h('span', { class: 'fi' }, icon), h('span', { class: 'fn' }, label), h('span', { class: 'fc' }, n));
        el.onclick = (e) => {
          if ((e.ctrlKey || e.metaKey || e.shiftKey) && c !== 'all') {
            const next = new Set(cats); next.delete('all');
            if (next.has(c)) next.delete(c); else next.add(c);
            setCats([...next]);
          } else setCats([c]);
          renderSide(); render();
        };
        return el;
      };
      side.append(entry('all', tx('Все'), '🗂'), entry('fav', tx('Избранное'), '★'));
      if (count('std')) side.append(entry('std', tx('Стандартные'), '⭐'));
      if (count('own')) side.append(entry('own', tx('Свои'), '📦'));
      const folders = new Set();
      const add = (f) => { if (!f) return; const p = f.split('/'); for (let i = 1; i <= p.length; i++) folders.add(p.slice(0, i).join('/')); };
      for (const it of items) add(folderOf(it));
      for (const f of (Lib.data.folders && Lib.data.folders[type]) || []) add(f);
      const fl = [...folders].sort((x, y) => x.localeCompare(y));
      if (fl.length) side.append(h('div', { class: 'pick-side-h' }, tx('Папки')));
      for (const f of fl) side.append(entry('f:' + f, f.split('/').pop(), '📁', f.split('/').length - 1));
      const tags = Marks.allTags(type);
      if (tags.length) side.append(h('div', { class: 'pick-side-h' }, tx('Метки')));
      for (const t of tags) side.append(entry('t:' + t, t, '🏷'));
      if (type === 'characters') {
        const roles = Object.entries(Marks.ROLES).filter(([r]) => count('r:' + r));
        if (roles.length) side.append(h('div', { class: 'pick-side-h' }, tx('Роли')));
        for (const [r, l] of roles) side.append(entry('r:' + r, l, '👤'));
      }
      side.append(h('div', { class: 'muted', style: { fontSize: '11px', margin: '10px 8px' } }, tx('Ctrl+клик — несколько разделов сразу (например, метка + роль)')));
    }
    async function render() {
      const q = search.value.trim().toLowerCase();
      if (smart && (sortMode === 'big' || sortMode === 'small') && !sizes) sizes = await Marks.sizes(type);
      grid.innerHTML = '';
      grid.className = 'grid' + (view === 'list' ? ' as-list' : '');
      if (smart && cats.size === 1 && !cats.has('all') && !items.some(inCats)) { setCats(['all']); renderSide(); }
      let list = items.filter((it) => matches(it, q) && (!smart || inCats(it)));
      if (smart) list = Marks.sort(type, list, sortMode, sizes);
      if (allowNone && !q) grid.append(card({ id: null, name: noneLabel, icon: '∅' }));
      // длинные списки дорисовываются по мере прокрутки — показываются все, а не первые LIMIT
      appendProgressive(grid, list, card, LIMIT);
      if (smart && q && !cats.has('all')) {
        const other = items.filter((it) => matches(it, q) && !inCats(it)).length;
        if (other) grid.append(h('div', { class: 'muted', style: { gridColumn: '1/-1', padding: '8px' } }, tx`В других разделах найдено ещё: ${other}. `,
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); setCats(['all']); renderSide(); render(); } }, tx('Искать везде'))));
      }
      if (!list.length && !(allowNone && !q)) grid.append(h('div', { class: 'muted', style: { gridColumn: '1/-1', padding: '12px' } }, cats.has('fav') && cats.size === 1 ? tx('В избранном пока пусто. ☆ на карточке добавляет в избранное.') : tx('Ничего не найдено.')));
    }
    async function editTags(it) {
      const cur = Marks.tags(type, it.id);
      const known = Marks.allTags(type);
      const v = await promptDialog(tx('Метки через запятую (ресурс может быть сразу в нескольких)') + (known.length ? tx('\nУже есть: ') + known.join(', ') : ''), cur.join(', '));
      if (v == null) return;
      await Marks.setTags(type, it.id, v.split(',').map((x) => x.trim()).filter(Boolean));
      renderSide(); render();
    }
    function card(it) {
      const pic = h('div', { class: 'pic' + (it.thumb && it.thumb.kind !== 'bg' ? ' sq' : '') },
        it.thumb ? thumbImg(it.thumb.url, it.thumb.kind, it.icon || '🖼')
          : it.img ? h('img', { src: it.img, loading: 'lazy', onerror: (e) => { e.target.replaceWith(h('span', { class: 'ico' }, it.icon || '🖼')); } }) : h('span', { class: 'ico' }, it.icon || '🖼'));
      const tags = smart && it.id != null ? Marks.tags(type, it.id) : [];
      const ca = type === 'characters' ? assetOf(it) : null;
      const meta = [ca ? (Marks.ROLES[ca.side] || tx('Свидетель')) : null, it.sub, view === 'list' && sizes && sizes[it.id] ? fmtBytes(sizes[it.id]) : null].filter(Boolean).join(' · ');
      const el = h('div', { class: 'card' + (it.id === selected ? ' sel' : ''), title: it.name },
        pic, h('div', { class: 'cap' }, it.name || '—', meta ? h('div', { class: 'tag' }, meta) : null,
          tags.length ? h('div', { class: 'tag tags' }, tags.map((t) => '🏷' + t).join(' ')) : null));
      if (smart && it.id != null) {
        const fav = Marks.fav(type, it.id);
        el.append(h('div', { class: 'card-tools' },
          h('button', { class: 'ct-btn' + (fav ? ' on' : ''), title: fav ? tx('Убрать из избранного') : tx('В избранное'), onclick: async (e) => { e.stopPropagation(); await Marks.toggleFav(type, it.id); renderSide(); render(); } }, fav ? '★' : '☆'),
          h('button', { class: 'ct-btn', title: tx('Метки (папки, в которых может быть сразу несколько ресурсов)'), onclick: (e) => { e.stopPropagation(); editTags(it); } }, '🏷')));
      }
      el.addEventListener('click', () => m.close({ value: it.id }));
      if (onPreview) el.addEventListener('contextmenu', (e) => { e.preventDefault(); onPreview(it); });
      return el;
    }
    search.addEventListener('input', render);
    const sortSel = smart ? h('select', { class: 'input', style: { width: 'auto' }, title: tx('Сортировка (избранное всегда сверху)'), onchange: (e) => { sortMode = e.target.value; localStorage.setItem('oo.pick.sort', sortMode); render(); } },
      Marks.SORTS.map(([v, l]) => h('option', { value: v, selected: v === sortMode || null }, l))) : null;
    const viewBtn = smart ? h('button', { class: 'btn small', title: tx('Плитка / список'), onclick: () => { view = view === 'list' ? 'grid' : 'list'; localStorage.setItem('oo.pick.view', view); viewBtn.textContent = view === 'list' ? tx('▦ Плитка') : tx('☰ Список'); render(); } }, view === 'list' ? tx('▦ Плитка') : tx('☰ Список')) : null;
    const body = smart
      ? h('div', { class: 'pick-wrap' }, side, h('div', { class: 'pick-main' }, h('div', { class: 'toolbar' }, search, sortSel, viewBtn, extra || null, onPreview ? h('span', { class: 'muted' }, tx('Правый клик — прослушать')) : null), grid))
      : h('div', null, h('div', { class: 'toolbar' }, search, extra || null, onPreview ? h('span', { class: 'muted' }, tx('Правый клик — прослушать')) : null), grid);
    m = modal({ title, wide: true, body });
    renderSide();
    render();
    setTimeout(() => search.focus(), 30);
    return m.done.then((v) => (v && 'value' in v ? v : null));
  }

  function progressDialog(title) {
    const label = h('div', null, tx('Подготовка…'));
    const bar = h('div');
    const cancelBtn = h('button', { class: 'btn' }, tx('Отмена'));
    const m = modal({ title, body: [label, h('div', { class: 'progress' }, bar)], foot: [cancelBtn], closable: false });
    return {
      set(text, frac) { label.textContent = text; if (frac != null) bar.style.width = Math.round(frac * 100) + '%'; },
      onCancel(fn) { cancelBtn.onclick = fn; },
      hideCancel() { cancelBtn.remove(); },
      close: () => m.close(),
    };
  }

  function fmtBytes(n) {
    if (n < 1024) return n + tx(' Б');
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + tx(' КБ');
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + tx(' МБ');
    return (n / 1024 / 1024 / 1024).toFixed(2) + tx(' ГБ');
  }

  // <img> с миниатюрой, которая считается, когда карточка появляется на экране
  let thumbObserver = null;
  function thumbImg(url, kind = 'char', fallbackIcon = '🖼') {
    const img = document.createElement('img');
    img.className = 'thumb-img';
    img.alt = '';
    if (!url) { const sp = document.createElement('span'); sp.className = 'ico'; sp.textContent = fallbackIcon; return sp; }
    img.dataset.thumbUrl = url;
    img.dataset.thumbKind = kind;
    img.onerror = () => { const sp = document.createElement('span'); sp.className = 'ico'; sp.textContent = fallbackIcon; img.replaceWith(sp); };
    if (!thumbObserver) {
      thumbObserver = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          thumbObserver.unobserve(el);
          window.Assets.Thumbs.get(el.dataset.thumbUrl, el.dataset.thumbKind).then((src) => { if (src) el.src = src; else el.onerror(); });
        }
      }, { rootMargin: '200px' });
    }
    thumbObserver.observe(img);
    return img;
  }

  // Поле с выпадающим списком подсказок (вместо <datalist>: список листается колесом, стрелки его прокручивают).
  // groups: () => [{ title, items: [строки] }]; onInput(value) — при каждом изменении, onPick(value) — при выборе из списка.
  function comboInput({ value = '', placeholder = '', title = '', groups, onInput, onPick }) {
    const input = h('input', { class: 'input', value, placeholder, title, autocomplete: 'off' });
    const list = h('div', { class: 'combo-list hidden' });
    let items = []; let active = -1;
    const close = () => { list.classList.add('hidden'); active = -1; };
    const place = () => {
      const r = input.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const hgt = Math.min(260, Math.max(below, r.top - 8));
      Object.assign(list.style, { left: r.left + 'px', width: Math.max(r.width, 220) + 'px', maxHeight: hgt + 'px' });
      if (below >= Math.min(160, hgt) || below >= r.top) { list.style.top = r.bottom + 2 + 'px'; list.style.bottom = ''; } else { list.style.top = ''; list.style.bottom = window.innerHeight - r.top + 2 + 'px'; }
    };
    const setActive = (i) => {
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach((el, j) => el.classList.toggle('active', j === active));
      items[active].scrollIntoView({ block: 'nearest' });
    };
    const pick = (v) => { input.value = v; close(); if (onInput) onInput(v); if (onPick) onPick(v); };
    const open = (all) => {
      const q = all ? '' : input.value.trim().toLowerCase();
      list.innerHTML = ''; items = []; active = -1;
      for (const g of groups()) {
        const its = g.items.filter((n) => !q || n.toLowerCase().includes(q));
        if (!its.length) continue;
        if (g.title) list.append(h('div', { class: 'combo-head' }, g.title));
        for (const n of its) {
          const el = h('div', { class: 'combo-item', onmousedown: (e) => { e.preventDefault(); pick(n); } }, n);
          el.addEventListener('mousemove', () => { if (active !== items.indexOf(el)) setActive(items.indexOf(el)); });
          items.push(el); list.append(el);
        }
      }
      if (!items.length) { close(); return; }
      if (!list.isConnected) document.body.append(list);
      list.classList.remove('hidden');
      place();
    };
    input.addEventListener('focus', () => open(true));
    input.addEventListener('click', () => { if (list.classList.contains('hidden')) open(true); });
    input.addEventListener('input', () => { if (onInput) onInput(input.value); open(false); });
    input.addEventListener('blur', () => setTimeout(() => { close(); if (!input.isConnected) list.remove(); }, 120));
    input.addEventListener('keydown', (e) => {
      const shown = !list.classList.contains('hidden');
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!shown) open(true); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!shown) open(true); setActive(active - 1); }
      else if (e.key === 'Enter' && shown && active >= 0) { e.preventDefault(); pick(items[active].textContent); }
      else if (e.key === 'Escape' && shown) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    // список «прилипает» к полю: при прокрутке окна просто закрывается
    const onScroll = (e) => { if (!list.contains(e.target) && !list.classList.contains('hidden')) close(); };
    document.addEventListener('scroll', onScroll, true);
    const obs = new MutationObserver(() => { if (!input.isConnected) { list.remove(); obs.disconnect(); document.removeEventListener('scroll', onScroll, true); } });
    obs.observe(document.body, { childList: true, subtree: true });
    return input;
  }

  window.UI = { thumbImg, h, toast, modal, confirmDialog, promptDialog, pickerDialog, progressDialog, fmtBytes, comboInput, appendProgressive };
})();
