// Personas con modelo de artista: los vecinos, la policía y los clientes salen de MakeHuman (CC0,
// makehumancommunity.org): cuerpo, cara, piel, ropa y pelo armados con tools/models/mh (build.py +
// pack.mjs), cada uno con su cara y su ropa (camisetas de Banfield, Temperley, Boca, River…), ~5.000
// triángulos y una textura de 1024. Gaspi también (con la cara de la foto). El SWAT es de Mesh2Motion
// (elbolilloduro, CC0) y Laban, Ciro y las chicas de Quaternius (Ultimate Modular Men y Women, CC0;
// tools/models/quat.mjs).
// Se cargan una vez; cada persona es un clon animado con nuestras poses (src/rig.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { rigHuman } from './rig.js';
import { R } from './rng.js';
import { TOUCH } from './input.js';
import { freeAfterUpload } from './textures.js';
import faceUrl from './gaspi-face.webp';

const SETS = {
  male: ['mh_banfield', 'mh_temperley', 'mh_boca', 'mh_river', 'mh_pibe', 'mh_laburante', 'mh_oficinista', 'mh_gordo', 'mh_flaco', 'mh_musculoso', 'mh_rayado', 'mh_jubilado_old', 'mh_abuelo_old'],
  female: ['mh_f_remera', 'mh_f_short', 'mh_f_deporte', 'mh_f_vestido', 'mh_f_madre', 'mh_f_afro', 'mh_f_abuela_old'],
  police: ['mh_policia', 'mh_policia_f'],
  swat: ['swat_male'],
  // solo para Gaspi, Laban, Ciro y las chicas (makeStar, makeGirl): no salen como vecinos al azar
  stars: ['mh_gaspi', 'q_suit', 'q_beach', 'qf_formal', 'qf_casual'],
};

// Ropa de otro color para cada vecino: se gira el tono de lo que está saturado y no es piel
// (la piel, el pelo oscuro y lo gris quedan como están). Un material por persona, mismo programa.
const TINT_GLSL = /* glsl */ `
vec3 tintHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 tintRgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`;
function tintClothes(material, hue, sat, val) {
  const m = material.clone();
  const at = '#include <map_fragment>';
  m.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(m, shader);
    shader.uniforms.uTint = { value: new THREE.Vector3(hue, sat, val) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\n' + TINT_GLSL)
      .replace(
        at,
        `${at}
        {
          vec3 cs = pow(max(diffuseColor.rgb, 0.0), vec3(0.4545));
          vec3 hsv = tintHsv(cs);
          float skin = (smoothstep(0.0, 0.03, hsv.x) - smoothstep(0.11, 0.15, hsv.x)) * smoothstep(0.12, 0.22, hsv.y) * (1.0 - smoothstep(0.7, 0.85, hsv.y)) * smoothstep(0.2, 0.38, hsv.z);
          float cloth = (1.0 - skin) * smoothstep(0.14, 0.3, hsv.y);
          hsv.x = fract(hsv.x + uTint.x * cloth);
          hsv.y = clamp(hsv.y * mix(1.0, uTint.y, cloth), 0.0, 1.0);
          hsv.z *= mix(1.0, uTint.z, 1.0 - skin);
          diffuseColor.rgb = pow(tintRgb(hsv), vec3(2.2));
        }`,
      );
  };
  m.customProgramCacheKey = () => 'ropa-tenida';
  return m;
}

// Quaternius: cada vértice dice qué es (atributo _part: 2 ropa, 1 piel, 0 pelo y ojos). La ropa
// cambia de color como en tintClothes y la piel toma otro tono (en el original todos son iguales).
const SKIN_TONES = [[1, 1, 1], [0.96, 0.9, 0.84], [0.86, 0.74, 0.62], [0.74, 0.58, 0.45], [0.6, 0.44, 0.33], [0.9, 0.8, 0.7]];
function tintParts(material, hue, sat, val, skin) {
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(m, shader);
    shader.uniforms.uTint = { value: new THREE.Vector3(hue, sat, val) };
    shader.uniforms.uSkin = { value: new THREE.Vector3(...skin) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _part;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = _part;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform vec3 uSkin;\nvarying float vPart;\n' + TINT_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float cloth = step(1.5, vPart);
          float skin = step(0.5, vPart) - cloth;
          vec3 hsv = tintHsv(pow(max(diffuseColor.rgb, 0.0), vec3(0.4545)));
          hsv.x = fract(hsv.x + uTint.x * cloth);
          hsv.y = clamp(hsv.y * mix(1.0, uTint.y, cloth), 0.0, 1.0);
          hsv.z *= mix(1.0, uTint.z, cloth);
          diffuseColor.rgb = pow(tintRgb(hsv), vec3(2.2)) * mix(vec3(1.0), uSkin, skin);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'ropa-partes';
  return m;
}

// MakeHuman (tools/models/mh): _part dice 1 piel, 2 ropa, 3 pelo y cejas, 4 ropa que no cambia de color
// (camisetas de equipo, uniformes), 0 lo demás (ojos, zapatos).
// La piel ya viene con su textura (clara u oscura): acá solo se varía un poco el tono. La ropa cambia
// de color como en tintClothes y el pelo (gris neutro en el atlas, luminancia media 0,18) toma el color
// que le toque: negro, castaño, rubio teñido, canoso…
const MH_SKIN = [[1, 1, 1], [0.97, 0.93, 0.9], [0.93, 0.86, 0.8], [1.02, 0.98, 0.95]];
const MH_HAIR = { negro: [0.025, 0.02, 0.018], oscuro: [0.05, 0.032, 0.022], castano: [0.12, 0.07, 0.04], claro: [0.3, 0.2, 0.11], rubio: [0.55, 0.42, 0.24], colorado: [0.32, 0.1, 0.04], canoso: [0.4, 0.4, 0.4], blanco: [0.75, 0.74, 0.72] };
const MH_HAIR_W = [['negro', 4], ['oscuro', 5], ['castano', 4], ['claro', 1.5], ['rubio', 1], ['colorado', 0.4]];
// allowed: los colores que admite el modelo (userData.hair del glb; p. ej. morochos: negro u oscuro)
function mhHair(old, allowed) {
  if (old && R.chance(0.7)) return MH_HAIR[R.chance(0.5) ? 'canoso' : 'blanco'];
  const list = allowed ? MH_HAIR_W.filter(([k]) => allowed.includes(k)) : MH_HAIR_W;
  let t = Math.random() * list.reduce((a, b) => a + b[1], 0);
  for (const [k, w] of list) if ((t -= w) <= 0) return MH_HAIR[k];
  return MH_HAIR.oscuro;
}
function tintMH(material, hue, sat, val, skin, hair) {
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    THREE.Material.prototype.onBeforeCompile.call(m, shader);
    shader.uniforms.uTint = { value: new THREE.Vector3(hue, sat, val) };
    shader.uniforms.uSkin = { value: new THREE.Vector3(...skin) };
    shader.uniforms.uHair = { value: new THREE.Vector3(...hair) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _part;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = _part;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform vec3 uSkin;\nuniform vec3 uHair;\nvarying float vPart;\n' + TINT_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float hairK = step(2.5, vPart) - step(3.5, vPart);
          float cloth = step(1.5, vPart) - step(2.5, vPart);
          float skin = step(0.5, vPart) - step(1.5, vPart);
          vec3 hsv = tintHsv(pow(max(diffuseColor.rgb, 0.0), vec3(0.4545)));
          hsv.x = fract(hsv.x + uTint.x * cloth);
          hsv.y = clamp(hsv.y * mix(1.0, uTint.y, cloth), 0.0, 1.0);
          hsv.z *= mix(1.0, uTint.z, cloth);
          vec3 c = pow(tintRgb(hsv), vec3(2.2)) * mix(vec3(1.0), uSkin, skin);
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(c, uHair * (lum / 0.18), hairK);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'ropa-mh';
  return m;
}

export const PEOPLE = { ready: false, scenes: {} };

function halve(t) {
  const img = t.image;
  if (!img?.width || img.width <= 512) return;
  const c = document.createElement('canvas');
  c.width = img.width / 2;
  c.height = img.height / 2;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.(); // ImageBitmap: se libera ya
  t.image = c;
  t.needsUpdate = true;
  freeAfterUpload(t);
}

export function loadPeople() {
  const loader = new GLTFLoader();
  const jobs = [];
  for (const [kind, list] of Object.entries(SETS)) {
    for (const f of list) {
      jobs.push(
        loader
          .loadAsync(`models/people/${f}.glb`)
          .then((g) => {
            // en el celular (poca memoria de placa) la textura de los MakeHuman baja de 1024 a 512
            if (TOUCH && /^mh_/.test(f)) g.scene.traverse((o) => o.isMesh && o.material.map && halve(o.material.map));
            // Quaternius: sin normales, se dibuja facetado como el original
            g.scene.traverse((o) => {
              if (o.isMesh && !o.geometry.attributes.normal) {
                o.material.flatShading = true;
                o.material.vertexColors = true;
                o.material.needsUpdate = true;
              }
            });
            (PEOPLE.scenes[kind] ??= []).push({ f, scene: g.scene });
          })
          .catch((e) => console.warn('No cargó', f, e)),
      );
    }
  }
  return Promise.all(jobs).then(() => (PEOPLE.ready = Object.keys(PEOPLE.scenes).length > 0));
}

// una persona nueva del tipo pedido ('male', 'female', 'police'), o null si todavía no cargaron
export function makePerson(kind) {
  const list = PEOPLE.scenes[kind];
  if (!list?.length) return null;
  const s = R.pick(list);
  const female = kind === 'female' || /female|^mh_f_|_f$/.test(s.f);
  // los de MakeHuman ya vienen con su altura (la abuela es bajita, el flaco alto): apenas se varía
  let height = female ? R.range(1.6, 1.7) : R.range(1.7, 1.84);
  if (/^mh_/.test(s.f)) {
    s.h0 ??= new THREE.Box3().setFromObject(s.scene).getSize(new THREE.Vector3()).y;
    height = s.h0 * R.range(0.97, 1.03);
  }
  const h = rigHuman(s.scene, { female, height });
  h.file = s.f; // qué modelo es (para pruebas)
  // los vecinos con ropa de otro color (los uniformes quedan como son)
  if (kind === 'male' || kind === 'female') {
    const hue = R.chance(0.25) ? 0 : Math.random();
    const sat = R.range(0.75, 1.3);
    const val = R.range(0.72, 1.18);
    h.rig.model.traverse((o) => {
      if (!o.isMesh) return;
      if (/^mh_/.test(s.f)) o.material = tintMH(o.material, hue, sat, val, R.pick(MH_SKIN), mhHair(/_old/.test(s.f), s.scene.userData.hair));
      else if (o.geometry.attributes._part) o.material = tintParts(o.material, hue, sat, val, R.pick(SKIN_TONES));
      else if (o.material?.map) o.material = tintClothes(o.material, hue, sat, val);
    });
  }
  return h;
}

// ---------- Gaspi, Laban y Ciro con modelo de artista (Quaternius, CC0) ----------
// La ropa se pinta cambiando los colores de vértice del original (una copia de la geometría por
// personaje: son tres). A Gaspi se le pega la cara de la foto en la cabeza (src/gaspi-face.webp, sacada
// de src/gaspi.webp: enderezada y con borde suave); Laban lleva sombrero y anteojos negros, y Ciro es
// el doble de alto y más ancho de hombros y brazos.
const STARS = {
  // MakeHuman (tools/models/mh, 'mh_gaspi'): traje negro, camisa blanca, corbata roja a rayas y la cara de
  // la foto horneada en la textura de la cabeza (src/gaspi-face.webp)
  gaspi: { file: 'mh_gaspi', height: 1.84, hair: 'oscuro' },
  laban: {
    file: 'q_suit',
    height: 1.8,
    // traje blanco a lo Alan Faena, camisa blanca sin corbata, reloj dorado
    paint: { '9d6b3d': 0xc98e6a, '110702': 0x2b1d14, '040507': 0xf4f2ec, '040404': 0xf4f2ec, '757575': 0xffffff, '11141a': 0xffffff, '0d0d0d': 0xd4af37, '120c09': 0xd4af37 },
    hat: 0xf4f2ec,
    shades: true,
  },
  // en cuero: la musculosa del modelo se pinta color piel
  ciro: { file: 'q_beach', height: 3.5, bulk: 1.25, paint: { '9d6b3d': 0xc68a5e, '4e473a': 0xc68a5e, '110702': 0x1a1410, '340509': 0x151515, '757575': 0x2a2a2a } },
};
const hexAt = (a, i) => [a.getX(i), a.getY(i), a.getZ(i)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const painted = new Map();
const EYES = new Set(['0c0906', '080503']);
const isBrow = (key, pos, i) => key === '110702' && pos.getY(i) < 1.75 && pos.getY(i) > 1.68 && pos.getZ(i) > 0.09 && Math.abs(pos.getX(i)) < 0.11;
function paintGeometry(name, g, paint, brows) {
  if (painted.has(name)) return painted.get(name);
  const out = g.clone();
  const col = out.attributes.color;
  const pos = out.attributes.position; // (clone() ya copió los atributos)
  const c = new THREE.Color();
  if (col) {
    const dst = new THREE.Float32BufferAttribute(new Float32Array(col.count * col.itemSize), col.itemSize);
    for (let i = 0; i < col.count; i++) {
      const key = hexAt(col, i);
      const brow = brows != null && isBrow(key, pos, i);
      const pk = paint[key];
      const hex = brow ? brows : typeof pk === 'function' ? pk(pos.getY(i)) : pk;
      // con la cara de la foto, los ojos y las cejas del modelo se meten adentro de la cabeza
      if (brows != null && (brow || EYES.has(key))) pos.setZ(i, pos.getZ(i) - 0.035);
      if (hex != null) c.setHex(hex);
      else c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      dst.setXYZ(i, c.r, c.g, c.b);
      if (col.itemSize === 4) dst.setW(i, 1);
    }
    out.setAttribute('color', dst);
  }
  painted.set(name, out);
  return out;
}

// piezas pegadas a la cabeza (cara, sombrero, anteojos): se arman en el espacio de la malla del
// original y se pasan al del hueso de la cabeza, así acompañan cualquier pose
function headSpace(source) {
  source.updateMatrixWorld(true);
  let mesh = null;
  let head = null;
  source.traverse((o) => {
    if (o.isSkinnedMesh && !mesh) mesh = o;
    if (o.isBone && /^head$/i.test(o.name)) head = o;
  });
  // lo mismo que hace el skinning con un vértice pegado solo a la cabeza
  const i = mesh.skeleton.bones.findIndex((b) => /^head$/i.test(b.name));
  const toHead = i >= 0 ? mesh.skeleton.boneInverses[i].clone().multiply(mesh.bindMatrix) : head.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  return { mesh, toHead };
}
// la caja de la cara en el modelo (metros del original): la foto se proyecta de frente sobre ella,
// con los ojos en y = 1,70 y el mentón en 1,565 (src/gaspi-face.webp está hecha para esta caja)
const FACE = { x0: -0.13, x1: 0.13, y0: 1.545, y1: 1.835 };
let faceGeo = null;
let faceMat = null;
function faceDecal(source) {
  if (!faceGeo) {
    const { mesh, toHead } = headSpace(source);
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const col = g.attributes.color;
    const idx = g.index;
    const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const n = new THREE.Vector3();
    const e = new THREE.Vector3();
    const tris = idx ? idx.count : pos.count;
    const pick = [];
    const nrm = new Map(); // normal promedio por vértice: el despegue no abre grietas entre triángulos
    for (let t = 0; t < tris; t += 3) {
      const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
      ids.forEach((i, k) => P[k].fromBufferAttribute(pos, i));
      // el frente de la cara (de la frente al mentón), sin el pelo de arriba
      if (P.some((p) => p.y < FACE.y0 || p.y > FACE.y1 || Math.abs(p.x) > FACE.x1 || p.z < 0.06)) continue;
      n.subVectors(P[1], P[0]).cross(e.subVectors(P[2], P[0])).normalize();
      if (n.z < 0.05 || n.y < -0.7) continue;
      if (col && ids.some((i) => hexAt(col, i) === '110702') && P.some((p) => p.y > 1.765)) continue;
      if (col && ids.some((i) => EYES.has(hexAt(col, i)) || isBrow(hexAt(col, i), pos, i))) continue;
      pick.push(ids);
      for (const i of ids) (nrm.get(i) ?? nrm.set(i, new THREE.Vector3()).get(i)).add(n);
    }
    const out = [];
    const uv = [];
    const p = new THREE.Vector3();
    for (const ids of pick) {
      for (const i of ids) {
        p.fromBufferAttribute(pos, i);
        uv.push((p.x - FACE.x0) / (FACE.x1 - FACE.x0), (p.y - FACE.y0) / (FACE.y1 - FACE.y0));
        p.addScaledVector(nrm.get(i).normalize(), 0.0025).applyMatrix4(toHead);
        out.push(p.x, p.y, p.z);
      }
    }
    faceGeo = new THREE.BufferGeometry();
    faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    faceGeo.computeBoundingSphere();
    const map = new THREE.TextureLoader().load(faceUrl);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    faceMat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.82, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const m = new THREE.Mesh(faceGeo, faceMat);
  m.renderOrder = 1;
  return m;
}

// sombrero blanco (copa, cinta y ala) y anteojos negros, en el espacio de la cabeza
const extras = {};
function hatMesh(source, color) {
  if (!extras.hat) {
    const { toHead } = headSpace(source);
    const crown = new THREE.CylinderGeometry(0.098, 0.112, 0.12, 14).translate(0, 1.875, 0.0);
    const brim = new THREE.CylinderGeometry(0.185, 0.19, 0.012, 18).translate(0, 1.818, 0.0);
    const band = new THREE.CylinderGeometry(0.1135, 0.1135, 0.026, 14).translate(0, 1.833, 0.0);
    extras.hat = [crown, brim].map((g) => g.applyMatrix4(toHead));
    extras.band = band.applyMatrix4(toHead);
  }
  const g = new THREE.Group();
  const felt = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  for (const geo of extras.hat) g.add(new THREE.Mesh(geo, felt));
  g.add(new THREE.Mesh(extras.band, new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 })));
  g.traverse((o) => (o.castShadow = !!o.isMesh));
  return g;
}
function shadesMesh(source) {
  if (!extras.shades) {
    const { toHead } = headSpace(source);
    const parts = [-1, 1].map((s) => new THREE.BoxGeometry(0.062, 0.038, 0.012).translate(s * 0.052, 1.704, 0.168));
    parts.push(new THREE.BoxGeometry(0.05, 0.008, 0.008).translate(0, 1.714, 0.17));
    extras.shades = parts.map((g) => g.applyMatrix4(toHead));
  }
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.15, metalness: 0.4 });
  for (const geo of extras.shades) g.add(new THREE.Mesh(geo, m));
  return g;
}

// Gaspi, Laban o Ciro con modelo de artista (null si todavía no cargaron los modelos)
export function makeStar(name) {
  return dress(STARS[name], name);
}
// Las chicas: 'fiesta' (las del Ferrucho de Laban, de vestido) o 'gym' (top y calzas).
// o: { dress | shirt, pants, hair, skin }
export function makeGirl(kind, o = {}) {
  const skin = o.skin ?? 0xd9a07a;
  const st =
    kind === 'fiesta'
      ? { file: 'qf_formal', height: 1.7, female: true, paint: { '9d6b3d': skin, '10230e': o.dress ?? 0xff4fa3, '230401': (y) => (y > 1.3 ? (o.hair ?? 0xc9a15a) : (o.shoes ?? 0xf2f2f2)), '6d3e11': 0xd4af37 } }
      : { file: 'qf_casual', height: 1.68, female: true, paint: { '9d6b3d': skin, '422e10': o.hair ?? 0x2b1d14, '571f0a': o.pants ?? 0x151515, '757575': o.shirt ?? 0xf48fb1, '0d0d0d': 0xf2f2f2 } };
  return dress(st, `${kind}|${skin}|${o.dress}|${o.shirt}|${o.pants}|${o.hair}|${o.shoes}`, 'chica');
}
function dress(st, key, star = key) {
  const s = Object.values(PEOPLE.scenes)
    .flat()
    .find((x) => x.f === st.file);
  if (!s) return null;
  const h = rigHuman(s.scene, { height: st.height, female: !!st.female });
  h.file = st.file;
  h.star = star;
  h.tall = st.height + 0.5; // donde va el globito de lo que dice
  h.rig.model.traverse((o) => {
    if (!o.isMesh) return;
    // los de MakeHuman traen todo en la textura: solo se fija el color del pelo (gris neutro en el atlas)
    if (/^mh_/.test(st.file)) o.material = tintMH(o.material, 0, 1, 1, [1, 1, 1], MH_HAIR[st.hair ?? 'oscuro']);
    else o.geometry = paintGeometry(key, o.geometry, st.paint, st.brows);
  });
  if (st.bulk) {
    h.rig.model.scale.x *= st.bulk;
    h.rig.model.scale.z *= st.bulk;
  }
  const head = h.rig.map.head;
  if (head) {
    if (st.face) head.add(faceDecal(s.scene));
    if (st.hat != null) head.add(hatMesh(s.scene, st.hat));
    if (st.shades) head.add(shadesMesh(s.scene));
  }
  return h;
}

// Cambia el cuerpo de un personaje que ya está en escena por otro: lo colgado de los huesos o de la
// raíz (armas, la barra del gym) pasa al nuevo, que queda en el mismo lugar y con la misma vista.
const OWN = new Set(['root', 'bones', 'mesh', 'rig', 'geos', 'lod', 'keep', 'female', 'phase', 'file', 'star']);
export function swapHuman(oldH, newH) {
  const r0 = oldH.root;
  const r1 = newH.root;
  r1.position.copy(r0.position);
  r1.rotation.copy(r0.rotation);
  r1.visible = r0.visible;
  const own = new Set();
  for (const b of Object.values(oldH.bones)) own.add(b);
  for (const [name, b] of Object.entries(oldH.bones)) {
    const nb = newH.bones[name];
    if (!nb) continue;
    for (const c of [...b.children]) if (!own.has(c)) nb.add(c);
  }
  for (const c of [...r0.children]) if (c !== oldH.mesh && !own.has(c) && !c.isSkinnedMesh) r1.add(c);
  for (const k of Object.keys(oldH)) if (!OWN.has(k) && !(k in newH)) newH[k] = oldH[k];
  r0.parent?.add(r1);
  r0.removeFromParent();
  return newH;
}

// ---------- Animales (CC0, Mesh2Motion: perro y caballo con el esqueleto del zorro) ----------
// Las animaciones (quieto, caminar, correr, sentarse, ladrar, morir) salen de fox-animations.glb,
// recortado con tools/models/anims.mjs. Se reproducen con un AnimationMixer por animal.
export const ANIMALS = { dog: null, horse: null, clips: null };

export function loadAnimals() {
  const loader = new GLTFLoader();
  return Promise.all(['dog', 'horse', 'quadruped-anims'].map((f) => loader.loadAsync(`models/animals/${f}.glb`)))
    .then(([d, h, a]) => {
      ANIMALS.dog = d.scene;
      ANIMALS.horse = h.scene;
      ANIMALS.clips = a.animations;
    })
    .catch((e) => console.warn('No cargaron los animales', e));
}

// Las animaciones vienen del zorro: se sacan las pistas de huesos que el modelo no tiene (la nariz),
// una sola vez por animal, para que three no avise en cada clon.
const CLIPS = {};
function clipFor(kind, name, src) {
  const key = kind + name;
  if (key in CLIPS) return CLIPS[key];
  const c = ANIMALS.clips.find((x) => x.name === name);
  if (!c) return (CLIPS[key] = null);
  const names = new Set();
  src.traverse((o) => names.add(o.name));
  const tracks = c.tracks.filter((t) => names.has(THREE.PropertyBinding.parseTrackName(t.name).nodeName));
  return (CLIPS[key] = new THREE.AnimationClip(c.name, c.duration, tracks));
}

// un animal con su mezclador: { g, mixer, actions, cur }. length: largo del cuerpo en metros.
export function makeAnimal(kind, { length = 0.95, tint = null } = {}) {
  const src = ANIMALS[kind];
  if (!src || !ANIMALS.clips) return null;
  const model = cloneSkinned(src);
  const box = new THREE.Box3().setFromObject(model);
  const k = length / Math.max(0.01, box.max.z - box.min.z, box.max.x - box.min.x);
  const g = new THREE.Group();
  model.scale.setScalar(k);
  model.position.y = -box.min.y * k;
  g.add(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    if (tint != null) {
      o.material = o.material.clone();
      o.material.color.multiply(new THREE.Color(tint));
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [n, clip] of [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run'], ['sit', 'Sit'], ['bark', 'Bark'], ['death', 'Death']]) {
    const c = clipFor(kind, clip, src);
    if (c) actions[n] = mixer.clipAction(c);
  }
  if (actions.death) {
    actions.death.setLoop(THREE.LoopOnce, 1);
    actions.death.clampWhenFinished = true;
  }
  actions.idle?.play();
  return { g, mixer, actions, cur: 'idle' };
}

// cambia de animación con un fundido corto
export function animalPlay(a, name, timeScale = 1) {
  const next = a.actions[name];
  if (!next) return;
  next.timeScale = timeScale;
  if (a.cur === name) return;
  next.reset().fadeIn(0.25).play();
  a.actions[a.cur]?.fadeOut(0.25);
  a.cur = name;
}
