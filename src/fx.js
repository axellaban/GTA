// Efectos: partículas (humo, fuego, chispas, polvo, humo de gomas, sangre), trazas de bala,
// marcas de frenada, manchas y charcos de sangre, fogonazos, lluvia y temblor de cámara.
import * as THREE from 'three';

const VERT = `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
varying vec3 vColor;
varying float vAlpha;
uniform float uSoft;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  // borde suave y un poco de grumo para el humo
  float n = fract(sin(dot(floor(gl_PointCoord * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
  float a = (1.0 - smoothstep(uSoft, 0.5, d)) * vAlpha * (0.85 + n * 0.15);
  gl_FragColor = vec4(vColor, a);
  #include <fog_fragment>
}`;

class Particles {
  constructor(scene, cap, additive) {
    this.cap = cap;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.alpha = new Float32Array(cap);
    this.size = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 }, uSoft: { value: additive ? 0.0 : 0.15 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat = mat;
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 3 : 2;
    scene.add(pts);
  }
  add(p) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(p);
  }
  update(dt) {
    let i = 0;
    const keep = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.life >= p.max) continue;
      keep.push(p);
      const k = p.life / p.max;
      p.vy += p.grav * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= p.grav ? 1 : drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // (las gotas de una salpicadura vuelven al agua y desaparecen)
      // (las burbujas revientan al llegar a la superficie)
      if (p.ceil != null && p.y > p.ceil) {
        p.life = p.max;
        continue;
      }
      if (p.floor != null && p.y < p.floor && p.vy < 0) {
        p.life = p.max;
        continue;
      }
      if (p.y < 0.05 && p.grav) {
        p.y = 0.05;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      // el fuego pasa de amarillo a rojo oscuro
      const c = p.c1 ? lerpColor(p.c0, p.c1, k) : p.c0;
      this.col[i * 3] = c[0];
      this.col[i * 3 + 1] = c[1];
      this.col[i * 3 + 2] = c[2];
      const fadeIn = p.fadeIn ? Math.min(1, p.life / p.fadeIn) : 1;
      this.alpha[i] = p.a * (1 - k) * fadeIn;
      this.size[i] = p.s0 + (p.s1 - p.s0) * k;
      i++;
    }
    this.list = keep;
    this.geo.setDrawRange(0, i);
    for (const a of ['position', 'aColor', 'aAlpha', 'aSize']) this.geo.attributes[a].needsUpdate = true;
  }
}
const tmpC = [0, 0, 0];
function lerpColor(a, b, k) {
  tmpC[0] = a[0] + (b[0] - a[0]) * k;
  tmpC[1] = a[1] + (b[1] - a[1]) * k;
  tmpC[2] = a[2] + (b[2] - a[2]) * k;
  return tmpC;
}
const rnd = (a, b) => a + Math.random() * (b - a);

function splatTexture() {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.7, `rgba(235,235,235,${a * 0.9})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // cuerpo de la mancha con bordes irregulares
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * N * 0.16;
    blob(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, N * (0.14 + Math.random() * 0.12), 0.9);
  }
  // gotitas salpicadas
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = N * (0.3 + Math.random() * 0.17);
    blob(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, N * (0.012 + Math.random() * 0.025), 0.95);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// agujero de bala: centro negro, borde de revoque saltado y grietas finas
function holeTexture() {
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const h = N / 2;
  const chip = g.createRadialGradient(h, h, 2, h, h, h * 0.95);
  chip.addColorStop(0, 'rgba(70,64,58,0.95)');
  chip.addColorStop(0.35, 'rgba(120,112,102,0.7)');
  chip.addColorStop(0.7, 'rgba(150,142,130,0.25)');
  chip.addColorStop(1, 'rgba(150,142,130,0)');
  g.fillStyle = chip;
  g.beginPath();
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = h * (0.62 + Math.random() * 0.33);
    g.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r);
  }
  g.fill();
  g.strokeStyle = 'rgba(40,36,32,0.55)';
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    g.beginPath();
    g.moveTo(h, h);
    g.lineTo(h + Math.cos(a) * h * 0.8, h + Math.sin(a) * h * 0.8);
    g.stroke();
  }
  const core = g.createRadialGradient(h, h, 0, h, h, h * 0.22);
  core.addColorStop(0, 'rgba(8,8,8,1)');
  core.addColorStop(0.7, 'rgba(20,18,16,1)');
  core.addColorStop(1, 'rgba(30,28,25,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(h, h, h * 0.22, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// quemadura de explosión: hollín negro con borde irregular y vetas que salen del centro
function scorchTexture() {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const h = N / 2;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * h * 0.45;
    const r = h * (0.18 + Math.random() * 0.3);
    const gr = g.createRadialGradient(h + Math.cos(a) * d, h + Math.sin(a) * d, 0, h + Math.cos(a) * d, h + Math.sin(a) * d, r);
    gr.addColorStop(0, 'rgba(8,7,6,0.55)');
    gr.addColorStop(1, 'rgba(8,7,6,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, N, N);
  }
  g.strokeStyle = 'rgba(10,9,8,0.5)';
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    g.moveTo(h, h);
    g.lineTo(h + Math.cos(a) * h * (0.6 + Math.random() * 0.35), h + Math.sin(a) * h * (0.6 + Math.random() * 0.35));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.alpha = new Particles(scene, 1800, false);
    this.add = new Particles(scene, 1200, true);
    // trazas de bala
    const TN = 48;
    this.tr = { n: TN, list: [], pos: new Float32Array(TN * 6), col: new Float32Array(TN * 6) };
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tr.pos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tr.col, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setDrawRange(0, 0);
    this.tr.geo = tg;
    const tl = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    tl.frustumCulled = false;
    scene.add(tl);
    // marcas de frenada
    const SK = 700;
    const skGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const skMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.skid = new THREE.InstancedMesh(skGeo, skMat, SK);
    this.skid.count = 0;
    this.skid.frustumCulled = false;
    this.skidI = 0;
    scene.add(this.skid);
    // manchas y charcos de sangre (siguen la altura del piso: calle o vereda)
    const BL = 180;
    const blMat = new THREE.MeshLambertMaterial({ map: splatTexture(), color: 0x6e0707, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.bloodM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blMat, BL);
    this.bloodM.count = 0;
    this.bloodM.frustumCulled = false;
    this.bloodM.receiveShadow = true;
    this.bloodI = 0;
    this.pools = [];
    this.ground = () => 0;
    scene.add(this.bloodM);
    // casquillos de bronce que saltan al tirar (rebotan y quedan un rato en el piso)
    const CS = 70;
    this.casings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3, emissive: 0x2a1c00 }), CS);
    this.casings.count = 0;
    this.casings.frustumCulled = false;
    this.casingList = [];
    this.casingCap = CS;
    scene.add(this.casings);
    // agujeros de bala en paredes y veredas (los más viejos se van reciclando)
    const HO = 160;
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), HO);
    this.holes.count = 0;
    this.holes.frustumCulled = false;
    this.holes.receiveShadow = true;
    this.holeI = 0;
    scene.add(this.holes);
    this.splashT = 0;
    // quemaduras de las explosiones en el piso
    const SC = 24;
    this.scorch = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), SC);
    this.scorch.count = 0;
    this.scorch.frustumCulled = false;
    this.scorch.receiveShadow = true;
    this.scorchI = 0;
    scene.add(this.scorch);
    // onda expansiva: anillo que se abre a ras del piso
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
    this.chunkGeo = new THREE.DodecahedronGeometry(0.16, 0);
    this.chunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 });
    // piezas sueltas (paragolpes caídos): rebotan y quedan un rato en el piso
    this.parts = [];
    // luces para fogonazos y explosiones (fijas en la escena: agregarlas después recompila todo)
    this.flashLight = new THREE.PointLight(0xffc070, 0, 14, 2);
    this.boomLight = new THREE.PointLight(0xff8a3a, 0, 40, 1.6);
    scene.add(this.flashLight, this.boomLight);
    this.shake = 0;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
    this.q2 = new THREE.Quaternion();
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.rain = null;
  }

  setScale(h) {
    // tamaño del punto proporcional a la altura del viewport
    this.alpha.mat.uniforms.uScale.value = h * 0.9;
    this.add.mat.uniforms.uScale.value = h * 0.9;
  }

  // ---------- Partículas ----------
  smoke(x, y, z, n = 1, o = {}) {
    for (let i = 0; i < n; i++) {
      const g = o.black ? rnd(0.05, 0.12) : rnd(0.45, 0.6);
      this.alpha.add({ x: x + rnd(-0.3, 0.3), y, z: z + rnd(-0.3, 0.3), vx: rnd(-0.4, 0.4) + (o.vx || 0), vy: rnd(0.8, 1.6) * (o.rise ?? 1), vz: rnd(-0.4, 0.4) + (o.vz || 0), grav: 0, drag: 0.6, life: 0, max: rnd(1.8, 3) * (o.life ?? 1), s0: o.s0 ?? 0.8, s1: o.s1 ?? 3.5, c0: [g, g, g * 1.02], a: o.a ?? 0.5, fadeIn: 0.25 });
    }
  }
  fire(x, y, z, n = 1, spread = 0.5) {
    for (let i = 0; i < n; i++) {
      this.add.add({ x: x + rnd(-spread, spread), y: y + rnd(0, 0.3), z: z + rnd(-spread, spread), vx: rnd(-0.3, 0.3), vy: rnd(1.5, 3), vz: rnd(-0.3, 0.3), grav: 0, drag: 1.2, life: 0, max: rnd(0.35, 0.7), s0: rnd(0.9, 1.5), s1: 0.3, c0: [1, 0.85, 0.4], c1: [0.9, 0.2, 0.05], a: 0.9 });
    }
  }
  sparks(x, y, z, n = 8, speed = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9;
      this.add.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * speed * rnd(0.3, 1), vy: Math.sin(e) * speed * rnd(0.4, 1), vz: Math.sin(a) * Math.cos(e) * speed * rnd(0.3, 1), grav: -12, drag: 0.5, life: 0, max: rnd(0.2, 0.45), s0: 0.14, s1: 0.05, c0: [1, 0.9, 0.55], a: 1 });
    }
  }
  dust(x, y, z, n = 5, color = [0.55, 0.5, 0.42], s = 1) {
    for (let i = 0; i < n; i++) {
      this.alpha.add({ x, y, z, vx: rnd(-1, 1) * s, vy: rnd(0.2, 1.2) * s, vz: rnd(-1, 1) * s, grav: 0, drag: 2.5, life: 0, max: rnd(0.5, 0.9), s0: 0.25 * s, s1: 1.1 * s, c0: color, a: 0.55 });
    }
  }
  tireSmoke(x, z, k = 1) {
    this.alpha.add({ x: x + rnd(-0.2, 0.2), y: 0.25, z: z + rnd(-0.2, 0.2), vx: rnd(-0.5, 0.5), vy: rnd(0.3, 0.8), vz: rnd(-0.5, 0.5), grav: 0, drag: 1, life: 0, max: rnd(1, 1.8), s0: 0.6, s1: 3 * k, c0: [0.8, 0.8, 0.8], a: 0.28 * k, fadeIn: 0.1 });
  }
  muzzle(x, y, z, fx, fz, big = false) {
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const k = rnd(0.1, 0.5);
      this.add.add({ x: x + fx * k, y, z: z + fz * k, vx: fx * 2, vy: 0, vz: fz * 2, grav: 0, drag: 0, life: 0, max: 0.06, s0: big ? 1.1 : 0.7, s1: 0.2, c0: [1, 0.8, 0.45], a: 1 });
    }
    this.alpha.add({ x: x + fx * 0.4, y, z: z + fz * 0.4, vx: fx * 0.8, vy: 0.4, vz: fz * 0.8, grav: 0, drag: 1.5, life: 0, max: 0.8, s0: 0.3, s1: 1.4, c0: [0.7, 0.7, 0.7], a: 0.25 });
    this.flashLight.position.set(x + fx * 0.5, y, z + fz * 0.5);
    this.flashLight.intensity = big ? 60 : 35;
  }
  // casquillo: sale despedido a la derecha del arma (hx, hz: hacia dónde apunta)
  casing(x, y, z, hx, hz, shell = false) {
    if (this.casingList.length >= this.casingCap) this.casingList.shift();
    const side = rnd(1.4, 2.4);
    this.casingList.push({ x, y, z, vx: -hz * side - hx * 0.4, vy: rnd(1.8, 2.8), vz: hx * side - hz * 0.4, rx: rnd(0, 6), ry: rnd(0, 6), spin: rnd(15, 30), life: 0, rest: false, shell, bounces: 0 });
  }
  // agujero de bala: (nx, ny, nz) es la normal de la superficie
  bulletHole(x, y, z, nx, ny, nz) {
    this.v.set(nx, ny, nz).normalize();
    this.q.setFromUnitVectors(this.zAxis, this.v);
    // un giro al azar sobre la normal para que no sean todos iguales
    this.q2.setFromAxisAngle(this.zAxis, Math.random() * Math.PI * 2);
    this.q.multiply(this.q2);
    const sz = rnd(0.07, 0.11);
    this.m4.compose(this.v.set(x, y, z), this.q, this.s.set(sz, sz, 1));
    this.holes.setMatrixAt(this.holeI, this.m4);
    this.holeI = (this.holeI + 1) % this.holes.instanceMatrix.count;
    this.holes.count = Math.max(this.holes.count, this.holeI);
    this.holes.instanceMatrix.needsUpdate = true;
  }
  // astillas que saltan de la pared (o del piso si la normal es 0)
  chips(x, y, z, nx, nz, color, n = 4) {
    for (let i = 0; i < n; i++) {
      const sp = rnd(1.5, 3.5);
      const g = rnd(0.8, 1.2);
      this.alpha.add({ x, y, z, vx: nx * sp + rnd(-1.2, 1.2), vy: rnd(0.5, 2.5), vz: nz * sp + rnd(-1.2, 1.2), grav: -9.8, drag: 0.6, life: 0, max: rnd(0.5, 1), s0: rnd(0.04, 0.08), s1: 0.03, c0: [color[0] * g, color[1] * g, color[2] * g], a: 1 });
    }
  }
  // pieza suelta con física simple: cae girando, rebota y queda tirada (90 s)
  part(mesh, x, y, z, vx, vy, vz, half = 0.06, o = {}) {
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.parts.push({ mesh, vx, vy, vz, wx: rnd(-4, 4), wy: rnd(-3, 3), wz: rnd(-6, 6), half, life: 0, rest: false, smoke: o.smoke ? rnd(2, 5) : 0, max: o.life ?? 90 });
    if (this.parts.length > 30) {
      const old = this.parts.shift();
      this.scene.remove(old.mesh);
    }
  }
  updateParts(dt) {
    for (const p of this.parts) {
      p.life += dt;
      // pedazo encendido: larga humo mientras vuela y un rato en el piso
      if (p.smoke > 0) {
        p.smoke -= dt;
        if (Math.random() < dt * 14) this.smoke(p.mesh.position.x, p.mesh.position.y + 0.1, p.mesh.position.z, 1, { black: true, s0: 0.3, s1: 1.6, life: 0.6, a: 0.5 });
        if (Math.random() < dt * 8) this.fire(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 1, 0.05);
      }
      if (p.rest) continue;
      const m = p.mesh;
      p.vy -= 9.8 * dt;
      m.position.x += p.vx * dt;
      m.position.y += p.vy * dt;
      m.position.z += p.vz * dt;
      m.rotation.x += p.wx * dt;
      m.rotation.y += p.wy * dt;
      m.rotation.z += p.wz * dt;
      const g = this.ground(m.position.x, m.position.z) + p.half;
      if (m.position.y < g) {
        m.position.y = g;
        if (Math.abs(p.vy) > 1.2) {
          p.vy *= -0.3;
          p.vx *= 0.6;
          p.vz *= 0.6;
          p.wx *= 0.4;
          p.wz *= 0.4;
        } else {
          // queda acostada sobre el lado más plano
          p.rest = true;
          m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI;
          m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI;
        }
      }
    }
    for (const p of this.parts) if (p.life > p.max) this.scene.remove(p.mesh);
    this.parts = this.parts.filter((p) => p.life <= p.max);
    // ondas expansivas
    for (const r of this.rings) {
      r.t += dt;
      const k = r.t / 0.45;
      r.m.scale.setScalar(0.5 + k * 13 * r.power);
      r.m.material.opacity = 0.6 * Math.max(0, 1 - k);
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
      }
    }
    this.rings = this.rings.filter((r) => r.t < 0.45);
  }
  // choque de autos: escamas de pintura y vidrio picado que rebotan en el asfalto
  debris(x, y, z, color, n = 6, glass = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(1.5, 4.5);
      const g = rnd(0.7, 1.15);
      this.alpha.add({ x, y: y + rnd(-0.2, 0.3), z, vx: Math.cos(a) * sp, vy: rnd(1.5, 4), vz: Math.sin(a) * sp, grav: -9.8, drag: 0.3, life: 0, max: rnd(1.6, 2.6), s0: rnd(0.07, 0.14), s1: 0.06, c0: [color[0] * g, color[1] * g, color[2] * g], a: 1 });
    }
    // vidrio: granitos verdosos (a la sombra se ven oscuros) y algunos que destellan con el sol
    for (let i = 0; i < glass; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(2, 5.5);
      const g = rnd(0.35, 0.6);
      this.alpha.add({ x, y: y + rnd(0.1, 0.6), z, vx: Math.cos(a) * sp, vy: rnd(1, 3.5), vz: Math.sin(a) * sp, grav: -9.8, drag: 0.3, life: 0, max: rnd(1.4, 2.4), s0: rnd(0.035, 0.06), s1: 0.035, c0: [g * 0.85, g, g * 1.02], a: 0.95 });
    }
    for (let i = 0; i < glass / 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(2, 5);
      this.add.add({ x, y: y + rnd(0.1, 0.5), z, vx: Math.cos(a) * sp, vy: rnd(1, 3.5), vz: Math.sin(a) * sp, grav: -9.8, drag: 0.3, life: 0, max: rnd(0.4, 0.9), s0: 0.09, s1: 0.03, c0: [0.95, 0.97, 1], a: 0.9 });
    }
  }
  // escape: bocanada de humo gris (negro si el auto está hecho pelota)
  exhaust(x, y, z, vx, vz, k = 1, dark = false) {
    const g = dark ? rnd(0.12, 0.2) : rnd(0.55, 0.68);
    this.alpha.add({ x, y, z, vx: vx + rnd(-0.2, 0.2), vy: rnd(0.2, 0.5), vz: vz + rnd(-0.2, 0.2), grav: 0, drag: 2.2, life: 0, max: rnd(0.8, 1.4), s0: 0.15, s1: 0.5 + k * 0.8, c0: [g, g, g * 1.03], a: 0.1 + k * 0.18, fadeIn: 0.05 });
  }
  // petardeo: llamarada corta por el caño de escape
  backfire(x, y, z, fx, fz) {
    for (let i = 0; i < 4; i++) this.add.add({ x, y, z, vx: -fx * rnd(2, 5) + rnd(-0.4, 0.4), vy: rnd(0, 0.4), vz: -fz * rnd(2, 5) + rnd(-0.4, 0.4), grav: 0, drag: 3, life: 0, max: rnd(0.06, 0.14), s0: rnd(0.35, 0.6), s1: 0.1, c0: [1, 0.75, 0.35], c1: [0.9, 0.3, 0.05], a: 1 });
    this.exhaust(x, y, z, -fx * 1.5, -fz * 1.5, 1.2, true);
    this.flashLight.position.set(x, y + 0.2, z);
    this.flashLight.intensity = Math.max(this.flashLight.intensity, 14);
  }
  // rocío de las gomas con la calle mojada
  spray(x, z, vx, vz, k = 1) {
    this.alpha.add({ x: x + rnd(-0.15, 0.15), y: 0.2, z: z + rnd(-0.15, 0.15), vx: vx + rnd(-0.6, 0.6), vy: rnd(0.6, 1.6), vz: vz + rnd(-0.6, 0.6), grav: -2, drag: 1.6, life: 0, max: rnd(0.4, 0.8), s0: 0.25, s1: 1.3 * k, c0: [0.72, 0.76, 0.8], a: 0.16 * k, fadeIn: 0.04 });
  }
  explosion(x, z, power = 1, y0 = 0) {
    const gy = this.ground(x, z);
    const by = Math.max(gy, y0);
    // fogonazo: núcleo blanco que se infla y la bola de fuego que sube y se oscurece
    for (let i = 0; i < 4; i++) this.add.add({ x, y: by + 1, z, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, life: 0, max: 0.12, s0: 9 * power, s1: 14 * power, c0: [1, 0.95, 0.8], a: 1 });
    for (let i = 0; i < 55 * power; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0, 3) * power;
      this.add.add({ x: x + Math.cos(a) * r * 0.3, y: by + rnd(0.5, 2), z: z + Math.sin(a) * r * 0.3, vx: Math.cos(a) * r * 2.5, vy: rnd(2, 9), vz: Math.sin(a) * r * 2.5, grav: -3, drag: 2.2, life: 0, max: rnd(0.5, 1.2), s0: rnd(2.5, 5) * power, s1: 1, c0: [1, 0.9, 0.55], c1: [0.8, 0.15, 0.02], a: 1 });
    }
    // hongo de humo negro que sube despacio y queda un rato
    this.smoke(x, by + 1.5, z, 18 * power, { black: true, s0: 2, s1: 7, life: 1.6, rise: 2, a: 0.7 });
    this.smoke(x, by + 3, z, 10 * power, { black: true, s0: 3, s1: 10, life: 3.2, rise: 1.4, a: 0.5 });
    // polvo que corre a ras del piso
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.alpha.add({ x, y: gy + 0.3, z, vx: Math.cos(a) * 9 * power, vy: 0.3, vz: Math.sin(a) * 9 * power, grav: 0, drag: 2.5, life: 0, max: rnd(1, 1.6), s0: 1, s1: 4, c0: [0.45, 0.42, 0.38], a: 0.35 });
    }
    this.sparks(x, by + 1, z, 30, 14);
    // brasas que vuelan alto y caen despacio
    for (let i = 0; i < 18 * power; i++) this.add.add({ x, y: by + 1, z, vx: rnd(-6, 6), vy: rnd(5, 13), vz: rnd(-6, 6), grav: -5, drag: 0.8, life: 0, max: rnd(1.2, 2.4), s0: 0.16, s1: 0.06, c0: [1, 0.6, 0.2], a: 1 });
    // escombros que salen volando humeando
    for (let i = 0; i < Math.round(4 * power); i++) {
      const m = new THREE.Mesh(this.chunkGeo, this.chunkMat);
      m.scale.setScalar(rnd(0.6, 1.6));
      m.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(4, 9);
      this.part(m, x, by + 0.8, z, Math.cos(a) * sp, rnd(5, 10), Math.sin(a) * sp, 0.1, { smoke: true, life: 25 });
    }
    // onda expansiva y quemadura en el piso
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.set(x, gy + 0.08, z);
    this.scene.add(ring);
    this.rings.push({ m: ring, t: 0, power });
    this.burn(x, z, rnd(3.5, 5) * power);
    this.boomLight.position.set(x, by + 3, z);
    this.boomLight.intensity = 320 * power;
    this.shake += 0.2 * power;
  }
  burn(x, z, size) {
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.random() * Math.PI * 2);
    this.m4.compose(this.v.set(x, this.ground(x, z) + 0.03, z), this.q, this.s.set(size, 1, size));
    this.scorch.setMatrixAt(this.scorchI, this.m4);
    this.scorchI = (this.scorchI + 1) % this.scorch.instanceMatrix.count;
    this.scorch.count = Math.max(this.scorch.count, this.scorchI);
    this.scorch.instanceMatrix.needsUpdate = true;
  }
  hit(x, y, z) {
    // golpe o bala en algo que no sangra: polvo
    this.dust(x, y, z, 4, [0.75, 0.72, 0.66], 0.6);
  }
  // sangre: gotas que salen en la dirección del golpe, caen y manchan el piso
  blood(x, y, z, dx = 0, dz = 0, n = 10, speed = 3) {
    for (let i = 0; i < n; i++) {
      const s = rnd(0.3, 1);
      this.alpha.add({ x, y, z, vx: dx * speed * s + rnd(-0.9, 0.9), vy: rnd(0.4, 2.4), vz: dz * speed * s + rnd(-0.9, 0.9), grav: -9.8, drag: 0.5, life: 0, max: rnd(0.35, 0.75), s0: rnd(0.07, 0.15), s1: 0.05, c0: [0.42, 0.02, 0.02], a: 0.95 });
    }
    // una nubecita roja en el punto del impacto
    this.alpha.add({ x, y, z, vx: dx * 0.8, vy: 0.2, vz: dz * 0.8, grav: 0, drag: 3, life: 0, max: 0.3, s0: 0.25, s1: 0.6, c0: [0.5, 0.03, 0.03], a: 0.55 });
    const d = Math.min(1.8, 0.4 + speed * 0.25);
    for (let i = 0; i < Math.ceil(n / 3); i++) this.splat(x + dx * rnd(0.2, d) + rnd(-0.35, 0.35), z + dz * rnd(0.2, d) + rnd(-0.35, 0.35), rnd(0.1, 0.32));
  }
  splat(x, z, r) {
    const i = this.bloodI;
    this.bloodI = (this.bloodI + 1) % this.bloodM.instanceMatrix.count;
    this.bloodM.count = Math.max(this.bloodM.count, this.bloodI);
    // si esta mancha era un charco que crecía, se deja de actualizar
    this.pools = this.pools.filter((p) => p.i !== i);
    this.setSplat(i, x, z, r, Math.random() * Math.PI * 2);
    return i;
  }
  setSplat(i, x, z, r, rot) {
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), rot);
    this.m4.compose(this.v.set(x, this.ground(x, z) + 0.025, z), this.q, this.s.set(r * 2, 1, r * 2));
    this.bloodM.setMatrixAt(i, this.m4);
    this.bloodM.instanceMatrix.needsUpdate = true;
  }
  // charco que se agranda de a poco debajo de un cuerpo
  pool(x, z, max = 0.9) {
    const i = this.splat(x, z, 0.15);
    this.pools.push({ i, x, z, r: 0.15, max, rot: Math.random() * Math.PI * 2 });
  }

  // ---------- Trazas ----------
  tracer(x0, y0, z0, x1, y1, z1) {
    const t = this.tr;
    if (t.list.length >= t.n) t.list.shift();
    t.list.push({ a: [x0, y0, z0], b: [x1, y1, z1], life: 0 });
  }

  // ---------- Frenadas ----------
  skidMark(ax, az, bx, bz, w = 0.22) {
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 0.05 || l > 3) return;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.atan2(bx - ax, bz - az));
    this.m4.compose(this.v.set((ax + bx) / 2, 0.035, (az + bz) / 2), this.q, this.s.set(w, 1, l + 0.04));
    this.skid.setMatrixAt(this.skidI, this.m4);
    this.skidI = (this.skidI + 1) % this.skid.instanceMatrix.count;
    this.skid.count = Math.max(this.skid.count, this.skidI);
    this.skid.instanceMatrix.needsUpdate = true;
  }

  // ---------- Lluvia ----------
  makeRain() {
    const N = 5000;
    const pos = new Float32Array(N * 6);
    const seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 70;
      const y = Math.random() * 40;
      const z = Math.random() * 70;
      const r = Math.random();
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], i * 6 + k * 3);
        seed[i * 2 + k] = k + r * 0.999; // parte entera: punta de abajo; decimales: aleatorio
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0xaab8c8) } },
      vertexShader: `
        attribute float seed;
        uniform float uTime; uniform vec3 uCam; uniform float uAmount;
        varying float vA;
        void main() {
          float tip = floor(seed);
          float r = fract(seed) ;
          vec3 p = position;
          float speed = 16.0 + r * 8.0;
          p.y = mod(p.y - uTime * speed, 40.0) - 12.0 + uCam.y;
          p.x = uCam.x + mod(p.x - uCam.x, 70.0) - 35.0 + tip * 0.08;
          p.z = uCam.z + mod(p.z - uCam.z, 70.0) - 35.0 + tip * 0.04;
          p.y -= tip * 0.9;
          vA = step(r, uAmount) * 0.5;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main() { if (vA <= 0.0) discard; gl_FragColor = vec4(uColor, vA); }`,
      transparent: true,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(g, mat);
    lines.frustumCulled = false;
    lines.renderOrder = 4;
    this.scene.add(lines);
    this.rain = { lines, mat };
  }
  setRain(amount, camera, t, dt = 1 / 60) {
    // gotas que pegan en el piso cerca de la cámara: un anillito que salta
    if (amount > 0.05 && camera.position.y < 30) {
      this.splashT += dt * amount * 70;
      while (this.splashT >= 1) {
        this.splashT -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = rnd(1.5, 14);
        const x = camera.position.x + Math.cos(a) * r;
        const z = camera.position.z + Math.sin(a) * r;
        const y = this.ground(x, z) + 0.04;
        this.alpha.add({ x, y, z, vx: 0, vy: 0.4, vz: 0, grav: 0, drag: 4, life: 0, max: rnd(0.12, 0.22), s0: 0.03, s1: 0.16, c0: [0.75, 0.8, 0.86], a: 0.45 });
        if (Math.random() < 0.5) this.alpha.add({ x, y, z, vx: rnd(-0.6, 0.6), vy: rnd(0.8, 1.5), vz: rnd(-0.6, 0.6), grav: -9.8, drag: 0, life: 0, max: rnd(0.15, 0.3), s0: 0.025, s1: 0.02, c0: [0.8, 0.85, 0.9], a: 0.6 });
      }
    }
    if (amount <= 0.001 && !this.rain) return;
    if (!this.rain) this.makeRain();
    this.rain.lines.visible = amount > 0.01;
    const u = this.rain.mat.uniforms;
    u.uAmount.value = amount;
    u.uTime.value = t;
    u.uCam.value.copy(camera.position);
  }

  updateCasings(dt) {
    const list = this.casingList;
    let n = 0;
    for (const c of list) {
      c.life += dt;
      if (!c.rest) {
        c.vy -= 9.8 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.rx += c.spin * dt;
        c.ry += c.spin * 0.6 * dt;
        const g = this.ground(c.x, c.z) + 0.012;
        if (c.y < g) {
          c.y = g;
          if (Math.abs(c.vy) > 0.7 && c.bounces < 3) {
            c.vy *= -0.32;
            c.vx *= 0.55;
            c.vz *= 0.55;
            c.spin *= 0.5;
            c.bounces++;
          } else {
            c.rest = true;
            c.rx = Math.PI / 2 * Math.round(c.rx / (Math.PI / 2));
          }
        }
      }
      if (c.life > 8) continue;
      this.q.setFromEuler(this.e.set(c.rest ? 0 : c.rx, c.ry, 0));
      this.s.setScalar(c.shell ? 1.9 : 1);
      this.casings.setMatrixAt(n++, this.m4.compose(this.v.set(c.x, c.y, c.z), this.q, this.s));
    }
    this.casingList = list.filter((c) => c.life <= 8);
    this.casings.count = n;
    this.casings.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    this.alpha.update(dt);
    this.add.update(dt);
    this.updateCasings(dt);
    this.updateParts(dt);
    for (const p of this.pools) {
      if (p.r >= p.max) continue;
      p.r = Math.min(p.max, p.r + dt * 0.06);
      this.setSplat(p.i, p.x, p.z, p.r, p.rot);
    }
    const t = this.tr;
    let i = 0;
    const keep = [];
    for (const s of t.list) {
      s.life += dt;
      if (s.life > 0.09) continue;
      keep.push(s);
      const k = 1 - s.life / 0.09;
      t.pos.set(s.a, i * 6);
      t.pos.set(s.b, i * 6 + 3);
      t.col.set([k * 0.6, k * 0.5, k * 0.25, k, k * 0.9, k * 0.6], i * 6);
      i++;
    }
    t.list = keep;
    t.geo.setDrawRange(0, i * 2);
    t.geo.attributes.position.needsUpdate = true;
    t.geo.attributes.color.needsUpdate = true;
    this.flashLight.intensity *= Math.exp(-dt * 40);
    this.boomLight.intensity *= Math.exp(-dt * 3.5);
    this.shake *= Math.exp(-dt * 6);
  }
}
