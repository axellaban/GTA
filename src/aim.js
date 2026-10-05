// Apuntar y disparar son acciones independientes. En táctil, apuntar se activa con un toque.
import * as THREE from 'three';

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

export function updateAiming(player, input, weapon, blocked = false) {
  if (!canAim(player, weapon, blocked)) input.aimToggled = false;
  else if (input.hit('aim')) input.aimToggled = !input.aimToggled;
  player.aiming = canAim(player, weapon, blocked) && (input.down('mouse2') || !!input.aimToggled);
}

export function shotSpread(player, weapon) {
  return weapon.spread * (player.aiming ? 0.5 : 1) *
    (player.speed > 3 ? 2 : 1) * (weapon.heavy && player.speed > 1 ? 1.5 : 1);
}

export function updateAimHud(player, weapon, { crosshair, button, hitmark }, blocked = false) {
  const available = canAim(player, weapon, blocked);
  const flying = !!player.ufo && !player.dead;
  crosshair.hidden = !((available && player.aiming) || flying);
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
