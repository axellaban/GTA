// Subirse y bajarse del auto y de la moto como en los GTA (pedido del dueño: más real, y que Gaspi se vea
// manejando). Todo pasa del lado izquierdo, el del conductor en la Argentina.
// Auto: llega a la manija, tira y la puerta se abre; se mete en el hueco, se da vuelta y se sienta de cola
// agachando la cabeza, entra las piernas y cierra con la mano. Al bajar: abre empujando, saca las piernas,
// se para y cierra de un empujón (si ya se va caminando, la puerta se cierra sola).
// Moto: se para al costado, agarra el manubrio y pasa la pierna derecha por arriba del asiento; la moto deja
// la pata y se endereza. Al bajar: la apoya en la pata, pasa la pierna para atrás y se baja por la izquierda.
// Gaspi va colgado de la carrocería (o de la moto) en coordenadas del vehículo: x a la izquierda, z adelante.
import * as THREE from 'three';
import { animateHuman } from './human.js';

const clamp01 = (k) => Math.max(0, Math.min(1, k));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const SIT_H = 0.97; // del almohadón a la coronilla, sentado (Gaspi mide 1,84)

// dónde se sienta el que maneja, en coordenadas de la carrocería. En los autos con vidrios que dejan ver
// (los hechos por código y los de Blender) Gaspi se ve; en los de Quaternius el vidrio es negro.
export function asiento(v) {
  const u = v.mesh.userData;
  const roof = (u.tall ?? 1.5) - 0.08;
  const s = u.seat;
  // la cabeza no puede pasar el techo: en los autos bajos se hunde en la butaca (y reclina)
  const y = (sy) => Math.max(0.12, Math.min(sy, roof - 0.07 - SIT_H));
  if (!s) return { x: v.W * 0.22, y: y(0.45), z: -v.L * 0.05, visible: false };
  return { x: s.x, y: y(s.y), z: s.z, visible: true };
}
export const carroceria = (v) => v.mesh.userData.chassis || v.mesh;

// pose sin la mezcla automática de animateHuman al cambiar (las de acá ya son continuas: si mezclara, al
// pasar de parado a sentado la cadera saltaba para arriba un instante)
function posar(P, a, dt, pose, speed = 0, t = 0) {
  const d = a.pose === pose ? dt : 0;
  a.pose = pose;
  animateHuman(P.h, d, speed, pose, t);
}
// sentado → parado: con u = 1 la cadera queda a la altura de agachado (0,8 m) y las piernas casi derechas
function pararse(b, u, sy) {
  if (u <= 0) return;
  b.hips.position.y += u * (0.8 - sy - 0.1);
  b.thR.rotation.x += u * 1.0;
  b.thL.rotation.x += u * 1.05;
  b.shR.rotation.x -= u * 0.55;
  b.shL.rotation.x -= u * 0.7;
  b.spine.rotation.x += u * 0.45;
  b.neck.rotation.x += u * 0.2;
}

// el ángulo más corto de a a b
function angLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// mano derecha a la manija (k: cuánto llega; tira: cuánto tiró hacia atrás)
function manoManija(b, k, tira) {
  b.uaR.rotation.x += (-0.95 + tira * 0.45) * k;
  b.uaR.rotation.z += 0.35 * k;
  b.faR.rotation.x += (-0.25 - tira * 0.5) * k;
  b.chest.rotation.y += -0.2 * k;
  b.spine.rotation.x += (0.12 - tira * 0.1) * k;
}
// brazo izquierdo afuera, a la puerta (para cerrarla desde adentro o empujarla para abrir)
function brazoPuerta(b, k) {
  b.uaL.rotation.x += -0.55 * k;
  b.uaL.rotation.z += 1.05 * k;
  b.faL.rotation.x += -0.35 * k;
  b.chest.rotation.y += 0.25 * k;
}
// agachado: cabeza gacha, rodillas dobladas
function agachar(b, k) {
  const q = Math.sin(clamp01(k) * Math.PI * 0.5);
  b.spine.rotation.x += 0.5 * q;
  b.neck.rotation.x += 0.3 * q;
  b.hips.position.y -= 0.28 * q;
  for (const [th, sh] of [
    [b.thR, b.shR],
    [b.thL, b.shL],
  ]) {
    th.rotation.x -= 0.9 * q;
    sh.rotation.x += 1.1 * q;
  }
}
// las piernas todavía afuera del auto (sentado de costado): se juntan y giran para afuera
function piernasAfuera(b, k) {
  b.thR.rotation.y += 0.9 * k;
  b.thL.rotation.y += 0.9 * k;
  b.thR.rotation.x += 0.35 * k;
  b.thL.rotation.x += 0.35 * k;
  b.hips.rotation.y += -0.6 * k;
}

// ---------- Auto ----------
export function subirAuto(P, v) {
  const s = asiento(v);
  const W = v.W / 2;
  const a = {
    tipo: 'subirAuto',
    v,
    t: 0,
    dur: 1.5,
    s,
    // la manija (del lado de afuera de la puerta), el hueco de la puerta abierta y el asiento
    p0: { x: W + 0.5, z: s.z - 0.25 },
    p1: { x: W + 0.3, z: s.z + 0.05 },
  };
  carroceria(v).add(P.h.root);
  P.h.root.visible = true;
  P.h.root.rotation.set(0, -Math.PI / 2, 0);
  P.h.root.position.set(a.p0.x, 0, a.p0.z);
  return a;
}
// devuelve true cuando terminó
export function pasoSubirAuto(P, a, dt) {
  a.t += dt;
  const { v, s, p0, p1 } = a;
  const t = a.t;
  const r = P.h.root;
  const b = P.h.bones;
  // abre la puerta al tirar de la manija y la cierra desde adentro al final
  if (!a.abrio && t > 0.18) {
    a.abrio = true;
    v.openDoor?.(1.05);
  }
  if (t < 0.3) {
    // la mano a la manija y tira
    r.position.set(p0.x, 0, p0.z);
    r.rotation.y = -Math.PI / 2;
    posar(P, a, dt, 'walk');
    manoManija(b, ease(seg(t, 0, 0.16)), ease(seg(t, 0.16, 0.3)));
  } else if (t < 0.62) {
    // se mete en el hueco de la puerta y se da vuelta (la espalda para el asiento), agachándose
    const k = ease(seg(t, 0.3, 0.62));
    r.position.set(lerp(p0.x, p1.x, k), 0, lerp(p0.z, p1.z, k));
    r.rotation.y = angLerp(-Math.PI / 2, 1.0, k);
    posar(P, a, dt, 'walk', 0.9);
    agachar(b, k * 0.35);
  } else if (t < 1.05) {
    // baja la cola al asiento agachando la cabeza y después mete las piernas
    const k = ease(seg(t, 0.62, 1.0));
    r.position.set(lerp(p1.x, s.x, k), s.y, lerp(p1.z, s.z, k));
    r.rotation.y = angLerp(1.0, 0, ease(seg(t, 0.8, 1.05)));
    posar(P, a, dt, 'manejar', 0, 0);
    pararse(b, 1 - k, s.y);
    piernasAfuera(b, 1 - ease(seg(t, 0.82, 1.05)));
    b.neck.rotation.x += 0.35 * (1 - ease(seg(t, 0.85, 1.05)));
  } else {
    // cierra la puerta con la mano izquierda
    r.position.set(s.x, s.y, s.z);
    r.rotation.y = 0;
    posar(P, a, dt, 'manejar', 0, 0);
    const k = seg(t, 1.05, a.dur);
    brazoPuerta(b, Math.sin(k * Math.PI));
  }
  P.yOff = 0;
  return t >= a.dur;
}

export function bajarAuto(P, v) {
  const s = asiento(v);
  const W = v.W / 2;
  carroceria(v).add(P.h.root);
  P.h.root.visible = true;
  P.h.root.position.set(s.x, s.y, s.z);
  P.h.root.rotation.set(0, 0, 0);
  v.openDoor?.(1.0);
  return {
    tipo: 'bajarAuto',
    v,
    t: 0,
    dur: 1.25,
    s,
    p1: { x: W + 0.3, z: s.z + 0.05 },
    p2: { x: W + 0.95, z: s.z + 0.3 },
  };
}
// true cuando terminó; corta: ya se puede cortar (si el jugador quiere irse caminando)
export function pasoBajarAuto(P, a, dt) {
  a.t += dt;
  const { s, p1, p2 } = a;
  const t = a.t;
  const r = P.h.root;
  const b = P.h.bones;
  if (t < 0.25) {
    // empuja la puerta
    r.position.set(s.x, s.y, s.z);
    r.rotation.y = 0;
    posar(P, a, dt, 'manejar', 0, 0);
    brazoPuerta(b, Math.sin(seg(t, 0, 0.25) * Math.PI * 0.5));
  } else if (t < 0.72) {
    // saca las piernas, gira para afuera y se para en el hueco de la puerta
    const k = ease(seg(t, 0.32, 0.72));
    r.position.set(lerp(s.x, p1.x, k), s.y, lerp(s.z, p1.z, k));
    r.rotation.y = angLerp(0, 1.15, ease(seg(t, 0.25, 0.48)));
    posar(P, a, dt, 'manejar', 0, 0);
    piernasAfuera(b, ease(seg(t, 0.25, 0.42)) * (1 - k));
    pararse(b, k, s.y);
    b.neck.rotation.x += 0.35 * Math.sin(k * Math.PI);
  } else {
    // sale del hueco caminando y cierra la puerta de un empujón para atrás
    const k = ease(seg(t, 0.72, a.dur));
    r.position.set(lerp(p1.x, p2.x, k), 0, lerp(p1.z, p2.z, k));
    r.rotation.y = angLerp(1.15, Math.PI / 2 + 0.35, k);
    posar(P, a, dt, 'walk', 1.0);
    agachar(b, 0.35 * (1 - k));
    const push = Math.sin(seg(t, 0.82, a.dur) * Math.PI);
    b.uaR.rotation.x += 0.7 * push;
    b.uaR.rotation.z += -0.4 * push;
  }
  P.yOff = 0;
  a.corta = t > 0.75;
  return t >= a.dur;
}

// ---------- Moto ----------
const MOTO_SEAT = { x: 0, y: 0.36, z: -0.12 };
export function subirMoto(P, v) {
  v.mesh.add(P.h.root);
  P.h.root.visible = true;
  P.h.root.position.set(0.55, 0, -0.1);
  P.h.root.rotation.set(0, 0, 0);
  return { tipo: 'subirMoto', v, t: 0, dur: 0.95, lean0: v.lean || 0 };
}
// pierna derecha arriba y por encima del asiento (k: 0 abajo, 1 arriba del todo)
function piernaPorArriba(b, k) {
  b.thR.rotation.x += -0.45 * k;
  b.thR.rotation.z += -1.25 * k;
  b.shR.rotation.x += 1.2 * k;
  b.hips.rotation.z += 0.18 * k;
  b.spine.rotation.z += -0.12 * k;
}
// manos al manubrio
function manosManubrio(b, k) {
  b.uaR.rotation.x += -0.9 * k;
  b.uaL.rotation.x += -0.9 * k;
  b.faR.rotation.x += -0.4 * k;
  b.faL.rotation.x += -0.4 * k;
  b.spine.rotation.x += 0.2 * k;
}
// en la moto, sentado: la cadera queda casi a la misma altura que parado (0,91 m); mientras sube, el origen
// sube al asiento y la cadera se compensa, y la pierna izquierda sigue apoyada en el piso
function apoyado(b, u, ry) {
  b.hips.position.y += MOTO_SEAT.y - ry;
  b.thL.rotation.x += u * 1.3;
  b.shL.rotation.x -= u * 1.15;
  b.thR.rotation.x += u * 1.0;
  b.shR.rotation.x -= u * 0.9;
}
export function pasoSubirMoto(P, a, dt) {
  a.t += dt;
  const t = a.t;
  const { v } = a;
  const r = P.h.root;
  const b = P.h.bones;
  if (t < 0.25) {
    r.position.set(lerp(0.55, 0.42, ease(seg(t, 0, 0.25))), 0, -0.1);
    posar(P, a, dt, 'walk', 0.6);
    manosManubrio(b, ease(seg(t, 0.05, 0.25)));
  } else if (t < 0.72) {
    // pasa la pierna derecha por arriba: el cuerpo va al medio y queda sentado
    const k = ease(seg(t, 0.25, 0.72));
    const arc = Math.sin(k * Math.PI);
    const ry = lerp(0, MOTO_SEAT.y, k);
    r.position.set(lerp(0.42, MOTO_SEAT.x, k), ry, lerp(-0.1, MOTO_SEAT.z, k));
    posar(P, a, dt, 'ride');
    apoyado(b, 1 - k, ry);
    piernaPorArriba(b, arc);
  } else {
    // la endereza y levanta la pata
    r.position.set(MOTO_SEAT.x, MOTO_SEAT.y, MOTO_SEAT.z);
    posar(P, a, dt, 'ride');
    v.lean = lerp(a.lean0, 0, ease(seg(t, 0.72, a.dur)));
  }
  r.rotation.y = 0;
  P.yOff = 0;
  return t >= a.dur;
}

export function bajarMoto(P, v) {
  v.mesh.add(P.h.root);
  P.h.root.visible = true;
  P.h.root.position.set(MOTO_SEAT.x, MOTO_SEAT.y, MOTO_SEAT.z);
  P.h.root.rotation.set(0, 0, 0);
  return { tipo: 'bajarMoto', v, t: 0, dur: 0.85 };
}
export function pasoBajarMoto(P, a, dt) {
  a.t += dt;
  const t = a.t;
  const { v } = a;
  const r = P.h.root;
  const b = P.h.bones;
  if (t < 0.25) {
    // pie izquierdo al piso y la moto se apoya en la pata
    r.position.set(MOTO_SEAT.x, MOTO_SEAT.y, MOTO_SEAT.z);
    posar(P, a, dt, 'ride');
    const k = ease(seg(t, 0, 0.25));
    v.lean = lerp(0, -0.12, k);
    b.thL.rotation.x += 0.9 * k;
    b.shL.rotation.x += -0.8 * k;
  } else if (t < 0.65) {
    // pasa la pierna derecha para atrás por arriba del asiento y se baja por la izquierda
    const k = ease(seg(t, 0.25, 0.65));
    const arc = Math.sin(k * Math.PI);
    const ry = lerp(MOTO_SEAT.y, 0, k);
    r.position.set(lerp(MOTO_SEAT.x, 0.5, k), ry, lerp(MOTO_SEAT.z, -0.1, k));
    posar(P, a, dt, 'ride');
    apoyado(b, k, ry);
    piernaPorArriba(b, arc);
  } else {
    r.position.set(lerp(0.5, 0.75, ease(seg(t, 0.65, a.dur))), 0, -0.1);
    posar(P, a, dt, 'walk', 0.5);
  }
  r.rotation.y = 0;
  P.yOff = 0;
  a.corta = t > 0.65;
  return t >= a.dur;
}

// Gaspi colgado del vehículo: dónde está en el mundo (para la cámara y la lógica del juego)
const tmp = new THREE.Vector3();
export function posMundo(P) {
  P.h.root.updateWorldMatrix(true, false);
  tmp.setFromMatrixPosition(P.h.root.matrixWorld);
  return tmp;
}
