// Postprocesado: resplandor (bloom), viñeta y un gradeo de color cálido tipo Vice City.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.12 },
    contrast: { value: 1.06 },
    warm: { value: new THREE.Vector3(1.03, 1.0, 0.95) },
    vignette: { value: 0.32 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 warm;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * warm;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d, d) * vignette * 1.6;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export const QUALITY = {
  alto: { post: true, bloomScale: 0.5, shadows: 2048, pixelRatio: 1.5, samples: 4, npcScale: 1 },
  medio: { post: true, bloomScale: 0.35, shadows: 1024, pixelRatio: 1, samples: 0, npcScale: 0.8 },
  bajo: { post: false, bloomScale: 0, shadows: 0, pixelRatio: 1, samples: 0, npcScale: 0.6 },
};

export class Post {
  constructor(renderer, scene, camera, q) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.q = q;
    this.enabled = q.post;
    if (!this.enabled) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.samples });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * q.bloomScale, size.y * q.bloomScale), 0.35, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }
  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setSize(w, h);
  }
  // k: 0 de día, 1 de noche; dusk: 0..1 al atardecer
  setMood(k, dusk) {
    if (!this.enabled) return;
    this.bloom.strength = 0.22 + k * 0.75 + dusk * 0.2;
    this.bloom.threshold = 0.92 - k * 0.35;
    this.bloom.radius = 0.5 + k * 0.2;
    const u = this.grade.uniforms;
    u.warm.value.set(1.03 + dusk * 0.06, 1.0 - k * 0.02, 0.95 + k * 0.08);
    u.saturation.value = 1.12 + dusk * 0.12 - k * 0.1;
    u.vignette.value = 0.3 + k * 0.25;
  }
  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
