// Mobiliario de la calle hecho en Blender (tools/blender/mobiliario.py): el semáforo con viseras y placa
// de contraste, el refugio de colectivo y el contenedor de basura. src/props.js arma las piezas de cajas
// de siempre (instancias, en los mismos marcos) y cuando carga el modelo se les cambia la geometría.
import { swapGeometry, loadBlenderMeshes } from './blender.js';

let kit = null;
function streetKit() {
  kit ??= loadBlenderMeshes('models/street/mobiliario.glb').catch((e) => {
    console.warn('mobiliario de Blender:', e.message);
    return {};
  });
  return kit;
}

// cambia la geometría de `mesh` por la pieza `name` del kit cuando carga
export function useStreetKit(mesh, name) {
  streetKit().then((geo) => {
    if (geo[name]) swapGeometry(mesh, geo[name]);
  });
}
