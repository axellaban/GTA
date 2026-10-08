// Inundación: cuando llueve fuerte el agua se junta, primero llena el bajo nivel (10 m de hondo) y
// después sube por las calles, las veredas y los pulmones de manzana. Con tormenta se puede nadar.
//
// El nivel es uno solo para todo el mapa (el agua busca su nivel) y sube o baja según cuánto llueve y
// cuánto tragan los desagües. La superficie es un plano a esa altura con un material físico:
//   - reflejo plano de verdad (la ciudad dibujada otra vez desde abajo del agua, a media resolución),
//     con la mezcla de Fresnel del agua (IOR 1,33): de arriba se ve el agua marrón, al ras es un espejo;
//   - agua turbia (la de las inundaciones del conurbano): transparente donde hay dos dedos y opaca donde
//     pasa los 40 cm. La profundidad sale del piso conocido (src/map.js), no del buffer de profundidad;
//   - espuma en los cordones, contra las paredes y donde algo se mueve;
//   - gotas de lluvia que abren anillos, una corriente lenta y ondas que dejan Gaspi, la gente y los
//     autos al pasar (hasta 32 fuentes a la vez);
//   - el sol brilla en las ondas y recibe la sombra de las casas; de noche la luz de los faroles cae sobre
//     el agua y los neones se reflejan.
import * as THREE from 'three';
import { DATA as D, X0, Z0, X1, Z1 } from './map.js';
import { laneDist } from './bajo-geo.js';
import { AGUA } from './atmosphere.js';

import { stepLevel, LEVELS, NADAR, VADEO } from './agua-nivel.js';

export { NADAR, VADEO };
const { SECO, FONDO, CALLE } = LEVELS;

export class Agua {
  constructor(scene, renderer, heightAt) {
    this.scene = scene;
    this.renderer = renderer;
    this.heightAt = heightAt;
    this.level = SECO;
    this.t = 0;
    this.rain = 0;
    this.flow = new THREE.Vector2(0.22, 0.1);
    // fuentes de ondas: x, z, edad, fuerza
    this.rips = Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 99, 0));
    this.ripsLive = Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 99, 0));
    this.ripI = 0;
    this.buildGround();
    this.buildSurface();
    this.buildUnderside();
    this.buildReflection();
    // el agua de Blender (tools/blender/agua.py): ondas con espuma y las cáusticas que hacen en el fondo
    const load = new THREE.TextureLoader();
    load.load('textures/agua_normal.webp', (t) => {
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.colorSpace = THREE.NoColorSpace;
      this.U.uWaves.value = t;
      this.U.uWavesOn.value = 1;
      this.UU.uWaves.value = t;
    });
    load.load('textures/agua_causticas.webp', (t) => {
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.colorSpace = THREE.NoColorSpace;
      AGUA.causticTex.value = t;
    });
    // la cámara está abajo del agua (lo usa la vista de buceo: src/post.js y src/player.js)
    this.under = false;
  }

  // ---------- consultas para el resto del juego ----------
  // altura de la superficie (o -Infinity si ahí no hay agua)
  surface(x, z) {
    if (this.level <= SECO + 0.1) return -Infinity;
    const g = this.heightAt(x, z);
    return this.level > g ? this.level : -Infinity;
  }
  // cuánta agua hay en ese punto (0 si está seco)
  depth(x, z, g = this.heightAt(x, z)) {
    return Math.max(0, this.level - g);
  }
  // el piso "efectivo" para partículas y objetos que flotan
  floor(x, z) {
    const g = this.heightAt(x, z);
    return Math.max(g, this.level);
  }
  // una onda que se abre desde (x, z); fuerza 0..1
  ripple(x, z, k = 1) {
    if (this.level <= SECO + 0.1) return;
    const r = this.rips[this.ripI];
    this.ripI = (this.ripI + 1) % this.rips.length;
    r.set(x, z, 0, Math.min(1.5, k));
  }
  // para probar o el truco "diluvio": salta directo a un nivel (metros sobre la calzada)
  setDepth(m) {
    this.level = m <= 0 ? SECO : CALLE + m;
  }
  // ¿hay agua en algún lado? (aunque sea en el fondo del bajo nivel)
  get wet() {
    return this.level > SECO + 0.1;
  }
  get streetDepth() {
    return Math.max(0, this.level - CALLE);
  }

  // ---------- simulación ----------
  update(dt, world, camera) {
    const rain = world.weather?.rain ?? 0;
    this.rain = rain;
    this.t += dt;
    this.level = stepLevel(this.level, rain, dt, !!world.weather?.diluvio);
    for (const r of this.rips) r.z += dt;
    // al shader van solo las ondas vivas (las primeras uRipN): el resto del tiempo el bucle no corre
    let n = 0;
    for (const r of this.rips) if (r.z < 4 && r.w > 0) this.ripsLive[n++].copy(r);
    this.U.uRipN.value = n;
    this.news(world);
    const on = this.level > SECO + 0.1 && !world.inside;
    this.mesh.visible = on;
    this.under = on && camera.position.y < this.level - 0.02;
    this.below.visible = this.under;
    // cáusticas en todo lo que queda abajo (src/atmosphere.js): el sol de día, nada de noche
    const P = AGUA.aguaParams.value;
    P.set(on ? this.level : -99, this.t, (world.sunK ?? 1) * (1 - rain * 0.55), (this.t * 9) % 16);
    // la marca del agua en las paredes y el barro: queda hasta donde llegó y se seca en unos 6 minutos
    if (this.level >= (this.marca ?? -99) - 0.01) {
      this.marca = this.level;
      this.marcaK = 1;
    } else this.marcaK = Math.max(0, (this.marcaK ?? 0) - dt / 360);
    if (this.marcaK <= 0) this.marca = this.level;
    // (solo desde la calle para arriba: el bajo nivel está siempre embarrado igual)
    AGUA.aguaMarca.value.set(world.inside || this.marca < 0.06 ? -99 : this.marca, world.inside ? 0 : this.marcaK);
    if (!on) return;
    this.mesh.position.y = this.level;
    this.below.position.y = this.level;
    this.UU.uTime.value = this.t;
    if (this.under) {
      // el techo de agua toma el cielo de afuera (de noche, oscuro) y el sol de la hora
      this.UU.uSun.value = P.z;
      if (this.scene.fog) this.UU.uSky.value.copy(this.scene.fog.color).multiplyScalar(0.6 + 0.6 * P.z);
      this.snow(world.fx, camera, dt);
    }
    const U = this.U;
    U.uTime.value = this.t;
    U.uRain.value = world.inside ? 0 : rain;
    U.uLevel.value = this.level;
    U.uNight.value = world.time?.night ? 1 : 0;
    // la corriente gira despacio (el agua va buscando las bocas de tormenta)
    const a = Math.sin(this.t * 0.013) * 1.2 + 0.4;
    this.flow.set(Math.cos(a), Math.sin(a)).multiplyScalar(0.12 + rain * 0.2);
    U.uFlow.value.copy(this.flow);
    this.followCamera(camera);
  }

  // el zócalo de noticias y un aviso cuando el agua cambia de etapa
  news(world) {
    const L = this.level;
    const st = L < FONDO + 0.3 ? 0 : L < CALLE ? 1 : L < 0.35 ? 2 : L < NADAR - 0.05 ? 3 : 4;
    const prev = this.stage ?? 0;
    this.stage = st;
    if (st === prev || !world.events) return;
    const up = st > prev;
    const msg = up
      ? [null, 'Temperley: se anegó el paso bajo nivel Manuel Belgrano, no circulen', 'Lomas: calles anegadas en Temperley, el agua ya pasa el cordón', 'Temperley bajo el agua: autos varados y vecinos con el agua a la cintura', 'Temperley: la gente sale nadando, Defensa Civil pide no salir de las casas'][st]
      : [null, 'Temperley: bajó el agua en las calles, el bajo nivel sigue anegado', 'Temperley: empieza a bajar el agua', 'Temperley: el agua baja de a poco, todavía no se puede circular', null][st];
    if (msg) world.events.pushNews(msg);
    if (up && st >= 3 && !world.inside) world.hud?.flash(st === 4 ? 'INUNDACIÓN' : 'CALLES ANEGADAS', st === 4 ? 'No se hace pie: a nadar.' : 'Los autos se ahogan con el agua alta.', 'warn', 3);
  }

  // buceando: la mugre en suspensión del agua turbia, alrededor de la cámara (da la escala y el movimiento)
  snow(fx, camera, dt) {
    if (!fx) return;
    this.snowT = (this.snowT || 0) + dt * 70;
    const c = camera.position;
    while (this.snowT >= 1) {
      this.snowT -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 6;
      const y = c.y + (Math.random() - 0.5) * 4;
      if (y > this.level - 0.05) continue;
      const g = 0.35 + Math.random() * 0.25;
      fx.alpha.add({ x: c.x + Math.cos(a) * r, y, z: c.z + Math.sin(a) * r, vx: this.flow.x * 0.5 + (Math.random() - 0.5) * 0.05, vy: (Math.random() - 0.5) * 0.04, vz: this.flow.y * 0.5 + (Math.random() - 0.5) * 0.05, grav: 0, drag: 0, life: 0, max: 3 + Math.random() * 2, s0: 0.012 + Math.random() * 0.02, s1: 0.012, c0: [g, g * 0.95, g * 0.7], a: 0.45, fadeIn: 0.6, ceil: this.level - 0.03 });
    }
  }

  // ---------- el piso que ve el shader ----------
  // dos texturas con la altura del piso (rojo) y qué tan cerca hay una pared (verde): una de 256 m con
  // celdas de 50 cm que sigue a la cámara, y otra de todo el mapa cada 4 m para lo lejano
  buildGround() {
    const N = 512;
    const RES = 0.5;
    this.win = { N, RES, x: Infinity, z: Infinity };
    this.winData = new Uint16Array(N * N * 2);
    this.winTex = new THREE.DataTexture(this.winData, N, N, THREE.RGFormat, THREE.HalfFloatType);
    this.winTex.magFilter = this.winTex.minFilter = THREE.LinearFilter;
    this.winTex.wrapS = this.winTex.wrapT = THREE.ClampToEdgeWrapping;
    this.winH = new Float32Array(N * N);
    this.winO = new Float32Array(N * N);
    this.winTmp = new Float32Array(N * N);
    // lienzo para dibujar las casas de la ventana
    this.winCanvas = document.createElement('canvas');
    this.winCanvas.width = this.winCanvas.height = N;
    // el mapa entero, grueso (con margen: el agua sigue hasta la niebla)
    const M = 400;
    const CR = 4;
    const cx0 = X0 - M;
    const cz0 = Z0 - M;
    const CW = Math.ceil((X1 - X0 + 2 * M) / CR);
    const CH = Math.ceil((Z1 - Z0 + 2 * M) / CR);
    const cdata = new Uint16Array(CW * CH * 2);
    for (let j = 0; j < CH; j++) {
      for (let i = 0; i < CW; i++) {
        const x = cx0 + (i + 0.5) * CR;
        const z = cz0 + (j + 0.5) * CR;
        // lo más bajo de la celda: así el bajo nivel no desaparece de lejos
        let h = Infinity;
        for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2], [0, 0]]) h = Math.min(h, this.heightAt(x + ox, z + oz));
        cdata[(j * CW + i) * 2] = THREE.DataUtils.toHalfFloat(h);
        cdata[(j * CW + i) * 2 + 1] = 0;
      }
    }
    this.coarseTex = new THREE.DataTexture(cdata, CW, CH, THREE.RGFormat, THREE.HalfFloatType);
    this.coarseTex.magFilter = this.coarseTex.minFilter = THREE.LinearFilter;
    this.coarseTex.needsUpdate = true;
    this.coarse = new THREE.Vector4(cx0, cz0, CW * CR, CH * CR);
    this.bounds = { x0: cx0, z0: cz0, x1: cx0 + CW * CR, z1: cz0 + CH * CR };
    // las casas, con su caja para descartar rápido
    this.houses = D.buildings.map((b) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (const [x, z] of b.r) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      return { r: b.r, x0, x1, z0, z1 };
    });
  }

  // re-centra la ventana fina cuando la cámara se alejó 48 m. El trabajo (262 mil alturas, las casas, el
  // desenfoque y el empaquetado) se reparte en varios cuadros: de un saque eran 30-60 ms de tirón en el celu
  // cada vez que se manejaba rápido. Mientras tanto el shader sigue usando la ventana anterior.
  followCamera(camera) {
    const W = this.win;
    const cx = Math.round(camera.position.x / 16) * 16;
    const cz = Math.round(camera.position.z / 16) * 16;
    const job = this.job;
    if (!job) {
      if (Math.abs(cx - W.x) < 48 && Math.abs(cz - W.z) < 48) return;
      const half = (W.N * W.RES) / 2;
      this.job = { cx, cz, x0: cx - half, z0: cz - half, row: 0, step: 0 };
      // la primera vez (sin ventana todavía) se hace de una
      if (!Number.isFinite(W.x)) while (this.job) this.windowStep();
      return;
    }
    this.windowStep();
  }
  windowStep() {
    const job = this.job;
    const W = this.win;
    const { N, RES } = W;
    const { x0, z0 } = job;
    if (job.step === 0) {
      // alturas: 64 filas por cuadro
      const j1 = Math.min(N, job.row + 64);
      for (let j = job.row; j < j1; j++) {
        for (let i = 0; i < N; i++) this.winH[j * N + i] = this.heightAt(x0 + (i + 0.5) * RES, z0 + (j + 0.5) * RES);
      }
      job.row = j1;
      if (j1 >= N) job.step = 1;
      return;
    }
    if (job.step === 1) {
      this.windowWalls(x0, z0);
      job.step = 2;
      return;
    }
    // empaquetar para la placa de video, en dos mitades
    const h0 = job.step === 2 ? 0 : (N * N) / 2;
    const h1 = h0 + (N * N) / 2;
    for (let k = h0; k < h1; k++) {
      this.winData[k * 2] = THREE.DataUtils.toHalfFloat(this.winH[k]);
      this.winData[k * 2 + 1] = THREE.DataUtils.toHalfFloat(Math.min(1, this.winO[k] * 1.8));
    }
    if (job.step === 2) {
      job.step = 3;
      return;
    }
    this.winTex.needsUpdate = true;
    this.U.uWin.value.set(x0, z0, N * RES, 0);
    W.x = job.cx;
    W.z = job.cz;
    this.job = null;
  }
  windowWalls(x0, z0) {
    const { N, RES } = this.win;
    // paredes: las casas dibujadas en blanco y desparramadas (la espuma se junta contra ellas)
    const g = this.winCanvas.getContext('2d', { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, N, N);
    g.setTransform(1 / RES, 0, 0, 1 / RES, -x0 / RES, -z0 / RES);
    g.fillStyle = '#fff';
    g.beginPath();
    const x1 = x0 + N * RES;
    const z1 = z0 + N * RES;
    for (const h of this.houses) {
      if (h.x1 < x0 || h.x0 > x1 || h.z1 < z0 || h.z0 > z1) continue;
      h.r.forEach(([x, z], k) => (k ? g.lineTo(x, z) : g.moveTo(x, z)));
      g.closePath();
    }
    g.fill();
    const px = g.getImageData(0, 0, N, N).data;
    for (let k = 0; k < N * N; k++) this.winO[k] = px[k * 4] / 255;
    // los cordones también juntan espuma: donde el piso cambia de golpe
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        const h = this.winH[k];
        const step = Math.max(Math.abs(this.winH[k + 1] - h), Math.abs(this.winH[k - 1] - h), Math.abs(this.winH[k + N] - h), Math.abs(this.winH[k - N] - h));
        if (step > 0.08 && step < 1) this.winO[k] = Math.max(this.winO[k], 0.55);
      }
    }
    blur(this.winO, this.winTmp, N, 3);
    blur(this.winO, this.winTmp, N, 3);
  }

  // ---------- la superficie ----------
  buildSurface() {
    const b = this.bounds;
    const geo = new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0, 48, 48);
    geo.rotateX(-Math.PI / 2);
    geo.translate((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x4a3d28, roughness: 0.06, metalness: 0, ior: 1.333, transparent: true, depthWrite: true });
    const U = (this.U = {
      uTime: { value: 0 },
      uRain: { value: 0 },
      uLevel: { value: SECO },
      uNight: { value: 0 },
      uFlow: { value: new THREE.Vector2() },
      uWin: { value: new THREE.Vector4(0, 0, 1, 0) },
      uCoarse: { value: this.coarse },
      uGround: { value: this.winTex },
      uGroundC: { value: this.coarseTex },
      uNoise: { value: noiseTexture() },
      uRips: { value: this.ripsLive },
      uRipN: { value: 0 },
      uRefl: { value: null },
      uReflOn: { value: 0 },
      uTexM: { value: new THREE.Matrix4() },
      uMurk: { value: new THREE.Color(0x46371f) },
      uMurkDeep: { value: new THREE.Color(0x261d10) },
      uFoam: { value: new THREE.Color(0xd8d2c0) },
      uWaves: { value: null },
      uWavesOn: { value: 0 },
    });
    mat.onBeforeCompile = (shader) => {
      THREE.Material.prototype.onBeforeCompile.call(mat, shader);
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec4 vReflUv;\nuniform mat4 uTexM;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvReflUv = uTexM * vec4(vWPos, 1.0);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + WATER_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + WATER_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = wRough;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + WATER_LIGHTS)
        .replace('#include <opaque_fragment>', WATER_OUT);
    };
    mat.customProgramCacheKey = () => 'agua-3';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    // después de lo opaco y de las manchas del piso, antes que el humo, las chispas y la lluvia
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.name = 'agua';
    this.mesh = mesh;
    this.scene.add(mesh);
  }

  // ---------- vista desde abajo (buceando) ----------
  // La superficie vista desde abajo: dentro de la "ventana de Snell" (un cono de 48,6° hacia arriba) se ve
  // el cielo refractado, claro y ondulante; afuera, la reflexión total del agua turbia. Basado en la
  // superficie de WaterThreeJS (Mohamed Achref Elouafi, MIT).
  buildUnderside() {
    const UU = (this.UU = {
      uTime: { value: 0 },
      uWaves: { value: null },
      uSky: { value: new THREE.Color(0.75, 0.82, 0.86) },
      uMurk: { value: new THREE.Color(0.11, 0.12, 0.07) },
      uSun: { value: 1 },
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: UU,
      side: THREE.BackSide,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uWaves;
        uniform vec3 uSky;
        uniform vec3 uMurk;
        uniform float uSun;
        varying vec3 vW;
        vec2 wv(vec2 p, float fr) {
          float f0 = floor(fr);
          vec2 q = fract(p) * 0.992 + 0.004;
          vec2 c0 = vec2(mod(f0, 4.0), floor(mod(f0, 16.0) / 4.0));
          return (texture2D(uWaves, (c0 + q) / 4.0).rg - 0.5) * 1.2;
        }
        void main() {
          vec2 g = wv(vW.xz / 6.0, mod(uTime * 9.0, 16.0)) * 0.7 + wv(vW.xz / 2.3 + 0.37, mod(uTime * 9.0 + 7.0, 16.0)) * 0.4;
          vec3 N = normalize(vec3(-g.x, -1.0, -g.y)); // hacia abajo (hacia el que mira)
          vec3 I = normalize(vW - cameraPosition);
          vec3 r = refract(I, N, 1.333);
          float ci = abs(dot(N, I));
          // (ci puede pasar apenas de 1 y pow de un negativo da NaN)
          float fres = 0.02 + 0.98 * pow(max(1.0 - ci, 0.0), 5.0);
          // el agua iluminada cerca de la superficie (nunca negra)
          vec3 glow = mix(uMurk, uSky * 0.55, 0.35) * (0.45 + 0.75 * uSun);
          vec3 col;
          if (dot(r, r) < 1e-4) col = glow;
          else {
            vec3 sky = uSky * (0.7 + 0.6 * max(r.y, 0.0)) * (0.5 + 0.9 * uSun);
            col = mix(glow, sky, 1.0 - fres);
          }
          // el brillo plateado que baila en la cara de abajo
          float sh = smoothstep(0.08, 0.3, length(g));
          col += vec3(0.85, 0.95, 1.0) * sh * (1.0 - fres) * 0.25 * uSun;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.below = new THREE.Mesh(this.mesh.geometry, mat);
    this.below.visible = false;
    this.below.renderOrder = 1;
    this.below.frustumCulled = false;
    this.below.name = 'agua-abajo';
    this.scene.add(this.below);
  }

  // ---------- reflejo plano ----------
  buildReflection() {
    this.rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 0 });
    this.rt.texture.generateMipmaps = false;
    this.U.uRefl.value = this.rt.texture;
    this.vcam = new THREE.PerspectiveCamera();
    // lo que no hace falta en el reflejo (y cuesta): el pasto, la lluvia (lo pone main.js)
    this.reflHide = () => [];
  }
  // se llama antes de dibujar el cuadro
  // load: 1 normal; menos cuando el juego no llega a los cuadros (resolución dinámica de src/main.js):
  // el reflejo se achica y, muy cargado, se dibuja un cuadro sí y otro no
  renderReflection(camera, load = 1) {
    const U = this.U;
    if (!this.mesh.visible) return;
    this.reflN = (this.reflN || 0) + 1;
    if (load < 0.6 && this.reflN % 2 && U.uReflOn.value) return;
    const L = this.level;
    // si el agua está solo en el bajo nivel y la cámara está lejos, no vale la pena
    if (L < CALLE && laneDist(camera.position.x, camera.position.z) > 260) {
      U.uReflOn.value = 0;
      return;
    }
    if (camera.position.y < L + 0.05) {
      U.uReflOn.value = 0;
      return;
    }
    const r = this.renderer;
    const size = r.getDrawingBufferSize(tmpV2);
    const k = load < 0.8 ? 0.36 : 0.5;
    const w = Math.max(160, Math.round(size.x * k));
    const h = Math.max(90, Math.round(size.y * k));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const vc = this.vcam;
    camera.updateMatrixWorld();
    // la cámara espejada del otro lado del agua
    camPos.setFromMatrixPosition(camera.matrixWorld);
    rotM.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotM).add(camPos);
    vc.position.set(camPos.x, 2 * L - camPos.y, camPos.z);
    vc.up.set(0, 1, 0).applyMatrix4(rotM);
    vc.up.y = -vc.up.y;
    vc.lookAt(look.x, 2 * L - look.y, look.z);
    vc.far = camera.far; // (el cielo es una esfera de 900 m: con menos se recortaba)
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    U.uTexM.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // plano de recorte oblicuo: lo que está abajo del agua no se refleja
    plane.setFromNormalAndCoplanarPoint(UP, tmpV3.set(0, L, 0)).applyMatrix4(vc.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const P = vc.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + P[8]) / P[0], (Math.sign(clip.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    P[2] = clip.x;
    P[6] = clip.y;
    P[10] = clip.z + 1 - 0.003;
    P[14] = clip.w;
    // dibujar sin el agua ni lo que sobra, sin recalcular sombras
    const prevRT = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    const prevXr = r.xr.enabled;
    const hidden = [];
    this.mesh.visible = false;
    for (const o of this.reflHide()) {
      if (o?.visible) {
        o.visible = false;
        hidden.push(o);
      }
    }
    try {
      r.xr.enabled = false;
      r.shadowMap.autoUpdate = false;
      r.setRenderTarget(this.rt);
      r.state.buffers.depth.setMask(true);
      r.clear();
      r.render(this.scene, vc);
      U.uReflOn.value = 1;
    } catch (e) {
      U.uReflOn.value = 0;
      if (!this.warned) console.warn('reflejo del agua:', e);
      this.warned = true;
    } finally {
      r.setRenderTarget(prevRT);
      r.shadowMap.autoUpdate = prevShadow;
      r.xr.enabled = prevXr;
      this.mesh.visible = true;
      for (const o of hidden) o.visible = true;
    }
  }
}

const tmpV2 = new THREE.Vector2();
const tmpV3 = new THREE.Vector3();
const camPos = new THREE.Vector3();
const look = new THREE.Vector3();
const rotM = new THREE.Matrix4();
const plane = new THREE.Plane();
const clip = new THREE.Vector4();
const q = new THREE.Vector4();
const UP = new THREE.Vector3(0, 1, 0);

// desenfoque de caja de radio r, en las dos direcciones
function blur(a, tmp, N, r) {
  const inv = 1 / (2 * r + 1);
  for (let j = 0; j < N; j++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += a[j * N + Math.min(N - 1, Math.max(0, i))];
    for (let i = 0; i < N; i++) {
      tmp[j * N + i] = s * inv;
      s += a[j * N + Math.min(N - 1, i + r + 1)] - a[j * N + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = -r; j <= r; j++) s += tmp[Math.min(N - 1, Math.max(0, j)) * N + i];
    for (let j = 0; j < N; j++) {
      a[j * N + i] = s * inv;
      s += tmp[Math.min(N - 1, j + r + 1) * N + i] - tmp[Math.max(0, j - r) * N + i];
    }
  }
}

// Ruido suave que se repite (dos octavas en rojo y verde, otra en azul): las ondas de la corriente y la
// espuma salen de acá
function noiseTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const lattice = (n, seed) => {
    const g = new Float32Array(n * n);
    let s = seed;
    for (let i = 0; i < g.length; i++) {
      s = (s * 16807) % 2147483647;
      g[i] = s / 2147483647;
    }
    return g;
  };
  const sample = (g, n, x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => g[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  const layers = [
    [8, 0.5, 11],
    [16, 0.28, 23],
    [32, 0.14, 37],
    [64, 0.08, 51],
  ].map(([n, amp, seed]) => ({ n, amp, g: lattice(n, seed) }));
  const foam = [
    [16, 0.55, 71],
    [48, 0.3, 83],
    [96, 0.15, 97],
  ].map(([n, amp, seed]) => ({ n, amp, g: lattice(n, seed) }));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let h = 0;
      let h2 = 0;
      for (const L of layers) h += sample(L.g, L.n, (x / N) * L.n, (y / N) * L.n) * L.amp;
      for (const L of layers) h2 += sample(L.g, L.n, ((x + 97) / N) * L.n, ((y + 41) / N) * L.n) * L.amp;
      let f = 0;
      for (const L of foam) f += sample(L.g, L.n, (x / N) * L.n, (y / N) * L.n) * L.amp;
      const k = (y * N + x) * 4;
      data[k] = Math.round(h * 255);
      data[k + 1] = Math.round(h2 * 255);
      data[k + 2] = Math.round(f * 255);
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------- shader ----------
const WATER_PARS = /* glsl */ `
varying vec3 vWPos;
varying vec4 vReflUv;
uniform float uTime;
uniform float uRain;
uniform float uLevel;
uniform float uNight;
uniform vec2 uFlow;
uniform vec4 uWin;
uniform vec4 uCoarse;
uniform sampler2D uGround;
uniform sampler2D uGroundC;
uniform sampler2D uNoise;
uniform vec4 uRips[32];
uniform int uRipN;
uniform sampler2D uRefl;
uniform float uReflOn;
uniform vec3 uMurk;
uniform vec3 uMurkDeep;
uniform vec3 uFoam;
uniform sampler2D uWaves;
uniform float uWavesOn;

// las ondas de Blender (atlas de 4 x 4 cuadros de un pedazo de 6 m que se repite): pendiente (rg) y espuma (b),
// dos cuadros seguidos mezclados para que el movimiento sea continuo
vec3 wWaves(vec2 p, float fr) {
  float f0 = floor(fr);
  float fk = fr - f0;
  vec2 q = fract(p) * 0.992 + 0.004;
  vec2 c0 = vec2(mod(f0, 4.0), floor(mod(f0, 16.0) / 4.0));
  vec2 c1 = vec2(mod(f0 + 1.0, 4.0), floor(mod(f0 + 1.0, 16.0) / 4.0));
  vec3 a = texture2D(uWaves, (c0 + q) / 4.0).rgb;
  vec3 b = texture2D(uWaves, (c1 + q) / 4.0).rgb;
  vec3 w = mix(a, b, fk);
  return vec3((w.rg - 0.5) * 1.2, w.b);
}

float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// piso (x) y paredes cerca (y): la ventana fina si está adentro, si no el mapa grueso
vec2 wGround(vec2 p) {
  vec2 u = (p - uWin.xy) / uWin.z;
  vec2 e = min(u, 1.0 - u);
  if (min(e.x, e.y) > 0.004) {
    vec2 g = texture2D(uGround, u).rg;
    // en el borde de la ventana se mezcla con el grueso (sin costura)
    float k = smoothstep(0.004, 0.06, min(e.x, e.y));
    vec2 gc = vec2(texture2D(uGroundC, (p - uCoarse.xy) / uCoarse.zw).r, 0.0);
    return mix(gc, g, k);
  }
  return vec2(texture2D(uGroundC, (p - uCoarse.xy) / uCoarse.zw).r, 0.0);
}

// gotas: en cada celda cae una gota cada tanto y abre un anillo (devuelve la pendiente)
vec2 wRainLayer(vec2 p, float t, float rate) {
  vec2 c = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = wHash(c);
  vec2 o = (vec2(wHash(c + 7.1), wHash(c + 3.7)) - 0.5) * 0.4;
  float ph = fract(t * rate + h);
  vec2 d = f - o;
  float r = length(d);
  float rad = ph * 0.48;
  float x = r - rad;
  // el anillo es una onda corta que se apaga mientras se abre
  float env = (1.0 - ph) * (1.0 - ph) * smoothstep(0.03, 0.0, abs(x) - 0.04) * step(0.2, wHash(c + floor(t * rate + h) * 1.7));
  float w = cos(x * 70.0) * env;
  return d / max(r, 1e-3) * w;
}
vec2 wRain(vec2 p, float t) {
  vec2 g = wRainLayer(p * 3.1, t, 1.3) + wRainLayer(p * 3.1 + 17.3, t * 1.07, 1.1);
  g += wRainLayer(p * 4.7 + 5.1, t * 0.93, 1.6) * 0.8;
  return g * 0.9;
}

// las ondas que deja lo que se mueve
vec3 wRips(vec2 p) {
  vec2 g = vec2(0.0);
  float foam = 0.0;
  for (int i = 0; i < 32; i++) {
    if (i >= uRipN) break;
    vec4 r = uRips[i];
    vec2 d = p - r.xy;
    float dist = length(d);
    float rad = r.z * 1.35 + 0.15;
    float x = dist - rad;
    float env = exp(-x * x * 6.0) * exp(-r.z * 0.9) * r.w;
    if (env < 0.002) continue;
    g += d / max(dist, 1e-3) * cos(x * 16.0) * env * 0.7;
    foam += exp(-x * x * 40.0) * exp(-r.z * 2.2) * r.w;
  }
  return vec3(g, foam);
}
`;

// color del agua según la profundidad, espuma y la normal de las ondas
const WATER_COLOR = /* glsl */ `
vec2 wG = wGround(vWPos.xz);
float wDepth = uLevel - wG.x;
vec2 wp = vWPos.xz;
// la corriente: dos capas de ruido que se cruzan
vec2 fl = uFlow * uTime;
vec4 n1 = texture2D(uNoise, (wp - fl) * 0.045);
vec2 wGrad;
float wBlendFoam = 0.0;
if (uWavesOn < 0.5) {
  // (hasta que carguen las ondas de Blender: ruido)
  vec4 n2 = texture2D(uNoise, (wp - fl * 0.6) * 0.13 + 0.37);
  vec4 n3 = texture2D(uNoise, (wp + fl.yx * 0.8) * 0.33 + 0.71);
  wGrad = (n1.rg - 0.5) * 0.18 + (n2.rg - 0.5) * 0.12 + (n3.rg - 0.5) * 0.06 * (0.4 + uRain);
} else {
  // la simulación de océano de Blender: dos escalas que se cruzan (y la corriente las arrastra)
  float fr = mod(uTime * 9.0, 16.0);
  vec3 wa = wWaves((wp - fl * 0.8) / 6.0, fr);
  vec3 wb = wWaves(mat2(0.8, 0.6, -0.6, 0.8) * (wp + fl * 0.5) / 2.3 + 0.37, mod(fr + 7.0, 16.0));
  wGrad = wa.xy * (0.55 + uRain * 0.25) + wb.xy * 0.35 + (n1.rg - 0.5) * 0.06;
  wBlendFoam = wa.z;
}
// gotas (solo cerca: de lejos se promedian a nada y titilan)
float wDist = length(vWPos - cameraPosition);
float wNear = 1.0 - smoothstep(25.0, 60.0, wDist);
if (uRain > 0.02 && wNear > 0.0) wGrad += wRain(wp, uTime) * uRain * wNear;
vec3 wR = wRips(wp);
wGrad += wR.xy;
// de lejos el agua se aplana (si no, el reflejo titila)
wGrad *= mix(1.0, 0.35, smoothstep(40.0, 220.0, wDist));
vec3 wN = normalize(vec3(-wGrad.x, 1.0, -wGrad.y));
// turbia: los primeros centímetros dejan ver el piso, a los 40 cm ya no se ve nada
float wA = 1.0 - exp(-max(wDepth, 0.0) * 7.5);
wA *= smoothstep(0.0, 0.025, wDepth);
vec3 wCol = mix(uMurk, uMurkDeep, smoothstep(0.3, 2.5, wDepth));
// espuma: en la orilla, contra las paredes y los cordones, y en las ondas
float wNoiseF = texture2D(uNoise, wp * 0.21 - fl * 0.5).b * 0.65 + texture2D(uNoise, wp * 0.57 + fl * 0.3).b * 0.35;
float wFoamAmt = smoothstep(0.09, 0.0, wDepth) * 0.9 + wG.y * 0.75 + wR.z * 1.4 + wBlendFoam * (0.6 + uRain * 0.8);
float wFoam = smoothstep(0.62, 0.95, wNoiseF + wFoamAmt * 0.55) * clamp(wFoamAmt, 0.0, 1.0);
wFoam *= smoothstep(0.0, 0.015, wDepth) * (1.0 - smoothstep(80.0, 160.0, wDist));
diffuseColor.rgb = mix(wCol, uFoam, wFoam);
float wAlpha = max(wA, wFoam * 0.92);
float wRough = mix(0.035 + uRain * 0.05, 0.6, wFoam);
`;

// reflejo plano (o el cielo si no hay) con la mezcla de Fresnel del agua
const WATER_LIGHTS = /* glsl */ `
vec3 wV = geometryViewDir;
float wNdV = saturate(dot(normal, wV));
float wFr = 0.02 + 0.98 * pow(1.0 - wNdV, 5.0);
wFr *= 1.0 - wFoam;
// distorsión: más fuerte cerca, menos de lejos
vec2 wOff = wN.xz * (0.035 / (1.0 + wDist * 0.02)) * vReflUv.w;
vec3 wRefl;
if (uReflOn > 0.5) {
  vec4 ru = vReflUv + vec4(wOff, 0.0, 0.0);
  vec2 ruv = ru.xy / ru.w;
  wRefl = texture2D(uRefl, clamp(ruv, vec2(0.001), vec2(0.999))).rgb;
} else {
  wRefl = reflectedLight.indirectSpecular / max(0.04, wFr);
}
reflectedLight.indirectSpecular = vec3(0.0);
// de noche: las rayas de luz de los faroles de sodio y de los neones sobre el agua (como en el asfalto
// mojado, src/detail.js, pero desde la superficie y con las ondas del agua)
#ifdef USE_FOG
if (lampParams.w > 0.001) {
  vec3 rv = normalize(vFogRay);
  vec3 rn = normalize(mix(vec3(0.0, 1.0, 0.0), wN, 0.55));
  vec3 rr = reflect(rv, rn);
  float rup = max(rr.y, 0.012);
  float rh = max(7.7 - uLevel, 0.5);
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 spot = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float k = 0.55 + (float(i) + jit - 0.5) * 0.24;
    float wk = 1.0 - abs(float(i) - 2.0) * 0.3;
    vec2 rp = vWPos.xz + rr.xz * (rh / (rup * k));
    spot += texture2D(lampSpot, (rp - lampParams.xy) / lampParams.z).rgb * wk;
  }
  wRefl += spot * (lampParams.w * 1.6) * (1.0 - wFoam);
  if (neonOn > 0.01) {
    float nh = max(3.4 - uLevel, 0.3);
    vec3 ns = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float k = 0.6 + (float(i) + jit - 0.5) * 0.3;
      vec2 np = vWPos.xz + rr.xz * (nh / (rup * k));
      ns += texture2D(neonSpot, (np - lampParams.xy) / lampParams.z).rgb;
    }
    wRefl += ns * (neonOn * 0.9);
  }
}
#endif
`;

// mezcla final: el cuerpo del agua (transparente donde es baja) + el reflejo (aunque sea baja)
const WATER_OUT = /* glsl */ `
vec3 wBody = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
vec3 wGlint = reflectedLight.directSpecular * (1.0 - wFoam);
float wOutA = 1.0 - (1.0 - wAlpha) * (1.0 - wFr);
vec3 wOut = (wBody * wAlpha * (1.0 - wFr) + wRefl * wFr + wGlint) / max(wOutA, 1e-3);
// (en la orilla wOutA es casi cero y el brillo del sol dividido por eso pasaba el tope del "half float":
// infinito por un alfa cero da NaN al mezclar, y el bloom lo desparramaba: pantalla negra)
wOut = clamp(wOut, 0.0, 512.0);
wOutA = clamp(wOutA + dot(wGlint, vec3(0.3)), 0.0, 1.0);
gl_FragColor = vec4(wOut, wOutA * smoothstep(0.0, 0.01, wDepth));
`;
