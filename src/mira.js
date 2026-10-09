// Tiros a lo GTA (pedido del dueño): la mira fija el blanco que tiene encima (roja si es peligroso, blanca si
// es un vecino) y muestra su vida; se abre al moverse y con cada tiro y se cierra quieto o agachado; cada arma
// patea distinto y la mira vuelve sola a donde estaba; y de dónde vino el último golpe se marca en rojo en el
// borde de la pantalla.
import * as THREE from 'three';
import { npcBody } from './npc-body.js';
import { TOUCH } from './input.js';

const v = new THREE.Vector3();
const dir = new THREE.Vector3();

// retroceso de cada arma: p (sube la mira, rad), y (para los costados), bloom (cuánto se abre la mira por
// tiro) y rec (qué tan rápido vuelve)
export const RECOIL = {
  pistola: { p: 0.016, y: 0.005, bloom: 0.35, rec: 7 },
  revolver: { p: 0.045, y: 0.01, bloom: 0.9, rec: 4 },
  metra: { p: 0.011, y: 0.011, bloom: 0.2, rec: 8 },
  escopeta: { p: 0.065, y: 0.014, bloom: 1.1, rec: 3.5 },
  ametralladora: { p: 0.014, y: 0.013, bloom: 0.14, rec: 7 },
  bazuca: { p: 0.08, y: 0.008, bloom: 1, rec: 2.5 },
};

// ¿es de cuidado? (rojo en la mira): la cana, los que pelean o persiguen, las bandas en guerra, los zombis
export function hostil(n) {
  return n.type === 'cana' || n.type === 'zombie' || n.state === 'fight' || n.state === 'chase' || n.state === 'shoot' || (n.type === 'banda' && (n.gang?.war || n.state === 'gang'));
}

// el blanco que queda fijado mientras se apunta: el más cerca del centro de la mira, dentro de un cono chico
// (más grande en el celu), a la vista y a tiro; el que ya estaba fijado se suelta recién un poco más afuera
export function fijar(world, P, w) {
  const cam = world.camera;
  cam.getWorldDirection(dir);
  const cone = TOUCH ? 0.12 : 0.055;
  let best = null;
  let bs = Infinity;
  const consider = (obj, kind, x, y, z, r) => {
    v.set(x - cam.position.x, y - cam.position.y, z - cam.position.z);
    const d = v.length();
    if (d > (w.range ?? 60) + 6 || d < 0.8) return;
    // el ángulo hasta el borde del cuerpo
    const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d))) - Math.atan(r / d);
    if (ang > (P.lock?.obj === obj ? cone * 1.8 : cone)) return;
    if (world.colliders.blocked(P.x, P.z, x, z, 1.5) < 0.98) return;
    const s = Math.max(0, ang) + d * 0.0012;
    if (s < bs) {
      bs = s;
      best = { obj, kind, x, y, z };
    }
  };
  for (const n of world.npcs.list) {
    if (n.killed || n.dead || n.state === 'ko' || n.type === 'chico') continue;
    if (Math.abs(n.x - P.x) > 95 || Math.abs(n.z - P.z) > 95) continue;
    const b = npcBody(n);
    n.hpMax ??= Math.max(1, n.hp);
    consider(n, 'npc', n.x, n.y + (n.fly?.y ?? 0) + b.aimHeight, n.z, b.radius);
  }
  for (const m of world.crime.motos) if (m.state !== 'down') consider(m, 'moto', m.v.x, 1.2, m.v.z, 0.6);
  P.lock = best;
  return best;
}

// de dónde vino un golpe o un tiro: el ángulo en la pantalla (0 arriba, en el sentido del reloj)
export function screenAngle(P, x, z) {
  const c = P.camYaw;
  const fx = -Math.sin(c);
  const fz = -Math.cos(c);
  const dx = x - P.x;
  const dz = z - P.z;
  return Math.atan2(dx * Math.cos(c) - dz * Math.sin(c), dx * fx + dz * fz);
}

// los cuatro palitos de la mira (separados según cuánto se abre) y la barrita de vida del blanco fijado
export function mountMira(el) {
  if (el.dataset.ticks) return;
  el.dataset.ticks = '1';
  for (const k of ['t', 'r', 'b', 'l']) {
    const i = document.createElement('i');
    i.className = `ch-${k}`;
    el.appendChild(i);
  }
  const hp = document.createElement('b');
  hp.className = 'ch-hp';
  hp.appendChild(document.createElement('s'));
  el.appendChild(hp);
}

// cada cuadro: abertura (px), color y vida del blanco
export function updateMira(el, P, spread, flying) {
  // (en las pruebas de node la mira es un objeto suelto, sin DOM)
  if (!el?.dataset || typeof document === 'undefined') return;
  mountMira(el);
  const gap = flying ? 0 : Math.round(3 + Math.min(40, spread * 650));
  if (el.dataset.gap !== String(gap)) {
    el.dataset.gap = String(gap);
    el.style.setProperty('--gap', `${gap}px`);
  }
  const L = !flying && P.lock;
  const cls = flying ? 'fly' : L ? (L.kind === 'moto' || hostil(L.obj) ? 'lock hostil' : 'lock civil') : 'free';
  if (el.className !== cls) el.className = cls;
  if (L && L.kind === 'npc') {
    const k = Math.max(0, Math.min(1, L.obj.hp / (L.obj.hpMax || 100)));
    const s = el.lastElementChild.firstElementChild;
    const w = `${Math.round(k * 100)}%`;
    if (s.style.width !== w) s.style.width = w;
  }
}
