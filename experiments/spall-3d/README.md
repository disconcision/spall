# spall-3d: the current prototype in real 3D

A study: can Spall go fully 3D, with a free orbit camera and smooth zoom, and still look like itself? This folder is the current prototype (`../stratum-wires/src`, unchanged) plus two modules. `src/91_gl3d.js` adds a WebGL2 view of the same world, and `src/92_backdrop3d.js` draws the prototype's backdrop (`../stratum-wires/src/93_backdrop.js`) through the 3D camera. Press **3** to switch between the 2D and 3D views.

```bash
./build.sh            # -> spall3d.html and test/test.html
python3 -m http.server 5190 --bind 127.0.0.1 --directory ..
# open http://127.0.0.1:5190/spall-3d/spall3d.html and press 3
```

## Controls (3D view)

| | |
|---|---|
| drag | orbit (settles back on the nearest of the four iso views when **O** snap is on) |
| drag a cable or tie | grab it. The cable, tie, girder and post tools all work from any angle |
| right-drag, two-finger scroll | pan |
| pinch, mouse wheel | smooth zoom, about the pointer |
| Q / E | turn 90° (animated) |
| W / S | tilt up / down |
| 9 | top-down and back |
| 0 | back to the iso view |
| N | upscale filter: sharp (square pixels, soft seams at fractional zoom) or nearest |
| M | texel mode: projected (the default) or face texels |
| K | thin lines: keep one-pixel rails, posts and lattice from dropping out on foreshortened planes (off by default; it thickens lines that were fine) |
| U | texel splats: planes → planes + points (every art pixel also drawn as a one-pixel point) → points only (sized to cover); see local/splats.html |
| Z (hold) | today's renderer (plain planes, no thin lines) while held, to flip back and forth at one angle |
| O | snap: ease back to the nearest iso view on release (on by default; turn off to study a fixed odd angle) |
| [ ] | cut level, as in 2D |

## How it works

- **Planes painted by their own sprite.** Every cell becomes a few axis-aligned planes: boxes, slabs, lattices and rails. A point on a plane shows the pixel of the cell's iso sprite that it covers in the default view. So the default view reproduces the 2D renderer. Other views carry the same pixels in 3D.
- **Back faces.** Seen from −x or −y, a plane takes the +x or +y face's pixels, mirrored. That is what the 2D view shows when turned 180°.
- **Cutouts and billboards.** Lattices and rails are planes whose transparent pixels drop out. Trees, masts, risers, tanks and the crane are camera-facing sprites.
- **Cables use the 2D code.** Cables, ties, girders, posts and birds are drawn by the 2D cable code itself. During the draw, `projIso`, `planeAt` and the rest are swapped for this camera, and the cables are depth-tested against the GL depth. The cable tools go through the same swap, so grabbing, laying and tying work unchanged.
- **Pixel-locked render.** The scene renders at one art pixel per pixel into a small target. That target is scaled to the screen at any zoom. Panning snaps to the art grid and the remainder is applied in the upscale, so there is no pixel creep.
- **Lighting.** Live lighting (sky, ambient occlusion, sun and shadow, mist) runs per pixel. It reads the same light volumes, uploaded as 3D textures. The hard-sun volume is marched on the GPU. The other volumes are rebuilt a few milliseconds a frame when the world changes, and the old ones stay in use until the new ones are ready.
- **Overlays.** The 2D view's per-frame drawing comes through the same camera swap as the cables. People, pods, lift cars, steam, motes and mast beacons are tested pixel by pixel against the scene depth. Builds in progress are dashed boxes. The cut label, cut plane and ghost-above are drawn on top, as in 2D. Window flicker runs in the scene shader, keyed by an alpha mark in the emissive atlas.
- **Real lines.** Cut outlines are stripped from the cut-top art and drawn as one-pixel lines in the world, so they stay clean at any angle. This is the test case for drawing rails, cage edges and trusses as lines.
- **Well beam.** The light well's column is drawn as real faces in the 2D view's every-other-column stripes, depth tested, so buildings in front hide it. Its strength is the lighting panel's Well light slider, shared with 2D.
- **Texel splats (U).** Each plane is also drawn as instanced points, one vertex per pixel of its sprite. The vertex shader inverts the sprite projection to find where that art pixel sits on the plane, and drops the pixels that miss or are transparent. Every art pixel lands on some screen pixel, so thin lines can't drop out. This is the splatting half of Ebert's Texel Splatting (arXiv 2603.14587); the sprites are already a world-fixed texel grid, so no probe is needed.
- **Light overlays.** Daytime sunlit air (the 2D `shaftsLayer`) is marched per quarter-res pixel from the depth target through the soft-sun volume. Night bloom blurs the visible lit windows at half size. Both are added in the final pass, as in 2D.

## What it shows

- **Default view.** Compared with the 2D renderer at the same view, 74% of pixels are within 6/255 and 93% within 32/255. Shafts and bloom were off for this comparison. The rest is overlays not ported yet (well light, lifts, people, labels) and small lighting differences.
- **Speed.** The GPU scene takes about 4–6 ms. The cable pass takes about 14 ms on the CPU: a depth readback plus the 2D cable drawing. That pass is the thing to optimise.
- **Not ported.** The build-tool hover ghost and demolish box (building and demolishing still go through the 2D picking), and the agent's cursor.
- **Known looks off-angle:**
  - Top faces show iso-sheared pixels.
  - Roof props are painted flat onto roofs.
  - Left and right facade details swap in the two side views.
  - Trees and the crane turn with the camera.
  - Edges shimmer while the camera rotates, though not while it pans.

`mockups/` holds the stills and two clips: `orbit.mp4` (orbit, tilt, zoom) and `lay.mp4` (laying a cable across a void from a low angle). `local/` has the rest.
