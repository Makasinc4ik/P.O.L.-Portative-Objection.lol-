// Язык интерфейса: русский (исходный) или английский. Строки в коде обёрнуты в tx('…') / tx`… ${x} …`;
// ключ перевода — сама русская строка (в шаблонах подстановки — {0}, {1}, …). Нет перевода — остаётся русская.
// Язык хранится в localStorage (oo.lang), смена — перезагрузкой окна.
(function () {
  'use strict';
  let lang = 'ru';
  try {
    const saved = localStorage.getItem('oo.lang');
    if (saved === 'en' || saved === 'ru') lang = saved;
    else if (localStorage.getItem('oo.autosave') || localStorage.getItem('oo.framesPerPage')) {
      lang = 'ru'; // программа уже запускалась (до выбора языка был только русский) — оставить русский
      localStorage.setItem('oo.lang', lang);
    } else {
      // первый запуск: язык системы — русский для русскоязычных систем, иначе английский; дальше — как выберет пользователь
      const RU = ['ru', 'be', 'uk', 'kk', 'ky', 'tg', 'uz'];
      const sys = (window.api && Array.isArray(window.api.sysLangs)) ? window.api.sysLangs : [];
      const langs = [...sys, ...(navigator.languages || []), navigator.language || ''].map((x) => String(x).toLowerCase().split(/[-_]/)[0]).filter(Boolean);
      // основной язык системы из «русскоязычных» или русский где-то в списке языков системы → русский
      lang = RU.includes(langs[0]) || langs.includes('ru') ? 'ru' : 'en';
      localStorage.setItem('oo.lang', lang);
    }
  } catch (e) { /* */ }
  const dict = lang === 'en' ? (window.OO_EN || {}) : null;
  const fill = (t, vals) => t.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < vals.length ? String(vals[Number(i)]) : m));

  function tx(s, ...vals) {
    if (Array.isArray(s) && s.raw) {
      if (dict) {
        const key = s.map((x, i) => x + (i < vals.length ? '{' + i + '}' : '')).join('');
        const t = dict[key];
        if (t != null) return fill(t, vals);
      }
      let out = '';
      s.forEach((x, i) => { out += x + (i < vals.length ? String(vals[i]) : ''); });
      return out;
    }
    return (dict && dict[s] != null) ? dict[s] : s;
  }
  window.tx = tx;
  window.OO_LANG = lang;
  document.documentElement.lang = lang;

  // Сменить язык и перезагрузить окно (проект сохраняется автоматически перед перезагрузкой)
  window.setUiLang = (l) => {
    try { localStorage.setItem('oo.lang', l === 'en' ? 'en' : 'ru'); } catch (e) { /* */ }
    location.reload();
  };

  // Статичные надписи index.html (меню, кнопки, подсказки)
  if (dict) {
    const tr = (s) => { const k = s.trim(); return k && dict[k] != null ? s.replace(k, dict[k]) : s; };
    const walk = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
        else if (n.nodeType === 1 && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') {
          for (const a of ['title', 'placeholder']) if (n.hasAttribute(a)) n.setAttribute(a, tr(n.getAttribute(a)));
          walk(n);
        }
      }
    };
    walk(document.body);
  }
})();
