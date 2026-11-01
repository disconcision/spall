"""sheet.py out.png cols width img1 img2 ... : quick review grid (labels = file names)."""
import sys, os
from PIL import Image, ImageDraw
out, cols, W = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ims = [Image.open(p).convert('RGB') for p in sys.argv[4:]]
cw = W // cols
thumbs = []
for p, im in zip(sys.argv[4:], ims):
    h = int(im.height * cw / im.width)
    t = im.resize((cw, h), Image.LANCZOS)
    d = ImageDraw.Draw(t); d.rectangle([0, 0, cw, 14], fill=(0, 0, 0)); d.text((4, 1), os.path.basename(p), fill=(255, 255, 255))
    thumbs.append(t)
rows = (len(thumbs) + cols - 1) // cols
rh = [max(t.height for t in thumbs[r * cols:(r + 1) * cols]) for r in range(rows)]
S = Image.new('RGB', (W, sum(rh)), (30, 30, 30))
y = 0
for r in range(rows):
    for c, t in enumerate(thumbs[r * cols:(r + 1) * cols]):
        S.paste(t, (c * cw, y))
    y += rh[r]
S.save(out)
