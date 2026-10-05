// Matas de pasto y yuyos en los terrenos, los jardines y las plazas (las matas se modelaron y renderizaron
// en Blender: tools/blender/pasto.py). En todo el mapa hay ~0,8 km² de pasto: en vez de plantar cientos
// de miles de matas, hay unas pocas miles que se reacomodan alrededor de la cámara cuando se mueve, sobre
// una máscara de dónde hay pasto (las manzanas, menos veredas, edificios, senderos y andenes). En el borde
// del círculo se achican hasta desaparecer, así no se ve cuándo aparecen.
import * as THREE from 'three';
import { DATA as D, X0, Z0, X1, Z1 } from './map.js';
import { ATMO } from './atmosphere.js';
import { denseAlpha } from './blender.js';

const RES = 1.25; // la máscara, de a 1,25 m
const R = 44; // radio con matas
const STEP = 1.15; // grilla de lugares posibles (con un corrimiento al azar en cada uno)
const MOVE = 5; // cada cuántos metros de la cámara se reacomodan
const MAX = 1800; // matas por variante, como mucho
// variantes del atlas: pasto, yuyos con flores, pasto seco alto, trébol (y cuánto sale cada una: en los
// terrenos y jardines, y en las plazas, que están cortadas)
const WEIGHTS = [
  [0.42, 0.2, 0.2, 0.18],
  [0.6, 0.14, 0.03, 0.23],
];
const MOWED = new Set(['park', 'pitch', 'playground', 'grass', 'school', 'college']);
const TINTS = [[0.95, 1.05, 0.9], [1, 1, 1], [1.05, 1.02, 0.92], [0.9, 1, 0.95], [1.1, 1.05, 0.85]];

function buildMask() {
  const NX = Math.ceil((X1 - X0) / RES);
  const NZ = Math.ceil((Z1 - Z0) / RES);
  const mask = new Uint8Array(NX * NZ);
  const c = document.createElement('canvas');
  const BAND = 256;
  c.width = NX;
  c.height = BAND;
  const g = c.getContext('2d', { willReadFrequently: true });
  const poly = (rings) => {
    g.beginPath();
    for (const r of rings) {
      r.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
      g.closePath();
    }
    g.fill('evenodd');
  };
  // de a bandas de filas (un lienzo del mapa entero pesaría ~10 MB)
  for (let j0 = 0; j0 < NZ; j0 += BAND) {
    const rows = Math.min(BAND, NZ - j0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, NX, BAND);
    g.setTransform(1 / RES, 0, 0, 1 / RES, -X0 / RES, -Z0 / RES - j0);
    g.fillStyle = '#fff';
    for (const b of D.blocks) poly(b);
    // las plazas, canchas y patios de escuela, que están cortados (en la máscara, un 2); las obras y los
    // terrenos del ferrocarril quedan como baldíos
    g.fillStyle = '#808080';
    for (const p of D.parks) if (MOWED.has(p.c)) poly(p.r[0]);
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    for (const s of D.sidewalks) poly(s);
    for (const p of D.platforms) poly(p);
    if (D.yard) for (const y of D.yard) poly(y);
    // los edificios, con medio metro de margen (que no asomen matas por las paredes)
    g.lineWidth = 1.2;
    for (const b of D.buildings) {
      poly([b.r]);
      g.stroke();
    }
    g.lineJoin = 'round';
    for (const p of D.paths) {
      g.lineWidth = p.w + 0.8;
      g.beginPath();
      p.p.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
      g.stroke();
    }
    const data = g.getImageData(0, 0, NX, rows).data;
    for (let i = 0; i < NX * rows; i++) mask[j0 * NX + i] = data[i * 4] > 192 ? 1 : data[i * 4] > 64 ? 2 : 0;
  }
  c.width = c.height = 1;
  return { mask, NX, NZ };
}

// hash entero → [0, 1)
function hash(i, j, k = 0) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// dos tarjetas cruzadas de 0,8 x 0,8 m con la base en el piso; la uv en el cuarto `v` del atlas; las
// normales para arriba (la luz es la del piso: sin caras oscuras)
function cards(v) {
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  const W = 0.4;
  const H = 0.8;
  for (const a of [0, Math.PI / 2]) {
    const cx = Math.cos(a) * W;
    const cz = Math.sin(a) * W;
    const b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, H, cz, -cx, H, -cz);
    const u0 = v / 4 + 0.002;
    const u1 = (v + 1) / 4 - 0.002;
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Grass {
  constructor(scene, heightAt) {
    this.heightAt = heightAt;
    this.center = new THREE.Vector2(1e9, 1e9);
    this.meshes = [];
    this.ready = false;
    new THREE.TextureLoader()
      .loadAsync('textures/pasto_matas.webp')
      .then((tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.windT = ATMO.windT;
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float windT;').replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            {
              vec3 wp = instanceMatrix[3].xyz;
              float ph = wp.x * 0.37 + wp.z * 0.29 + windT * 2.2;
              float hk = position.y * position.y;
              transformed.x += (sin(ph) * 0.7 + sin(ph * 2.3 + wp.z) * 0.3) * 0.16 * hk;
              transformed.z += cos(ph * 1.3) * 0.12 * hk;
            }`,
          );
          // las dos caras con la normal para arriba (como las hojas de los árboles)
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif');
        };
        mat.customProgramCacheKey = () => 'matas';
        // de lejos, que las hojitas no se raleen (src/blender.js)
        denseAlpha(mat, 0.35);
        this.grid = buildMask();
        for (let v = 0; v < 4; v++) {
          const m = new THREE.InstancedMesh(cards(v), mat, MAX);
          m.count = 0;
          m.frustumCulled = false;
          m.receiveShadow = true;
          m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
          m.userData.noChunk = true;
          scene.add(m);
          this.meshes.push(m);
        }
        this.ready = true;
      })
      .catch((e) => console.warn('matas de pasto:', e.message));
  }

  // 0: sin pasto, 1: terreno o jardín, 2: plaza
  grassAt(x, z) {
    const { mask, NX, NZ } = this.grid;
    const i = Math.floor((x - X0) / RES);
    const j = Math.floor((z - Z0) / RES);
    return i >= 0 && j >= 0 && i < NX && j < NZ ? mask[j * NX + i] : 0;
  }

  update(cam) {
    if (!this.ready || Math.hypot(cam.x - this.center.x, cam.z - this.center.y) < MOVE) return;
    this.center.set(cam.x, cam.z);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const n = [0, 0, 0, 0];
    const i0 = Math.floor((cam.x - R) / STEP);
    const i1 = Math.ceil((cam.x + R) / STEP);
    const j0 = Math.floor((cam.z - R) / STEP);
    const j1 = Math.ceil((cam.z + R) / STEP);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + hash(i, j, 1)) * STEP;
        const z = (j + hash(i, j, 2)) * STEP;
        const d = Math.hypot(x - cam.x, z - cam.z);
        if (d > R || hash(i, j, 3) < 0.25) continue;
        const kind = this.grassAt(x, z);
        if (!kind) continue;
        const y = this.heightAt(x, z);
        if (Math.abs(y - 0.15) > 0.05) continue;
        const w = WEIGHTS[kind - 1];
        let r = hash(i, j, 4);
        let v = 0;
        while (v < 3 && r > w[v]) r -= w[v++];
        if (n[v] >= MAX) continue;
        // en el borde del círculo se achican hasta desaparecer
        const fade = Math.min(1, (R - d) / 10);
        const k = (0.7 + hash(i, j, 5) * 0.6) * fade;
        const mesh = this.meshes[v];
        mesh.setMatrixAt(n[v], m4.compose(p.set(x, y - 0.01, z), q.setFromAxisAngle(up, hash(i, j, 6) * Math.PI), s.set(k, k * (0.85 + hash(i, j, 7) * 0.3), k)));
        const t = TINTS[Math.floor(hash(i, j, 8) * TINTS.length)];
        mesh.setColorAt(n[v], col.setRGB(t[0], t[1], t[2]));
        n[v]++;
      }
    }
    this.meshes.forEach((m, v) => {
      m.count = n[v];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    });
  }
}
