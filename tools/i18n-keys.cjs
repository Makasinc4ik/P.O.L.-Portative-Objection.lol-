// Собирает все строки интерфейса (код + index.html) в tools/i18n/keys.json — в порядке появления
const fs = require('fs');
const acorn = require('/home/claude/oo/android/node_modules/acorn');
const walk = require('/home/claude/oo/android/node_modules/acorn-walk');
const CYR = /[А-Яа-яЁё]/;
const ROOT = '/home/claude/oo/';
const files = ['app/js/ui.js', 'app/js/assets.js', 'app/js/player.js', 'app/js/exporter.js', 'app/js/editor.js', 'app/js/library-ui.js', 'main.js', 'zipimport.js'];
const keys = [];
const seen = new Set();
const add = (k) => { if (!seen.has(k)) { seen.add(k); keys.push(k); } };
// index.html: текст и title/placeholder
const html = fs.readFileSync(ROOT + 'app/index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
for (const m of html.matchAll(/(?:title|placeholder)="([^"]*)"/g)) if (CYR.test(m[1])) add(m[1]);
for (const m of html.matchAll(/>([^<>]+)</g)) { const t = m[1].trim(); if (CYR.test(t)) add(t); }
for (const f of files) {
  const src = fs.readFileSync(ROOT + f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true });
  walk.fullAncestor(ast, (n, st, anc) => {
    const p = anc[anc.length - 2];
    if (n.type === 'Literal' && typeof n.value === 'string' && CYR.test(n.value)) {
      if (p && p.type === 'CallExpression' && p.callee.name === 'tx') add(n.value);
    } else if (n.type === 'TemplateLiteral' && p && p.type === 'TaggedTemplateExpression' && p.tag.name === 'tx') {
      add(n.quasis.map((q, i) => q.value.cooked + (i < n.expressions.length ? `{${i}}` : '')).join(''));
    }
  });
}
fs.writeFileSync(ROOT + 'tools/i18n/keys.json', JSON.stringify(keys, null, 1));
console.log('keys', keys.length);
