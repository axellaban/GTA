// Mobiliario de la calle hecho en Blender (tools/blender/mobiliario.py): el semáforo con viseras y placa
// de contraste, el refugio de colectivo, el contenedor de basura y el tanque de agua de los techos con su
// base. src/props.js y src/city.js arman las piezas simples de siempre (instancias, en los mismos marcos)
// y cuando carga el modelo se les cambia la geometría.
import { swapGeometry, loadBlenderMeshes } from './blender.js';

let kit = null;
function streetKit() {
  kit ??= loadBlenderMeshes('models/street/mobiliario.glb').catch((e) => {
    console.warn('mobiliario de Blender:', e.message);
    return {};
  });
  return kit;
}

// cambia la geometría de `mesh` por la pieza `name` del kit cuando carga (white: el color pasa a los
// vértices y el material queda blanco)
export function useStreetKit(mesh, name, opts) {
  streetKit().then((geo) => {
    if (geo[name]) swapGeometry(mesh, geo[name], opts);
  });
}
