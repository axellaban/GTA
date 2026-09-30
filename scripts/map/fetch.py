# Baja de Overture Maps (release fijo en ov.py) todo lo que hay en un cuadrado de 1,3 km
# alrededor de la estación Temperley. Deja seg/bld/lu/land/inf/places.json en esta carpeta.
import ov, json, math, sys
from shapely import wkb
from shapely.geometry import mapping
LAT0, LON0 = -34.7761, -58.3963
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110950.0
R = 650
bbox = (LON0 - R / KX, LAT0 - R / KZ, LON0 + R / KX, LAT0 + R / KZ)
def P(lon, lat): return [round((lon - LON0) * KX, 2), round((LAT0 - lat) * KZ, 2)]
def ring(coords): return [P(x, y) for x, y in coords]
def geo(g):
    g = wkb.loads(g)
    t = g.geom_type
    if t == 'Point': return {'t': 'pt', 'c': P(g.x, g.y)}
    if t == 'LineString': return {'t': 'ln', 'c': ring(g.coords)}
    if t == 'MultiLineString': return {'t': 'mln', 'c': [ring(l.coords) for l in g.geoms]}
    if t == 'Polygon': return {'t': 'pg', 'c': [ring(g.exterior.coords)] + [ring(h.coords) for h in g.interiors]}
    if t == 'MultiPolygon': return {'t': 'mpg', 'c': [[ring(p.exterior.coords)] + [ring(h.coords) for h in p.interiors] for p in g.geoms]}
    return None
def name(r):
    n = r.get('names')
    return n.get('primary') if n else None
out = {}
which = sys.argv[1:] or ['seg', 'bld', 'lu', 'land', 'inf', 'places']
if 'seg' in which:
    rows = ov.query('theme=transportation/type=segment', bbox, ['id', 'names', 'subtype', 'class', 'subclass', 'geometry', 'road_flags', 'rail_flags'])
    out['seg'] = [{'sub': r['subtype'], 'cls': r['class'], 'subcls': r.get('subclass'), 'name': name(r), 'g': geo(r['geometry'])} for r in rows]
if 'bld' in which:
    rows = ov.query('theme=buildings/type=building', bbox, ['id', 'names', 'height', 'num_floors', 'class', 'subtype', 'facade_color', 'facade_material', 'roof_shape', 'roof_color', 'geometry'])
    out['bld'] = [{'h': r['height'], 'f': r['num_floors'], 'cls': r['class'], 'sub': r['subtype'], 'name': name(r), 'fc': r['facade_color'], 'rs': r['roof_shape'], 'rc': r['roof_color'], 'g': geo(r['geometry'])} for r in rows]
if 'lu' in which:
    rows = ov.query('theme=base/type=land_use', bbox, ['id', 'names', 'subtype', 'class', 'surface', 'geometry'])
    out['lu'] = [{'sub': r['subtype'], 'cls': r['class'], 'name': name(r), 'g': geo(r['geometry'])} for r in rows]
if 'land' in which:
    rows = ov.query('theme=base/type=land', bbox, ['id', 'names', 'subtype', 'class', 'geometry'])
    out['land'] = [{'sub': r['subtype'], 'cls': r['class'], 'name': name(r), 'g': geo(r['geometry'])} for r in rows]
if 'inf' in which:
    rows = ov.query('theme=base/type=infrastructure', bbox, ['id', 'names', 'subtype', 'class', 'height', 'geometry'])
    out['inf'] = [{'sub': r['subtype'], 'cls': r['class'], 'name': name(r), 'h': r['height'], 'g': geo(r['geometry'])} for r in rows]
if 'places' in which:
    rows = ov.query('theme=places/type=place', bbox, ['id', 'names', 'basic_category', 'confidence', 'geometry'])
    out['places'] = []
    for r in rows:
        g = wkb.loads(r['geometry'])
        out['places'].append({'name': name(r), 'cat': r.get('basic_category'), 'x': g.x, 'y': g.y, 'conf': r.get('confidence')})
for k, v in out.items():
    json.dump(v, open(f'{k}.json', 'w'))
    print(k, len(v))
