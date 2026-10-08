// Postprocesado: oclusión ambiental (sombras de contacto en esquinas, bajo los autos y
// entre las casas), resplandor, y un gradeo de color de película: sombras frías,
// luces cálidas, curva en S, nitidez y un poco de grano.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ScaledBloomPass } from './bloom.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { N8AOPass } from 'n8ao';
import { VC } from './vc.js';
import { AGUA } from './atmosphere.js';

// Bajo el agua: el color se apaga con la distancia (Beer-Lambert: el agua turbia se come primero el rojo) y
// el sol baja en rayos que dibujan las mismas cáusticas de la superficie. Adaptado del pase "underwater
// volumetrics" de WaterThreeJS (Mohamed Achref Elouafi, MIT): la posición de cada píxel sale del buffer de
// profundidad y el rayo de la cámara se recorre en pasos sumando la luz que entra por arriba.
const UnderwaterShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uInvProjView: { value: new THREE.Matrix4() },
    uCam: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uTime: { value: 0 },
    uLevel: { value: 0 },
    uSun: { value: 1 },
    uDeep: { value: new THREE.Color(0.07, 0.095, 0.06) },
    uShaft: { value: new THREE.Color(0.85, 0.95, 0.8) },
    uExt: { value: new THREE.Vector3(0.2, 0.125, 0.22) },
    causticTex: AGUA.causticTex,
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform mat4 uInvProjView;
    uniform vec3 uCam;
    uniform vec3 uSunDir;
    uniform float uTime;
    uniform float uLevel;
    uniform float uSun;
    uniform vec3 uDeep;
    uniform vec3 uShaft;
    uniform vec3 uExt;
    uniform sampler2D causticTex;
    varying vec2 vUv;
    float caus(vec2 p) {
      float fr = mod(uTime * 9.0, 16.0);
      float f0 = floor(fr);
      vec2 c0 = vec2(mod(f0, 4.0), floor(f0 / 4.0));
      return texture2D(causticTex, (c0 + fract(p) * 0.992 + 0.004) / 4.0).r;
    }
    float hg(float c, float g) {
      float g2 = g * g;
      return (1.0 - g2) / (12.5663706 * pow(1.0 + g2 - 2.0 * g * c, 1.5));
    }
    void main() {
      // (una onda leve en la imagen, como mirar a través del agua)
      vec2 uv = vUv + vec2(sin(vUv.y * 40.0 + uTime * 2.1), cos(vUv.x * 33.0 + uTime * 1.7)) * 0.0016;
      vec3 col = texture2D(tDiffuse, uv).rgb;
      float d = texture2D(tDepth, uv).x;
      vec4 wp = uInvProjView * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      wp /= wp.w;
      vec3 to = wp.xyz - uCam;
      float dist = length(to);
      vec3 rd = to / max(dist, 1e-3);
      // lo de afuera del agua se ve a través de la superficie: cuenta solo el tramo mojado
      float wet = dist;
      if (rd.y > 0.001) wet = min(dist, (uLevel - uCam.y) / rd.y);
      vec3 T = exp(-uExt * wet);
      float lightK = 0.35 + 0.65 * uSun;
      col = col * T + uDeep * lightK * (1.0 - T);
      // rayos de sol: se recorre el rayo y se suma la luz que baja por las cáusticas
      float dither = fract(sin(dot(vUv, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
      float len = min(wet, 24.0);
      float st = len / 16.0;
      float acc = 0.0;
      for (int i = 0; i < 16; i++) {
        vec3 p = uCam + rd * ((float(i) + dither) * st);
        float below = uLevel - p.y;
        if (below <= 0.0) continue;
        vec2 sp = (p.xz + uSunDir.xz / max(uSunDir.y, 0.25) * below) / 6.0;
        acc += caus(sp * 0.35) * exp(-below * 0.25) * exp(-(float(i) + dither) * st * 0.12);
      }
      acc *= st;
      vec3 rays = uShaft * acc * 0.09 * hg(dot(rd, uSunDir), 0.6) * 12.566 * uSun;
      gl_FragColor = vec4(col + rays, 1.0);
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    saturation: { value: 1.1 },
    contrast: { value: 0.25 },
    lift: { value: new THREE.Vector3(-0.01, 0.0, 0.02) },
    gain: { value: new THREE.Vector3(1.04, 1.0, 0.95) },
    vignette: { value: 0.32 },
    sharpen: { value: 0.3 },
    grain: { value: 0.016 },
    time: { value: 0 },
    gray: { value: 0 },
    filterColor: { value: new THREE.Vector3(0, 0, 0) },
    filterAmt: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float saturation;
    uniform float gray;
    uniform float contrast;
    uniform vec3 lift;
    uniform vec3 gain;
    uniform float vignette;
    uniform float sharpen;
    uniform float grain;
    uniform float time;
    uniform vec3 filterColor;
    uniform float filterAmt;
    varying vec2 vUv;
    void main() {
      vec2 px = 1.0 / resolution;
      vec4 c0 = texture2D(tDiffuse, vUv);
      vec3 col = c0.rgb;
      // nitidez: realza los bordes finos (rejas, cables, ventanas)
      vec3 blur = (texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb
        + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb) * 0.25;
      col += (col - blur) * sharpen;
      col = clamp(col, 0.0, 1.0);
      // sombras hacia el azul, luces hacia el naranja
      col = col * gain + lift * (1.0 - col);
      // filtro de color de la PS2 (modo Vice City): la imagen se suma a sí misma teñida por la hora,
      // así las luces se lavan a pastel y todo brilla un poco
      col = min(col + col * filterColor * filterAmt, 1.0);
      // curva en S
      col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
      // saturación que respeta los colores que ya están saturados
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
      col = mix(vec3(l), col, saturation + (1.0 - sat) * (saturation - 1.0) * 0.8);
      col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), gray);
      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d, d) * vignette * 1.6;
      float n = fract(sin(dot(gl_FragCoord.xy + fract(time * 7.13) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c0.a);
    }`,
};

export const QUALITY = {
  alto: { post: true, ao: 'full', bloomScale: 0.5, shadows: 2048, pixelRatio: 1.5, samples: 4, sharpen: 0.3, npcScale: 1, lodNear: 28 },
  medio: { post: true, ao: 'half', bloomScale: 0.35, shadows: 1024, pixelRatio: 1, samples: 2, sharpen: 0.2, npcScale: 0.8, lodNear: 18 },
  bajo: { post: false, ao: null, bloomScale: 0, shadows: 0, pixelRatio: 1, samples: 0, sharpen: 0, npcScale: 0.6, lite: true, lodNear: 10 },
};

export class Post {
  constructor(renderer, scene, camera, q) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.q = q;
    this.enabled = q.post;
    if (!this.enabled) return;
    const css = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    // con oclusión ambiental la escena se dibuja en el objetivo de N8AO (con antialiasing propio)
    const rt = new THREE.WebGLRenderTarget(css.x * pr, css.y * pr, { type: THREE.HalfFloatType, samples: q.ao ? 0 : q.samples });
    this.composer = new EffectComposer(renderer, rt);
    if (q.ao) {
      const ao = new N8AOPass(scene, camera, css.x * pr, css.y * pr);
      ao.beautyRenderTarget.samples = q.samples;
      ao.autoDetectTransparency = false;
      const c = ao.configuration;
      c.transparencyAware = false;
      c.gammaCorrection = false;
      // en pantallas grandes la oclusión va a media resolución (se ve igual y cuesta 4 veces menos)
      const half = q.ao === 'half' || css.x * pr * css.y * pr > 1.2e6;
      c.halfRes = half;
      c.aoSamples = half ? 12 : 16;
      c.denoiseSamples = half ? 6 : 8;
      c.denoiseRadius = 12;
      c.aoRadius = 2.6;
      c.distanceFalloff = 1;
      c.intensity = 2.4;
      c.color = new THREE.Color(0x06080f);
      this.ao = ao;
      this.composer.addPass(ao);
    } else this.composer.addPass(new RenderPass(scene, camera));
    // buceando (src/agua.js): se prende solo con la cámara abajo del agua
    this.under = new ShaderPass(UnderwaterShader);
    this.under.enabled = false;
    this.composer.addPass(this.under);
    this.bloom = new ScaledBloomPass(new THREE.Vector2(css.x * pr, css.y * pr), q.bloomScale, 0.35, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // estelas de la PS2 (los "trails" de Vice City): lo muy brillante deja un rastro que se apaga
    this.trails = new AfterimagePass(0.85);
    this.trails.uniforms.thr = { value: 0.7 };
    this.trails.compFsMaterial.fragmentShader = /* glsl */ `
      uniform float damp;
      uniform float thr;
      uniform sampler2D tOld;
      uniform sampler2D tNew;
      varying vec2 vUv;
      void main() {
        vec4 o = texture2D(tOld, vUv);
        vec4 n = texture2D(tNew, vUv);
        float l = dot(o.rgb, vec3(0.299, 0.587, 0.114));
        o.rgb *= damp * smoothstep(thr, thr + 0.25, l);
        gl_FragColor = vec4(max(n.rgb, o.rgb), n.a);
      }`;
    this.composer.addPass(this.trails);
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.sharpen.value = q.sharpen;
    this.composer.addPass(this.grade);
    this.setSize(css.x, css.y);
  }
  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.uniforms.resolution.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }
  // k: 0 de día, 1 de noche; dusk: 0..1 al atardecer
  // clear: 0..1, día de sol sin atardecer ni lluvia (imagen más nítida, cálida y contrastada)
  setMood(k, dusk, rain = 0, clear = 0) {
    if (!this.enabled) return;
    // resplandor suave también de día (la "radiosidad" de la PS2); a pleno sol, menos (no lava la imagen)
    // (medido en celu: con más fuerza los neones, faros y fogatas se queman en manchas blancas)
    this.bloom.strength = 0.24 + k * 0.34 + dusk * 0.12 - clear * 0.08;
    this.bloom.threshold = 0.9 - k * 0.18 + clear * 0.04;
    this.bloom.radius = 0.5 + k * 0.1;
    // estelas: de noche las luces dejan rastro; de día, casi nada
    this.trails.uniforms.damp.value = 0.55 + k * 0.25;
    this.trails.uniforms.thr.value = 0.92 - k * 0.14;
    const u = this.grade.uniforms;
    // día: luces cálidas y sombras apenas azules; atardecer: más naranja; noche: todo más frío
    // al atardecer, un toque magenta (luces rosas y sombras violetas) como Vice City
    // filtro de color a lo Vice City: día dorado, atardecer rosa, noche azul violácea
    u.gain.value.set(1.07 + dusk * 0.05 - k * 0.1 + clear * 0.035, 1.01 - dusk * 0.05 - k * 0.04 + clear * 0.012, 0.9 + dusk * 0.08 + k * 0.2 - clear * 0.035);
    // (de día las sombras se levantan un poco: en el celu se veían negras)
    u.lift.value.set(0.004 - k * 0.026 + dusk * 0.012, 0.008 - k * 0.004, 0.026 + k * 0.026 + rain * 0.01 + dusk * 0.018);
    // al morir (o caer preso) la imagen se va a blanco y negro, como en GTA
    const w = this.wasted || 0;
    u.saturation.value = 1.12 + dusk * 0.1 - k * 0.12 - rain * 0.15 + clear * 0.06;
    u.gray.value = w;
    u.contrast.value = 0.24 + dusk * 0.05 - k * 0.04 + clear * 0.05 + w * 0.18;
    u.sharpen.value = this.q.sharpen * (1 + clear * 0.45);
    u.vignette.value = 0.2 + k * 0.35 + w * 0.5;
    u.time.value = performance.now() / 1000;
    if (VC) this.viceCity(k, dusk, rain, clear);
    const ao = 2.4 - k * 0.9;
    if (this.ao && Math.abs(this.ao.configuration.intensity - ao) > 0.02) this.ao.configuration.intensity = ao;
  }
  // Modo Vice City: más resplandor (la "radiosidad" de la PS2), estelas más largas, colores pastel
  // saturados y un filtro por hora: dorado de día, rosa al atardecer, azul violáceo de noche.
  viceCity(k, dusk, rain, clear) {
    this.bloom.strength += 0.2 + dusk * 0.1 - clear * 0.04;
    this.bloom.threshold -= 0.14;
    this.bloom.radius = 0.85;
    this.trails.uniforms.damp.value = 0.7 + k * 0.18;
    this.trails.uniforms.thr.value -= 0.08;
    const u = this.grade.uniforms;
    const day = (1 - k) * (1 - dusk);
    u.filterColor.value.set(0.5 * day + 0.62 * dusk + 0.2 * k, 0.4 * day + 0.3 * dusk + 0.24 * k, 0.24 * day + 0.42 * dusk + 0.52 * k);
    u.filterAmt.value = 0.32 * (1 - rain * 0.5);
    u.saturation.value += 0.14;
    u.contrast.value -= 0.08;
    u.lift.value.x += 0.02;
    u.lift.value.z += 0.025;
    u.sharpen.value *= 0.5;
    u.vignette.value *= 0.7;
  }
  // cámara abajo del agua: k (0..1), nivel del agua, sol (0 de noche)
  setUnderwater(on, level = 0, sun = 1, sunDir = null, t = 0) {
    if (!this.enabled || !this.under) return;
    const ok = on && !!this.ao?.beautyRenderTarget?.depthTexture;
    this.under.enabled = ok;
    if (!ok) return;
    const u = this.under.uniforms;
    u.tDepth.value = this.ao.beautyRenderTarget.depthTexture;
    u.causticTex.value = AGUA.causticTex.value;
    this.camera.updateMatrixWorld();
    u.uInvProjView.value.multiplyMatrices(this.camera.matrixWorld, this.camera.projectionMatrixInverse);
    u.uCam.value.setFromMatrixPosition(this.camera.matrixWorld);
    u.uLevel.value = level;
    u.uSun.value = sun;
    u.uTime.value = t;
    if (sunDir) u.uSunDir.value.copy(sunDir);
  }
  dispose() {
    if (!this.enabled) return;
    for (const p of this.composer.passes) p.dispose?.();
    this.composer.dispose();
  }
  render() {
    if (this.enabled && !this.renderError) {
      const autoClear = this.renderer.autoClear;
      const xrEnabled = this.renderer.xr?.enabled;
      try {
        this.composer.render();
        return;
      } catch (error) {
        // El compositor puede dejar un framebuffer activo y abortar el loop.
        // Conservar el juego visible y el error original para diagnosticarlo.
        this.renderError = error;
        console.error('Falló el postprocesado; sigue el render de la escena.', error);
      } finally {
        this.renderer.autoClear = autoClear;
        if (this.renderer.xr) this.renderer.xr.enabled = xrEnabled;
      }
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
