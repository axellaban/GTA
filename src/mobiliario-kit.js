// Mobiliario de la calle hecho en Blender (tools/blender/mobiliario.py): el semáforo con viseras y placa
// de contraste, el refugio de colectivo, el contenedor de basura y el tanque de agua de los techos con su
// base. src/props.js y src/city.js arman las piezas simples de siempre (instancias, en los mismos marcos)
// y cuando carga el modelo se les cambia la geometría.
import * as THREE from 'three';
import { swapGeometry, loadBlenderMeshes, denseAlpha } from './blender.js';

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

// el canasto de basura elevado (tools/blender/canasto.py): la malla de metal desplegado (con su textura,
// recortada) y el marco con el caño; las dos instancias tienen que estar en el mismo marco (el centro del
// canasto)
export function useBasketKit(basket, post) {
  Promise.all([loadBlenderMeshes('models/street/canasto.glb'), new THREE.TextureLoader().loadAsync('textures/canasto.webp')])
    .then(([geo, tex]) => {
      if (!geo.canasto_malla || !geo.canasto_marco) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      // las coordenadas del glTF ya vienen con la v para abajo
      tex.flipY = false;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      const old = basket.material.map;
      basket.material.map = tex;
      // (los alambres son finitos: sin esto, a unos metros la malla desaparecía y quedaba solo el marco)
      denseAlpha(basket.material, 0.45);
      old?.dispose();
      swapGeometry(basket, geo.canasto_malla);
      swapGeometry(post, geo.canasto_marco, { white: true });
    })
    .catch((e) => console.warn('canasto de Blender:', e.message));
}
