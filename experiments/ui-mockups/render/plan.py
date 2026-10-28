"""plan.py - print projected pixel positions for layout planning:  python3 plan.py <cam> x,y,level [x,y,level ...]"""
import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
def cam(name):
    c = json.load(open(os.path.join(HERE, 'out', name + '.cam.json')))
    rx, ry = c['res']; ppm = rx / c['scale']
    def p(x, y, lv):
        pt = (x * 4.0, y * 4.0, lv * 3.5)
        d1 = sum(a * b for a, b in zip(pt, c['right'])); d2 = sum(a * b for a, b in zip(pt, c['up']))
        return (round(rx / 2 + (d1 - c['cx']) * ppm), round(ry / 2 - (d2 - c['cy']) * ppm))
    return p
if __name__ == '__main__':
    p = cam(sys.argv[1])
    for a in sys.argv[2:]:
        x, y, l = map(float, a.split(','))
        print(a, p(x, y, l))
