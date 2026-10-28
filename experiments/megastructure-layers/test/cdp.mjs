// Minimal CDP harness: launches headless Chrome, runs a list of steps against
// test/test.html in REAL time (so rAF, timers and performance.now() behave),
// captures screenshots and console errors.
// usage: node test/cdp.mjs steps.json
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const steps = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9400 + Math.floor(Math.random() * 400);
const udd = mkdtempSync(join(tmpdir(), 'cdp-'));
const gpu = process.env.SWGL ? ['--disable-gpu'] : ['--use-angle=metal'];
const proc = spawn(CH, ['--headless=new', ...gpu, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', `--user-data-dir=${udd}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map(), errors = [];
async function connect() {
  for (let k = 0; k < 80; k++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const pg = list.find(t => t.type === 'page'); if (pg) return pg.webSocketDebuggerUrl; } catch (e) { /* retry */ }
    await sleep(150);
  }
  throw new Error('no CDP');
}
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text);
  return r.result.value;
}
try {
  const url = await connect();
  ws = new WebSocket(url);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value || a.description).join(' '));
  });
  await send('Page.enable'); await send('Runtime.enable');
  for (const st of steps) {
    if (st.size) await send('Emulation.setDeviceMetricsOverride', { width: st.size[0], height: st.size[1], deviceScaleFactor: st.dpr || 1, mobile: !!st.mobile });
    if (st.reduced != null) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: st.reduced ? 'reduce' : 'no-preference' }] });
    if (st.hash != null) {
      const file = resolve(here, st.page || 'test.html');
      await send('Page.navigate', { url: 'file://' + file + '?r=' + (++seq) + '#' + st.hash });
      await sleep(st.load || 1800);
    }
    if (st.eval) { const v = await evalJS(st.eval); if (v !== undefined) console.log((st.name || 'eval') + ':', typeof v === 'string' ? v : JSON.stringify(v)); }
    if (st.mouse) for (const [type, x, y, mods] of st.mouse) { await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, modifiers: mods || 0 }); await sleep(40); }
    if (st.keys) for (const k of st.keys) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: k.length === 1 ? k : undefined }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k }); await sleep(60); }
    if (st.wait) await sleep(st.wait);
    if (st.shot) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(st.shot, Buffer.from(r.data, 'base64'));
      console.log('shot', st.shot);
    }
    if (st.frames) {   // [count, intervalMs, prefix]
      const [n, dt, prefix] = st.frames;
      for (let k = 0; k < n; k++) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${prefix}${String(k).padStart(3, '0')}.png`, Buffer.from(r.data, 'base64')); await sleep(dt); }
      console.log('frames', n, prefix);
    }
  }
  const pageErrs = await evalJS('JSON.stringify(window.__errs||[])');
  console.log('ERRORS:', JSON.stringify(errors), 'PAGE:', pageErrs);
} catch (e) { console.log('HARNESS ERROR', e.message); }
finally { try { ws && ws.close(); } catch (e) { /* ignore */ } proc.kill('SIGKILL'); await sleep(200); try { rmSync(udd, { recursive: true, force: true }); } catch (e) { /* ignore */ } process.exit(0); }
