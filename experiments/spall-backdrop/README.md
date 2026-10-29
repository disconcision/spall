# Backdrop study (retired as a build)

The backdrop now lives in the prototype: `../stratum-wires/src/93_backdrop.js` (the world, its renderer, the 2D view)
and `../spall-3d/src/92_backdrop3d.js` (the 3D view's camera). This folder keeps the study's tools:

- `shots/` — cdp step generators that drive `../spall-3d/test/test.html` (2D and 3D in one page)
- `page/` — the report page builders; media and builds go to `local/` (not committed)
- `tools/cdp.mjs` — headless Chrome driver (node ≥ 22)
