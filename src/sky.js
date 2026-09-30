// Cielo procedural: degradé, sol con halo, nubes que se mueven y estrellas de noche.
// También genera el mapa de entorno que reflejan los autos.
import * as THREE from 'three';

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunColor;
uniform float time;
uniform float night;
uniform float cover;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, horizon * 0.7, smoothstep(0.0, -0.25, h));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  float day = 1.0 - night;
  // halo del sol (fuerte al atardecer)
  col += sunColor * (pow(sd, 6.0) * 0.25 + pow(sd, 40.0) * 0.5) * day;
  // disco
  col += sunColor * smoothstep(0.9975, 0.999, sd) * 6.0 * day;
  // luna
  float md = max(dot(d, normalize(-sunDir + vec3(0.0, 0.6, 0.0))), 0.0);
  col += vec3(0.9, 0.92, 1.0) * smoothstep(0.9992, 0.9996, md) * 2.0 * night;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.4;
    uv += vec2(time * 0.006, time * 0.003);
    float n = fbm(uv * 1.3);
    float c = smoothstep(0.62 - cover * 0.35, 0.95, n) * smoothstep(0.0, 0.18, h);
    float lit = 0.55 + 0.45 * sd;
    vec3 cloudLight = mix(horizon, vec3(1.0, 0.97, 0.92), 0.6) * mix(0.25, 1.0, day);
    vec3 cloudDark = mix(horizon, zenith, 0.5) * 0.7;
    vec3 cloud = mix(cloudDark, cloudLight, lit) + sunColor * pow(sd, 8.0) * 0.6 * day;
    col = mix(col, cloud, c * 0.9);
    // estrellas
    float s = step(0.9975, hash(floor(d.xz / (h + 0.05) * 180.0)));
    col += vec3(s) * night * (1.0 - c) * smoothstep(0.05, 0.3, h) * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene, renderer) {
    this.uniforms = {
      sunDir: { value: new THREE.Vector3(0.3, 0.4, -0.2) },
      zenith: { value: new THREE.Color(0x3f7fc4) },
      horizon: { value: new THREE.Color(0xdfe7ea) },
      sunColor: { value: new THREE.Color(0xffd9a0) },
      time: { value: 0 },
      night: { value: 0 },
      cover: { value: 0.5 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
    // escena aparte con el cielo solo, para el mapa de reflejos
    this.envScene = new THREE.Scene();
    this.envMesh = new THREE.Mesh(this.mesh.geometry, mat);
    this.envScene.add(this.envMesh);
    // piso gris para que los autos reflejen algo abajo
    const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3a38 }));
    ground.position.y = -2;
    this.envScene.add(ground);
    this.groundMat = ground.material;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.renderer = renderer;
    this.env = null;
    this.lastEnvHour = -99;
  }

  follow(camera) {
    this.mesh.position.copy(camera.position);
  }

  // Regenera el entorno reflejado cuando cambió bastante la hora.
  updateEnv(hour, scene) {
    let d = Math.abs(hour - this.lastEnvHour);
    d = Math.min(d, 24 - d);
    if (d < 0.4) return;
    this.lastEnvHour = hour;
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    if (this.env) this.env.dispose();
    this.env = rt;
    scene.environment = rt.texture;
  }
}
