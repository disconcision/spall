// Headless shots for the placement study: boot the real game, stop its loop, load pl.js
// (overlay helpers + scenes), then save each scene's canvas frames as PNGs at art-pixel scale.
// usage: node shoot.mjs outdir scene[,scene...]   (node >= 22; the 5190 server must be up)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [out, list] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9100 + Math.floor(Math.random() * 400);
const udd = mkdtempSync(join(tmpdir(), 'znshot-'));
const proc = spawn(CH, ['--headless=new', '--use-angle=metal', `--remote-debugging-port=${port}`, '--no-first-run', '--hide-scrollbars', `--user-data-dir=${udd}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0; const pending = new Map();
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
}
try {
  let url; for (let k = 0; k < 80 && !url; k++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) url = p.webSocketDebuggerUrl; } catch (e) { } await sleep(150); }
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } if (m.method === 'Runtime.exceptionThrown') console.log('page error:', JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description)); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:5190/stratum-wires/test/test.html' });
  await sleep(1500);
  await ev('new Promise(r => { const t = () => window.__booted ? window.__booted.then(r) : setTimeout(t, 100); t(); })');
  await ev(readFileSync(join(here, 'zine.js'), 'utf8'));
  await ev('ZN.init()');
  for (const name of list.split(',')) {
    const t0 = Date.now();
    const frames = await ev(`ZN.run(${JSON.stringify(name)})`);
    const arr = Array.isArray(frames) ? frames : [frames];
    arr.forEach((d, k) => {
      if (typeof d === 'string' && d.startsWith('data:')) writeFileSync(join(out, arr.length > 1 ? `${name}_${String(k).padStart(3, '0')}.png` : `${name}.png`), Buffer.from(d.split(',')[1], 'base64'));
      else console.log(name, k, d);
    });
    console.log(name, arr.length, 'frame(s)', Date.now() - t0, 'ms');
  }
} catch (e) { console.error('failed:', e.message); }
finally { try { ws && ws.close(); } catch (e) { } proc.kill('SIGKILL'); }
