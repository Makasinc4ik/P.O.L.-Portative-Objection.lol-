// Ищет строки с кириллицей в коде (строковые литералы и шаблоны), печатает статистику / JSON
const fs = require('fs');
const acorn = require('/home/claude/oo/android/node_modules/acorn');
const walk = require('/home/claude/oo/android/node_modules/acorn-walk');
const CYR = /[А-Яа-яЁё]/;
const files = process.argv.slice(2);
const keys = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true });
  walk.full(ast, (n) => {
    if (n.type === 'Literal' && typeof n.value === 'string' && CYR.test(n.value)) {
      const k = n.value; keys.set(k, (keys.get(k) || 0) + 1);
    } else if (n.type === 'TemplateLiteral' && n.quasis.some((q) => CYR.test(q.value.cooked))) {
      const k = n.quasis.map((q, i) => q.value.cooked + (i < n.expressions.length ? `{${i}}` : '')).join('');
      keys.set(k, (keys.get(k) || 0) + 1);
    }
  });
}
if (process.env.JSON) console.log(JSON.stringify([...keys.keys()], null, 1));
else { let chars = 0; for (const k of keys.keys()) chars += k.length; console.log('unique', keys.size, 'chars', chars); }
