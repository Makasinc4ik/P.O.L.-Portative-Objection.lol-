// Оборачивает строки с кириллицей в tx(...) / tx`...` (перевод интерфейса). Повторный запуск ничего не меняет.
const fs = require('fs');
const acorn = require('/home/claude/oo/android/node_modules/acorn');
const walk = require('/home/claude/oo/android/node_modules/acorn-walk');
const CYR = /[А-Яа-яЁё]/;
const SKIP = new Set(['Hgйё', 'з']);
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true });
  const ins = [];
  let n1 = 0, n2 = 0;
  walk.fullAncestor(ast, (n, st, anc) => {
    const p = anc[anc.length - 2];
    if (n.type === 'Literal' && typeof n.value === 'string' && CYR.test(n.value) && !SKIP.has(n.value)) {
      if (p && p.type === 'Property' && p.key === n && !p.computed) return;
      if (p && p.type === 'CallExpression' && p.callee.type === 'Identifier' && p.callee.name === 'tx') return;
      if (p && (p.type === 'ImportDeclaration' || p.type === 'ExportNamedDeclaration')) return;
      ins.push([n.start, 'tx(']); ins.push([n.end, ')']);
      n1++;
    } else if (n.type === 'TemplateLiteral' && n.quasis.some((q) => CYR.test(q.value.cooked))) {
      if (p && p.type === 'TaggedTemplateExpression' && p.quasi === n) return;
      ins.push([n.start, 'tx']);
      n2++;
    }
  });
  let out = src;
  ins.sort((a, b) => b[0] - a[0]);
  for (const [pos, t] of ins) out = out.slice(0, pos) + t + out.slice(pos);
  fs.writeFileSync(f, out);
  console.log(f, 'literals', n1, 'templates', n2);
}
