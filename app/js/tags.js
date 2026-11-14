// Разбор текста кадра с тегами в стиле objection.lol
// [#p500] пауза, [#ts40] скорость текста, [#/r]красный[/#], [#fl] вспышка ([#flcFF0000] — красная), [#sm600:quake] тряска,
// [#/i]курсив[/#], [#/u] подчёркнутый, [#/s] зачёркнутый, [#/bd] жирный, [#/sz150] размер (своё, не с сайта),
// [#bgm12] музыка, [#bgms] стоп музыки, [#bgmfo]/[#bgmfi] затухание, [#bgs5] звук, [#bgss] стоп звуков
'use strict';

const COLORS = { r: '#F77337', g: '#00F61C', b: '#6BC7F6', w: '#FFFFFF' };
const SHAKE_MOTIONS = ['default', 'impact', 'rumble', 'quake', 'horizontal', 'vertical', 'jolt', 'wobble', 'pulse'];

function numFrom(s, def = 0) {
  const n = parseInt(String(s).replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? def : n;
}

function colorFromTag(tag) {
  const t = tag.trim();
  const c = t[0];
  if (c === 'r' || c === 'g' || c === 'b') return c; // буква — цвет берётся из текстбокса
  if (c === 'c') {
    const hex = '#' + t.slice(1);
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return hex;
    return '#FFFFFF';
  }
  return null;
}

function parseShake(tag) {
  const t = tag.toLowerCase().trim();
  const n = t[1];
  if (t.length < 2 || t[0] !== 's' || !['s', 'm', 'l'].includes(n)) return null;
  if (t.length === 2) return { intensity: n, duration: 700, motion: 'default', legacy: true };
  const parts = t.slice(2).split(/[:\-.]+/).filter(Boolean);
  const num = parts.find((p) => /^\d+$/.test(p));
  const word = parts.find((p) => !/^\d+$/.test(p));
  let dur = num ? parseInt(num, 10) : numFrom(t.slice(2), 0);
  if (!dur || dur > 5000) dur = dur > 5000 ? 5000 : 700;
  const motion = SHAKE_MOTIONS.includes(word) ? word : 'default';
  return { intensity: n, duration: dur, motion, legacy: false };
}

const END_TAGS = ['bgms', 'bgmfo', 'bgss', 'bgsfo', 'evdh'];

function isNumTag(tag, prefix) {
  return tag.length > prefix.length && tag.startsWith(prefix) && !Number.isNaN(parseFloat(tag.slice(prefix.length)));
}

// Превращает тег в команду
function tagToCommand(rawTag) {
  const tag = rawTag.trim();
  const low = tag.toLowerCase();
  if (!low) return null;
  // «в конце кадра» (своё, не с сайта): [#bgmse] [#bgmfoe] [#bgsse] [#bgsfoe] [#evdhe] — срабатывают при переходе
  // к следующему кадру, а не когда до тега дошёл текст (иначе после текста остаётся пауза без улики/музыки)
  if (low.length > 4 && low.endsWith('e') && END_TAGS.includes(low.slice(0, -1))) return { ...tagToCommand(low.slice(0, -1)), atEnd: true };
  if (low === 'bgmd') return { cmd: 'music_default' };
  if (low === 'bgms') return { cmd: 'music_stop' };
  if (low === 'bgmfo') return { cmd: 'music_fadeout' };
  if (low === 'bgmfi') return { cmd: 'music_fadein' };
  if (isNumTag(low, 'bgm')) return { cmd: 'music', id: numFrom(low.slice(3)) };
  if (low === 'bgss') return { cmd: 'sound_stop' };
  if (low === 'bgsfo') return { cmd: 'sound_fadeout' }; // плавно заглушить звуки (своё)
  if (isNumTag(low, 'bgs')) return { cmd: 'sound', id: numFrom(low.slice(3)) };
  if (low === 'evdh') return { cmd: 'evidence_hide' };
  if (isNumTag(low, 'evdi')) {
    // [#evdi12l] / [#evdi12r] — значок слева / справа (своё, не с сайта)
    const side = /\d\s*l$/.test(low) ? 'left' : /\d\s*r$/.test(low) ? 'right' : null;
    return side ? { cmd: 'evidence_icon', id: numFrom(low.slice(4)), side } : { cmd: 'evidence_icon', id: numFrom(low.slice(4)) };
  }
  if (isNumTag(low, 'evd')) return { cmd: 'evidence', id: numFrom(low.slice(3)) };
  if (isNumTag(low, 'tbs')) return { cmd: 'blip_speed', value: Math.max(25, numFrom(low.slice(3), 64)) };
  if (low[0] === 't' && low[1] === 's') return { cmd: 'text_speed', value: numFrom(low.slice(2), 0) };
  if (low[0] === 'p' && /^p\d*$/.test(low)) return { cmd: 'pause', ms: numFrom(low.slice(1), 0) };
  if (low.length === 2 && low[0] === 'f' && 'sml'.includes(low[1])) return { cmd: 'flash', size: low[1] };
  // вспышка своего цвета: [#fmcFF0000] (как у цвета текста [#/cFF0000]); можно и [#fm#FF0000], [#fm:FF0000]
  const fc = /^f([sml])\s*(?:c|#|:)?\s*#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(low);
  if (fc) return { cmd: 'flash', size: fc[1], color: '#' + fc[2] };
  if (low[0] === 's' && 'sml'.includes(low[1])) {
    const s = parseShake(low);
    if (s) return { cmd: 'shake', ...s };
  }
  return null;
}

// Оформление текста внутри [#/…]…[/#] (своё, на objection.lol такого нет): несколько пунктов через пробел или запятую —
//   i — курсив, u — подчёркнутый, s — зачёркнутый, bd — жирный, sz150 — размер 150 %; плюс цвет (r, g, b, cFF0000).
// Например: [#/i]курсив[/#], [#/bd r]жирный красный[/#], [#/sz200]крупно[/#]. Вложения работают: [#/i]а [#/u]б[/#][/#].
function parseSpan(spec) {
  const items = String(spec).trim().toLowerCase().split(/[\s,;+]+/).filter(Boolean);
  const fmt = {};
  let color = null;
  let any = false;
  for (const it of items) {
    if (it === 'i') { fmt.i = true; any = true; continue; }
    if (it === 'u') { fmt.u = true; any = true; continue; }
    if (it === 's') { fmt.s = true; any = true; continue; }
    if (it === 'bd') { fmt.b = true; any = true; continue; }
    const z = /^sz(\d{1,3})$/.exec(it);
    if (z) { fmt.z = Math.max(20, Math.min(400, Number(z[1]))) / 100; any = true; continue; }
    if (!color) color = colorFromTag(it);
  }
  // как раньше: [#/x] с непонятным содержимым — цвет по правилам сайта
  if (!any && !color && items.length) color = colorFromTag(spec);
  return { color, fmt: any ? fmt : null };
}

function mergeFmt(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { ...a, ...b };
}

// Разбирает текст на токены: {type:'text', text, color, fmt} | {type:'cmd', ...}
function parseText(text) {
  const tokens = [];
  if (!text) return tokens;
  const re = /\[#\/([^\]]*)\]|\[\/#\]|\[#([^\]]*)\]/g;
  const stack = [{ color: null, fmt: null }];
  const top = () => stack[stack.length - 1];
  const pushText = (t) => { if (t) tokens.push({ type: 'text', text: t, color: top().color, fmt: top().fmt }); };
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    pushText(text.slice(last, m.index));
    if (m[1] !== undefined) {
      // открывающий тег без закрывающего дальше по тексту ничего не красит (как на сайте)
      if (text.indexOf('[/#]', re.lastIndex) >= 0) {
        const sp = parseSpan(m[1]);
        const cur = top();
        stack.push({ color: sp.color || cur.color, fmt: mergeFmt(cur.fmt, sp.fmt) });
      }
    } else if (m[0] === '[/#]') {
      if (stack.length > 1) stack.pop();
    } else {
      const c = tagToCommand(m[2]);
      if (c) tokens.push({ type: 'cmd', ...c });
    }
    last = re.lastIndex;
  }
  pushText(text.slice(last));
  return tokens;
}

function plainText(text) {
  return parseText(text).filter((t) => t.type === 'text').map((t) => t.text).join('');
}

// Короткое описание для списка кадров (теги заменяются значками)
function previewText(text) {
  if (!text) return '';
  return text
    .replace(/\[#\/[^\]]*\]([\s\S]*?)\[\/#\]/g, '$1')
    .replace(/\[#bgm(\d+)\]/gi, '♪')
    .replace(/\[#bgs(\d+)\]/gi, '🔊')
    .replace(/\[#[^\]]*\]/g, '')
    .replace(/\[\/#\]/g, '');
}

window.Tags = { parseText, plainText, previewText, tagToCommand, parseShake, COLORS, SHAKE_MOTIONS };
