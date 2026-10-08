// Lo que arrastra el agua cuando se inunda (modelado en Blender: tools/blender/flotantes.py): botellas,
// bolsas, bandejas de telgopor, latas, ramas, ojotas, bidones, cajas, una pelota, gomas, pallets, una
// conservadora y la silla de plástico del patio. Flotan alrededor de la cámara, se mecen con las ondas,
// los lleva la corriente, se frenan contra los cordones y las paredes, y Gaspi los corre al pasar.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// pieza: [peso (cuántas salen), profundidad mínima para flotar (m), cuánto se mece]
const KINDS = {
  botella: [18, 0.08, 1],
  bolsa: [13, 0.06, 1.2],
  telgopor: [9, 0.05, 1.2],
  lata: [9, 0.06, 1],
  rama: [10, 0.12, 0.6],
  ojota: [6, 0.05, 1.1],
  bidon: [6, 0.2, 0.8],
  caja: [6, 0.12, 0.6],
  pelota: [4, 0.1, 1.3],
  cubierta: [5, 0.3, 0.5],
  pallet: [3, 0.25, 0.4],
  conservadora: [4, 0.25, 0.7],
  silla: [4, 0.4, 0.6],
};
const MAX = 80;

export class Flotantes {
  constructor(scene, agua) {
    this.scene = scene;
    this.agua = agua;
    this.items = [];
    this.meshes = {};
    this.ready = false;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    const kinds = Object.keys(KINDS);
    const total = kinds.reduce((a, k) => a + KINDS[k][0], 0);
    this.bag = [];
    for (const k of kinds) for (let i = 0; i < Math.round((KINDS[k][0] / total) * 60); i++) this.bag.push(k);
    new GLTFLoader()
      .loadAsync('models/agua/flotantes.glb')
      .then((g) => this.build(g))
      .catch((e) => console.warn('flotantes.glb:', e));
  }

  build(gltf) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !KINDS[o.name]) return;
      const cap = Math.ceil((KINDS[o.name][0] / 100) * MAX * 1.6) + 2;
      const im = new THREE.InstancedMesh(o.geometry, mat, cap);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = o.name === 'pallet' || o.name === 'silla' || o.name === 'cubierta' || o.name === 'conservadora';
      im.receiveShadow = true;
      im.cap = cap;
      this.scene.add(im);
      this.meshes[o.name] = im;
    });
    this.ready = true;
  }

  // un lugar con agua alrededor de la cámara (lejos de la vista directa si ya estaba jugando)
  spawn(it, cx, cz, r0, r1) {
    const ag = this.agua;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = r0 + Math.random() * (r1 - r0);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (ag.depth(x, z) < KINDS[it.kind][1] + 0.03) continue;
      it.x = x;
      it.z = z;
      it.yaw = Math.random() * Math.PI * 2;
      it.spin = (Math.random() - 0.5) * 0.3;
      it.ph = Math.random() * 10;
      it.vx = it.vz = 0;
      it.on = true;
      return true;
    }
    it.on = false;
    return false;
  }

  update(dt, world, camera) {
    const ag = this.agua;
    if (!this.ready) return;
    const wet = ag.level > -5.9 && !world.inside;
    if (!wet) {
      if (this.items.length) {
        for (const im of Object.values(this.meshes)) im.count = 0;
        this.items.length = 0;
      }
      return;
    }
    const cx = camera.position.x;
    const cz = camera.position.z;
    // cuántas según cuánta agua hay: con un charco en el bajo nivel, pocas; con la calle inundada, todas
    const want = ag.level < 0.02 ? 18 : Math.round(Math.min(MAX, 30 + ag.streetDepth * 70));
    while (this.items.length < want) {
      const it = { kind: this.bag[(Math.random() * this.bag.length) | 0], on: false };
      this.spawn(it, cx, cz, 3, 70);
      this.items.push(it);
    }
    if (this.items.length > want) this.items.length = want;
    const P = world.player;
    const t = ag.t;
    const fl = ag.flow;
    for (const im of Object.values(this.meshes)) im.count = 0;
    for (const it of this.items) {
      if (!it.on || Math.hypot(it.x - cx, it.z - cz) > 85) {
        // lo que quedó lejos o en seco aparece en otro lado (fuera de la vista: atrás o lejos)
        if (Math.random() < 0.15) this.spawn(it, cx, cz, 45, 80);
        if (!it.on) continue;
      }
      const K = KINDS[it.kind];
      // la corriente + un poco de viento propio
      const tx = fl.x * 0.7 + Math.sin(t * 0.3 + it.ph) * 0.05;
      const tz = fl.y * 0.7 + Math.cos(t * 0.27 + it.ph) * 0.05;
      it.vx += (tx - it.vx) * Math.min(1, dt * 0.6);
      it.vz += (tz - it.vz) * Math.min(1, dt * 0.6);
      // Gaspi (nadando o caminando) y los autos los empujan
      const dx = it.x - P.x;
      const dz = it.z - P.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 0.01 && !P.vehicle) {
        const push = (1.1 - d) * (1.5 + (P.speed || 0));
        it.vx += (dx / d) * push * dt * 3;
        it.vz += (dz / d) * push * dt * 3;
        it.spin += (Math.random() - 0.5) * dt * 4;
      }
      if (P.vehicle && Math.abs(P.vehicle.speed) > 1) {
        const v = P.vehicle;
        const ex = it.x - v.x;
        const ez = it.z - v.z;
        const e = Math.hypot(ex, ez);
        if (e < 3.2 && e > 0.01) {
          const push = (3.2 - e) * Math.abs(v.speed) * 0.25;
          it.vx += (ex / e) * push * dt * 3 + v.vx * dt * 0.8;
          it.vz += (ez / e) * push * dt * 3 + v.vz * dt * 0.8;
          it.spin += (Math.random() - 0.5) * dt * 6;
        }
      }
      const sp = Math.hypot(it.vx, it.vz);
      if (sp > 3) {
        it.vx *= 3 / sp;
        it.vz *= 3 / sp;
      }
      const nx = it.x + it.vx * dt;
      const nz = it.z + it.vz * dt;
      // contra el cordón o una pared se frena y gira despacio (así se juntan en las orillas)
      if (ag.depth(nx, nz) < K[1]) {
        it.vx *= -0.2;
        it.vz *= -0.2;
        it.spin *= 0.9;
      } else {
        it.x = nx;
        it.z = nz;
      }
      it.spin *= Math.exp(-dt * 0.4);
      it.yaw += it.spin * dt + it.vx * dt * 0.05;
      const im = this.meshes[it.kind];
      if (!im || im.count >= im.cap) continue;
      // se mece con las ondas (y más con la lluvia)
      const rock = K[2] * (0.6 + ag.rain * 0.8);
      const ph = t * 1.6 + it.ph;
      this.e.set(Math.sin(ph) * 0.08 * rock, it.yaw, Math.cos(ph * 0.83) * 0.07 * rock);
      this.q.setFromEuler(this.e);
      this.v.set(it.x, ag.level + Math.sin(ph * 1.3) * 0.018 * rock, it.z);
      im.setMatrixAt(im.count++, this.m4.compose(this.v, this.q, this.s));
    }
    for (const im of Object.values(this.meshes)) im.instanceMatrix.needsUpdate = true;
  }
}
