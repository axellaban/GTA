// Corrige el punto final, también después del suavizado de cámara y del temblor.
export function safeCamera(a, p, colliders, heightAt, margin = 0.4) {
  const k = colliders.cameraFraction(a, p, margin);
  p.x = a.x + (p.x - a.x) * k;
  p.y = a.y + (p.y - a.y) * k;
  p.z = a.z + (p.z - a.z) * k;
  p.y = Math.max(p.y, heightAt(p.x, p.z) + margin);
  return p;
}

// El plano cercano dentro del torso no debe llenar la pantalla con la espalda.
export function cameraInsidePlayer(camera, player) {
  return !player.vehicle && !player.ufo &&
    Math.hypot(camera.x - player.x, camera.z - player.z) < 0.9 &&
    camera.y > player.y - 0.3 && camera.y < player.y + 2.2;
}
