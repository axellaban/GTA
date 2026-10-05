// Apuntar y disparar son acciones independientes. En táctil, apuntar se activa con un toque.
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

export function updateAimHud(player, weapon, { crosshair, button }, blocked = false) {
  const available = canAim(player, weapon, blocked);
  crosshair.hidden = !((available && player.aiming) || (player.ufo && !player.dead));
  button.hidden = !available;
  button.setAttribute('aria-pressed', String(available && !!player.aiming));
  button.classList.toggle('active', available && !!player.aiming);
}
