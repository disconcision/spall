# the round-four shot set: the undercity under four lights, in both views, and three clips  ->  shots/_u4full.json
import json
CLEAN = "AGENT.timer=1e9;AGENT.state='idle';document.getElementById('strip').style.display='none';{const b=document.getElementById('bApprove');if(b)(b.closest('.pn')||b.parentElement).style.visibility='hidden';}if(window.G3&&G3.hud)G3.hud.style.display='none';"
U = "http://127.0.0.1:5190/spall-3d/test/test.html?s=v{i}#level=29&bd=under&tod={t}{x}"
R, V = 'local/u4/raw/', 'local/u4/rec/'
n = [0]
def page(t, light=None): n[0] += 1; return [{"url": U.format(i=n[0], t=t, x='&light=' + light if light else ''), "load": 6000}]
def d2(name, z, y): return [{"eval": CLEAN + f"setG3(false);setZoom({z});S.cam.x=0;S.cam.y={y};S.camTarget=null;skyDirty=true;"}, {"wait": 1500}, {"shot": R + name + '.png'}]
def d3(name, T, az, el, zf): return [{"eval": CLEAN + f"setG3(true);G3.hud.style.display='none';G3.T=[{T}];G3.az={az};G3.el={el};G3.zf={zf};G3.anim=null"}, {"wait": 1500}, {"shot": R + name + '.png'}]
ORBIT = "(()=>{const t0=performance.now();function f(){const t=(performance.now()-t0)/12000;if(t>1)return;G3.az=110+360*t;G3.el=20-8*Math.cos(t*Math.PI*2);G3.anim=null;requestAnimationFrame(f)}f()})()"
def orbit(name): return [{"eval": CLEAN + "setG3(true);G3.hud.style.display='none';G3.T=[32,32,15];G3.az=110;G3.el=12;G3.zf=1;G3.anim=null"}, {"wait": 1500}, {"record": V + name, "ms": 12300, "during": ORBIT}]
s = [{"size": [1400, 900]}]
s += page('day', 'morning') + d2('2d_top_morning', 2, -150) + d3('3d_hz_morning', '32,32,15', 110, 12, 1) + orbit('orbit_morning')
s += page('day') + d2('2d_top_day', 2, -150) + d2('2d_wide_day', 1, -40) + d3('3d_hz_day', '32,32,15', 110, 12, 1) + d3('3d_far_day', '14,14,10', 150, 32, 1)
s += page('dusk') + d2('2d_top_dusk', 2, -150) + d3('3d_hz_dusk', '32,32,15', 110, 12, 1) + d3('3d_far_dusk', '14,14,10', 150, 32, 1)
s += page('night') + d2('2d_top_night', 2, -150) + d2('2d_below_night', 1, 420) + d3('3d_hz_night', '32,32,15', 110, 12, 1)
s += orbit('orbit_night') + d2('_', 2, -150) + [{"record": V + 'still_night', "ms": 8300}]
s += [{"eval": "JSON.stringify(window.__errs)"}]
json.dump(s, open('shots/_u4full.json', 'w'))
