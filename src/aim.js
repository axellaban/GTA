// Apuntar y disparar son acciones independientes. En táctil, apuntar se activa con un toque.
import * as THREE from 'three';
import { updateMira } from './mira.js';

// en el helicóptero y el plato volador la mira no va en el centro (ahí está la nave): va más arriba, como en
// los GTA, y los tiros salen por ese punto de la pantalla (x, y: de 0 a 1 desde arriba a la izquierda)
export const FLY_AIM = { x: 0.5, y: 0.36 };
const ndc = new THREE.Vector3();
export function flyAimDir(camera, out) {
  ndc.set(FLY_AIM.x * 2 - 1, 1 - FLY_AIM.y * 2, 0.5).unproject(camera);
  return out.copy(ndc).sub(camera.position).normalize();
}
export function canAim(player, weapon, blocked = false) {
  return !!weapon.gun && !blocked && !player.vehicle && !player.riding && !player.ufo && !player.dead &&
    !player.jack && !player.exitAnim && !player.auto && !player.cutscene &&
    !(player.downT > 0) && !(player.getupT > 0) && !(player.busted > 0);
}

// tirar desde el auto o la moto (drive-by, como en los GTA): con las armas de una mano o la tumbera, sentado
export function canDriveBy(player, weapon) {
  const v = player.vehicle;
  return !!weapon.gun && !weapon.heavy && !weapon.rocket && !weapon.flame && !!v && (v.kind === 'car' || v.kind === 'moto') &&
    !player.subida && !player.exitAnim && !player.dead && !player.jack && !v.rollover && !v.overturned && !v.wreck;
}

export function updateAiming(player, input, weapon, blocked = false) {
  const can = canAim(player, weapon, blocked) || (!blocked && canDriveBy(player, weapon));
  if (!can) input.aimToggled = false;
  else if (input.hit('aim')) input.aimToggled = !input.aimToggled;
  player.aiming = can && (input.down('mouse2') || !!input.aimToggled);
}

// cuánto se abre el tiro: apuntando se cierra; corriendo, con un arma pesada, después de varios tiros
// seguidos (bloom) o desde un auto en movimiento se abre; agachado se cierra más
export function shotSpread(player, weapon) {
  const sp = player.vehicle ? Math.abs(player.vehicle.speed) : player.speed;
  return weapon.spread * (player.aiming ? 0.5 : 1) *
    (sp > 3 ? (player.vehicle ? 1.6 : 2) : 1) * (weapon.heavy && sp > 1 ? 1.5 : 1) *
    (1 + (player.bloom || 0) * 0.6) * (player.crouch ? 0.6 : 1);
}

export function updateAimHud(player, weapon, { crosshair, button, hitmark }, blocked = false) {
  const available = canAim(player, weapon, blocked);
  const flying = !!player.ufo && !player.dead;
  const drive = !blocked && canDriveBy(player, weapon);
  crosshair.hidden = !(((available || drive) && player.aiming) || flying);
  if (!crosshair.hidden) updateMira(crosshair, player, flying ? 0 : shotSpread(player, weapon), flying);
  // volando, la mira (y la marca del impacto) arriba de la nave
  const left = flying ? `${FLY_AIM.x * 100}%` : '';
  const top = flying ? `${FLY_AIM.y * 100}%` : '';
  for (const el of [crosshair, hitmark]) {
    if (el?.style && el.style.top !== top) {
      el.style.left = left;
      el.style.top = top;
    }
  }
  button.hidden = !available;
  button.setAttribute('aria-pressed', String(available && !!player.aiming));
  button.classList.toggle('active', available && !!player.aiming);
}
