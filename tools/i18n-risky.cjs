const fs = require('fs');
const acorn = require('/home/claude/oo/android/node_modules/acorn');
const walk = require('/home/claude/oo/android/node_modules/acorn-walk');
const CYR = /[А-Яа-яЁё]/;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowReturnOutsideFunction: true });
  walk.fullAncestor(ast, (n, st, anc) => {
    const isStr = (n.type === 'Literal' && typeof n.value === 'string' && CYR.test(n.value)) || (n.type === 'TemplateLiteral' && n.quasis.some((q) => CYR.test(q.value.cooked)));
    if (!isStr) return;
    const p = anc[anc.length - 2];
    let why = null;
    if (p.type === 'BinaryExpression' && /[=!]=/.test(p.operator)) why = 'compare';
    else if (p.type === 'SwitchCase') why = 'case';
    else if (p.type === 'Property' && p.key === n) why = 'key';
    else if (p.type === 'CallExpression' && p.callee.type === 'MemberExpression' && ['includes', 'indexOf', 'startsWith', 'endsWith', 'test', 'match', 'replace', 'split', 'has', 'get', 'set', 'getItem', 'setItem'].includes(p.callee.property.name)) why = 'call:' + p.callee.property.name;
    else if (p.type === 'NewExpression') why = 'new';
    else if (p.type === 'MemberExpression' && p.property === n) why = 'member';
    if (why) console.log(f + ':' + n.loc.start.line, why, JSON.stringify(n.type === 'Literal' ? n.value : src.slice(n.start, n.end)).slice(0, 90));
  });
}
