// Marcos de ventanas y puertas hechos en Blender (tools/blender/aberturas.py): alféizar con goterón,
// guardapolvo con gola, jambas molduradas, umbral de granito y persianas de enrollar a medio bajar (con
// las tablillas renderizadas en Cycles). addFrames (src/city.js) anota cada pieza en la medida de la
// abertura pintada en la fachada; son instancias estiradas a lo largo (el perfil no cambia, así que no se
// deforma). Arrancan como las cajas de antes y cuando carga el modelo se les cambia la geometría.
import * as THREE from 'three';
import { swapGeometry, loadBlenderMeshes } from './blender.js';

// las cajas de antes, en el marco de cada pieza (hasta que carga el modelo)
const BOXES = {
  alfeizar: () => new THREE.BoxGeometry(1, 0.07, 0.17).translate(0, -0.035, 0.085),
  dintel: () => new THREE.BoxGeometry(1, 0.1, 0.09).translate(0, 0.05, 0.045),
  jamba: () => new THREE.BoxGeometry(0.06, 1, 0.05).translate(0, 0.5, 0.025),
  umbral: () => new THREE.BoxGeometry(1, 0.12, 0.4).translate(0, 0.06, 0.2),
  // (la persiana es nueva: no se ve hasta que carga)
  persiana: () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3)),
};
// persianas de PVC blancas o grises, de madera y alguna verde
export const SHUTTERS = [0xf2f0ea, 0xf2f0ea, 0xd4d6d8, 0xc9b28c, 0x8a6240, 0x5f8a62].map((c) => new THREE.Color(c));

// interiores de los locales (tools/blender/locales.py), con "interior mapping": el vidrio no tiene el local
// dibujado; el shader sigue la mirada hacia adentro hasta el piso, el cielorraso o la pared del fondo de un
// cuarto que se repite cada W metros a lo largo de la vidriera y busca ese punto en una foto de Blender
// sacada desde CAM metros delante del vidrio (la misma proyección). Los muebles van en otra foto, en un
// plano a YF metros, espejados uno sí y uno no. Así el local tiene fondo y se mueve con la perspectiva al
// pasar caminando o en auto. Atlas de 4x2: arriba los cuartos, abajo los muebles (con alfa); columnas:
// almacén, farmacia, ropa y panadería, según el rubro del cartel (las medidas, las mismas que en Blender)
const ROOM = { W: 3, H: 3, D: 5, CAM: 4, YF: 1, M: 1.06 };
const INTERIOR = [
  [/FARMACIA|ÓPTICA|VETERINARIA|LABORATORIO/i, 1],
  [/ZAPATER|MERCER|ROPA|LIBRER|CELULAR|COTILL|LENCER|DEPORT/i, 2],
  [/PANADER|ROTISER|PIZZER|EMPANADA|HELADER|FIAMBRER|CARNICER|VERDULER|DIETÉTICA|CONFITER|PASTA/i, 3],
];
export function interiorFor(name) {
  for (const [re, k] of INTERIOR) if (name && re.test(name)) return k;
  return 0;
}
const f = (v, n = 3) => v.toFixed(n);
const ROOM_GLSL = /* glsl */ `
#ifdef USE_EMISSIVEMAP
{
  // la mirada dentro del local (x a lo largo de la vidriera, y hacia el fondo, z para arriba) desde el punto
  // del vidrio (uv: metros desde el medio de la vidriera y altura sobre el piso): dónde pega primero
  const vec3 RS = vec3(${f(ROOM.W)}, ${f(ROOM.D)}, ${f(ROOM.H)});
  const vec2 CELL = vec2(0.25, 0.5);
  // (redondeados: interpolados pueden llegar como 0,99999 y el espejado salía salpicado)
  float rVar = floor(vRoomVar.x + 0.5);
  float rFlip = floor(vRoomVar.y + 0.5);
  vec3 rRay = vRoomRay;
  rRay.y = max(rRay.y, 1e-3);
  vec3 rP0 = vec3(vEmissiveMapUv.x, 0.0, vEmissiveMapUv.y);
  float rTz = rRay.z < 0.0 ? -rP0.z / rRay.z : (RS.z - rP0.z) / max(rRay.z, 1e-4);
  float rT = min(RS.y / rRay.y, rTz);
  vec3 rP = rP0 + rRay * rT;
  // el cuarto: la proyección de la cámara de Blender, repetido cada W metros
  float rS = ${f(ROOM.CAM)} / (${f(ROOM.CAM)} + rP.y) / ${f(ROOM.M)};
  float rK = floor(rP.x / RS.x + 0.5);
  vec2 rL = vec2(rP.x / RS.x - rK, rP.z / RS.z - 0.5);
  // (los gradientes, sin el salto de cada repetición: si no, queda una raya en la costura)
  vec2 rDx = (dFdx(rP.xz) / RS.xz * rS + rL * dFdx(rS)) * CELL;
  vec2 rDy = (dFdy(rP.xz) / RS.xz * rS + rL * dFdy(rS)) * CELL;
  vec3 rCol = textureGrad(emissiveMap, (vec2(rVar, 1.0) + 0.5 + rL * rS) * CELL, rDx, rDy).rgb;
  // los muebles, en su plano: solo si la mirada llega antes de pegar en el piso
  float rTf = ${f(ROOM.YF)} / rRay.y;
  vec3 rPf = rP0 + rRay * rTf;
  float rKf = floor(rPf.x / RS.x + 0.5);
  float rFl = mod(rKf + rFlip, 2.0) > 0.5 ? -1.0 : 1.0;
  const float SF = ${f(ROOM.CAM / (ROOM.CAM + ROOM.YF) / ROOM.M, 5)};
  vec2 rLf = vec2((rPf.x / RS.x - rKf) * rFl, rPf.z / RS.z - 0.5);
  vec4 rFur = textureGrad(emissiveMap, (vec2(rVar, 0.0) + 0.5 + rLf * SF) * CELL, dFdx(rPf.xz) / RS.xz * SF * CELL, dFdy(rPf.xz) / RS.xz * SF * CELL);
  totalEmissiveRadiance *= mix(rCol, rFur.rgb, rFur.a * step(rTf, rT));
}
#endif
`;

export class OpeningKit {
  constructor() {
    this.at = {};
    for (const k of Object.keys(BOXES)) this.at[k] = [];
    // vidrieras: posición, normal, uv (metros en el local) y qué local (rubro, espejado y dirección)
    this.shopPos = [];
    this.shopNor = [];
    this.shopUv = [];
    this.shopRoom = [];
    this.shopVariant = 0;
  }

  // la vidriera de (x0, z0) a (x1, z1), del borde de abajo `bot` al de la persiana `top`, apenas delante de
  // la fachada (nx, nz: hacia afuera); `floor`: la altura del piso del local
  shop(x0, z0, x1, z1, bot, top, floor, nx, nz) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.2 || top - bot < 0.05) return;
    const o = 0.015;
    const ax = x0 + nx * o;
    const az = z0 + nz * o;
    const bx = x1 + nx * o;
    const bz = z1 + nz * o;
    this.shopPos.push(ax, bot, az, bx, bot, bz, bx, top, bz, ax, bot, az, bx, top, bz, ax, top, az);
    const h0 = bot - floor;
    const h1 = top - floor;
    this.shopUv.push(-L / 2, h0, L / 2, h0, L / 2, h1, -L / 2, h0, L / 2, h1, -L / 2, h1);
    // los muebles arrancan derechos o espejados, según el local (así no son todos iguales)
    const flip = Math.abs(Math.round(x0 * 3.1 + z0 * 1.7)) % 2;
    for (let k = 0; k < 6; k++) {
      this.shopNor.push(nx, 0, nz);
      this.shopRoom.push(this.shopVariant, flip, (x1 - x0) / L, (z1 - z0) / L);
    }
  }

  // el vidrio no tiene color propio: refleja el cielo (más de costado) y el local va como emisión, que tiene
  // su propia luz de tubo; de noche se ve más (nightOf: de dónde sacar el brillo de la noche)
  buildShops(nightOf) {
    if (!this.shopPos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.shopPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.shopNor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.shopUv, 2));
    g.setAttribute('room', new THREE.Float32BufferAttribute(this.shopRoom, 4));
    const mat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.05,
      metalness: 0,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      // (un poco adelante de la fachada: de lejos no titila contra la vidriera pintada)
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 room;\nvarying vec3 vRoomRay;\nvarying vec2 vRoomVar;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          // la mirada en el marco del local: a lo largo de la vidriera (room.zw), hacia adentro y para arriba
          vec3 roomRay = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;
          vRoomRay = vec3(dot(roomRay.xz, room.zw), dot(roomRay.xz, vec2(room.w, -room.z)), roomRay.y);
          vRoomVar = room.xy;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRoomRay;\nvarying vec2 vRoomVar;')
        .replace('#include <emissivemap_fragment>', ROOM_GLSL);
    };
    mat.onBeforeRender = () => {
      mat.emissiveIntensity = 0.42 + nightOf() * 0.45;
    };
    const m = new THREE.Mesh(g, mat);
    m.name = 'vidrieras';
    m.visible = false;
    m.receiveShadow = true;
    new THREE.TextureLoader()
      .loadAsync('textures/locales.webp')
      .then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        mat.emissiveMap = t;
        mat.needsUpdate = true;
        m.visible = true;
      })
      .catch((e) => console.warn('interiores de los locales:', e.message));
    return m;
  }

  // pieza `name` con el origen en (x, y, z), girada `rot` (+z hacia afuera de la pared) y estirada
  put(name, x, y, z, rot, sx, sy, sz, color) {
    this.at[name].push([x, y, z, rot, sx, sy, sz, color]);
  }

  build() {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const meshes = {};
    for (const [name, list] of Object.entries(this.at)) {
      if (!list.length) continue;
      const mat = new THREE.MeshLambertMaterial();
      const m = new THREE.InstancedMesh(BOXES[name](), mat, list.length);
      list.forEach(([x, y, z, rot, sx, sy, sz, c], i) => {
        m.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), s.set(sx, sy, sz)));
        m.setColorAt(i, col.set(c));
      });
      m.castShadow = name !== 'persiana' && name !== 'jamba';
      m.receiveShadow = true;
      m.name = `aberturas-${name}`;
      // se apagan de lejos, de a cuadrados de 160 m (src/chunks.js)
      m.userData.cell = 160;
      meshes[name] = m;
    }
    Promise.all([loadBlenderMeshes('models/houses/aberturas.glb'), new THREE.TextureLoader().loadAsync('textures/persiana.webp')])
      .then(([geo, slats]) => {
        for (const [name, m] of Object.entries(meshes)) if (geo[name]) swapGeometry(m, geo[name]);
        if (meshes.persiana) {
          slats.colorSpace = THREE.SRGBColorSpace;
          // las coordenadas del glTF ya vienen con la v para abajo
          slats.flipY = false;
          slats.anisotropy = 4;
          meshes.persiana.material.map = slats;
          meshes.persiana.material.needsUpdate = true;
        }
      })
      .catch((e) => console.warn('aberturas de Blender:', e.message));
    return Object.values(meshes);
  }
}
