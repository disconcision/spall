# the round-three shot set: stills of both scenes in both views, and three clips  ->  shots/_u3full.json
import json
CLEAN = "AGENT.timer=1e9;AGENT.state='idle';document.getElementById('strip').style.display='none';{const b=document.getElementById('bApprove');if(b)(b.closest('.pn')||b.parentElement).style.visibility='hidden';}if(window.G3&&G3.hud)G3.hud.style.display='none';"
U = "http://127.0.0.1:5190/spall-backdrop/test/test.html?s=r{i}#level=29&bd={sc}&tod={t}"
R = 'local/u3f/raw/'
n = [0]
def page(sc, t): n[0] += 1; return [{"url": U.format(i=n[0], sc=sc, t=t), "load": 6000}]
def d2(name, z, y): return [{"eval": CLEAN + f"setG3(false);setZoom({z});S.rot=0;markAllDirty();S.cam.x=0;S.cam.y={y};S.camTarget=null;skyDirty=true;"}, {"wait": 1500}, {"shot": R + name + '.png'}]
def d3(name, T, az, el, zf): return [{"eval": CLEAN + f"setG3(true);G3.hud.style.display='none';G3.T=[{T}];G3.az={az};G3.el={el};G3.zf={zf};G3.anim=null"}, {"wait": 1500}, {"shot": R + name + '.png'}]
ORBIT = "(()=>{const t0=performance.now();function f(){const t=(performance.now()-t0)/12000;if(t>1)return;G3.az=110+360*t;G3.el=20-8*Math.cos(t*Math.PI*2);G3.anim=null;requestAnimationFrame(f)}f()})()"
def orbit(name): return [{"eval": CLEAN + "setG3(true);G3.hud.style.display='none';G3.T=[32,32,15];G3.az=110;G3.el=12;G3.zf=1;G3.anim=null"}, {"wait": 1500}, {"record": 'local/u3f/rec/' + name, "ms": 12300, "during": ORBIT}]
s = [{"size": [1400, 900]}]
s += page('under', 'day') + d2('under_2d_top_day', 2, -150) + d2('under_2d_wide_day', 1, -40) + d2('under_2d_below_day', 1, 420)
s += d3('under_3d_hz_day', '32,32,15', 110, 12, 1) + d3('under_3d_side_day', '32,32,-20', 200, 14, 1)
s += orbit('under_orbit_day')
s += page('under', 'dusk') + d2('under_2d_top_dusk', 2, -150) + d3('under_3d_hz_dusk', '32,32,15', 110, 12, 1) + d3('under_3d_far_dusk', '14,14,10', 150, 32, 1)
s += [{"eval": "setG3(false)"}, {"wait": 500}] + d2('_', 1, 420)
s += [{"record": "local/u3f/rec/under_pan_dusk", "ms": 11300, "during": "(()=>{const t0=performance.now();let k=0;function f(){const t=(performance.now()-t0)/1000;if(t>11)return;if(t<6){S.cam.y=420-570*(t/6);S.camTarget=null;skyDirty=true}else{const n=Math.floor((t-6)/1.25);if(n>k){k=n;rotate(1);S.cam.y=-150;S.cam.x=0;S.camTarget=null}}requestAnimationFrame(f)}f()})()"}]
s += page('under', 'night') + d2('under_2d_top_night', 2, -150) + d2('under_2d_below_night', 1, 420) + d3('under_3d_hz_night', '32,32,15', 110, 12, 1)
s += page('abyss', 'day') + d2('abyss_2d_top_day', 2, -150) + d2('abyss_2d_wide_day', 1, -40) + d3('abyss_3d_hz_day', '32,32,15', 110, 12, 1) + d3('abyss_3d_far_day', '14,14,10', 150, 32, 1)
s += orbit('abyss_orbit_day')
s += page('abyss', 'dusk') + d2('abyss_2d_top_dusk', 2, -150) + d3('abyss_3d_hz_dusk', '32,32,15', 110, 12, 1)
s += page('abyss', 'night') + d2('abyss_2d_top_night', 2, -150) + d3('abyss_3d_hz_night', '32,32,15', 110, 12, 1)
s += [{"eval": "JSON.stringify(window.__errs)"}]
json.dump(s, open('shots/_u3full.json', 'w'))
