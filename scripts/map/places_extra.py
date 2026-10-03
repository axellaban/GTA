# Lugares de Overture con confianza media (0,3 a 0,55) que preprocess.py deja afuera (usa >= 0,55):
# solo los que son locales a la calle (comercios, comida, salud, talleres...). Sale src/data/places.json;
# src/map.js los pone en huellas que todavía no tienen nombre real.
# Uso: python3 fetch.py places && python3 places_extra.py
import json, math
from shapely.geometry import Point
from area import AREA
LAT0, LON0 = -34.7761, -58.3963
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110950.0
D = json.load(open('../../src/data/temperley.json'))
OK = ('store', 'shop', 'restaurant', 'food_service', 'bar', 'cafe', 'bakery', 'pharmacy', 'clinic', 'dental', 'automotive', 'beauty', 'salon', 'gym', 'fitness', 'dance_club', 'real_estate', 'hotel', 'school', 'education', 'religious', 'church', 'veterinar', 'optic', 'laundry', 'repair', 'pet', 'florist', 'kiosk', 'butcher', 'market')
NO = ('professional_service', 'home_service', 'financial_service', 'manufacturer', 'historic', 'senior_living', 'marketing', 'event_or_party')
out = []
for q in json.load(open('places.json')):
    c = q['conf'] or 0
    cat = q['cat'] or ''
    # (vendedoras por catálogo y nombres larguísimos no son un local a la calle)
    if not q['name'] or 'Mary Kay' in q['name'] or len(q['name']) > 40 or not (0.3 <= c < 0.55) or not cat or any(n in cat for n in NO) or not any(o in cat for o in OK):
        continue
    x = round((q['x'] - LON0) * KX, 1)
    z = round((LAT0 - q['y']) * KZ, 1)
    if not AREA.contains(Point(x, z)):
        continue
    k = 'iglesia' if 'religious' in cat or 'church' in cat else 'escuela' if 'school' in cat or 'education' in cat else 'local'
    out.append({'n': q['name'].strip(), 'k': k, 'c': cat, 'x': x, 'z': z})
json.dump({'fuente': 'Overture Maps Foundation (places, CDLA Permissive 2.0)', 'pois': out}, open('../../src/data/places.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'lugares extra')
for p in out: print(' ', p['n'], '|', p['c'])
