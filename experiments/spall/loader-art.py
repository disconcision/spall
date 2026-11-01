# generates the static loader art: the pixel SPALL wordmark (glyph C24) and an iso plate
C24 = [".#####...######....#####...##.......##.....", "##...##..##...##..##...##..##.......##.....", "##.......##...##..##...##..##.......##.....", ".#####...######...#######..##.......##.....", ".....##..##.......##...##..##.......##.....", "##...##..##.......##...##..##.......##.....", ".#####...##.......##...##..#######..#######"]
def runs(grid):   # grid: rows of colour-or-None -> merged rects
    out = []
    for y, row in enumerate(grid):
        x = 0
        while x < len(row):
            c = row[x]
            if c is None: x += 1; continue
            x2 = x
            while x2 < len(row) and row[x2] == c: x2 += 1
            out.append((x, y, x2 - x, c)); x = x2
    return out
def svg(grid, sc, cls):
    w = max(len(r) for r in grid); h = len(grid)
    fill = lambda c: '' if c == 'cur' else ' fill="%s"' % c
    body = ''.join('<rect x="%d" y="%d" width="%d" height="1"%s/>' % (x, y, n, fill(c)) for x, y, n, c in runs(grid))
    return f'<svg class="{cls}" width="{w*sc}" height="{h*sc}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">{body}</svg>'
word = [[('cur' if ch == '#' else None) for ch in r.rstrip('.')] for r in C24]
W, H, S = 28, 14, 3   # top face 28 x 14, side 3 deep
def plate(top, left, right, edge):
    g = [[None] * W for _ in range(H + S)]
    bot = [0] * W
    for y in range(H):
        half = (y + 1) * 2 if y < H // 2 else (H - y) * 2
        for x in range(W // 2 - half, W // 2 + half):
            g[y][x] = top; bot[x] = y
    for x in range(W):
        for k in range(1, S + 1): g[bot[x] + k][x] = left if x < W // 2 else right
    # a lit front edge on the top face
    for x in range(W):
        if g[bot[x]][x] == top: g[bot[x]][x] = edge
    return g
plates = {
  'a': plate('#e8a83c', '#b07a22', '#8a5c14', '#f5c46a'),
  'b': plate('#6a645a', '#4f4a41', '#38342e', '#857e72'),
  'c': plate('#38342e', '#26241f', '#1b1a17', '#4f4a41'),
}
out = {'word': svg(word, 6, 'ldw')}
for k, g in plates.items(): out[k] = svg(g, 3, 'ldp')
import json; print(json.dumps(out))
