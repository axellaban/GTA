// Postprocesado: oclusión ambiental (sombras de contacto en esquinas, bajo los autos y
// entre las casas), resplandor, y un gradeo de color de película: sombras frías,
// luces cálidas, curva en S, nitidez y un poco de grano.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';

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
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 lift;
    uniform vec3 gain;
    uniform float vignette;
    uniform float sharpen;
    uniform float grain;
    uniform float time;
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
      // curva en S
      col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
      // saturación que respeta los colores que ya están saturados
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
      col = mix(vec3(l), col, saturation + (1.0 - sat) * (saturation - 1.0) * 0.8);
      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d, d) * vignette * 1.6;
      float n = fract(sin(dot(gl_FragCoord.xy + fract(time * 7.13) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c0.a);
    }`,
};

export const QUALITY = {
  alto: { post: true, ao: 'full', bloomScale: 0.5, shadows: 2048, pixelRatio: 1.5, samples: 4, sharpen: 0.3, npcScale: 1 },
  medio: { post: true, ao: 'half', bloomScale: 0.35, shadows: 1024, pixelRatio: 1, samples: 2, sharpen: 0.2, npcScale: 0.8 },
  bajo: { post: false, ao: null, bloomScale: 0, shadows: 0, pixelRatio: 1, samples: 0, sharpen: 0, npcScale: 0.6, lite: true },
  // solo lo usa la calidad automática, para celulares que no dan ni en "bajo"
  minimo: { post: false, ao: null, bloomScale: 0, shadows: 0, pixelRatio: 0.7, samples: 0, sharpen: 0, npcScale: 0.5, lite: true },
};
// de peor a mejor, para que la calidad automática suba o baje de a un escalón
export const LEVELS = ['minimo', 'bajo', 'medio', 'alto'];

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
      c.halfRes = q.ao === 'half';
      c.aoSamples = q.ao === 'half' ? 8 : 16;
      c.denoiseSamples = q.ao === 'half' ? 4 : 8;
      c.denoiseRadius = 12;
      c.aoRadius = 2.6;
      c.distanceFalloff = 1;
      c.intensity = 2.4;
      c.color = new THREE.Color(0x06080f);
      this.ao = ao;
      this.composer.addPass(ao);
    } else this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(css.x * pr * q.bloomScale, css.y * pr * q.bloomScale), 0.35, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
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
  setMood(k, dusk, rain = 0) {
    if (!this.enabled) return;
    this.bloom.strength = 0.2 + k * 0.7 + dusk * 0.25;
    this.bloom.threshold = 0.95 - k * 0.4;
    this.bloom.radius = 0.45 + k * 0.25;
    const u = this.grade.uniforms;
    // día: luces cálidas y sombras apenas azules; atardecer: más naranja; noche: todo más frío
    u.gain.value.set(1.04 + dusk * 0.06 - k * 0.06, 1.0 - k * 0.02, 0.95 - dusk * 0.05 + k * 0.1);
    u.lift.value.set(-0.012 - k * 0.01, 0.0 + k * 0.004, 0.022 + k * 0.03 + rain * 0.01);
    u.saturation.value = 1.12 + dusk * 0.1 - k * 0.12 - rain * 0.15;
    u.contrast.value = 0.28 + dusk * 0.05 - k * 0.08;
    u.vignette.value = 0.3 + k * 0.25;
    u.time.value = performance.now() / 1000;
    const ao = 2.4 - k * 0.9;
    if (this.ao && Math.abs(this.ao.configuration.intensity - ao) > 0.02) this.ao.configuration.intensity = ao;
  }
  dispose() {
    if (!this.enabled) return;
    for (const p of this.composer.passes) p.dispose?.();
    this.composer.dispose();
  }
  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
