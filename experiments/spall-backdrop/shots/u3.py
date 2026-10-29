# quick round-three shots: python3 shots/u3.py tag scene tod [extra hash params]  ->  shots/_u3.json
import json, sys
tag, scene, tod = sys.argv[1:4]; extra = sys.argv[4] if len(sys.argv) > 4 else ''
CLEAN = "AGENT.timer=1e9;AGENT.state='idle';document.getElementById('strip').style.display='none';{const b=document.getElementById('bApprove');if(b)(b.closest('.pn')||b.parentElement).style.visibility='hidden';}if(window.G3&&G3.hud)G3.hud.style.display='none';"
url = f"http://127.0.0.1:5190/spall-3d/test/test.html?s={tag}#level=29&bd={scene}&tod={tod}{extra}"
o = f"local/u3/{tag}_"
def d2(n, z, y): return [{"eval": CLEAN + f"setG3(false);setZoom({z});S.cam.x=0;S.cam.y={y};S.camTarget=null;skyDirty=true;"}, {"wait": 1500}, {"shot": o + n + ".png"}]
def d3(n, T, az, el, zf): return [{"eval": CLEAN + f"setG3(true);G3.hud.style.display='none';G3.T=[{T}];G3.az={az};G3.el={el};G3.zf={zf};G3.anim=null"}, {"wait": 1500}, {"shot": o + n + ".png"}]
steps = [{"size": [1400, 900]}, {"url": url, "load": 6000}]
steps += d2("2d_top", 2, -150) + d2("2d_below", 1, 420)
steps += d3("3d_low", "22,22,20", 110, 12, 2) + d3("3d_far", "14,14,10", 150, 32, 1) + d3("3d_side", "32,32,-20", 200, 14, 1) + d3("3d_hz", "32,32,15", 110, 12, 1)
steps += [{"eval": "JSON.stringify({n:STRATUM.UC.n,gen:STRATUM.UC.genMs,gpu:G3.stats.gpu,errs:window.__errs})"}]
json.dump(steps, open('shots/_u3.json', 'w'))
