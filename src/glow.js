// Halos de luz de noche: faroles de sodio, faros y luces traseras de los autos,
// más un foco real que ilumina la calle delante del auto de Gaspi.
import * as THREE from 'three';
import { NIGHT } from './atmosphere.js';

// destello en estrella como las "coronas" de Vice City: núcleo brillante y rayos finos
function glowTexture() {
  const S = 128;
  const h = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.1, 'rgba(255,255,255,0.8)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.2)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (const [a, len, w, al] of [[0, 1, 6, 0.95], [Math.PI / 2, 1, 6, 0.95], [Math.PI / 4, 0.6, 4, 0.5], [-Math.PI / 4, 0.6, 4, 0.5]]) {
    g.save();
    g.translate(h, h);
    g.rotate(a);
    const lg = g.createLinearGradient(-h * len, 0, h * len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, `rgba(255,255,255,${al})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(-h * len, -w / 2, 2 * h * len, w);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Haz de luz volumétrico: brilla en el eje, se esfuma hacia la punta y hacia los bordes del cono.
function beamMaterial(color, len) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 0 }, uLen: { value: len } },
    vertexShader: /* glsl */ `
      uniform float uLen;
      varying float vFade;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mv = modelViewMatrix * p;
        vFade = 1.0 - clamp(length(position) / uLen, 0.0, 1.0);
        vN = normalize(normalMatrix * n);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vFade;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        gl_FragColor = vec4(uColor * (uStrength * vFade * vFade * edge), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

// cono con la punta en el origen: hacia +z (faros) o hacia abajo (faroles)
function coneGeo(len, radius, down) {
  const g = new THREE.ConeGeometry(radius, len, 16, 1, true);
  g.translate(0, -len / 2, 0);
  if (!down) g.rotateX(-Math.PI / 2);
  return g;
}

function points(n, color, size, tex) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ color, size, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0 });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// raya de reflejo en el asfalto mojado: fuerte del lado de la luz, se esfuma hacia la cámara
function streakTexture() {
  const W = 32;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - y / (H - 1); // 1 arriba (la luz)
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1)) * 2 - 1;
      // cortes de agua: la raya tiene huecos y se ensancha un poco lejos de la luz
      const ripple = 0.75 + 0.25 * Math.sin(y * 0.9 + Math.sin(y * 0.23) * 3);
      const k = Math.exp(-(u * u) / (0.12 + (1 - v) * 0.25)) * v ** 1.6 * ripple;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * k);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Glows {
  constructor(scene, city) {
    const tex = glowTexture();
    this.lamps = points(city.lamps.length, 0xffb455, 7, tex);
    const pos = this.lamps.geometry.attributes.position;
    city.lamps.forEach((l, i) => pos.setXYZ(i, l.x, 7.75, l.z));
    this.maxCars = 140;
    this.heads = points(this.maxCars * 2, 0xfff1c8, 2.2, tex);
    this.tails = points(this.maxCars * 2, 0xff2a18, 1.3, tex);
    scene.add(this.lamps, this.heads, this.tails);
    // foco del auto de Gaspi (siempre en escena para no recompilar materiales)
    this.spot = new THREE.SpotLight(0xfff0cc, 0, 45, 0.55, 0.5, 1.2);
    scene.add(this.spot, this.spot.target);
    // haces de los faros de los autos
    this.beams = new THREE.InstancedMesh(coneGeo(13, 2.6, false), beamMaterial(0xfff0d0, 13), this.maxCars * 2);
    this.beams.frustumCulled = false;
    this.beams.count = 0;
    this.beams.renderOrder = 4;
    // conos de luz bajo los faroles (se notan con bruma o lluvia)
    this.cones = new THREE.InstancedMesh(coneGeo(7.4, 3.6, true), beamMaterial(0xffb866, 7.4), city.lamps.length);
    const m4 = new THREE.Matrix4();
    city.lamps.forEach((l, i) => this.cones.setMatrixAt(i, m4.makeTranslation(l.x, 7.62, l.z)));
    this.cones.renderOrder = 4;
    scene.add(this.beams, this.cones);
    // reflejos de faros y luces traseras en la calle mojada (rayas que apuntan a la cámara)
    const sg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.streaks = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 160);
    this.streaks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3);
    this.streaks.count = 0;
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 3;
    scene.add(this.streaks);
    this.sc = new THREE.Color();
    this.ss = new THREE.Vector3();
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.v = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
  }

  update(world, k) {
    const { traffic, player } = world;
    const on = k > 0.02;
    for (const p of [this.lamps, this.heads, this.tails]) {
      p.visible = on;
      p.material.opacity = Math.min(0.75, k * 0.9);
    }
    const rain = world.weather?.rain ?? 0;
    // en calidad baja no hay conos ni haces (son transparentes y pesan en el celu)
    this.cones.visible = on && !this.lite;
    this.cones.material.uniforms.uStrength.value = k * (0.045 + rain * 0.09) * NIGHT.conos;
    this.beams.visible = on && !this.lite;
    this.beams.material.uniforms.uStrength.value = k * (0.1 + rain * 0.12) * NIGHT.haces;
    if (!on) {
      this.spot.intensity = 0;
      this.streaks.count = 0;
      return;
    }
    const hp = this.heads.geometry.attributes.position;
    const tp = this.tails.geometry.attributes.position;
    let n = 0;
    let nb = 0;
    const all = traffic.cars.concat(player.vehicle ? [player.vehicle] : []);
    for (const v of all) {
      if (n >= this.maxCars) break;
      if (!v.mesh.visible || v.kind === 'moto') continue;
      const fx = v.fx;
      const fz = v.fz;
      const rx = fz;
      const rz = -fx;
      const half = v.L / 2 + 0.05;
      const w = v.W / 2 - 0.28;
      const y = v.kind === 'bus' ? 0.9 : 0.62;
      for (const s of [-1, 1]) {
        hp.setXYZ(n * 2 + (s > 0 ? 1 : 0), v.x + fx * half + rx * w * s, y, v.z + fz * half + rz * w * s);
        tp.setXYZ(n * 2 + (s > 0 ? 1 : 0), v.x - fx * half + rx * w * s, y + 0.1, v.z - fz * half + rz * w * s);
      }
      // haces: solo los autos cercanos
      if (Math.abs(v.x - player.x) < 140 && Math.abs(v.z - player.z) < 140) {
        this.e.set(0.07, Math.atan2(fx, fz), 0);
        this.q.setFromEuler(this.e);
        for (const s of [-1, 1]) {
          this.v.set(v.x + fx * half + rx * w * s, y, v.z + fz * half + rz * w * s);
          this.beams.setMatrixAt(nb++, this.m4.compose(this.v, this.q, this.one));
        }
      }
      n++;
    }
    this.beams.count = nb;
    this.updateStreaks(world, all, k);
    this.beams.instanceMatrix.needsUpdate = true;
    this.heads.geometry.setDrawRange(0, n * 2);
    this.tails.geometry.setDrawRange(0, n * 2);
    hp.needsUpdate = true;
    tp.needsUpdate = true;
    const v = player.vehicle;
    if (v) {
      this.spot.intensity = 45 * k;
      this.spot.position.set(v.x + v.fx * (v.L / 2), 1.1, v.z + v.fz * (v.L / 2));
      this.spot.target.position.set(v.x + v.fx * 18, 0, v.z + v.fz * 18);
    } else this.spot.intensity = 0;
  }

  updateStreaks(world, cars, k) {
    const wet = world.weather?.wet ?? 0;
    const cam = world.camera.position;
    let n = 0;
    if (wet > 0.15 && !this.lite && cam.y < 25) {
      const len = 2.5 + wet * 4.5;
      const put = (x, z, w, r, g, b) => {
        if (n >= 160) return;
        const ang = Math.atan2(cam.x - x, cam.z - z);
        const d = Math.hypot(cam.x - x, cam.z - z);
        // más larga cuanto más al ras se mira (y nunca más allá de la cámara)
        const l = Math.min(d * 0.9, len * (1 + Math.min(2, d / (cam.y * 8 + 1))));
        this.q.setFromAxisAngle(this.ss.set(0, 1, 0), ang);
        // (con la calle inundada, sobre el agua)
        this.m4.compose(this.v.set(x, Math.max(0.035, (world.agua?.level ?? -9) + 0.012), z), this.q, this.ss.set(w, 1, l));
        this.streaks.setMatrixAt(n, this.m4);
        this.sc.setRGB(r * wet * k, g * wet * k, b * wet * k);
        this.streaks.setColorAt(n, this.sc);
        n++;
      };
      for (const v of cars) {
        if (!v.mesh.visible || v.kind === 'moto' || Math.abs(v.x - cam.x) > 70 || Math.abs(v.z - cam.z) > 70) continue;
        const fx = v.fx;
        const fz = v.fz;
        const half = v.L / 2 + 0.1;
        const w = v.W / 2 - 0.28;
        const brake = v.mesh.userData.tail?.material?.color?.r > 2;
        for (const s of [-1, 1]) {
          const rx = fz * w * s;
          const rz = -fx * w * s;
          put(v.x + fx * half + rx, v.z + fz * half + rz, 0.45, 0.9, 0.82, 0.62);
          put(v.x - fx * half + rx, v.z - fz * half + rz, 0.35, brake ? 1 : 0.55, brake ? 0.1 : 0.05, brake ? 0.06 : 0.03);
        }
      }
    }
    this.streaks.count = n;
    this.streaks.instanceMatrix.needsUpdate = true;
    if (this.streaks.instanceColor) this.streaks.instanceColor.needsUpdate = true;
  }

  // farol voltead: se apaga el halo y el cono de luz
  lampOff(i) {
    const pos = this.lamps.geometry.attributes.position;
    pos.setY(i, -500);
    pos.needsUpdate = true;
    this.cones.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
    this.cones.instanceMatrix.needsUpdate = true;
  }
}
