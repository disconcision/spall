// Perf harness (headless Chrome): boot timeline and CPU profile, steady frame times in cut and
// exploded, and the frame times of the switches between them (keys 2 and 1), with a profile each.
// usage: SETTLE=7000 node test/perf.mjs http://127.0.0.1:5190/stratum-wires/stratum.html outdir [w h]
// SETTLE: ms to wait after boot before measuring (the cables sleep about 7 s in). Node >= 22.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2], OUT = process.argv[3] || '.', VW = +(process.argv[4] || 1440), VH = +(process.argv[5] || 900);
mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9500 + Math.floor(Math.random() * 400);
const proc = spawn(CHROME, ['--headless=new', '--use-angle=metal', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0; const pending = new Map();
async function connect() {
  for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch (e) { } await sleep(150); }
  throw new Error('no CDP');
}
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value; };
function summarize(profile, label, n = 25) {
  const nodes = new Map(profile.nodes.map(x => [x.id, x])), self = new Map();
  const dt = profile.timeDeltas; const counts = new Map();
  profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
  for (const [id, us] of counts) { const nd = nodes.get(id), cf = nd.callFrame; const k = `${cf.functionName || '(anon)'} :${cf.lineNumber + 1}${cf.url ? '' : ' [native]'}`; self.set(k, (self.get(k) || 0) + us); }
  // inclusive by function name
  const parent = new Map(); for (const nd of profile.nodes) for (const c of nd.children || []) parent.set(c, nd.id);
  const incl = new Map();
  for (const [id, us] of counts) { const seen = new Set(); let cur = id; while (cur != null) { const cf = nodes.get(cur).callFrame; const k = `${cf.functionName || '(anon)'} :${cf.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } cur = parent.get(cur); } }
  const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `  ${(us / 1000).toFixed(1).padStart(8)}ms  ${k}`).join('\n');
  console.log(`\n== ${label}: self ==\n${top(self)}\n== ${label}: inclusive ==\n${top(incl)}`);
}
try {
  ws = new WebSocket(await connect()); await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } if (m.method === 'Runtime.exceptionThrown') console.log('EXC', m.params.exceptionDetails.exception?.description); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__t0 = performance.now(); window.__frames = []; window.__lt = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = f => raf(t => { window.__frames.push(t); f(t); });
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  ` });
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 250 }); await send('Profiler.start');
  await send('Page.navigate', { url: URL });
  for (let k = 0; k < 150; k++) { await sleep(100); if (await ev(`(() => { try { return BOOT.done; } catch (e) { return document.readyState === 'complete' && typeof STRATUM !== 'undefined' && !!STRATUM.S.bw; } })()`) === true) break; } await ev(`window.__bootT = performance.now()`); await sleep(+(process.env.SETTLE || 300));
  const bootProf = (await send('Profiler.stop')).profile; writeFileSync(join(OUT, 'boot.cpuprofile'), JSON.stringify(bootProf));
  const nav = await ev(`JSON.stringify((() => { const n = performance.getEntriesByType('navigation')[0]; const f = window.__frames; return { domInteractive: Math.round(n.domInteractive), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), booted: Math.round(window.__bootT||0), firstFrame: Math.round(f[0]), frames: f.length, fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime||0), longtasks: window.__lt }; })())`);
  console.log('BOOT', nav);
  summarize(bootProf, 'boot', 30);
  await ev(`document.fonts.ready.then(()=>1)`);
  await sleep(1500);
  // steady-state frame times in cut mode
  const steady = async label => { await ev(`window.__frames = []`); await send('Profiler.start'); await sleep(2000); const sp = (await send('Profiler.stop')).profile; writeFileSync(join(OUT, 'steady-' + label + '.cpuprofile'), JSON.stringify(sp)); const r = await ev(`(() => { const f = window.__frames, d = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b); return { n: f.length, med: d[d.length >> 1]?.toFixed(1), p95: d[Math.floor(d.length * .95)]?.toFixed(1), max: d[d.length - 1]?.toFixed(1) }; })()`); console.log('STEADY', label, JSON.stringify(r)); };
  await steady('cut');
  // explode transition
  const trans = async (key, label) => {
    await ev(`window.__frames = []; window.__lt = []`);
    await send('Profiler.start');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: 'Digit' + key, text: key }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: 'Digit' + key });
    await sleep(1800);
    const p = (await send('Profiler.stop')).profile; writeFileSync(join(OUT, label + '.cpuprofile'), JSON.stringify(p));
    const r = await ev(`(() => { const f = window.__frames, d = f.slice(1).map((t, i) => Math.round(t - f[i])); return { mode: STRATUM.S.mode, n: f.length, deltas: d.join(' '), longtasks: JSON.stringify(window.__lt) }; })()`);
    console.log('\nTRANSITION', label, JSON.stringify(r));
    summarize(p, label, 18);
  };
  await trans('2', 'to-exploded');
  await steady('exploded');
  await trans('1', 'to-cut');
  await steady('cut-again');
} catch (e) { console.error('failed', e); }
finally { try { ws.close(); } catch (e) { } proc.kill('SIGKILL'); }
