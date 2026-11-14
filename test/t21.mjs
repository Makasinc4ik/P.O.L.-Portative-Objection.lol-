// 1.0.0: теги «в конце кадра», плавность звуков, выбор файлов системным окном
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const ROOT = '/home/claude/oo', OUT = ROOT + '/test/out21';
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: process.env.EL || (ROOT + '/node_modules/electron/dist/electron'), args: ['--no-sandbox', ROOT], env: { ...process.env, OO_LIBRARY: '/tmp/fresh/Library' } });
const win = await app.firstWindow();
const logs = [];
win.on('pageerror', (e) => logs.push('[pageerror] ' + e.stack));
win.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await win.setViewportSize({ width: 1500, height: 950 }).catch(() => {});
await win.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(150); }
const R = {};

R.tags = await win.evaluate(() => Object.fromEntries(['evdh', 'evdhe', 'bgmse', 'bgmfoe', 'bgsse', 'bgsfo', 'bgsfoe', 'bgme', 'evd12', 'bgs3'].map((t) => [t, JSON.stringify(window.Tags.tagToCommand(t))])));

// воспроизведение: улика держится до смены кадра
R.play = await win.evaluate(async () => {
  const ev = window.Assets.Lib.list('evidence')[0];
  const f0 = { ...App.project.groups[0].frames[2], id: 'a', text: `раз[#evd${ev.id}]два три[#evdhe]`, actions: [], speechBubble: null, popupId: null, fade: null };
  const f1 = { ...f0, id: 'b', text: 'следующий' };
  const proj = { ...App.project, groups: [{ ...App.project.groups[0], frames: [f0, f1] }] };
  const cv = document.createElement('canvas');
  const pl = new window.Player(cv, App.audio);
  pl.setSize(640, 360);
  pl.setProject(proj);
  const log = [];
  const t0 = performance.now();
  let textDone = null;
  pl.on('frame', (i) => log.push({ ev: 'frame' + i, t: Math.round(performance.now() - t0), evidence: !!pl.state.evidence }));
  const timer = setInterval(() => {
    const b = pl.state.box;
    if (textDone == null && pl.current === 0 && b && b.chars && b.shown >= b.chars.length && b.chars.length > 5) textDone = { t: Math.round(performance.now() - t0), evidence: !!pl.state.evidence };
  }, 20);
  const p = pl.playFrom(0, { tail: 100 });
  await new Promise((r) => setTimeout(r, 400));
  // после смены кадра
  await new Promise((r) => { const iv = setInterval(() => { if (pl.current === 1) { clearInterval(iv); r(); } }, 20); });
  await new Promise((r) => setTimeout(r, 500));
  const after = !!pl.state.evidence;
  await p; clearInterval(timer);
  // пропуск кадров и неподвижный кадр
  pl.fastForward(1);
  const ff = pl.ffEvidence;
  await pl.showStill(0);
  const still0 = !!pl.state.evidence;
  await pl.showStill(1);
  const still1 = !!pl.state.evidence;
  // runCommand напрямую
  pl.state.evidence = { id: 1, icon: true };
  await pl.runCommand({ cmd: 'evidence_hide', atEnd: true }, pl.session);
  const queued = !!pl.state.evidence;
  pl.flushEnd();
  return { log, textDone, after, ffAfterFrame0: ff, still0, still1, queuedStillShown: queued, flushed: !pl.state.evidence };
});

// плавность звука в проигрывателе (OfflineAudioContext вместо настоящего)
R.audio = await win.evaluate(async () => {
  const SR = 8000;
  const mk = (ctx, sec) => { const b = ctx.createBuffer(1, SR * sec, SR); b.getChannelData(0).fill(1); return b; };
  const at = (buf, t) => Math.round(buf.getChannelData(0)[Math.floor(t * SR)] * 100) / 100;
  const engine = (sec) => { const ae = new window.Assets.AudioEngine(); ae.ctx.close(); ae.ctx = new OfflineAudioContext(1, SR * sec, SR); ae.master = ae.ctx.createGain(); ae.master.connect(ae.ctx.destination); return ae; };
  const a = engine(2);
  a.playBuffer(mk(a.ctx, 1), 1, { fadeInMs: 200, fadeOutMs: 300 });
  const ra = await a.ctx.startRendering();
  const b = engine(2);
  b.playBuffer(mk(b.ctx, 1.5), 1, { fadeOutMs: 400 });
  b.ctx.suspend(0.5).then(() => { b.stopSounds(); b.ctx.resume(); });
  const rb = await b.ctx.startRendering();
  const c = engine(2);
  c.playBuffer(mk(c.ctx, 1.5), 1, {});
  c.ctx.suspend(0.5).then(() => { c.fadeOutSounds(500); c.ctx.resume(); });
  const rc = await c.ctx.startRendering();
  return {
    fades: [0.05, 0.1, 0.5, 0.85, 0.99].map((t) => [t, at(ra, t)]),
    stopWithFade: [0.4, 0.7, 0.95].map((t) => [t, at(rb, t)]),
    fadeOutTag: [0.4, 0.75, 1.05].map((t) => [t, at(rc, t)]),
  };
});

// сведение звука при экспорте
R.mix = await win.evaluate(async () => {
  const ac = new OfflineAudioContext(1, 48000, 48000);
  const buf = ac.createBuffer(1, 48000, 48000); buf.getChannelData(0).fill(1);
  const buf2 = ac.createBuffer(1, 96000, 48000); buf2.getChannelData(0).fill(1);
  const real = { buffer: async () => null, sfxVolume: 1, musicVolume: 1 };
  const out = await window.Exporter._renderAudio([
    { t: 0, type: 'sfx', buf, vol: 1, fadeInMs: 200, fadeOutMs: 300 },
    { t: 2, type: 'sfx', buf: buf2, vol: 1, fadeInMs: 0, fadeOutMs: 400 },
    { t: 2.5, type: 'sfx_stop' },
    { t: 4, type: 'sfx', buf: buf2, vol: 1 },
    { t: 4.5, type: 'sfx_fadeout', ms: 500 },
  ], 6, real, null);
  const L = out.getChannelData(0);
  const at = (t) => Math.round(L[Math.floor(t * 48000)] * 100) / 100;
  return [0.1, 0.5, 0.85, 2.4, 2.7, 2.95, 3.5, 4.4, 4.75, 5.05].map((t) => [t, at(t)]);
});

// выбор файлов: системное окно с «Все файлы»
await app.evaluate(({ dialog }) => {
  global.__dlgArgs = [];
  dialog.showOpenDialog = async (w, opts) => { global.__dlgArgs.push(opts || w); return { canceled: false, filePaths: ['/tmp/oo_pick_TEST.PNG'] }; };
});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync('/tmp/oo_pick_TEST.PNG', png);
R.pick = await win.evaluate(async () => {
  const paths = await window.api.lib.pickPaths('image', true);
  const rel = await window.api.lib.importPath(paths[0]);
  return { paths, rel };
});
R.dialogOpts = await app.evaluate(() => global.__dlgArgs.map((o) => ({ title: o.title, filters: o.filters, properties: o.properties })));
// меню тегов
R.menus = await win.evaluate(async () => {
  document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
  const out = {};
  for (const name of ['🔎 Улика', '🎵 Музыка', '🔊 Звук']) {
    const b = [...document.querySelectorAll('.frame button')].find((x) => x.textContent.trim() === name);
    b.click();
    await new Promise((r) => setTimeout(r, 150));
    out[name] = [...document.querySelectorAll('.dropdown.tagmenu button')].map((x) => x.textContent).filter((t) => /конце кадра|заглушить/.test(t));
    document.body.click();
    document.querySelectorAll('.dropdown.tagmenu').forEach((m) => m.remove());
  }
  return out;
});

console.log(JSON.stringify(R, null, 1));
console.log(logs.join('\n'));
await app.close();
