// Thumbnails for the front page (../index.html): opens each build and study headless and saves
// home/<id>.jpg. Needs the local server on 5190. usage: node --experimental-websocket home/shoot.mjs [id ...]
// Uses lines-and-voids/tools/cdp.mjs. Nothing here touches the microphone (simSpeech is scripted text).
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), U = 'http://127.0.0.1:5190/';
const booted = 'window.__booted ? window.__booted.then(() => 1) : 1';
// a scripted turn for the multimodal build: rest on something, say a line, sketch an arrow
const turn = `(async () => { const st = $('stage'), r = st.getBoundingClientRect(), sl = ms => new Promise(f => setTimeout(f, ms));
  const at = (x, y, b) => st.dispatchEvent(new PointerEvent(b || 'pointermove', { clientX: r.left + x, clientY: r.top + y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: b === 'pointerdown' ? 1 : 0, bubbles: true }));
  at(300, 160); await sl(700); simSpeech('put a garden here and connect this to that', { wordMs: 260 }); await sl(1600);
  setTool('sketch'); MM.anchor = 'float'; at(330, 420); await sl(100); at(330, 420, 'pointerdown');
  for (let k = 1; k <= 30; k++) { st.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 330 + k * 9, clientY: r.top + 420 - Math.sin(k / 30 * Math.PI) * 60, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1, bubbles: true })); await sl(30); }
  at(600, 420, 'pointerup'); at(700, 520); await sl(3200); return 1; })()`;
const SHOTS = {
  // the main build twice: light chrome at noon on Four voids, dark chrome at evening on Chasm (cut at L5)
  'spall-light': [{ url: U + 'spall/', load: 1500 }, { eval: booted }, { eval: "setUiTone(false); loadPreset('voids'); if (LIT.on) setLightTime('noon'); 1" }, { wait: 6000 }],
  'spall-dark': [{ url: U + 'spall/', load: 1500 }, { eval: booted }, { eval: "setUiTone(true); loadPreset('chasm'); if (LIT.on) setLightTime('evening'); setLevel(7, { silent: true, snap: true }); 1" }, { wait: 6000 }],
  'spall-3d': [{ url: U + 'spall-3d/', load: 1500 }, { eval: booted }, { wait: 800 }, { eval: 'setG3(true); g3Go(68, 22, 0.01); 1' }, { wait: 3500 }],
  'spall-multimodal': [{ url: U + 'spall-multimodal/', load: 1500 }, { eval: booted }, { eval: 'BAND.cfg.traffic = 0.3; MM.auto = false; 1' }, { eval: turn }, { wait: 500 }],
  'notes-multimodal': [{ url: U + 'spall-multimodal/notes.html', load: 2500 }],
  placement: [{ url: U + 'spall/mockups/placement/local/placement.html', load: 3000 }],
  zine: [{ url: U + 'spall/mockups/zine/local/spall-zine.html', load: 3000 }],
  backdrop: [{ url: U + 'spall-backdrop/local/undercity.html', load: 5000 }],
  chatter: [{ url: U + 'agent-chat-reference/?still', load: 2500 }],
  light: [{ url: U + 'spall/mockups/light.html', load: 3500 }],
  hires: [{ url: U + 'spall/mockups/hires.html', load: 3500 }],
  wires: [{ url: U + 'spall/mockups/index.html', load: 3500 }],
  '3d-passes': [{ url: U + 'spall-3d/local/compare.html', load: 3000 }],
  '3d-splats': [{ url: U + 'spall-3d/local/splats.html', load: 3000 }],
  '3d-edges': [{ url: U + 'spall-3d/local/edges.html', load: 3000 }],
  '3d-outlines': [{ url: U + 'spall-3d/local/outlines.html', load: 3000 }],
  '3d-outline-options': [{ url: U + 'spall-3d/local/outline-options.html', load: 3000 }],
  layers: [{ url: U + 'megastructure-layers/stratum.html', load: 3500 }],
  aesthetics: [{ url: U + 'aesthetics/', load: 3000 }],
  scale: [{ url: U + 'aesthetics/scale/', load: 3000 }],
  lines: [{ url: U + 'lines-and-voids/', load: 3500 }],
  // not served: the toy lives in notes/, beside its write-up
  multiscale: [{ url: 'file://' + join(HERE, '..', '..', 'notes', 'multiscale-toy.html'), load: 2500 }],
};
// archive cards whose best picture is one of their own renders: cropped to the card's 16:10
const STILLS = {
  renders: 'concept-renders/out/c_kowloon.png',
  'agent-buildings': 'agent-buildings/out/scene_dusk_labelled.png',
  'ui-mockups': 'ui-mockups/out/m1_level_hud.png',
};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : [...Object.keys(SHOTS), ...Object.keys(STILLS)];
const tmp = mkdtempSync(join(tmpdir(), 'home-')), steps = [{ size: [1280, 800], dpr: 1 }];
for (const id of ids) {
  if (STILLS[id]) {
    const out = join(HERE, id + '.jpg');
    spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '--resampleWidth', '1140', join(HERE, '..', STILLS[id]), '--out', out], { stdio: 'ignore' });
    spawnSync('sips', ['--cropToHeightWidth', '712', '1140', out], { stdio: 'ignore' });
    console.log('home/' + id + '.jpg'); continue;
  }
  if (!SHOTS[id]) { console.error('no shot for', id); continue; } steps.push(...SHOTS[id], { shot: join(tmp, id + '.png') }); }
writeFileSync(join(tmp, 'steps.json'), JSON.stringify(steps));
spawnSync('node', ['--experimental-websocket', join(HERE, '..', 'lines-and-voids', 'tools', 'cdp.mjs'), join(tmp, 'steps.json')], { stdio: 'inherit' });
for (const id of ids) {
  const png = join(tmp, id + '.png'); if (!existsSync(png)) continue;
  // cards are two to a row, so 1140 px wide covers a 2× screen
  spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '--resampleWidth', '1140', png, '--out', join(HERE, id + '.jpg')], { stdio: 'ignore' });
  console.log('home/' + id + '.jpg');
}
rmSync(tmp, { recursive: true, force: true });
