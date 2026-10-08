// Víboras que nadan en la inundación (en el conurbano, con las crecidas aparecen yararás y culebras). El
// modelo es la cobra CC0 de Micket (OpenGameArt), estirada y con cabeza de yarará en Blender
// (tools/blender/vibora.py). Nadan en S: una onda recorre el cuerpo de la cabeza a la cola a la misma
// velocidad con la que avanzan (así no "patinan"), con la cabeza apenas levantada. El dibujo de yarará
// (manchas oscuras con borde claro a los costados, panza clara) se pinta en el shader.
// Si Gaspi está en el agua cerca, algunas se le acercan y lo pican; después se van.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const N = 4;
const SPEED = 0.42;
const WAVE = 0.62; // largo de la onda del cuerpo (m)

const VERT_PARS = /* glsl */ `
uniform float uT;
uniform float uPh;
varying vec3 vLoc;
`;
const VERT = /* glsl */ `
vLoc = position;
{
  float s = -position.z; // 0 en la cabeza, 1,5 en la cola
  float k = 6.2831853 / ${WAVE.toFixed(3)};
  float amp = 0.012 + 0.075 * smoothstep(0.05, 0.6, s) * (1.0 - 0.25 * smoothstep(1.0, 1.5, s));
  float ph = k * s - uT * k * ${SPEED.toFixed(3)} + uPh;
  transformed.x += amp * sin(ph);
  // la cabeza un poco levantada, el resto a ras del agua
  transformed.y += 0.035 * (1.0 - smoothstep(0.0, 0.3, s));
}
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vLoc;
`;
const FRAG = /* glsl */ `
{
  float s = -vLoc.z;
  float side = vLoc.x;
  // panza clara, lomo marrón grisáceo
  vec3 base = vec3(0.36, 0.27, 0.18);
  vec3 belly = vec3(0.72, 0.66, 0.52);
  vec3 dark = vec3(0.09, 0.06, 0.04);
  vec3 cream = vec3(0.86, 0.8, 0.64);
  vec3 c = mix(belly, base, smoothstep(-0.012, 0.004, vLoc.y));
  // manchas de yarará: a cada costado, corridas medio paso entre un lado y el otro
  float P = 0.105;
  float u = fract(s / P + (side > 0.0 ? 0.5 : 0.0)) - 0.5;
  float d = length(vec2(u * P * 1.25, abs(side) - 0.014)) ;
  float ring = smoothstep(0.024, 0.02, d);
  float core = smoothstep(0.019, 0.015, d);
  c = mix(c, cream, ring * (1.0 - core));
  c = mix(c, dark, core);
  // la cabeza: más oscura, con la línea clara detrás del ojo
  float head = 1.0 - smoothstep(0.06, 0.1, s);
  c = mix(c, mix(dark * 1.6, cream, smoothstep(0.004, 0.0, abs(abs(side) - 0.012)) * step(0.015, s)), head * 0.85);
  // se apaga hacia la punta de la cola
  c = mix(c, base * 0.8, smoothstep(1.3, 1.5, s));
  diffuseColor.rgb = c;
}
`;

export class Viboras {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = null;
    this.t = { value: 0 };
    new GLTFLoader()
      .loadAsync('models/agua/vibora.glb')
      .then((g) => {
        g.scene.traverse((o) => {
          if (o.isMesh && !this.geo) this.geo = o.geometry;
        });
      })
      .catch((e) => console.warn('víbora:', e));
  }

  material(ph) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0 });
    const t = this.t;
    mat.onBeforeCompile = (shader) => {
      THREE.Material.prototype.onBeforeCompile.call(mat, shader);
      shader.uniforms.uT = t;
      shader.uniforms.uPh = { value: ph };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS).replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG);
    };
    mat.customProgramCacheKey = () => 'vibora-1';
    return mat;
  }

  spawn(world) {
    const ag = world.agua;
    const P = world.player;
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 40;
      const x = P.x + Math.cos(a) * r;
      const z = P.z + Math.sin(a) * r;
      if (ag.depth(x, z) < 0.3) continue;
      const ph = Math.random() * 6.28;
      const mesh = new THREE.Mesh(this.geo, this.material(ph));
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.scale.set(1.35, 1.35, 1);
      this.scene.add(mesh);
      this.list.push({ mesh, x, z, heading: Math.random() * Math.PI * 2, turn: 0, mood: Math.random() < 0.4 ? 'curiosa' : 'paseo', biteT: 0, ripT: 0, fleeT: 0 });
      return;
    }
  }

  update(dt, world) {
    const ag = world.agua;
    this.t.value += dt;
    const P = world.player;
    const wet = ag && ag.level > 0.1 && !world.inside;
    if (wet && this.geo && this.list.length < N && Math.random() < dt * 0.25) this.spawn(world);
    // (arriba de un bote o de un auto no pican)
    const inWater = !P.vehicle && !P.boat && (P.swimming || (P.waterDepth ?? 0) > 0.3);
    for (const v of this.list) {
      const dx = P.x - v.x;
      const dz = P.z - v.z;
      const d = Math.hypot(dx, dz);
      if (!wet || d > 90 || ag.depth(v.x, v.z) < 0.08) v.gone = true;
      if (v.gone) continue;
      v.biteT -= dt;
      v.fleeT -= dt;
      // rumbo: deambula; las curiosas van hacia Gaspi si está en el agua; después de picar se escapan
      let want = null;
      if (v.fleeT > 0) want = Math.atan2(-dx, -dz);
      else if (inWater && v.mood === 'curiosa' && d < 9) want = Math.atan2(dx, dz);
      v.turn += ((Math.random() - 0.5) * 2.5 - v.turn) * Math.min(1, dt * 0.8);
      if (want != null) {
        let df = want - v.heading;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        v.heading += Math.max(-1.2 * dt, Math.min(1.2 * dt, df));
      } else v.heading += v.turn * dt * 0.6;
      const sp = SPEED * (v.fleeT > 0 ? 2.2 : 1);
      const nx = v.x + Math.sin(v.heading) * sp * dt;
      const nz = v.z + Math.cos(v.heading) * sp * dt;
      // contra la orilla o una pared, da la vuelta
      const p = { x: nx, z: nz };
      if (ag.depth(nx + Math.sin(v.heading) * 0.8, nz + Math.cos(v.heading) * 0.8) < 0.12 || world.colliders.resolveCircle(p, 0.25)) v.heading += Math.PI * (0.6 + Math.random() * 0.5);
      else {
        v.x = nx;
        v.z = nz;
      }
      // a ras del agua, con el lomo afuera (una yarará grande: unos 8 cm de ancho)
      v.mesh.position.set(v.x, ag.level + 0.014, v.z);
      v.mesh.rotation.set(0, v.heading, 0);
      v.mesh.visible = d < 70;
      // anillitos en el agua alrededor de la cabeza
      v.ripT -= dt;
      if (v.ripT <= 0 && d < 40) {
        v.ripT = 0.7;
        ag.ripple(v.x, v.z, 0.14);
      }
      // ¡pica!
      if (inWater && d < 0.75 && v.biteT <= 0 && v.fleeT <= 0) {
        v.biteT = 5;
        v.fleeT = 7;
        P.hurt(7, 'TE PICÓ UNA VÍBORA');
        world.hud.flash('¡UNA VÍBORA!', 'Te picó una yarará. Salí del agua o alejate nadando.', 'bad', 2.4);
        world.audio.burst?.(0.35, 3800, 'highpass', 0.18, 0, 0.6);
        P.hitReact?.(v.x, v.z);
      }
    }
    for (const v of this.list) {
      if (!v.gone) continue;
      this.scene.remove(v.mesh);
      v.mesh.material.dispose();
    }
    this.list = this.list.filter((v) => !v.gone);
  }
}
