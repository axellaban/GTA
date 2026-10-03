# Revisa los nombres de las calles del juego contra OpenStreetMap y los corrige en
# src/data/temperley.json: pone el nombre a los tramos que no lo tienen, cambia los que no
# coinciden y parte en dos los tramos que en OSM son dos calles distintas.
#
#   python3 scripts/map/osm_streets.py          # muestra las diferencias y las corrige
#   python3 scripts/map/osm_streets.py --cache  # sin volver a bajar de Overpass
#
# Datos: © colaboradores de OpenStreetMap (ODbL). Usa Overpass (prueba varios servidores).
import json, math, os, sys, time, urllib.parse, urllib.request
from shapely.geometry import LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
from area import BOUNDS

LAT0, LON0 = -34.7761, -58.3963
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110950.0
X0, Z0, X1, Z1 = BOUNDS  # la zona del mapa (area.py) más 50 m
S, N = LAT0 - (Z1 + 50) / KZ, LAT0 - (Z0 - 50) / KZ
W, E = LON0 + (X0 - 50) / KX, LON0 + (X1 + 50) / KX
QUERY = f'''[out:json][timeout:120];
way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian"]({S:.5f},{W:.5f},{N:.5f},{E:.5f});
out geom tags;'''
SERVERS = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data', 'temperley.json')


CACHE = os.path.join(os.path.dirname(__file__), 'osm_highways.json')  # (ignorado por git)


def fetch():
    # la respuesta se guarda: los servidores de Overpass suelen estar saturados
    if '--cache' in sys.argv and os.path.exists(CACHE):
        return json.load(open(CACHE))
    body = urllib.parse.urlencode({'data': QUERY}).encode()
    for url in SERVERS * 2:
        try:
            req = urllib.request.Request(url, data=body, headers={'User-Agent': 'gta-vi-conurba-map/1.0'})
            with urllib.request.urlopen(req, timeout=150) as r:
                data = json.load(r)
            json.dump(data, open(CACHE, 'w'))
            return data
        except Exception as e:  # noqa: BLE001
            print(f'{url}: {e}', file=sys.stderr)
            time.sleep(2)
    raise SystemExit('ningún servidor de Overpass respondió')


def P(lon, lat):
    return ((lon - LON0) * KX, (LAT0 - lat) * KZ)


def main():
    ways = [w for w in fetch()['elements'] if len(w.get('geometry', [])) > 1]
    lines = [LineString([P(g['lon'], g['lat']) for g in w['geometry']]) for w in ways]
    tree = STRtree(lines)

    def osm_name(l, t):
        # la calle de OSM más cercana que va en la misma dirección (en los cruces, la transversal no cuenta)
        pt = l.interpolate(t, normalized=True)
        a = l.interpolate(max(0, t - 0.01), normalized=True)
        b = l.interpolate(min(1, t + 0.01), normalized=True)
        dx, dz = b.x - a.x, b.y - a.y
        dl = math.hypot(dx, dz) or 1
        best = None
        for i in tree.query(pt.buffer(8)):
            ln = lines[i]
            d = ln.distance(pt)
            if d >= 8:
                continue
            s = ln.project(pt)
            p0, p1 = ln.interpolate(max(0, s - 1)), ln.interpolate(min(ln.length, s + 1))
            ox, oz = p1.x - p0.x, p1.y - p0.y
            if abs(dx * ox + dz * oz) / (dl * (math.hypot(ox, oz) or 1)) < 0.85:
                continue
            if best is None or d < best[0]:
                best = (d, ways[i]['tags'].get('name') or '')
        return best[1] if best else None

    D = json.load(open(ROOT))
    rails = unary_union([LineString(t) for t in D['rails'] if len(t) > 1])
    RAIL = 14  # un cambio de nombre no puede caer en las vías: partiría el paso a nivel en dos

    def off_rails(l, t, keep_before):
        # corre el corte hasta 14 m de la última vía, del lado que deja el cruce en la parte más larga
        if rails.distance(l.interpolate(t, normalized=True)) >= RAIL:
            return t
        step = 1 / l.length
        u = t
        while 0 < u < 1 and rails.distance(l.interpolate(u, normalized=True)) < RAIL:
            u += step if keep_before else -step
        return min(1, max(0, u))

    out = []
    changed = 0
    for r in D['roads']:
        l = LineString(r['p'])
        if l.length < 1:
            out.append(r)
            continue
        # nombre de OSM cada 2 m a lo largo del tramo
        n = max(2, int(l.length / 2))
        samples = [(i / n, osm_name(l, i / n)) for i in range(n + 1)]
        runs = []
        for t, nm in samples:
            if nm is None:
                continue
            if runs and runs[-1][2] == nm:
                runs[-1][1] = t
            else:
                runs.append([t, t, nm])
        # tramos cortos no cuentan (para partir una calle, cada parte tiene que tener 30 m o más)
        runs = [x for x in runs if (x[1] - x[0]) * l.length >= 30] or runs
        names = [x for x in runs if x[2]]
        if not names:
            out.append(r)
            continue
        if len({x[2] for x in names}) == 1:
            nm = names[0][2]
            if nm != (r['n'] or ''):
                print(f"  {r['n'] or '(sin nombre)'} -> {nm}")
                r['n'] = nm
                changed += 1
            out.append(r)
            continue
        # dos calles en un tramo: se parte donde cambia el nombre (si alguna parte queda de menos de
        # 15 m, el tramo entero se queda con el nombre que más largo cubre)
        cuts = [0.0] + [(a[1] + b[0]) / 2 for a, b in zip(names, names[1:])] + [1.0]
        for k in range(1, len(cuts) - 1):
            before = cuts[k] - cuts[k - 1]
            after = cuts[k + 1] - cuts[k]
            cuts[k] = off_rails(l, cuts[k], before >= after)
        if min(t1 - t0 for t0, t1 in zip(cuts, cuts[1:])) * l.length < 15:
            nm = max(names, key=lambda x: x[1] - x[0])[2]
            if nm != (r['n'] or ''):
                print(f"  {r['n'] or '(sin nombre)'} -> {nm}")
                r['n'] = nm
                changed += 1
            out.append(r)
            continue
        print(f"  {r['n'] or '(sin nombre)'} -> partida en {[x[2] for x in names]}")
        for (t0, t1), x in zip(zip(cuts, cuts[1:]), names):
            pts = [l.interpolate(t0, normalized=True).coords[0]]
            d0, d1 = t0 * l.length, t1 * l.length
            acc = 0
            for a, b in zip(r['p'], r['p'][1:]):
                acc += math.dist(a, b)
                if d0 < acc < d1:
                    pts.append(b)
            pts.append(l.interpolate(t1, normalized=True).coords[0])
            out.append({**r, 'n': x[2], 'p': [[round(px, 1), round(pz, 1)] for px, pz in pts]})
        changed += 1
    D['roads'] = out
    if changed:
        json.dump(D, open(ROOT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{changed} tramos corregidos')


if __name__ == '__main__':
    main()
