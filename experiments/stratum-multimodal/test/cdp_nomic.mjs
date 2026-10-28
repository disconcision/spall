// Headless Chrome over CDP for speech tests that never touch the microphone.
// Same steps as experiments/lines-and-voids/tools/cdp.mjs, plus a guard injected before every
// page load: getUserMedia rejects (unless a test sets window.__fakeMic to return a generated
// stream) and SpeechRecognition / webkitSpeechRecognition are removed. Chrome's Web Speech
// recognizer listens to the real default mic whatever the fake-device flags say, so it must never
// run headless. Feed speech with STRATUM.speakClip(url) (Moonshine only) or STRATUM.simSpeech(text).
// usage: UDD=/path/to/profile node --experimental-websocket test/cdp_nomic.mjs steps.json
//   (UDD keeps the browser profile, so Moonshine's model cache survives between runs)
// steps: [{size:[w,h]}, {url}, {wait:ms}, {eval:"js", name?}, {shot:"out.png"},
//         {mouse:[[type,x,y,mods?],...], dt?}, {key:"t"}, {record:"dir", ms}, {profile:"out.cpuprofile", run:"js"}]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const steps = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9500 + Math.floor(Math.random() * 400);
const udd = process.env.UDD || mkdtempSync(join(tmpdir(), 'cdp-'));
mkdirSync(udd, { recursive: true });
const proc = spawn(CH, ['--headless=new', '--use-angle=metal', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--deny-permission-prompts', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...(process.env.CDP_ARGS ? process.env.CDP_ARGS.split(' ') : []), `--user-data-dir=${udd}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map(), errors = [];
const listeners = [];
async function connect() {
  for (let k = 0; k < 80; k++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const pg = list.find(t => t.type === 'page'); if (pg) return pg.webSocketDebuggerUrl; } catch (e) { /* retry */ }
    await sleep(150);
  }
  throw new Error('no CDP');
}
function send(method, params = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); }
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text);
  return r.result.value;
}
try {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value || a.description).join(' '));
    for (const l of listeners) l(m);
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const no = () => window.__fakeMic ? window.__fakeMic() : Promise.reject(new DOMException('microphone disabled in tests', 'NotAllowedError'));   // a test may hand over a generated stream, never a device
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: no });
    for (const k of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, k, { value: undefined });
    window.__micGuard = true;
  })();` });
  for (const st of steps) {
    if (st.size) await send('Emulation.setDeviceMetricsOverride', { width: st.size[0], height: st.size[1], deviceScaleFactor: st.dpr || 1, mobile: false });
    if (st.url) { await send('Page.navigate', { url: st.url }); await sleep(st.load || 2500); }
    if (st.wait) await sleep(st.wait);
    if (st.profile) {   // CPU profile around one expression: {profile:"out.cpuprofile", run:"js"}
      await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start');
      await evalJS(st.run); const r = await send('Profiler.stop');
      writeFileSync(st.profile, JSON.stringify(r.profile)); console.log('profile', st.profile);
    }
    if (st.eval) { const v = await evalJS(st.eval); if (v !== undefined && v !== null) console.log((st.name || 'eval') + ':', typeof v === 'string' ? v : JSON.stringify(v)); }
    if (st.key) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: st.key, text: st.key.length === 1 ? st.key : undefined }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: st.key }); await sleep(60); }
    if (st.mouse) for (const [type, x, y, mods, btn] of st.mouse) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !btn ? 'none' : (btn || 'left'), buttons: type === 'mouseReleased' ? 0 : (type === 'mousePressed' || btn ? 1 : 0), clickCount: 1, modifiers: mods || 0 });
      await sleep(st.dt || 16);
    }
    if (st.shot) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(st.clip ? { clip: { x: st.clip[0], y: st.clip[1], width: st.clip[2], height: st.clip[3], scale: 1 } } : {}) });
      writeFileSync(st.shot, Buffer.from(r.data, 'base64')); console.log('shot', st.shot);
    }
    if (st.record) {
      // screencast frames for st.ms, written as numbered jpgs with their timestamps
      mkdirSync(st.record, { recursive: true });
      let n = 0; const times = [];
      const on = async m => {
        if (m.method !== 'Page.screencastFrame') return;
        const f = m.params; writeFileSync(join(st.record, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
        times.push(f.metadata.timestamp); n++;
        send('Page.screencastFrameAck', { sessionId: f.sessionId });
      };
      listeners.push(on);
      await send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
      if (st.during) evalJS(st.during);
      await sleep(st.ms || 3000);
      await send('Page.stopScreencast');
      listeners.splice(listeners.indexOf(on), 1);
      writeFileSync(join(st.record, 'times.json'), JSON.stringify(times));
      console.log('recorded', n, 'frames to', st.record);
    }
  }
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} catch (e) { console.error('cdp failed:', e.message); }
finally { try { ws && ws.close(); } catch (e) { /* ignore */ } proc.kill('SIGKILL'); }
