import { allVehicles, vehicleBody } from './vehicle-physics.js';
import { cameraInsidePlayer } from './camera-safe.js';

// También cuenta el plano cercano: el ojo puede estar afuera y la chapa tapar todo.
export function cameraInsideVehicle(p, vehicle, margin = 0.4) {
  const b = vehicleBody(vehicle);
  const x = p.x - b.x, z = p.z - b.z;
  return p.y >= b.low - margin && p.y <= b.high + margin &&
    Math.abs(x * b.rx + z * b.rz) <= b.hw + margin &&
    Math.abs(x * b.fx + z * b.fz) <= b.hl + margin;
}

// Una pared puede forzar la cámara dentro de un vehículo. Sólo se oculta en este
// cuadro; sigue chocando y vuelve a aparecer apenas el plano cercano queda afuera.
export function renderGameView(world, render) {
  const hidden = [];
  const hide = (object) => {
    if (!object?.visible) return;
    hidden.push(object);
    object.visible = false;
  };
  const { camera, player } = world;
  const margin = camera.near + 0.1;
  if (cameraInsidePlayer(camera.position, player)) hide(player.h.root);
  for (const v of allVehicles(world)) {
    if (cameraInsideVehicle(camera.position, v, margin)) hide(v.mesh);
  }
  try {
    return render();
  } finally {
    // Un error de render tampoco puede dejar a Gaspi o un auto invisible.
    for (const object of hidden) object.visible = true;
  }
}
