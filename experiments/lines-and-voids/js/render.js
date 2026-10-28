'use strict';
// ==========================================================================
// Pixel ray caster. The world is drawn at native pixel resolution with an
// orthographic 2:1 projection that matches the layer prototype (a cell is
// 16 px wide, a level 12 px tall at zoom 1). Voxel faces come from a DDA;
// carves and adds are intersected exactly, so round shafts stay round. The
// result is read back (colour + depth + normal) so cables can be depth-tested
// and anchors picked in JS.
// ==========================================================================
const CAM = { x: 0, y: 0, k: 1, rot: 0, cutZ: 99, sect: false, sectV: 0, tod: 'dusk' };
const PIV = 48;
const ROTS = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]];   // view = R (world - pivot)
const TODS = {
  day: { T: [1.00, 0.99, 0.95], L: [0.97, 0.96, 0.93], R: [0.78, 0.81, 0.84], lit: 0.06, bg: [11, 12, 14] },
  dusk: { T: [0.88, 0.74, 0.64], L: [1.00, 0.78, 0.60], R: [0.52, 0.50, 0.55], lit: 0.40, bg: [12, 11, 14] },
  night: { T: [0.32, 0.36, 0.42], L: [0.29, 0.32, 0.38], R: [0.20, 0.23, 0.29], lit: 0.62, bg: [6, 7, 10] }
};
let W = 0, H = 0;                       // internal (art-pixel) resolution
let sceneCol, sceneD, sceneN, sceneK;   // readback, top-down
const NOHIT = -1e9;

function proj(x, y, z) {
  const R = ROTS[CAM.rot], dx = x - PIV, dy = y - PIV;
  const u = R[0] * dx + R[1] * dy, v = R[2] * dx + R[3] * dy;
  return [((u - v) * 8 - CAM.x) * CAM.k + W / 2, ((u + v) * 4 - 12 * z - CAM.y) * CAM.k + H / 2, 1.5 * (u + v) + z];
}
function unproj(px, py, D) {
  const R = ROTS[CAM.rot];
  const SX = (px - W / 2) / CAM.k + CAM.x, SY = (py - H / 2) / CAM.k + CAM.y;
  const z = (D - 0.375 * SY) / 5.5, s = (SY + 12 * z) / 4, d = SX / 8, u = (s + d) / 2, v = (s - d) / 2;
  return [R[0] * u + R[2] * v + PIV, R[1] * u + R[3] * v + PIV, z];
}
// world point -> screen in world-pixel units (camera independent)
function worldSX(x, y, z) { const R = ROTS[CAM.rot], dx = x - PIV, dy = y - PIV, u = R[0] * dx + R[1] * dy, v = R[2] * dx + R[3] * dy; return [(u - v) * 8, (u + v) * 4 - 12 * z]; }
function viewV(x, y) { const R = ROTS[CAM.rot]; return R[2] * (x - PIV) + R[3] * (y - PIV); }

const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.-1., 0., 1.); }`;

const FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler3D; precision highp sampler3D;
uniform vec2 uRes; uniform vec2 uCam; uniform float uK; uniform vec4 uRot;
uniform float uCutZ; uniform float uSect; uniform int uSectOn;
uniform highp usampler3D uCells; uniform highp sampler3D uSky; uniform highp sampler2D uPrims; uniform highp sampler2D uGroups;
uniform int uNGroups; uniform int uCarve0; uniform int uNCarves;
uniform vec3 uTodT; uniform vec3 uTodL; uniform vec3 uTodR; uniform float uLit; uniform vec3 uBg;
layout(location=0) out vec4 oCol; layout(location=1) out vec4 oDat;
const vec3 GMIN = vec3(0., 0., -4.);
const vec3 GMAX = vec3(96., 96., 28.);
const float ZT = 30.0;

vec2 wdir(vec2 v){ return vec2(uRot.x*v.x + uRot.z*v.y, uRot.y*v.x + uRot.w*v.y); }
vec2 vdir(vec2 w){ return vec2(uRot.x*w.x + uRot.y*w.y, uRot.z*w.x + uRot.w*w.y); }
float h1(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float bayer(ivec2 q){ int x=q.x&3, y=q.y&3; int m[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[y*4+x])+.5)/16.; }

void slab(vec3 o, vec3 d, vec3 h, out float t0, out float t1, out vec3 ni, out vec3 no){
  d = mix(d, vec3(1e-8), lessThan(abs(d), vec3(1e-8)));
  vec3 inv = 1./d, ta = (-h - o)*inv, tb = (h - o)*inv, tn = min(ta,tb), tf = max(ta,tb);
  t0 = max(max(tn.x,tn.y),tn.z); t1 = min(min(tf.x,tf.y),tf.z);
  if (t0 == tn.x) ni = vec3(-sign(d.x),0.,0.); else if (t0 == tn.y) ni = vec3(0.,-sign(d.y),0.); else ni = vec3(0.,0.,-sign(d.z));
  if (t1 == tf.x) no = vec3(sign(d.x),0.,0.); else if (t1 == tf.y) no = vec3(0.,sign(d.y),0.); else no = vec3(0.,0.,sign(d.z));
}
bool prim(int i, vec3 ro, vec3 rd, out float t0, out float t1, out vec3 ni, out vec3 no, out int mat){
  vec4 A = texelFetch(uPrims, ivec2(i*4,0),0), B = texelFetch(uPrims, ivec2(i*4+1,0),0), C = texelFetch(uPrims, ivec2(i*4+2,0),0);
  int ty = int(A.x+.5); mat = int(A.z+.5);
  float cs = B.w, sn = C.w;
  vec3 o = ro - B.xyz;
  vec3 lo = vec3(cs*o.x + sn*o.y, -sn*o.x + cs*o.y, o.z);
  vec3 ld = vec3(cs*rd.x + sn*rd.y, -sn*rd.x + cs*rd.y, rd.z);
  vec3 h = C.xyz;
  t0 = 0.; t1 = -1.; ni = vec3(0.); no = vec3(0.);
  if (ty == 1 || ty == 4) {
    slab(lo, ld, h, t0, t1, ni, no);
    if (t0 > t1) return false;
    if (ty == 4) {
      vec4 P = texelFetch(uPrims, ivec2(i*4+3,0),0);
      float nd = dot(P.xyz, ld), np = dot(P.xyz, lo);
      if (abs(nd) < 1e-7) { if (np > P.w) return false; }
      else { float tp = (P.w - np)/nd;
        if (nd > 0.) { if (tp < t1) { t1 = tp; no = P.xyz; } }
        else if (tp > t0) { t0 = tp; ni = P.xyz; } }
      if (t0 > t1) return false;
    }
  } else if (ty == 2) {
    float r = h.x, a = dot(ld.xy,ld.xy), b = dot(lo.xy,ld.xy), c = dot(lo.xy,lo.xy) - r*r, disc = b*b - a*c;
    if (disc < 0.) return false;
    float sq = sqrt(disc), c0 = (-b - sq)/a, c1 = (-b + sq)/a;
    float z0 = (-h.z - lo.z)/ld.z, z1 = (h.z - lo.z)/ld.z, zn = min(z0,z1), zf = max(z0,z1);
    if (c0 > zn) { t0 = c0; ni = vec3((lo.xy + ld.xy*c0)/r, 0.); } else { t0 = zn; ni = vec3(0.,0.,-sign(ld.z)); }
    if (c1 < zf) { t1 = c1; no = vec3((lo.xy + ld.xy*c1)/r, 0.); } else { t1 = zf; no = vec3(0.,0.,sign(ld.z)); }
    if (t0 > t1) return false;
  } else {
    float r = h.y, a = dot(ld.yz,ld.yz), b = dot(lo.yz,ld.yz), c = dot(lo.yz,lo.yz) - r*r, disc = b*b - a*c;
    if (disc < 0. || a < 1e-9) return false;
    float sq = sqrt(disc), c0 = (-b - sq)/a, c1 = (-b + sq)/a;
    float lx = abs(ld.x) < 1e-8 ? 1e-8 : ld.x;
    float x0 = (-h.x - lo.x)/lx, x1 = (h.x - lo.x)/lx, xn = min(x0,x1), xf = max(x0,x1);
    if (c0 > xn) { t0 = c0; ni = vec3(0., (lo.yz + ld.yz*c0)/r); } else { t0 = xn; ni = vec3(-sign(lx),0.,0.); }
    if (c1 < xf) { t1 = c1; no = vec3(0., (lo.yz + ld.yz*c1)/r); } else { t1 = xf; no = vec3(sign(lx),0.,0.); }
    if (t0 > t1) return false;
  }
  ni = vec3(cs*ni.x - sn*ni.y, sn*ni.x + cs*ni.y, ni.z);
  no = vec3(cs*no.x - sn*no.y, sn*no.x + cs*no.y, no.z);
  return t1 > 0.;
}
vec3 matCol(int m){
  if (m==1) return vec3(.29,.25,.21);
  if (m==2) return vec3(.62,.60,.56);
  if (m==3) return vec3(.70,.64,.56);
  if (m==4) return vec3(.55,.41,.31);
  if (m==5) return vec3(.44,.46,.48);
  if (m==6) return vec3(.17,.34,.40);
  if (m==7) return vec3(.36,.48,.24);
  if (m==8) return vec3(.45,.52,.57);
  if (m==9) return vec3(.62,.58,.51);
  if (m==10) return vec3(.77,.74,.67);
  if (m==11) return vec3(.33,.32,.31);
  if (m==12) return vec3(.27,.31,.29);
  return vec3(1.,0.,1.);
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  float SX = (fc.x - uRes.x*.5)/uK + uCam.x;
  float SY = (uRes.y*.5 - fc.y)/uK + uCam.y;
  ivec2 wp = ivec2(floor(SX*uK), floor(SY*uK));      // pan-stable pattern coords
  float s = (SY + 12.*ZT)/4., dd = SX/8.;
  vec2 uv = vec2((s+dd)*.5, (s-dd)*.5);
  vec3 ro = vec3(wdir(uv) + vec2(48.), ZT);
  vec3 rd = vec3(wdir(vec2(-1.5)), -1.);
  float D0 = 1.5*s + ZT;
  float tClip = max(ZT - uCutZ, 0.); vec3 clipN = vec3(0.,0.,1.);
  if (uSectOn == 1) { float ts = (uv.y - uSect)/1.5; if (ts > tClip) { tClip = ts; clipN = vec3(wdir(vec2(0.,1.)), 0.); } }
  float tBest = 1e9; vec3 nB = vec3(0.); int mB = 0; int kB = 0;   // kinds: 1 face, 2 carved, 3 cut, 4 add

  for (int g = 0; g < 64; g++) {
    if (g >= uNGroups) break;
    vec4 ga = texelFetch(uGroups, ivec2(g*2,0),0), gb = texelFetch(uGroups, ivec2(g*2+1,0),0);
    float a0, a1; vec3 x0, x1;
    slab(ro - (ga.xyz+gb.xyz)*.5, rd, (gb.xyz-ga.xyz)*.5 + .01, a0, a1, x0, x1);
    if (a0 > a1 || a1 < tClip || a0 > tBest) continue;
    int st = int(ga.w+.5), cnt = int(gb.w+.5);
    for (int j = 0; j < 256; j++) {
      if (j >= cnt) break;
      float t0, t1; vec3 ni, no; int m;
      if (!prim(st+j, ro, rd, t0, t1, ni, no, m)) continue;
      int kk = 4;
      if (t0 < tClip) { t0 = tClip; ni = clipN; kk = 3; }
      if (t0 < t1 && t0 < tBest) { tBest = t0; nB = ni; mB = m; kB = kk; }
    }
  }
  float g0, g1; vec3 gn0, gn1;
  slab(ro - (GMIN+GMAX)*.5, rd, (GMAX-GMIN)*.5, g0, g1, gn0, gn1);
  if (g0 < g1 && g1 > 0.) {
    float t = max(max(g0, 0.), tClip);
    vec3 enterN = (tClip > g0) ? clipN : gn0;
    vec3 p = ro + rd*(t + 1e-4);
    ivec3 c = ivec3(floor(p));
    ivec3 stp = ivec3(sign(rd));
    vec3 inv = 1./rd, tMax = (vec3(c) + max(vec3(stp),0.) - ro)*inv, tDel = abs(inv);
    bool first = true; int axis = 2;
    for (int i = 0; i < 400; i++) {
      if (t >= tBest || t > g1) break;
      if (c.x < 0 || c.y < 0 || c.z < -4 || c.x >= 96 || c.y >= 96 || c.z >= 28) break;
      float tExit = min(tMax.x, min(tMax.y, tMax.z));
      uint m = texelFetch(uCells, ivec3(c.x, c.y, c.z+4), 0).r;
      if (m > 0u) {
        float th = t; vec3 nn = vec3(0.); int kk;
        if (first) { nn = enterN; kk = 3; } else { nn[axis] = -float(stp[axis]); kk = 1; }
        for (int pass = 0; pass < 3; pass++) {
          bool moved = false;
          for (int j = 0; j < 32; j++) {
            if (j >= uNCarves) break;
            float t0, t1; vec3 ni, no; int mm;
            if (!prim(uCarve0+j, ro, rd, t0, t1, ni, no, mm)) continue;
            if (t0 <= th + 1e-4 && th < t1) { th = t1; nn = -no; kk = 2; moved = true; }
          }
          if (!moved) break;
        }
        if (th < tExit && th < tBest) { tBest = th; nB = nn; mB = int(m); kB = kk; break; }
      }
      first = false;
      if (tMax.x < tMax.y && tMax.x < tMax.z) { c.x += stp.x; t = tMax.x; tMax.x += tDel.x; axis = 0; }
      else if (tMax.y < tMax.z) { c.y += stp.y; t = tMax.y; tMax.y += tDel.y; axis = 1; }
      else { c.z += stp.z; t = tMax.z; tMax.z += tDel.z; axis = 2; }
    }
  }

  if (kB == 0) { oCol = vec4(uBg, 1.); oDat = vec4(0.); return; }
  vec3 P = ro + rd*tBest;
  float D = D0 - 5.5*tBest;
  vec3 n = normalize(nB);
  int m = mB;
  vec3 base = matCol(m);
  vec3 ecol = vec3(0.); float emis = 0.;
  bool top = n.z > .97, slope = !top && n.z > .25;
  vec2 tg = normalize(vec2(-n.y, n.x) + 1e-6);
  float fa = dot(P.xy, tg), fz = P.z;
  float lw = 1./(8.*uK), lz = 1./(12.*uK);           // one art pixel, along a face / up a face
  float bd = bayer(wp) - .5;

  if (kB == 3) {
    vec3 ink = vec3(.075,.07,.065);
    if (m == 1 || m == 11) { if ((wp.x & 3) == 0 && (wp.y & 1) == 0 && (((wp.x>>2)+(wp.y>>1)) & 1) == 0) ink = vec3(.25,.2,.15); }
    else if (((wp.x + wp.y) & 3) == 0) ink = vec3(.2,.18,.16);
    oCol = vec4(ink, 1.);
  } else {
    if (slope) {
      // cast ramp: a stepped line every level, board marks along the fall line
      if (fract(fz) < lz*1.5) base *= .8;
      if (fract(fa*.5) < lw) base *= .9;
      float st = h1(vec3(floor(fa*3.), floor(fz*.5), 6.)); if (st > .8) base *= .92;
      if (m == 3 || m == 4) base = vec3(.6,.58,.54)*(fract(fz) < lz*1.5 ? .8 : 1.);
    } else if (top) {
      if (m == 7) { float h = h1(floor(P*4.)); base *= .82 + .32*h; if (h > .86) base = vec3(.5,.6,.3); }
      else if (m == 6) { if (h1(vec3(floor(P.xy*5.), 1.)) > .93) base = vec3(.33,.52,.56); }
      else if (m == 5) { if (fract((P.x + P.y)*3.) < .3) base *= .82; }
      else if (m == 11) { base *= .92 + .1*h1(floor(P*3.)); }
      else if (m == 1) { base *= .9 + .15*h1(floor(P*2.)); }
      else {
        if (m == 3 || m == 4) base = vec3(.56,.54,.5);
        if (fract(P.x*.5) < lw || fract(P.y*.5) < lw) base *= .86;
        vec2 cf = fract(P.xy); float hv = h1(vec3(floor(P.xy), 5.));
        if (hv > .93 && cf.x > .3 && cf.x < .65 && cf.y > .3 && cf.y < .65) base *= .5;
      }
    } else if (m == 3) {
      float fw = fract(fa*2.), fb = fract(fz), cid = floor(fa*2.);
      if (fb < .12) base *= .74;
      else if (fw > .2 && fw < .74 && fb > .36 && fb < .84) {
        float hh = h1(vec3(cid, floor(fz), 3.7 + floor(n.x*3.) + 7.*floor(n.y*3.)));
        if (hh < uLit) { emis = 1.; ecol = mix(vec3(1.,.74,.40), vec3(1.,.9,.64), h1(vec3(cid, floor(fz), 9.))); }
        else base = vec3(.15,.17,.2) + .06*hh;
      }
    } else if (m == 4) {
      float fw = fract(fa*3.), fb = fract(fz*2.), cid = floor(fa*3.);
      if (fract(fz) < .06) base *= .8;
      else if (fw > .3 && fw < .7 && fb > .42 && fb < .86 && h1(vec3(cid, floor(fz*2.), 4.)) > .3) {
        if (h1(vec3(cid, floor(fz*2.), 8.)) < uLit*.7) { emis = 1.; ecol = vec3(1.,.66,.36); }
        else base = vec3(.14,.12,.11);
      }
    } else if (m == 2 || m == 10) {
      if (fract(fa*.5) < lw || fract(fz) < lz) base *= .86;
      if (m == 2) { float st = h1(vec3(floor(fa*6.), 2., 0.)); if (st > .74) base *= mix(1., .84, 1. - fract(fz*.25)); }
      if (uK >= 2. && abs(fract(fa*2.) - .5) < lw*1.2 && abs(fract(fz*2.) - .5) < lz*1.2) base *= .6;
    } else if (m == 1) {
      if (fract(fz*.5 + h1(vec3(floor(fa*.5), 0., 1.))*.3) < .2) base *= .82;
    } else if (m == 8) {
      if (fract(dot(P.xy, vec2(.25))) < .06) base *= .78;
    } else if (m == 12) {
      if (uLit > .3 && fract(fa*4.) < .25 && fract(fz*3.) > .6) { emis = 1.; ecol = vec3(.4,1.,.7); }
    }
    vec2 nv2 = vdir(n.xy);
    vec3 nv = vec3(nv2, n.z);
    vec3 w = vec3(max(n.z,0.), max(nv2.y,0.), max(nv2.x,0.));
    float ws = w.x + w.y + w.z;
    vec3 L = ws > 1e-4 ? (w.x*uTodT + w.y*uTodL + w.z*uTodR)/ws : uTodR*.7;
    L *= mix(.74, 1., clamp(dot(nv, normalize(vec3(1.5,1.5,1.)))*2.3, 0., 1.));
    float sk = texture(uSky, (P + n*.55 - GMIN)/(GMAX - GMIN)).r;
    float ao = mix(.34, 1., sk);
    vec3 col = base*L*ao;
    col = floor(col*15. + .5 + bd*.95)/15.;
    if (emis > 0.) col = ecol*(.82 + .18*uLit);
    oCol = vec4(col, 1.);
  }
  float Dn = clamp((D + 200.)/400., 0., 1.)*65535.;
  float hi = floor(Dn/256.), lo = floor(Dn - hi*256.);
  float bx = floor((n.x*.5+.5)*15.+.5), by = floor((n.y*.5+.5)*15.+.5);
  oDat = vec4(hi/255., lo/255., (bx*16.+by)/255., float(kB*32 + mB)/255.);
}`;

const R3 = { gl: null };
function initRenderer() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 is required');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const U = {}; for (const n of ['uRes', 'uCam', 'uK', 'uRot', 'uCutZ', 'uSect', 'uSectOn', 'uCells', 'uSky', 'uPrims', 'uGroups', 'uNGroups', 'uCarve0', 'uNCarves', 'uTodT', 'uTodL', 'uTodR', 'uLit', 'uBg']) U[n] = gl.getUniformLocation(pr, n);
  gl.getExtension('EXT_color_buffer_float');
  R3.gl = gl; R3.U = U; R3.canvas = c; R3.vao = gl.createVertexArray();
  uploadWorld();
}
function uploadWorld() {
  const gl = R3.gl, U = R3.U;
  const tex = (unit, target) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t); return t; };
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  tex(0, gl.TEXTURE_3D);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8UI, NX, NY, NZ, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, cells);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  tex(1, gl.TEXTURE_3D);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, NX, NY, NZ, 0, gl.RED, gl.UNSIGNED_BYTE, sky);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
  // prims: adds in group order, then carves
  const order = []; const gdat = [];
  for (const g of groups) { gdat.push(g.bb[0], g.bb[1], g.bb[2], order.length, g.bb[3], g.bb[4], g.bb[5], g.prims.length); order.push(...g.prims); }
  const carve0 = order.length; order.push(...carves);
  const pd = new Float32Array(order.length * 16);
  order.forEach((p, i) => {
    pd.set([p.type, p.role, p.mat, 0, p.c[0], p.c[1], p.c[2], p.cs, p.h[0], p.h[1], p.h[2], p.sn, p.n[0], p.n[1], p.n[2], p.d], i * 16);
  });
  tex(2, gl.TEXTURE_2D);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, order.length * 4, 1, 0, gl.RGBA, gl.FLOAT, pd);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  tex(3, gl.TEXTURE_2D);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, Math.max(1, groups.length * 2), 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(gdat.length ? gdat : [0, 0, 0, 0, 0, 0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(U.uCells, 0); gl.uniform1i(U.uSky, 1); gl.uniform1i(U.uPrims, 2); gl.uniform1i(U.uGroups, 3);
  gl.uniform1i(U.uNGroups, groups.length); gl.uniform1i(U.uCarve0, carve0); gl.uniform1i(U.uNCarves, carves.length);
}
function resizeTargets(w, h) {
  const gl = R3.gl; W = w; H = h;
  R3.canvas.width = w; R3.canvas.height = h;
  if (R3.fb) { gl.deleteFramebuffer(R3.fb); gl.deleteTexture(R3.t0); gl.deleteTexture(R3.t1); }
  const mkT = () => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h); return t; };
  R3.t0 = mkT(); R3.t1 = mkT();
  R3.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, R3.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R3.t0, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, R3.t1, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  R3.raw0 = new Uint8Array(w * h * 4); R3.raw1 = new Uint8Array(w * h * 4);
  sceneCol = new Uint8ClampedArray(w * h * 4); sceneD = new Float32Array(w * h); sceneN = new Uint8Array(w * h); sceneK = new Uint8Array(w * h);
}
function renderScene() {
  const gl = R3.gl, U = R3.U, td = TODS[CAM.tod];
  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.fb); gl.viewport(0, 0, W, H);
  gl.uniform2f(U.uRes, W, H); gl.uniform2f(U.uCam, CAM.x, CAM.y); gl.uniform1f(U.uK, CAM.k);
  const R = ROTS[CAM.rot]; gl.uniform4f(U.uRot, R[0], R[1], R[2], R[3]);
  gl.uniform1f(U.uCutZ, CAM.cutZ); gl.uniform1f(U.uSect, CAM.sectV); gl.uniform1i(U.uSectOn, CAM.sect ? 1 : 0);
  gl.uniform3fv(U.uTodT, td.T); gl.uniform3fv(U.uTodL, td.L); gl.uniform3fv(U.uTodR, td.R); gl.uniform1f(U.uLit, td.lit);
  gl.uniform3f(U.uBg, td.bg[0] / 255, td.bg[1] / 255, td.bg[2] / 255);
  gl.bindVertexArray(R3.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, R3.raw0);
  gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, R3.raw1);
  const a = R3.raw0, b = R3.raw1;
  for (let y = 0; y < H; y++) {
    const sr = (H - 1 - y) * W * 4, dr = y * W * 4;
    sceneCol.set(a.subarray(sr, sr + W * 4), dr);
    for (let x = 0; x < W; x++) {
      const s = sr + x * 4, i = y * W + x;
      const k = b[s + 3];
      sceneK[i] = k; sceneN[i] = b[s + 2];
      sceneD[i] = k ? ((b[s] * 256 + b[s + 1]) / 65535) * 400 - 200 : NOHIT;
    }
  }
  postOutline();
}
// 1-px dark outline on the far side of depth steps; cut boundaries get a light line
function postOutline() {
  const c = sceneCol, D = sceneD, K = sceneK, th = 1.6;
  const out = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, d = D[i], kind = K[i] >> 5;
    let near = false, cutEdge = false;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (D[j] > d + th) near = true;
      if (kind === 3 && (K[j] >> 5) !== 3 && K[j]) cutEdge = true;
    }
    if (near) out[i] = 1; else if (cutEdge) out[i] = 2;
  }
  for (let i = 0; i < W * H; i++) {
    if (out[i] === 1) { c[i * 4] *= 0.35; c[i * 4 + 1] *= 0.35; c[i * 4 + 2] *= 0.38; }
    else if (out[i] === 2) { c[i * 4] = 236; c[i * 4 + 1] = 226; c[i * 4 + 2] = 204; }
  }
}
// what is under an art pixel: {p, n, kind, mat} or null
function pickWorld(px, py) {
  const x = Math.floor(px), y = Math.floor(py);
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const i = y * W + x, k = sceneK[i]; if (!k) return null;
  const p = unproj(x + 0.5, y + 0.5, sceneD[i]);
  const nb = sceneN[i], nx = ((nb >> 4) / 15) * 2 - 1, ny = ((nb & 15) / 15) * 2 - 1, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return { p, n: [nx, ny, nz], kind: k >> 5, mat: k & 31 };
}
