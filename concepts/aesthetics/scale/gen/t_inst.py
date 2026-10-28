import random
from sc import Spec, write_jobs, town_hi, town_lo
s = Spec('t_inst', style='scale', light='aerial', seed=1)
s.proto('town_hi', lambda t: town_hi(t))
s.proto('town_lo', lambda t: town_lo(t))
s.add('ground', -200, -200, 0, 1400, 1400, 1, mat='plain', t=1.0)
rng = random.Random(1)
s.scatter('town_hi', [[x, y, 0, rng.uniform(0, 360), 1.0] for x in (0, 150) for y in (0, 120)])
s.scatter('town_lo', [[rng.uniform(300, 1100), rng.uniform(0, 1100), 0, rng.uniform(0, 360), rng.uniform(0.8, 1.3)] for _ in range(300)])
sp = s.write()
write_jobs('t_inst', [dict(spec=sp, out='out/test/t_inst.png', frame_bb=[-200, -200, 0, 1200, 1200, 40])])
