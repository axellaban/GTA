# Negocios y lugares con nombre de OpenStreetMap (Overpass) alrededor de la estación Temperley.
# Escribe src/data/osm.json, que src/map.js usa para ponerle el nombre real a cada local.
# Datos: © colaboradores de OpenStreetMap (ODbL); el crédito ya está en la pausa y en el README.
#
#   python3 scripts/map/osm_pois.py
#
# overpass-api.de suele estar saturado: se prueban varios servidores en orden.
import json, math, os, sys, time, urllib.parse, urllib.request
from shapely.geometry import Point
from area import AREA, BOUNDS

LAT0, LON0 = -34.7761, -58.3963
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110950.0
# la zona del mapa (area.py): el cuadrado de 1,2 km y las franjas al norte y al este
X0, Z0, X1, Z1 = BOUNDS
S = LAT0 - Z1 / KZ
N = LAT0 - Z0 / KZ
W = LON0 + X0 / KX
E = LON0 + X1 / KX
BB = f'({S:.5f},{W:.5f},{N:.5f},{E:.5f})'

AMENITY = 'restaurant|cafe|bar|fast_food|pharmacy|bank|ice_cream|pub|fuel|clinic|dentist|doctors|veterinary|bureau_de_change|post_office|car_wash|school|place_of_worship|police|hospital|cinema|theatre|library|kindergarten|marketplace|nightclub'
QUERY = f'''[out:json][timeout:90];
(
  nwr["shop"]{BB};
  nwr["amenity"~"{AMENITY}"]{BB};
  nwr["craft"]{BB};
  nwr["office"]{BB};
  nwr["leisure"~"fitness_centre|sports_centre"]{BB};
);
out center tags;'''

SERVERS = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]


def fetch():
    body = urllib.parse.urlencode({'data': QUERY}).encode()
    for url in SERVERS:
        try:
            req = urllib.request.Request(url, data=body, headers={'User-Agent': 'gta-vi-conurba-map/1.0'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f'{url}: {e}', file=sys.stderr)
            time.sleep(2)
    raise SystemExit('ningún servidor de Overpass respondió')


def kind_of(t):
    """local / escuela / iglesia / otro (lo que no es un local a la calle)"""
    if t.get('shop') == 'vacant':
        return None
    a = t.get('amenity')
    if a in ('school', 'kindergarten'):
        return 'escuela'
    if a == 'place_of_worship':
        return 'iglesia'
    if a in ('police', 'hospital', 'fuel'):
        return 'otro'
    if t.get('office') == 'government':
        return 'otro'
    return 'local'


def main():
    data = fetch()
    out = []
    for e in data['elements']:
        t = e.get('tags', {})
        name = (t.get('name') or '').strip()
        if not name:
            continue
        k = kind_of(t)
        if not k:
            continue
        lat = e.get('lat') or e['center']['lat']
        lon = e.get('lon') or e['center']['lon']
        x = (lon - LON0) * KX
        z = (LAT0 - lat) * KZ
        if not AREA.contains(Point(x, z)):
            continue
        cat = t.get('shop') or t.get('amenity') or t.get('craft') or t.get('office') or t.get('leisure')
        p = {'n': name, 'k': k, 'c': cat, 'x': round(x, 1), 'z': round(z, 1)}
        if t.get('addr:street'):
            p['a'] = f"{t['addr:street']} {t.get('addr:housenumber', '')}".strip()
        if t.get('building:levels'):
            p['f'] = t['building:levels']
        out.append(p)
    out.sort(key=lambda p: (p['x'], p['z']))
    root = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data', 'osm.json')
    with open(root, 'w', encoding='utf-8') as f:
        json.dump({'fuente': '© colaboradores de OpenStreetMap (ODbL)', 'pois': out}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} lugares con nombre -> src/data/osm.json')


if __name__ == '__main__':
    main()
