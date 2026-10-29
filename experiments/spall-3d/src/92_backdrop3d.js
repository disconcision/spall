// ==========================================================================
// The backdrop (stratum-wires/src/93_backdrop.js) through the 3D camera: the
// same world drawn from this view's basis, uploaded as the sky texture.
// ==========================================================================
const g3SkyFlat = g3Sky;
g3Sky = function (V) {
  if (BD.scene !== 'under') return g3SkyFlat(V);
  const tod = bdTod(), key = ['u', V.Wt, V.Ht, V.off[0], V.off[1], V.C.join(','), ucKey(tod)].join('|');
  if (G3.skyKey === key) return;
  if (!ucRender({ R: V.R, U: V.U, C: V.C, off: V.off, W: V.Wt, H: V.Ht, c: [V.Wt / 2, V.Ht / 2] }, tod)) return;
  const gl = G3.gl; gl.bindTexture(gl.TEXTURE_2D, G3.tex.sky);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, UC.cv);
  G3.skyKey = key;
};

{
  const t0 = STRATUM.test;
  STRATUM.test = function (p) {
    t0.call(this, p);
    if (p.g3) {
      setG3(true);
      if (p.az) G3.az = +p.az; if (p.el) G3.el = +p.el; if (p.zf) G3.zf = +p.zf;
      if (p.tgt) G3.T = p.tgt.split(',').map(Number);
    }
    G3.skyKey = '';
  };
}
