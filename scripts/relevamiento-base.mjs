// Arma public/relevamiento-base.json para la página de relevamiento: edificios y calles a 600 m de
// la estación (en las coordenadas del juego: x al este, z al sur, en metros), con lo que ya sabemos
// (tipo, pisos, nombre y rubro de Overture). Uso: node scripts/relevamiento-base.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('../src/data/temperley.json', import.meta.url)));
const S = { x: d.station[0], z: d.station[1] };
const R = 600;
const r1 = (v) => Math.round(v * 10) / 10;
const near = (pts) => pts.some(([x, z]) => Math.hypot(x - S.x, z - S.z) < R);
const buildings = [];
d.buildings.forEach((b, id) => {
  if (!b.r?.length || !near(b.r)) return;
  buildings.push({ id, r: b.r.map(([x, z]) => [r1(x), r1(z)]), k: b.k, f: b.f, n: b.n || undefined, c: b.cat || undefined });
});
// plazas, escuelas, canchas y demás terrenos con nombre (se cargan igual que un edificio)
const parks = [];
d.parks.forEach((p, i) => {
  const ring = p.r?.[0]?.[0];
  if (!ring?.length || !near(ring)) return;
  parks.push({ id: 'p' + i, r: ring.map(([x, z]) => [r1(x), r1(z)]), k: p.c, n: p.n || undefined });
});
const roads = d.roads.filter((r) => near(r.p)).map((r) => ({ n: r.n || '', w: r.w, p: r.p.map(([x, z]) => [r1(x), r1(z)]) }));
// para convertir GPS a coordenadas del juego (mismo origen que scripts/map/fetch.py)
const geo = { lat0: -34.7761, lon0: -58.3963, kx: Math.cos((-34.7761 * Math.PI) / 180) * 111320, kz: 110950 };
writeFileSync(new URL('../public/relevamiento-base.json', import.meta.url), JSON.stringify({ station: S, radius: 550, geo, buildings, parks, roads }));
console.log('edificios', buildings.length, 'terrenos', parks.length, 'calles', roads.length);
