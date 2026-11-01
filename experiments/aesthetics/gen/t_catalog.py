"""Smoke test / catalogue of the edge treatments and the concrete part family."""
from common import Spec, write_jobs

s = Spec('t_catalog', style='brut', light='crisp')
modes = [('sharp', {}), ('chamfer', dict(mode='chamfer')), ('round', dict(mode='round', seg=3)),
         ('step', dict(mode='step', steps=3)), ('hewn', dict(mode='chamfer', hew=3))]
for i, (nm, kw) in enumerate(modes):
    x = i * 16.0
    if nm == 'sharp':
        s.add('cblock', x, 0, 0, 10, 10, 12, mat='bconc', v=0, top=0)
    else:
        s.add('cblock', x, 0, 0, 10, 10, 12, mat='bconc', v=1.6, top=1.0, **kw)
s.add('ground', -10, -10, 0, 110, 60, 1, mat='paving', t=1.0)
s.add('tetrapod', 0, 22, 0, 8, 8, 6, mat='tetra', size=3.5, yaw=20)
s.add('tetrapod', 12, 22, 0, 8, 8, 6, mat='tetra', unit='dolos', size=4.0, rest='random')
s.add('tetrapod', 24, 22, 0, 8, 8, 6, mat='tetra', unit='cube', size=3.0, rest='random')
s.add('armour', 36, 18, 0, 20, 14, 4, mat='tetra', unit='tetrapod', size=2.2, h0=3.0, slope_face='s')
s.add('tripod', 62, 18, 0, 14, 14, 20, mat='tetra', r=1.0, splay=6.0, cap='tri')
s.add('megaframe', 0, 40, 0, 24, 12, 14, mat='bconc', bx=8, by=12, bz=2, col=1.2, beam=1.2, haunch=0.9, pods=0.6, bevel=0.35)
s.add('bmass', 36, 40, 0, 24, 14, 21, mat='bconc', faces=dict(s='eggcrate', e='fins', n='slots', w='blank'), roof='plant')
s.add('cpier', 70, 40, 0, 16, 5, 18, mat='bconc')
s.write()
write_jobs('t_catalog', [
    dict(spec='specs/t_catalog.json', out='out/k/k1_catalog_blocky.png', light='crisp'),
    dict(spec='specs/t_catalog.json', out='out/k/k2_catalog_hewn.png', light='crisp', style='brut_hewn'),
], samples=24)
