// Собирает app/js/lang-en.js из tools/i18n/keys.json и tools/i18n/en/*.json; проверяет {n} и пробелы по краям
const fs = require('fs');
const path = require('path');
const ROOT = '/home/claude/oo/';
const keys = require(ROOT + 'tools/i18n/keys.json');
const tr = {};
for (const f of fs.readdirSync(ROOT + 'tools/i18n/en').sort()) Object.assign(tr, JSON.parse(fs.readFileSync(ROOT + 'tools/i18n/en/' + f, 'utf8')));
const out = {};
const problems = [];
keys.forEach((k, i) => {
  let t = tr[String(i)];
  if (i === 976 || (t == null && /localStorage\.getItem\('token'\)/.test(k))) t = k.replace('Objection Offline: вход в аккаунт — кнопка Login / Войти вверху справа. После входа это окно закроется само.', 'Objection Offline: sign in with the Login button at the top right. This window closes by itself after signing in.');
  if (t == null) { problems.push('missing ' + i + ' ' + JSON.stringify(k)); return; }
  const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join();
  if (ph(k) !== ph(t)) problems.push('placeholders ' + i + ' ' + JSON.stringify(k) + ' -> ' + JSON.stringify(t));
  // пробелы и переводы строк по краям — как в оригинале (строки склеиваются с числами и другими строками)
  const lead = k.match(/^\s*/)[0], trail = k.match(/\s*$/)[0];
  t = lead + t.trim() + trail;
  t = t.replace(/«/g, '“').replace(/»/g, '”'); // английские кавычки
  out[k] = t;
});
const extra = Object.keys(tr).filter((i) => !(Number(i) < keys.length));
if (extra.length) problems.push('extra ids ' + extra.join(','));
const js = '// Перевод интерфейса на английский (собирается tools/i18n-build.cjs из tools/i18n/en/*.json; ключ — русская строка)\n' +
  "(function (g) {\n  var EN = " + JSON.stringify(out, null, 1) + ";\n  g.OO_EN = EN;\n  if (typeof module !== 'undefined' && module.exports) module.exports = EN;\n})(typeof window !== 'undefined' ? window : globalThis);\n";
fs.writeFileSync(ROOT + 'app/js/lang-en.js', js);
console.log('entries', Object.keys(out).length, 'of', keys.length);
if (problems.length) console.log(problems.join('\n'));
