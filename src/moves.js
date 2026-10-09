// Pelea y armas con todo el cuerpo (a lo GTA de ahora): guardia de boxeo con rebote, golpes con
// anticipación → golpe rápido → impacto → vuelta a la guardia, la cadera y el pecho giran con el golpe, el
// peso pasa al pie de adelante y el talón de atrás pivotea; patada con recogida de rodilla; reacción al
// golpe para el lado que vino; apuntado que sigue la cámara arriba/abajo, con retroceso y respiración.
// Convenciones del esqueleto (src/human.js): el cuerpo mira a +z, la izquierda es +x; brazo: x < 0 lo
// levanta adelante, y lo gira sobre su eje, z lo abre (derecho z < 0, izquierdo z > 0); antebrazo x < 0
// dobla el codo; muslo x < 0 adelante; canilla x > 0 dobla la rodilla; pie x > 0 levanta el talón; pecho
// y > 0 adelanta el hombro derecho.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const outCubic = (x) => 1 - (1 - clamp01(x)) ** 3;

// fases de un golpe: w (carga, sube y baja), e (extensión: rápida al salir, se sostiene y vuelve)
function strike(t, a, p, r) {
  const w = t < a ? smooth(t / a) : t < p ? 1 - outCubic((t - a) / (p - a)) : 0;
  const e = t < a ? 0 : t < p ? outCubic((t - a) / (p - a)) : t < r ? 1 : 1 - smooth((t - r) / (1 - r));
  return { w, e };
}

export const COMBAT_POSES = new Set(['fight', 'guard', 'jab', 'cross', 'punch', 'hook', 'uppercut', 'kick', 'hit', 'block', 'aim', 'aimLong', 'holdGun']);

// guardia de boxeo (ortodoxa: izquierda adelante). legs: 0 deja las piernas de la caminata, 1 las planta
function stance(h, b, legs) {
  h.fightSeed ??= Math.random() * 10;
  const beat = Math.sin(h.phase * 5.2 + h.fightSeed);
  const bob = 0.5 + 0.5 * beat;
  const mix = (o, k, v) => (o[k] += (v - o[k]) * legs);
  // torso de perfil, mentón abajo, la cabeza mira al frente
  b.hips.rotation.y += -0.32 * legs;
  b.chest.rotation.y = -0.12;
  b.spine.rotation.x = 0.13;
  b.chest.rotation.x = 0.04;
  b.head.rotation.set(0.12, 0.42 * legs + 0.1, 0.02 * beat);
  // manos: la de adelante a la altura de los ojos, la de atrás pegada al mentón
  b.uaL.rotation.set(-1.02 - 0.04 * beat, 0, -0.24);
  b.faL.rotation.set(-1.85, 0, 0);
  b.uaR.rotation.set(-0.78 + 0.03 * beat, 0, 0.36);
  b.faR.rotation.set(-2.15, 0, 0);
  // piernas abiertas, rodillas flojas, rebota sobre la punta de los pies
  mix(b.hips.position, 'y', 0.915 - 0.022 * bob);
  mix(b.thL.rotation, 'x', -0.28);
  mix(b.shL.rotation, 'x', 0.3 + 0.05 * bob);
  mix(b.ftL.rotation, 'x', -0.02);
  mix(b.thR.rotation, 'x', 0.2);
  mix(b.shR.rotation, 'x', 0.32 + 0.05 * bob);
  mix(b.ftR.rotation, 'x', 0.18);
  mix(b.thL.rotation, 'z', 0.06);
  mix(b.thR.rotation, 'z', -0.07);
}

export function combatPose(h, b, pose, t, speed) {
  const planted = 1 - smooth((speed - 0.25) / 0.6); // quieto: piernas de guardia; caminando: las del paso
  if (pose === 'fight' || pose === 'guard') {
    stance(h, b, planted);
    return;
  }
  if (pose === 'jab' || pose === 'punch') {
    // directo de izquierda: corto y rápido, el hombro tapa el mentón
    stance(h, b, 1);
    const { w, e } = strike(t, 0.1, 0.34, 0.46);
    b.hips.position.y -= 0.012 * w;
    b.chest.rotation.y += 0.06 * w - 0.34 * e;
    b.hips.rotation.y -= 0.1 * e;
    b.hips.position.z += 0.05 * e;
    b.thL.rotation.x -= 0.12 * e;
    b.shL.rotation.x -= 0.08 * e;
    b.uaL.rotation.set(-1.02 - 0.5 * e, 0, -0.24 + 0.16 * e);
    b.faL.rotation.x = -1.85 + 1.77 * e;
    b.head.rotation.y += 0.3 * e;
    b.head.rotation.x += 0.04 * e;
    return;
  }
  if (pose === 'cross') {
    // derecha cruzada: carga atrás, gira cadera y pecho, pivotea el talón de atrás y el peso va adelante
    stance(h, b, 1);
    const { w, e } = strike(t, 0.16, 0.42, 0.52);
    b.chest.rotation.y += -0.14 * w + 0.66 * e;
    b.hips.rotation.y += -0.05 * w + 0.38 * e;
    b.spine.rotation.x += 0.1 * e;
    b.hips.position.z += 0.08 * e;
    b.hips.position.y -= 0.015 * w + 0.01 * e;
    b.ftR.rotation.x += 0.4 * e;
    b.thR.rotation.x -= 0.18 * e;
    b.shR.rotation.x += 0.18 * e;
    b.thL.rotation.x -= 0.06 * e;
    b.uaR.rotation.set(-0.78 - 0.74 * e, 0, 0.36 - 0.16 * e);
    b.faR.rotation.x = -2.15 + 2.1 * e;
    // la izquierda vuelve a tapar la cara
    b.uaL.rotation.set(-1.1, 0, -0.3);
    b.faL.rotation.x = -2.1;
    b.head.rotation.y += -0.42 * e;
    return;
  }
  if (pose === 'hook') {
    // gancho de izquierda: el codo arriba a la altura del hombro, el brazo en ángulo y gira todo el cuerpo
    stance(h, b, 1);
    const { w, e } = strike(t, 0.2, 0.48, 0.56);
    b.chest.rotation.y += 0.32 * w - 0.62 * e;
    b.hips.rotation.y += 0.12 * w - 0.32 * e;
    b.hips.position.y -= 0.03 * w;
    b.ftL.rotation.x += 0.3 * e; // pivotea sobre el pie de adelante
    b.thR.rotation.x -= 0.08 * e;
    const k = Math.max(w, e);
    b.uaL.rotation.set(-1.02 - 0.43 * k, -1.3 * k, -0.24 + 0.24 * k + 0.35 * w);
    b.faL.rotation.x = -1.85 + 0.35 * k;
    b.uaR.rotation.set(-0.85, 0, 0.36);
    b.faR.rotation.x = -2.15;
    b.head.rotation.y += -0.25 * w + 0.4 * e;
    return;
  }
  if (pose === 'uppercut') {
    // uppercut de derecha: baja, carga y sube con las piernas
    stance(h, b, 1);
    const { w, e } = strike(t, 0.24, 0.5, 0.58);
    b.hips.position.y -= 0.07 * w - 0.02 * e;
    b.thL.rotation.x -= 0.2 * w;
    b.shL.rotation.x += 0.3 * w;
    b.thR.rotation.x -= 0.15 * w;
    b.shR.rotation.x += 0.3 * w;
    b.spine.rotation.x += 0.22 * w - 0.2 * e;
    b.chest.rotation.y += -0.18 * w + 0.5 * e;
    b.hips.rotation.y += 0.25 * e;
    b.ftR.rotation.x += 0.35 * e;
    b.uaR.rotation.set(-0.78 + 0.32 * w - 0.35 * e, 0.2 * e, 0.36 - 0.1 * e);
    b.faR.rotation.x = -2.15 + 0.6 * w + 0.45 * e;
    b.uaL.rotation.set(-1.1, 0, -0.3);
    b.faL.rotation.x = -2.1;
    b.head.rotation.x += 0.1 * w - 0.12 * e;
    b.head.rotation.y += -0.3 * e;
    return;
  }
  if (pose === 'kick') {
    // patada frontal: recoge la rodilla, estira la pierna echando el cuerpo atrás, la recoge y apoya
    stance(h, b, 1);
    const up = t < 0.3 ? smooth(t / 0.3) : t < 0.78 ? 1 : 1 - smooth((t - 0.78) / 0.22);
    const ext = t < 0.3 ? 0 : t < 0.48 ? outCubic((t - 0.3) / 0.18) : t < 0.6 ? 1 : 1 - smooth((t - 0.6) / 0.2);
    b.hips.rotation.y += 0.28 * up; // la cadera derecha viene adelante
    b.chest.rotation.y += -0.1 * up;
    b.thR.rotation.set(0.2 - 1.75 * up + 0.2 * ext, 0, -0.07);
    b.shR.rotation.x = 0.32 + 1.5 * up - 1.65 * ext;
    b.ftR.rotation.x = 0.18 - 0.45 * up;
    b.thL.rotation.x = -0.28 + 0.3 * up;
    b.shL.rotation.x = 0.3 + 0.12 * up;
    b.spine.rotation.x = 0.13 - 0.42 * ext - 0.1 * up;
    b.hips.position.y -= 0.02 * up;
    b.hips.position.z += 0.07 * ext;
    // los brazos equilibran: el derecho va atrás, el izquierdo cuida la cara
    b.uaR.rotation.set(-0.3 + 0.55 * ext, 0, -0.25 * ext + 0.3 * (1 - ext));
    b.faR.rotation.x = -1.4 + 0.6 * ext;
    b.uaL.rotation.set(-1.15, 0, -0.1 + 0.3 * ext);
    b.faL.rotation.x = -1.9;
    b.head.rotation.x += 0.28 * ext;
    return;
  }
  if (pose === 'hit') {
    // le pegaron: según el golpe (h.hitKind) y de qué lado vino (h.hitSide), el cuerpo reacciona distinto.
    // El impacto es instantáneo (la cabeza se va de golpe) y la vuelta es lenta, con medio paso atrás
    const side = h.hitSide ?? (h.hitSide = Math.random() < 0.5 ? -1 : 1);
    const kind = h.hitKind;
    const k = t < 0.12 ? outCubic(t / 0.12) : 1 - smooth((t - 0.12) / 0.88);
    // rebote: la cabeza pasa un poco de largo y vuelve (el cuello no es rígido)
    const wob = Math.sin(clamp01(t / 0.45) * Math.PI * 2) * (1 - clamp01(t / 0.45)) * 0.12;
    if (kind === 'hook' || kind === 'swing') {
      // gancho o palazo: la cabeza y el torso se van de costado de un latigazo, las rodillas se aflojan
      b.spine.rotation.set(-0.08 * k, 0.25 * k * side, 0.2 * k * side);
      b.chest.rotation.set(-0.06 * k, 0.5 * k * side, 0.18 * k * side);
      b.head.rotation.set(-0.15 * k, (0.85 * k + wob) * side, (0.4 * k + wob) * side);
      b.hips.position.y -= 0.06 * k;
      b.hips.position.x -= 0.06 * k * side;
      b.thR.rotation.x += 0.2 * k;
      b.shR.rotation.x += 0.45 * k;
      b.thL.rotation.x -= 0.15 * k;
      b.shL.rotation.x += 0.35 * k;
      b.uaR.rotation.set(-0.25 * k, 0, -0.75 * k);
      b.uaL.rotation.set(-0.25 * k, 0, 0.75 * k);
      b.faR.rotation.x = -0.2 - 0.3 * k;
      b.faL.rotation.x = -0.2 - 0.3 * k;
    } else if (kind === 'uppercut') {
      // uppercut: la cabeza sale para arriba, se para en puntas de pie y los brazos se caen
      b.spine.rotation.x = -0.32 * k;
      b.chest.rotation.set(-0.22 * k, 0.12 * k * side, 0);
      b.head.rotation.set(-0.95 * k - wob, 0.1 * k * side, 0.08 * k * side);
      b.hips.position.y += 0.04 * k;
      b.hips.position.z -= 0.08 * k;
      b.ftL.rotation.x += 0.45 * k;
      b.ftR.rotation.x += 0.45 * k;
      b.uaR.rotation.set(0.15 * k, 0, -0.5 * k);
      b.uaL.rotation.set(0.15 * k, 0, 0.5 * k);
      b.faR.rotation.x = -0.15;
      b.faL.rotation.x = -0.15;
    } else if (kind === 'kick') {
      // patada a la panza: se dobla en dos, las manos a la panza, la cadera para atrás
      b.spine.rotation.set(0.6 * k, 0, 0.05 * k * side);
      b.chest.rotation.set(0.32 * k, 0, 0);
      b.head.rotation.set(0.15 * k - wob, 0, 0);
      b.hips.position.z -= 0.14 * k;
      b.hips.position.y -= 0.07 * k;
      b.thR.rotation.x -= 0.3 * k;
      b.thL.rotation.x -= 0.35 * k;
      b.shR.rotation.x += 0.55 * k;
      b.shL.rotation.x += 0.6 * k;
      b.uaR.rotation.set(-0.55 * k, 0.4 * k, 0.25 * k);
      b.uaL.rotation.set(-0.55 * k, -0.4 * k, -0.25 * k);
      b.faR.rotation.x = -0.4 - 1.3 * k;
      b.faL.rotation.x = -0.4 - 1.3 * k;
    } else {
      // directo o cruzado: la cabeza va para atrás (y para el lado de la mano que pegó), medio paso atrás
      const cross = kind === 'cross' ? 1 : 0.45;
      b.spine.rotation.x = -0.22 * k;
      b.chest.rotation.set(-0.12 * k, 0.32 * k * side * cross, 0.12 * k * side * cross);
      b.head.rotation.set(-0.5 * k - wob, (0.48 * k * side + wob * side) * cross, 0.25 * k * side * cross);
      b.hips.position.z -= 0.07 * k;
      b.thR.rotation.x += 0.28 * k;
      b.shR.rotation.x += 0.28 * k;
      b.thL.rotation.x -= 0.08 * k;
      // los brazos se abren un poco para no caerse
      b.uaR.rotation.set(-0.35 * k, 0, -0.38 * k);
      b.uaL.rotation.set(-0.35 * k, 0, 0.38 * k);
      b.faR.rotation.x = -0.2 - 0.55 * k;
      b.faL.rotation.x = -0.2 - 0.55 * k;
    }
    if (t > 0.97) h.hitSide = h.hitKind = null;
    return;
  }
  if (pose === 'block') {
    // ataja el golpe con los antebrazos delante de la cara: el golpe lo empuja un poco y vuelve a la guardia
    stance(h, b, 1);
    const k = t < 0.15 ? outCubic(t / 0.15) : 1 - smooth((t - 0.15) / 0.85) * 0.6;
    b.uaL.rotation.set(-1.35, -0.35, -0.05);
    b.faL.rotation.set(-2.35, 0, 0);
    b.uaR.rotation.set(-1.3, 0.35, 0.05);
    b.faR.rotation.set(-2.35, 0, 0);
    b.head.rotation.x += 0.28;
    b.spine.rotation.x += 0.08 - 0.12 * k;
    b.hips.position.z -= 0.05 * k;
    b.hips.position.y -= 0.03;
    return;
  }
  // ---- armas: apuntado con pitch de la cámara (h.aimPitch, + arriba), retroceso (t) y respiración
  const pitch = Math.max(-0.75, Math.min(0.6, h.aimPitch ?? 0));
  const br = Math.sin(h.phase * 1.3) * 0.012;
  if (pose === 'aim') {
    // pistola a dos manos (isósceles), los brazos a la altura de los ojos; el torso sigue la mira
    const r = t;
    b.spine.rotation.x = 0.1 - pitch * 0.35;
    b.chest.rotation.x = -pitch * 0.45 + br - 0.05 * r;
    b.chest.rotation.y = 0.1 - (h.strafeHip ?? 0);
    b.uaR.rotation.set(-1.52 - pitch * 0.2 - 0.32 * r, 0, 0.12);
    b.faR.rotation.x = -0.05 - 0.2 * r;
    b.uaL.rotation.set(-1.4 - pitch * 0.2 - 0.25 * r, 0, -0.55);
    b.faL.rotation.set(-0.25 - 0.1 * r, 0, 0);
    b.head.rotation.set(0.06 - pitch * 0.2 - 0.04 * r, 0.04, 0.05);
    aimLegs(b, speed);
    return;
  }
  if (pose === 'aimLong') {
    // escopeta o metra al hombro: perfilado, la mejilla sobre la culata, la otra mano adelante
    const r = t;
    b.spine.rotation.x = 0.06 - pitch * 0.35;
    b.chest.rotation.set(-pitch * 0.45 + br - 0.1 * r, 0.35 - (h.strafeHip ?? 0), 0);
    b.uaR.rotation.set(-1.1 - pitch * 0.15 - 0.15 * r, 0, 0.5);
    b.faR.rotation.x = -1.2;
    b.uaL.rotation.set(-1.45 - pitch * 0.2 - 0.2 * r, 0, -0.35);
    b.faL.rotation.x = -0.2;
    b.head.rotation.set(0.1 - pitch * 0.2, -0.22, 0.12);
    b.hips.position.z -= 0.03 * r;
    aimLegs(b, speed);
    return;
  }
  if (pose === 'holdGun') {
    // arma baja lista (el caño al piso, adelante), el otro brazo suelto
    b.uaR.rotation.set(-0.55, 0, 0.08);
    b.faR.rotation.x = -0.75;
    b.chest.rotation.y += 0.05;
  }
}

// apuntando quieto: piernas un poco abiertas y rodillas flojas (caminando quedan las del paso)
function aimLegs(b, speed) {
  const k = 1 - smooth((speed - 0.25) / 0.6);
  if (k <= 0) return;
  b.hips.position.y -= 0.02 * k;
  b.thL.rotation.z += 0.07 * k;
  b.thR.rotation.z -= 0.07 * k;
  b.thL.rotation.x -= 0.1 * k;
  b.shL.rotation.x += 0.12 * k;
  b.shR.rotation.x += 0.12 * k;
  b.thR.rotation.x += 0.08 * k;
}
