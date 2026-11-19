// Багтрек 8: шрифт таблички в копии текстбокса, петли стандартной музыки, автометка «(AJT based)»
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo';
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
await win.waitForTimeout(2500);
await win.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
const R = await win.evaluate(async ([fa, fb]) => {
  const { Lib, Fonts } = window.Assets;
  const imp = (p) => window.api.lib.importPath(p);
  const base = Lib.list('textboxes').find((x) => x.nameplate) || window.Assets.SYSTEM.textboxes[0];
  const mk = JSON.parse(JSON.stringify(base)); delete mk.isPreset; delete mk.id; mk.name = 'Font test (AJT based)';
  mk.nameplate.fontUrl = await imp(fa);
  const s1 = await Lib.upsert('textboxes', mk);
  const url1 = s1.nameplate.fontUrl;
  const fam1 = Fonts.family(url1); await fam1.promise;
  // копия, как кнопкой «Копия»
  const cp = JSON.parse(JSON.stringify(s1)); delete cp.id; cp.name = s1.name; // то же имя
  const s2 = await Lib.upsert('textboxes', cp);
  const fam2a = Fonts.family(s2.nameplate.fontUrl); await fam2a.promise;
  // в копии выбрать другой шрифт и сохранить
  const ed = JSON.parse(JSON.stringify(s2)); ed.nameplate.fontUrl = await imp(fb);
  const s3 = await Lib.upsert('textboxes', ed);
  const fam2b = Fonts.family(s3.nameplate.fontUrl); await fam2b.promise;
  const sz = async (u) => (await (await fetch(Lib.url(u) + '?x=' + Math.random())).arrayBuffer()).byteLength;
  const out = { url1, url2: s2.nameplate.fontUrl, url3: s3.nameplate.fontUrl, size1: await sz(url1), size3: await sz(s3.nameplate.fontUrl), famBefore: fam2a.fam, famAfter: fam2b.fam, ready: fam2b.ready };
  // шрифт реально другой: ширина строки этим семейством
  const c = document.createElement('canvas').getContext('2d');
  const w = (fam) => { c.font = `40px "${fam}"`; return Math.round(c.measureText('Феникс Wright 123').width); };
  out.widthOrig = w(fam1.fam); out.widthNew = w(fam2b.fam);
  out.marks = window.Assets.Marks.autoTags ? window.Assets.Marks.autoTags('textboxes', s3.id) : 'n/a';
  out.loops = ['1', '2', '4', '9', '63'].map((id) => { const m = Lib.get('music', +id) || Lib.get('music', id); return [id, m && m.name, JSON.stringify(Lib.musicLoop(m))]; });
  await Lib.remove('textboxes', s1.id); await Lib.remove('textboxes', s3.id);
  return out;
}, ['/usr/share/fonts/truetype/crosextra/Caladea-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf']);
console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
