// Kit de los andenes hecho en Blender (tools/blender/anden.py): columna de hierro fundido con
// ménsulas, puntilla de madera del borde del techo y el relieve de la chapa acanalada.
// La estación se arma igual sin esto (columnas lisas, tabla lisa, chapa plana); cuando el kit carga,
// las geometrías se cambian en el lugar, porque los pedazos de src/chunks.js las comparten.
import * as THREE from 'three';
import { swapGeometry, loadBlenderMeshes } from './blender.js';

// el techo repite la textura cada 4 m (uv de `flat` en city.js) y el relieve de la chapa, cada 1 m
const ROOF_UV_METERS = 4;

export function loadStationKit({ columns, valance, roof }) {
  loadBlenderMeshes('models/station/anden.glb')
    .then((geo) => {
      // la columna viene con el origen en la base; las instancias están paradas a media altura (y 3,0)
      if (geo.columna) swapGeometry(columns, geo.columna.clone().translate(0, -1.9, 0));
      if (geo.puntilla) swapGeometry(valance, geo.puntilla);
    })
    .catch((e) => console.warn('kit de andenes:', e.message));
  new THREE.TextureLoader()
    .loadAsync('textures/chapa_normal.webp')
    .then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(ROOF_UV_METERS, ROOF_UV_METERS);
      t.anisotropy = 4;
      roof.normalMap = t;
      roof.needsUpdate = true;
    })
    .catch((e) => console.warn('chapa del techo:', e.message));
}
