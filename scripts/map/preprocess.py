# Convierte los datos de Overture (OSM + huellas de edificios) en el mapa del juego.
# Coordenadas locales en metros: x al este, z al sur, origen en la estación Temperley.
import json, math, random, collections, sys
from shapely.geometry import LineString, Polygon, MultiPolygon, Point, box, mapping
from shapely.ops import unary_union, linemerge
from shapely import prepared
from shapely.strtree import STRtree

random.seed(1400)
HALF = 600
SQ = box(-HALF, -HALF, HALF, HALF)
R1 = lambda v: round(v, 1)

seg = json.load(open('seg.json'))
bld = json.load(open('bld.json'))
lu = json.load(open('lu.json'))
land = json.load(open('land.json'))
inf = json.load(open('inf.json'))
places = json.load(open('places.json'))

LAT0, LON0 = -34.7761, -58.3963
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110950.0

WIDTH = {'primary': 15, 'secondary': 13, 'tertiary': 11, 'residential': 9, 'living_street': 6.5, 'service': 5.5, 'unknown': 8, 'unclassified': 8}
PATHS = {'footway', 'steps', 'cycleway', 'pedestrian', 'path'}


def lines_of(g):
    if g['t'] == 'ln':
        return [g['c']]
    if g['t'] == 'mln':
        return g['c']
    return []


def polys_of(g):
    if g['t'] == 'pg':
        return [Polygon(g['c'][0], g['c'][1:])]
    if g['t'] == 'mpg':
        return [Polygon(p[0], p[1:]) for p in g['c']]
    return []


def clip_lines(ls):
    c = ls.intersection(SQ)
    if c.is_empty:
        return []
    if c.geom_type == 'LineString':
        return [c]
    if hasattr(c, 'geoms'):
        return [x for x in c.geoms if x.geom_type == 'LineString']
    return []


# ---------- Puentes y bajo niveles ----------
bridges = [LineString(c) for i in inf if i['cls'] == 'bridge' for c in lines_of(i['g'])]
bridge_union = unary_union([b.buffer(3) for b in bridges]) if bridges else None

# ---------- Vías ----------
rails = []
for s in seg:
    if s['sub'] != 'rail':
        continue
    for c in lines_of(s['g']):
        for l in clip_lines(LineString(c)):
            rails.append(l)
rail_union = unary_union([r.buffer(2.9, cap_style='flat') for r in rails])

# ---------- Calles ----------
roads = []
paths = []
for s in seg:
    if s['sub'] != 'road':
        continue
    cls = s['cls']
    name = s['name']
    for c in lines_of(s['g']):
        for l in clip_lines(LineString(c)):
            if l.length < 1:
                continue
            if cls in PATHS:
                paths.append({'w': 2.4 if cls != 'steps' else 2, 'l': l, 'c': cls})
                continue
            under = name and 'bajo nivel' in name.lower()
            over = bridge_union is not None and l.intersects(rail_union) and l.within(bridge_union.buffer(25))
            if under or over:
                continue
            roads.append({'n': name, 'c': cls, 'w': WIDTH.get(cls, 8), 'l': l})

# si una calle sin nombre queda pegada a una con nombre, hereda el nombre
road_poly = unary_union([r['l'].buffer(r['w'] / 2, cap_style='round', join_style='round') for r in roads]).intersection(SQ)
walk_poly = unary_union([r['l'].buffer(r['w'] / 2 + 3.0, cap_style='round') for r in roads]).intersection(SQ)
path_poly = unary_union([p['l'].buffer(p['w'] / 2) for p in paths]).intersection(SQ) if paths else None

# ---------- Andenes ----------
platforms = []
for i in inf:
    if i['cls'] == 'platform':
        for p in polys_of(i['g']):
            p = p.intersection(SQ)
            if not p.is_empty:
                platforms.append(p.simplify(0.2))
plat_union = unary_union(platforms) if platforms else None
yard = unary_union([rail_union] + ([plat_union.buffer(0.3)] if plat_union else [])).difference(road_poly)

# ---------- Manzanas y veredas ----------
blocks = SQ.difference(road_poly).difference(yard)
sidewalks = blocks.intersection(walk_poly)

# ---------- Parques, canchas, estadio ----------
parks = []
for l in lu:
    for p in polys_of(l['g']):
        p = p.intersection(SQ)
        if p.is_empty:
            continue
        parks.append({'c': l['cls'], 'n': l['name'], 'g': p})

# ---------- Grafo: nodos con grado para esquinas ----------
deg = collections.Counter()
for r in roads:
    a = tuple(round(v * 2) / 2 for v in r['l'].coords[0])
    b = tuple(round(v * 2) / 2 for v in r['l'].coords[-1])
    deg[a] += 1
    deg[b] += 1
corners = [Point(k) for k, v in deg.items() if v >= 3]
corner_tree = STRtree(corners) if corners else None


def near_corner(pt, d):
    if not corner_tree:
        return False
    return any(pt.distance(corners[i]) < d for i in corner_tree.query(pt.buffer(d)))


# ---------- Edificios ----------
avenues = [r for r in roads if r['c'] in ('primary', 'secondary')]
av_union = unary_union([r['l'] for r in avenues]) if avenues else None
place_pts = []
for p in places:
    if not p['name'] or (p['conf'] or 0) < 0.55:
        continue
    x = (p['x'] - LON0) * KX
    z = (LAT0 - p['y']) * KZ
    if abs(x) < HALF and abs(z) < HALF:
        place_pts.append((Point(x, z), p['name'], p['cat']))
ptree = STRtree([p[0] for p in place_pts]) if place_pts else None
road_prep = prepared.prep(road_poly)
yard_prep = prepared.prep(yard)

buildings = []
blocked_polys = []
for i, b in enumerate(bld):
    for p in polys_of(b['g']):
        p = p.intersection(SQ)
        if p.is_empty or p.geom_type != 'Polygon' or p.area < 12:
            continue
        # descartar huellas que invaden la calle o la playa de vías
        if p.intersection(road_poly).area > p.area * 0.25 or p.intersection(yard).area > p.area * 0.4:
            continue
        p = p.difference(road_poly).difference(yard)
        if p.geom_type == 'MultiPolygon':
            p = max(p.geoms, key=lambda g: g.area)
        if p.is_empty or p.area < 12:
            continue
        p = p.simplify(0.35)
        if p.exterior.is_ccw:
            p = Polygon(list(p.exterior.coords)[::-1])  # horario visto desde arriba en x-z (z al sur)
        ring = list(p.exterior.coords)[:-1]
        area = p.area
        c = p.centroid
        dav = c.distance(av_union) if av_union else 999
        # nombre de comercio cercano
        name = b['name']
        cat = None
        if ptree is not None and not name:
            for j in ptree.query(p.buffer(6)):
                if place_pts[j][0].distance(p) < 6:
                    name, cat = place_pts[j][1], place_pts[j][2]
                    break
        # tipo y pisos
        cls = (b['cls'] or '') + '|' + (b['sub'] or '')
        if 'train_station' in cls:
            kind = 'estacion'
        elif 'stadium' in cls:
            kind = 'estadio'
        elif 'school' in cls or 'education' in cls:
            kind = 'escuela'
        elif 'religious' in cls:
            kind = 'iglesia'
        elif 'apartments' in cls or (name and name.lower().startswith('torre')):
            kind = 'edificio'
        elif 'retail' in cls or 'commercial' in cls or (name and dav < 60):
            kind = 'local'
        elif area > 700:
            kind = 'galpon'
        elif dav < 30 and random.random() < 0.5:
            kind = 'local'
        elif area > 280 and dav < 45 and random.random() < 0.5:
            kind = 'edificio'
        else:
            kind = 'casa'
        floors = b['f']
        if not floors:
            if kind == 'edificio':
                floors = 12 if name and name.lower().startswith('torre') else random.randint(3, 7)
            elif kind == 'galpon':
                floors = 2
            elif kind in ('escuela', 'iglesia'):
                floors = 2
            elif kind == 'local':
                floors = 1 if random.random() < 0.55 else 2
            else:
                floors = 1 if random.random() < 0.66 else 2
        # frentes: aristas que dan a la vereda
        fronts = []
        setbacks = []
        n = len(ring)
        for k in range(n):
            ax, az = ring[k]
            bx, bz = ring[(k + 1) % n]
            L = math.hypot(bx - ax, bz - az)
            if L < 2.2:
                continue
            mx, mz = (ax + bx) / 2, (az + bz) / 2
            # normal hacia afuera (anillo horario en x-z con z al sur -> derecha)
            nx, nz = (bz - az) / L, -(bx - ax) / L
            probe = Point(mx + nx * 0.8, mz + nz * 0.8)
            if p.contains(probe):
                nx, nz = -nx, -nz
            d = Point(mx, mz).distance(road_poly)
            out = Point(mx + nx * min(d + 1, 14), mz + nz * min(d + 1, 14))
            if d < 13 and road_prep.intersects(out.buffer(1.2)):
                fronts.append(k)
                setbacks.append(R1(max(0, d - 3.0)))
        buildings.append({'r': [[R1(x), R1(z)] for x, z in ring], 'k': kind, 'f': int(floors), 'v': random.randint(0, 999), 'fr': fronts, 'sb': setbacks, 'n': name, 'cat': cat})
        blocked_polys.append(p)

bld_union = unary_union(blocked_polys)
bld_prep = prepared.prep(bld_union.buffer(0.6))

# ---------- Rejas frente a las casas con retiro ----------
fences = []
for b in buildings:
    if b['k'] != 'casa':
        continue
    ring = b['r']
    n = len(ring)
    for k, sb in zip(b['fr'], b['sb']):
        if sb < 1.4 or sb > 9:
            continue
        ax, az = ring[k]
        bx, bz = ring[(k + 1) % n]
        L = math.hypot(bx - ax, bz - az)
        nx, nz = (bz - az) / L, -(bx - ax) / L
        poly = Polygon(ring)
        if poly.contains(Point((ax + bx) / 2 + nx * 0.8, (az + bz) / 2 + nz * 0.8)):
            nx, nz = -nx, -nz
        # extender la reja un poco a los costados (el lote es más ancho que la casa)
        ext = 0.8
        ux, uz = (bx - ax) / L, (bz - az) / L
        fx0, fz0 = ax - ux * ext + nx * sb, az - uz * ext + nz * sb
        fx1, fz1 = bx + ux * ext + nx * sb, bz + uz * ext + nz * sb
        seg_line = LineString([(fx0, fz0), (fx1, fz1)])
        if road_prep.intersects(seg_line.buffer(0.3)):
            continue
        fences.append([R1(fx0), R1(fz0), R1(fx1), R1(fz1), round(0.2 + random.random() * 0.6, 2)])

# ---------- Árboles ----------
trees = []
bad = unary_union([road_poly, yard]).buffer(0.4)
bad_prep = prepared.prep(bad)
for r in roads:
    l = r['l']
    L = l.length
    for side in (-1, 1):
        d = random.uniform(4, 12)
        while d < L - 3:
            p0 = l.interpolate(d)
            p1 = l.interpolate(min(L, d + 0.5))
            dx, dz = p1.x - p0.x, p1.y - p0.y
            m = math.hypot(dx, dz) or 1
            nx, nz = -dz / m * side, dx / m * side
            off = r['w'] / 2 + 0.9
            pt = Point(p0.x + nx * off, p0.y + nz * off)
            if not bad_prep.contains(pt) and not bld_prep.contains(pt) and not near_corner(pt, 11) and random.random() < 0.72:
                trees.append([R1(pt.x), R1(pt.y), round(random.uniform(0.8, 1.25), 2)])
            d += random.uniform(9, 17)
for pk in parks:
    if pk['c'] not in ('park', 'grass', 'garden', 'village_green'):
        continue
    g = pk['g']
    minx, miny, maxx, maxy = g.bounds
    n = int(g.area / 110)
    for _ in range(n * 3):
        if n <= 0:
            break
        pt = Point(random.uniform(minx, maxx), random.uniform(miny, maxy))
        if g.contains(pt) and not bld_prep.contains(pt) and not (path_poly is not None and path_poly.buffer(1).contains(pt)):
            trees.append([R1(pt.x), R1(pt.y), round(random.uniform(1.0, 1.6), 2)])
            n -= 1
for l in land:
    if l['cls'] == 'tree_row':
        for c in lines_of(l['g']):
            ls = LineString(c)
            d = 0
            while d < ls.length:
                p = ls.interpolate(d)
                if SQ.contains(p):
                    trees.append([R1(p.x), R1(p.y), 1.1])
                d += 8
# no amontonar
tree_pts = []
grid = {}
for t in trees:
    k = (int(t[0] // 4), int(t[1] // 4))
    if any(grid.get((k[0] + i, k[1] + j)) for i in (-1, 0, 1) for j in (-1, 0, 1)):
        continue
    grid[k] = True
    tree_pts.append(t)

# ---------- Faroles ----------
lamps = []
for idx, r in enumerate(roads):
    l = r['l']
    side = 1 if idx % 2 else -1
    d = 12
    while d < l.length - 5:
        p0 = l.interpolate(d)
        p1 = l.interpolate(min(l.length, d + 0.5))
        dx, dz = p1.x - p0.x, p1.y - p0.y
        m = math.hypot(dx, dz) or 1
        nx, nz = -dz / m * side, dx / m * side
        off = r['w'] / 2 + 0.5
        pt = Point(p0.x + nx * off, p0.y + nz * off)
        if not bad_prep.contains(pt) and not bld_prep.contains(pt):
            # el brazo apunta hacia la calle (-n)
            lamps.append([R1(pt.x), R1(pt.y), round(math.atan2(-nx, -nz), 3)])
        d += 33


def rings(g):
    out = []
    geoms = g.geoms if hasattr(g, 'geoms') else [g]
    for p in geoms:
        if p.geom_type != 'Polygon' or p.area < 0.5:
            continue
        p = p.simplify(0.25)
        if p.is_empty:
            continue
        out.append([[[R1(x), R1(y)] for x, y in list(p.exterior.coords)[:-1]]] + [[[R1(x), R1(y)] for x, y in list(h.coords)[:-1]] for h in p.interiors])
    return out


def line(l):
    return [[R1(x), R1(y)] for x, y in l.coords]


pt = lambda i: i['g']['c']

# calles unidas por nombre (para las marchas y los carteles)
named = {}
by_name = collections.defaultdict(list)
for r in roads:
    if r['n']:
        by_name[r['n']].append(r['l'])
for n, ls in by_name.items():
    m = linemerge(ls)
    parts = [m] if m.geom_type == 'LineString' else list(m.geoms)
    parts = [x for x in parts if x.length > 60]
    if parts:
        named[n] = [line(x.simplify(0.5)) for x in parts]

# techos de andén (cerca del edificio) y columnas
canopies = []
columns = []
cbox = box(-70, -75, 70, 75)
for pl in platforms:
    c = pl.intersection(cbox)
    if c.is_empty:
        continue
    for g in (c.geoms if hasattr(c, 'geoms') else [c]):
        if g.geom_type != 'Polygon' or g.area < 20:
            continue
        canopies.append([[R1(x), R1(y)] for x, y in list(g.exterior.coords)[:-1]])
        rect = g.minimum_rotated_rectangle
        cs = list(rect.exterior.coords)[:4]
        e0 = math.dist(cs[0], cs[1])
        e1 = math.dist(cs[1], cs[2])
        if e0 > e1:
            a = ((cs[1][0] + cs[2][0]) / 2, (cs[1][1] + cs[2][1]) / 2)
            b = ((cs[3][0] + cs[0][0]) / 2, (cs[3][1] + cs[0][1]) / 2)
        else:
            a = ((cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2)
            b = ((cs[2][0] + cs[3][0]) / 2, (cs[2][1] + cs[3][1]) / 2)
        axis = LineString([a, b])
        d = 5
        while d < axis.length - 4:
            q = axis.interpolate(d)
            if g.contains(q):
                columns.append([R1(q.x), R1(q.y)])
            d += 10
out = {
    'half': HALF,
    'origin': [LAT0, LON0],
    'roads': [{'n': r['n'], 'c': r['c'], 'w': r['w'], 'p': line(r['l'].simplify(0.3))} for r in roads],
    'paths': [{'w': p['w'], 'c': p['c'], 'p': line(p['l'].simplify(0.3))} for p in paths],
    'rails': [line(r.simplify(0.2)) for r in rails],
    'platforms': rings(plat_union) if plat_union else [],
    'roadPoly': rings(road_poly),
    'sidewalks': rings(sidewalks),
    'blocks': rings(blocks),
    'yard': rings(yard),
    'buildings': buildings,
    'fences': fences,
    'trees': tree_pts,
    'lamps': lamps,
    'parks': [{'c': p['c'], 'n': p['n'], 'r': rings(p['g'])} for p in parks],
    'signals': [pt(i) for i in inf if i['cls'] == 'traffic_signals' and abs(pt(i)[0]) < HALF and abs(pt(i)[1]) < HALF],
    'stops': [pt(i) for i in inf if i['cls'] == 'bus_stop' and abs(pt(i)[0]) < HALF and abs(pt(i)[1]) < HALF],
    'crossings': [pt(i) for i in inf if i['cls'] == 'crossing' and abs(pt(i)[0]) < HALF and abs(pt(i)[1]) < HALF],
    'bridges': [line(b) for b in bridges],
    'station': [p for p in inf if p['cls'] == 'railway_station'][0]['g']['c'],
    'named': named,
    'canopies': canopies,
    'columns': columns,
}
s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
open(sys.argv[1] if len(sys.argv) > 1 else 'temperley.json', 'w').write(s)
print('KB', len(s) // 1024, {k: len(v) for k, v in out.items() if isinstance(v, list)})
