# Suma las franjas nuevas del mapa (preprocess.py --ext) a src/data/temperley.json sin tocar lo que ya estaba.
# Los edificios que el borde viejo cortaba al medio se cambian por el edificio entero.
#
#   python3 merge.py ext.json
import json, os, sys
from shapely.geometry import LineString, Polygon
from shapely.ops import linemerge

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data', 'temperley.json')
old = json.load(open(ROOT))
new = json.load(open(sys.argv[1]))
if old.get('bounds') == new['bounds']:
    raise SystemExit('temperley.json ya tiene esta zona')

# edificios cortados por el borde viejo: el entero ocupa el lugar del pedazo en la lista (el relevamiento
# y otros datos los nombran por índice, así que ningún edificio viejo cambia de número)
olds = [Polygon(b['r']) for b in old['buildings']]
blds = list(old['buildings'])
add = []
gone = 0
for b in new['buildings']:
    if b.pop('seam', None):
        q = Polygon(b['r'])
        hit = next((j for j, p in enumerate(olds) if p.intersects(q) and p.intersection(q).area > p.area * 0.3), None)
        if hit is not None:
            blds[hit] = b
            gone += 1
            continue
    add.append(b)
out = dict(old)
out['buildings'] = blds + add
for k in ('roads', 'paths', 'rails', 'platforms', 'roadPoly', 'sidewalks', 'blocks', 'yard', 'fences', 'trees', 'lamps', 'parks', 'signals', 'stops', 'crossings'):
    out[k] = old[k] + new[k]
have = {json.dumps(b[0]) for b in old['bridges']}
out['bridges'] = old['bridges'] + [b for b in new['bridges'] if json.dumps(b[0]) not in have]
for k in ('bounds', 'area', 'wall'):
    out[k] = new[k]

# calles unidas por nombre (marchas y carteles): se rehacen las que siguen en las franjas nuevas
named = dict(old['named'])
for n in sorted({r['n'] for r in new['roads'] if r['n']}):
    ls = [LineString(r['p']) for r in out['roads'] if r['n'] == n and len(r['p']) > 1]
    m = linemerge(ls)
    parts = [m] if m.geom_type == 'LineString' else list(m.geoms)
    parts = [x for x in parts if x.length > 60]
    if parts:
        named[n] = [[[round(x, 1), round(z, 1)] for x, z in p.simplify(0.5).coords] for p in parts]
out['named'] = named

s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
open(ROOT, 'w').write(s)
print('KB', len(s) // 1024, 'edificios cambiados', gone, {k: len(new[k]) for k in new if isinstance(new[k], list)})
