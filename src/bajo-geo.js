// Paso bajo nivel Manuel Belgrano (el "bajo nivel" de Temperley): la avenida de dos manos que va de Av.
// Eva Perón a Av. 9 de Julio y pasa por abajo de las vías del Roca. Geometría sacada de OpenStreetMap
// (ways 226336216, 465744151-155 y 1149008569; © colaboradores de OSM, ODbL). El preprocesado del mapa
// la dejaba afuera (scripts/map/preprocess.py descarta lo que se llama "bajo nivel"): acá se suma al
// cargar. Este archivo es solo geometría (sin imports) para que lo use src/map.js sin ciclos.
export const W = 8; // ancho de cada mano (dos carriles)
export const NAME = 'Paso bajo nivel Manuel Belgrano';

// mano hacia el este y mano hacia el oeste (la primera se corta donde empalma con 9 de Julio)
export const LANES = [
  [[-253.2, 572.9], [-229.0, 556.0], [-220.4, 548.7]],
  [[-220.4, 548.7], [-212.2, 538.4], [-209.2, 535.2], [-205.1, 532.0], [-29.8, 417.9], [-16.5, 409.9], [-2.1, 401.9], [36.2, 383.3], [77.4, 362.4], [94.2, 352.9], [109.7, 343.4], [221.8, 269.6], [248.2, 251.0]],
  [[241.1, 244.7], [214.6, 264.7], [104.2, 335.7], [88.6, 345.7], [70.0, 356.3], [53.5, 365.2], [35.4, 375.5], [-3.0, 392.9], [-14.8, 398.4], [-24.0, 403.5], [-35.8, 411.0], [-207.5, 524.6], [-211.1, 527.2], [-215.3, 530.8], [-218.6, 533.6], [-223.3, 538.5], [-232.9, 550.2], [-253.2, 572.9]],
];

// eje del túnel (bajo las vías): s = 0 en el medio, crece hacia el oeste
export const AXIS = { x: 16.6, z: 388.4, ux: -0.8995, uz: 0.4368 };
const FLAT = 24; // tramo hondo (abajo de las vías y un poco más)
const RAMP = 72; // largo de cada rampa
export const DEPTH = 5.4;

export function sOf(x, z) {
  return (x - AXIS.x) * AXIS.ux + (z - AXIS.z) * AXIS.uz;
}
// cuánto baja la calle (negativo) según dónde está sobre el eje
export function depthAt(s) {
  const a = Math.abs(s);
  if (a <= FLAT) return -DEPTH;
  if (a >= FLAT + RAMP) return 0;
  const k = (a - FLAT) / RAMP;
  return -DEPTH * 0.5 * (1 + Math.cos(Math.PI * k));
}

// los tramos, con su caja (para descartar rápido)
export const SEGS = [];
for (const L of LANES) {
  for (let i = 0; i < L.length - 1; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    SEGS.push({ ax, az, bx, bz, l, ux: (bx - ax) / l, uz: (bz - az) / l, x0: Math.min(ax, bx) - W, x1: Math.max(ax, bx) + W, z0: Math.min(az, bz) - W, z1: Math.max(az, bz) + W });
  }
}
export const BOX = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
for (const g of SEGS) {
  BOX.x0 = Math.min(BOX.x0, g.x0);
  BOX.x1 = Math.max(BOX.x1, g.x1);
  BOX.z0 = Math.min(BOX.z0, g.z0);
  BOX.z1 = Math.max(BOX.z1, g.z1);
}

// distancia al eje de la mano más cercana
export function laneDist(x, z) {
  if (x < BOX.x0 || x > BOX.x1 || z < BOX.z0 || z > BOX.z1) return Infinity;
  let best = Infinity;
  for (const g of SEGS) {
    if (x < g.x0 || x > g.x1 || z < g.z0 || z > g.z1) continue;
    const t = Math.max(0, Math.min(g.l, (x - g.ax) * g.ux + (z - g.az) * g.uz));
    const d = Math.hypot(x - g.ax - g.ux * t, z - g.az - g.uz * t);
    if (d < best) best = d;
  }
  return best;
}
// altura de la calzada en (x, z), o null si no es parte del bajo nivel (margen: ensancha la franja)
export function corridorY(x, z, margin = 0) {
  if (laneDist(x, z) > W / 2 + margin) return null;
  return 0.02 + depthAt(sOf(x, z));
}
// ¿está en la parte honda (más de `min` metros abajo)?
export function inTrench(x, z, min = 0.3, margin = 0) {
  const y = corridorY(x, z, margin);
  return y !== null && y < 0.02 - min;
}
