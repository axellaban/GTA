// GTA Conurbano · Temperley. Arma el mundo, el ciclo de día y noche y el loop del juego.
import * as THREE from 'three';
import './style.css';
import { buildCity } from './city.js';
import { makeGround, ISLANDS, PLATFORM } from './map.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Npcs } from './npcs.js';
import { Crime } from './crime.js';
import { Events } from './events.js';
import { Trains } from './trains.js';
import { Hud } from './hud.js';
import { lightMat } from './cars.js';
import { loadGaspiPhoto } from './human.js';
import { Sky } from './sky.js';
import { Post, QUALITY } from './post.js';
import { Glows } from './glow.js';
import { R } from './rng.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Calidad gráfica: se recuerda por navegador; en celulares arranca en "bajo".
const coarse = matchMedia('(pointer: coarse)').matches;
let qualityName = coarse ? 'bajo' : 'alto';
try {
  const saved = localStorage.getItem('gta-conurbano-calidad');
  if (saved && QUALITY[saved]) qualityName = saved;
} catch {
  /* sin almacenamiento */
}
let Q = QUALITY[qualityName];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 1400);
scene.fog = new THREE.Fog(0xc9d6dc, 90, 420);

// ---------- Cielo y luces ----------
const sky = new Sky(scene, renderer);
const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x5b5646, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -70;
sc.right = sc.top = 70;
sc.near = 10;
sc.far = 400;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
let post = null;

function applyQuality(name) {
  qualityName = name;
  Q = QUALITY[name];
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  const shadows = Q.shadows > 0;
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }
  sun.castShadow = shadows;
  if (shadows && sun.shadow.mapSize.x !== Q.shadows) {
    sun.shadow.mapSize.set(Q.shadows, Q.shadows);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  post = new Post(renderer, scene, camera, Q);
  for (const b of document.querySelectorAll('[data-quality]')) b.setAttribute('aria-pressed', String(b.dataset.quality === name));
  try {
    localStorage.setItem('gta-conurbano-calidad', name);
  } catch {
    /* sin almacenamiento */
  }
}
applyQuality(qualityName);
for (const b of document.querySelectorAll('[data-quality]')) b.addEventListener('click', () => applyQuality(b.dataset.quality));

// ---------- Mundo ----------
const city = buildCity(scene);
const heightAt = makeGround(city.blocks);
const audio = new Audio();
const input = new Input(canvas);
const hud = new Hud();
const player = new Player(scene, city, heightAt);
loadGaspiPhoto();
const traffic = new Traffic(scene, audio);
traffic.populate(city, player);
const npcs = new Npcs(scene, city, city.colliders, heightAt, audio);
npcs.populate();
const crime = new Crime(scene, traffic, city.colliders, audio);
const events = new Events(scene, traffic, audio);
const trains = new Trains(scene, audio);
const glows = new Glows(scene, city);

const time = { hour: 17.5, night: false, label: '17:30' };
const world = { scene, camera, city, input, audio, hud, player, traffic, npcs, crime, events, trains, time, colliders: city.colliders };

// Faroles y luces de los autos
const lampColor = new THREE.Color();
function updateTime(dt) {
  const rate = time.night ? 2.2 : 1; // minutos de juego por segundo real
  time.hour = (time.hour + (dt * rate) / 60) % 24;
  const h = time.hour;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  time.label = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const elev = Math.sin(((h - 6.5) / 13) * Math.PI); // >0 de día
  const day = THREE.MathUtils.clamp(elev * 3 + 0.12, 0, 1);
  const dusk = THREE.MathUtils.clamp(1 - Math.abs(elev) * 3.2, 0, 1) * (h > 12 ? 1 : 0.6);
  time.night = day < 0.15;
  const nightTop = new THREE.Color(0x050a1a);
  const nightBottom = new THREE.Color(0x1a2233);
  const dayTop = new THREE.Color(0x3d7fcf);
  const dayBottom = new THREE.Color(0xcfdde4);
  const duskBottom = new THREE.Color(0xf59a52);
  const duskTop = new THREE.Color(0x4a5d9e);
  const U = sky.uniforms;
  U.zenith.value.copy(nightTop).lerp(dayTop, day).lerp(duskTop, dusk * 0.6);
  U.horizon.value.copy(nightBottom).lerp(dayBottom, day).lerp(duskBottom, dusk * 0.85);
  U.night.value = 1 - THREE.MathUtils.clamp(day * 3, 0, 1);
  U.time.value += dt;
  U.sunColor.value.setHSL(0.1 - dusk * 0.05, 0.9, 0.62 - dusk * 0.05);
  scene.fog.color.copy(U.horizon.value).lerp(U.zenith.value, 0.15);
  scene.fog.near = 50 + day * 50;
  scene.fog.far = 240 + day * 200;
  sun.intensity = 0.45 + day * 2.2;
  sun.color.setHSL(0.09 - dusk * 0.04, 0.5 + dusk * 0.4, 0.75 - dusk * 0.1);
  if (time.night) sun.color.set(0x8fa8ff);
  hemi.intensity = 0.75 + day * 0.55;
  hemi.color.copy(U.zenith.value).lerp(new THREE.Color(time.night ? 0x7d8fd0 : 0xffffff), 0.55);
  hemi.groundColor.set(time.night ? 0x2e2a3a : 0x5b5646);
  const az = ((h - 6) / 24) * Math.PI * 2;
  const sx = Math.cos(az) * 120;
  const sy = Math.max(35, Math.abs(elev) * 170);
  const sz = Math.sin(az) * 60 - 40;
  sun.position.set(player.x + sx, sy, player.z + sz);
  sun.target.position.set(player.x, 0, player.z);
  // el disco del sol en el cielo sigue la luz (baja hasta el horizonte al atardecer)
  U.sunDir.value.set(Math.cos(az), Math.max(-0.2, elev * 0.9), Math.sin(az) * 0.5 - 0.33).normalize();
  sky.updateEnv(h, scene);
  post?.setMood(1 - day, dusk);
  // faroles de sodio
  const lampsOn = day < 0.35;
  lampColor.set(lampsOn ? 0xffc46b : 0x3a3226);
  for (const m of city.lampMats) m.color.copy(lampColor);
  lightMat.color.setScalar(lampsOn ? 2.2 : 0.9);
  city.lampPools.visible = lampsOn;
  time.glow = THREE.MathUtils.clamp((0.42 - day) * 2.6, 0, 1);
  city.windowMat.emissiveIntensity = THREE.MathUtils.clamp((0.45 - day) * 2.2, 0, 0.85);
  city.lampPools.material.opacity = THREE.MathUtils.clamp((0.35 - day) * 0.8, 0, 0.2);
  renderer.toneMappingExposure = 1.0 + (1 - day) * 0.45;
}

// ---------- Objetivos ----------
const steps = [
  { text: 'Cruzá Av. Meeks y andá a la estación Temperley', target: () => city.spots.stationDoor, done: () => dist(city.spots.stationDoor) < 5 },
  { text: 'Comprate un pancho en el carrito ($1.500)', target: () => city.spots.pancho, done: () => flags.pancho },
  { text: 'Conseguí un auto: acercate y apretá F', target: () => nearestParked(), done: () => !!player.vehicle },
  { text: 'Andá a ver qué pasa en el corte', target: () => nearestCorte(), done: () => { const c = nearestCorte(); return c && dist(c) < 32; } },
  { text: 'Temperley es tuyo. Cuidá el celu.', target: () => null, done: () => false },
];
const flags = { pancho: false };
let step = 0;
function dist(p) {
  return p ? Math.hypot(p.x - player.x, p.z - player.z) : Infinity;
}
function nearestParked() {
  let best = null;
  let bd = Infinity;
  for (const v of traffic.parked) {
    const d = dist(v);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}
function nearestCorte() {
  let best = null;
  let bd = Infinity;
  for (const e of events.list) {
    if (e.type !== 'corte' || e.leaving) continue;
    const d = dist(e);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best && step === 3 && !events.firstForced) {
    events.firstForced = true;
    best = events.spawnCorte(player, true);
  }
  return best;
}
const praise = ['¡BIEN AHÍ!', '¡VAMOS, GASPI!', '¡DE UNA!', '¡ESO!'];
function updateObjective() {
  const s = steps[step];
  if (s.done()) {
    if (step < steps.length - 1) {
      hud.flash(praise[step % praise.length], step === 3 ? 'Los cortes aparecen solos: fijate en el zócalo de abajo' : '', 'ok', 2.4);
      step++;
    }
  }
  const cur = steps[step];
  hud.setObjective(cur.text, cur.target());
  hud.updateObjective(player);
}

// ---------- Acciones con E ----------
function interactions() {
  if (player.dead || hud.dialog) {
    hud.prompt(null);
    return;
  }
  if (player.vehicle) {
    hud.prompt(Math.abs(player.vehicle.speed) < 3 ? 'F' : null, Math.abs(player.vehicle.speed) < 3 ? 'Bajarse del auto' : null);
    return;
  }
  let action = null;
  const pancho = city.spots.pancho;
  if (dist(pancho) < 2.6) {
    action = {
      text: 'Comprar un pancho ($1.500)',
      run: () => {
        if (player.money < 1500) {
          hud.toast('No te alcanza ni para un pancho');
          return;
        }
        player.addMoney(-1500);
        player.health = Math.min(100, player.health + 25);
        player.say('¡Uno con todo, jefe!', 2.5);
        audio.plata();
        flags.pancho = true;
      },
    };
  }
  if (!action) {
    const beggar = npcs.list.find((n) => n.type === 'mendigo' && Math.hypot(n.x - player.x, n.z - player.z) < 2.6);
    if (beggar) {
      action = {
        text: 'Darle $500',
        run: () => {
          if (player.money < 500) return hud.toast('No tenés ni para eso');
          player.addMoney(-500);
          player.addRespeto(1);
          beggar.say('Dios te bendiga, pibe', 3);
          beggar.cool = 60;
        },
      };
    }
  }
  if (!action && crime.motos.some((m) => m.state !== 'down' && m.v.speed < 2.5 && Math.hypot(m.v.x - player.x, m.v.z - player.z) < 2.2)) {
    action = { text: 'Voltearles la moto', run: () => crime.tryShove(world) };
  }
  if (!action) {
    const n = npcs.list.find((o) => o.knockT <= 0 && o.state !== 'sit' && Math.hypot(o.x - player.x, o.z - player.z) < 1.7);
    if (n) {
      action = {
        text: n.type === 'zombie' ? 'Sacártelo de encima' : 'Empujar',
        run: () => {
          player.punchT = 0.3;
          npcs.knock(n, Math.sin(player.heading), Math.cos(player.heading), 2);
          if (n.type === 'vecino') player.addRespeto(-1);
          player.grabbed = 0;
        },
      };
    }
  }
  const car = player.nearestVehicle(world);
  if (action) hud.prompt('E', action.text);
  else if (car) hud.prompt('F', car.ai ? 'Sacarle el auto' : car.kind === 'moto' ? 'Subirse a la moto' : 'Subir al auto');
  else hud.prompt(null);
  if (action && input.hit('e', 'mouse0')) action.run();
}

// ---------- Ganchos del jugador ----------
player.say = (text, dur = 2.5) => (player.bubble = { text, t: dur });
player.hooks.hurt = (n, msg) => {
  if (msg && n >= 15) hud.toast(msg, 2);
};
player.hooks.die = (msg) => {
  document.getElementById('wasted').hidden = false;
  document.getElementById('wasted-title').textContent = msg === 'TE PASÓ POR ENCIMA EL ROCA' ? 'TE PASÓ EL ROCA' : 'TE BAJARON';
  document.getElementById('wasted-sub').textContent = msg === 'TE PASÓ POR ENCIMA EL ROCA' ? 'Nunca cruces con la barrera baja' : msg;
};
player.hooks.respawn = (lost) => {
  document.getElementById('wasted').hidden = true;
  hud.flash('HOSPITAL GANDULFO', `Te dieron el alta. La cuenta: $${lost.toLocaleString('es-AR')}`, 'warn', 3.5);
};
player.hooks.respeto = (n) => {
  if (n > 0) hud.toast(`Respeto +${n}`, 1.6);
  if (n < 0) hud.toast(`Respeto ${n}`, 1.6);
};
events.onNews = (t) => hud.setTicker(events.news);
hud.setTicker(events.news);

// ---------- Globos ----------
function speakers() {
  const out = [];
  const add = (x, y, z, text, bad) => {
    const d = Math.hypot(x - player.x, z - player.z);
    if (d < 38) out.push({ x, y, z, text, bad, d });
  };
  for (const n of npcs.list) if (n.bubble) add(n.x, n.y + 2.35, n.z, n.bubble.text, n.type === 'trapito');
  for (const m of crime.motos) if (m.bubble) add(m.v.x, 2.6, m.v.z, m.bubble.text, true);
  if (player.bubble) add(player.x, player.y + 2.4, player.z, player.bubble.text, false);
  // la gente del corte canta
  for (const e of events.list) {
    if (e.leaving || dist(e) > 30) continue;
    if (!e.chant || e.chant.t <= 0) e.chant = R.chance(0.02) ? { text: R.pick(['¡No se pasa, flaco!', '¡Luz! ¡Luz! ¡Luz!', '¡Queremos soluciones!', '¡Vamos, vamos, compañeros!', '¡Tocá bocina si nos apoyás!']), t: 3 } : null;
    if (e.chant) add(e.x, 3, e.z, e.chant.text, true);
  }
  return out.sort((a, b) => a.d - b.d);
}

// ---------- Loop ----------
let started = false;
let last = performance.now();
let intro = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  updateTime(started ? dt : dt * 0.2);
  if (!started) {
    // cámara dando vueltas sobre la estación
    intro += dt * 0.06;
    camera.position.set(-20 + Math.cos(intro) * 150, 70, Math.sin(intro) * 150);
    camera.lookAt(-15, 0, 0);
    trains.update(dt, null);
    events.update(dt, world);
    traffic.update(dt, world);
    glows.update(world, time.glow);
    sky.follow(camera);
    post.render();
    requestAnimationFrame(frame);
    return;
  }
  if (input.hit('m')) {
    const muted = audio.toggleMute();
    document.getElementById('mute').textContent = muted ? 'Sin sonido' : 'Sonido';
  }
  hud.handleKeys(input);
  interactions();
  player.update(dt, world);
  if (player.bubble) {
    player.bubble.t -= dt;
    if (player.bubble.t <= 0) player.bubble = null;
  }
  traffic.update(dt, world);
  npcs.update(dt, world);
  crime.update(dt, world);
  events.update(dt, world);
  trains.update(dt, player);
  updateObjective();
  player.updateCamera(camera, dt, city.colliders);
  const moto = crime.nearestMoto(player.x, player.z, 80);
  audio.update(player.vehicle?.speed ?? 0, !!player.vehicle, moto ? Math.hypot(moto.x - player.x, moto.z - player.z) : 999);
  hud.update(dt, world);
  hud.bubbles(camera, speakers());
  glows.update(world, time.glow);
  sky.follow(camera);
  post.render();
  input.endFrame();
  requestAnimationFrame(frame);
}

function start(data = {}) {
  if (data.money != null) {
    player.money = data.money;
    player.respeto = data.respeto ?? 0;
    player.phone = data.phone ?? true;
    time.hour = data.hour ?? time.hour;
    step = data.step ?? 0;
  }
  requestAnimationFrame(frame);
}
window.claude?.hot?.snapshot?.(() => ({ money: player.money, respeto: player.respeto, phone: player.phone, hour: time.hour, step }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});

document.getElementById('play').addEventListener('click', () => {
  document.getElementById('start').hidden = true;
  hud.show();
  audio.start();
  input.wantLock = true;
  try {
    const p = canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* sin pointer lock */
  }
  started = true;
  last = performance.now();
  hud.flash('TEMPERLEY', 'Av. Meeks 1400 · Estación del Roca', 'warn', 3);
});
document.getElementById('mute').addEventListener('click', () => {
  const muted = audio.toggleMute();
  document.getElementById('mute').textContent = muted ? 'Sin sonido' : 'Sonido';
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  post?.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Para pruebas desde la consola
window.__gta = world;
window.__renderer = renderer;
void ISLANDS;
void PLATFORM;
