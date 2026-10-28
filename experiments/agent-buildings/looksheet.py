"""looksheet.py - compose a draft's quick renders into review images:
   out/iter/<id>_<draft>_look.png  = concept | hi r0 | hi r1   (row 1)  +  lo->kit64 r0, r1 at integer zoom (row 2)"""
import os, sys
sys.dont_write_bytecode = True   # never write __pycache__ into ../concept-renders (read-only)
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'concept-renders'))
from sprites import palette_lock, crop_alpha, up, font, ncolors  # pure-Pillow helpers from the stock pipeline


def fit(im, w, h):
    s = min(w / im.width, h / im.height)
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)


def look(bid, draft, rots=(0, 1)):
    d = os.path.join(HERE, 'out', 'iter')
    con = Image.open(os.path.join(d, '%s_%s_concept.png' % (bid, draft))).convert('RGB')
    his = [crop_alpha(Image.open(os.path.join(d, '%s_%s_r%d_hi.png' % (bid, draft, r))).convert('RGBA'), 4) for r in rots]
    los = [crop_alpha(Image.open(os.path.join(d, '%s_%s_r%d_lo.png' % (bid, draft, r))).convert('RGBA'), 1) for r in rots]
    pls = [palette_lock(l)[0] for l in los]
    H1 = 620
    c = fit(con, 900, H1)
    hs = [fit(h, 560, H1) for h in his]
    W = c.width + sum(h.width + 20 for h in hs) + 40
    K = max(2, min(5, int((W / 2 - 60) / max(p.width for p in pls))))
    K = min(K, max(2, int(560 / max(p.height for p in pls))))
    ps = [up(p, K) for p in pls]
    H2 = max(p.height for p in ps) + 40
    W = max(W, sum(p.width + 30 for p in ps) + 40)
    im = Image.new('RGB', (W, H1 + H2 + 20), (236, 233, 226))
    dr = ImageDraw.Draw(im)
    im.paste(c, (0, 0))
    x = c.width + 20
    for h in hs:
        im.paste(h, (x, H1 - h.height), h); x += h.width + 20
    x = 20
    for r, p in zip(rots, ps):
        im.paste(p, (x, H1 + 20 + (H2 - 40 - p.height)), p)
        dr.text((x, H1 + H2 - 12), 'kit64 r%d  %dx  (%d colours)' % (r, K, ncolors(p)), font=font('regular', 16), fill=(60, 60, 60))
        x += p.width + 30
    dr.text((10, 10), '%s %s' % (bid, draft), font=font('bold', 22), fill=(250, 250, 250))
    out = os.path.join(d, '%s_%s_look.png' % (bid, draft))
    im.save(out)
    print(out, im.size)


if __name__ == '__main__':
    look(sys.argv[1], sys.argv[2])
