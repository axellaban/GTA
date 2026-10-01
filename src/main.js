// GTA XI · Temperley. Arma el mundo, el ciclo de día y noche, el clima y el loop del juego.
import * as THREE from 'three';
import './style.css';
import { ATMO, LAMPS, NIGHT, buildLampMap } from './atmosphere.js';
import { buildCity } from './city.js';
import { makeGround, ROADS, project, STATION, cornerName, nearestStreetName, nearestRoad } from './map.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Player } from './player.js';
import { Traffic, Vehicle } from './traffic.js';
import { Smash } from './smash.js';
import { Ufo } from './ufo.js';
import { Npcs } from './npcs.js';
import { Crime } from './crime.js';
import { Events } from './events.js';
import { Trains } from './trains.js';
import { Hud } from './hud.js';
import { lightMat, tailMat, brakeMat, paintMat, repairCar } from './cars.js';
import { CAR_COLORS, makeCar } from './vehicles.js';
import { loadGaspiPhoto, updateHumanLod } from './human.js';
import { Sky } from './sky.js';
import { Post, QUALITY } from './post.js';
import { Glows } from './glow.js';
import { buildProps, TrafficLights, BlobShadows } from './props.js';
import { Fx } from './fx.js';
import { Pickups, FIGUS } from './pickups.js';
import { WEAPONS } from './weapons.js';
import { Gym } from './gym.js';
import { Stunts, RAMPS } from './stunts.js';
import { addPalms } from './palms.js';
import { loadFerrari } from './models.js';
import { Laban } from './laban.js';
import { loadPeople, loadAnimals } from './people.js';
import { Rescue } from './rescue.js';
import { Combat } from './combat.js';
import { Police } from './police.js';
import { Nav } from './nav.js';
import { Radio } from './radio.js';
import { R } from './rng.js';
import { setupInstall } from './install.js';
import { Transit } from './transit.js';
import { Interiors } from './interiors.js';
import { Races } from './races.js';
import { Missions, makeMarker } from './missions.js';

setupInstall();

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.localClippingEnabled = true; // el techo cortado de la Ferrari descapotable
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Gráficos siempre en calidad alta (en todos los dispositivos)
const coarse = matchMedia('(pointer: coarse)').matches;
const Q = QUALITY.alto;

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
let glows = null;

// Resolución: los efectos quedan siempre en alto; lo que se ajusta es cuántos píxeles se dibujan.
// Tope de ~Full HD (en pantallas grandes o Retina el navegador lo escala) y resolución dinámica
// como en GTA V o Fortnite: si no llega a ~48 cuadros por segundo dibuja un poco menos, y cuando
// sobra vuelve a subir.
const MAX_PIXELS = 2.1e6;
const res = { scale: 1, t: 0, frames: 0, wait: 5 };
function pixelRatio() {
  return Math.min(devicePixelRatio, Q.pixelRatio, Math.sqrt(MAX_PIXELS / (innerWidth * innerHeight))) * res.scale;
}
function applyResolution() {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  post?.setSize(innerWidth, innerHeight);
}
function dynamicResolution(dt) {
  if (document.hidden || paused) return;
  if (res.wait > 0) {
    // al arrancar y después de cada cambio se compilan shaders y se rearman texturas: no cuenta
    res.wait -= dt;
    res.frames = res.t = 0;
    return;
  }
  res.frames++;
  res.t += dt;
  if (res.t < 2) return;
  const fps = res.frames / res.t;
  res.frames = res.t = 0;
  let next = res.scale;
  if (fps < 48) next = Math.max(0.5, res.scale * (fps < 32 ? 0.8 : 0.9));
  else if (fps > 57 && res.scale < 1) next = Math.min(1, res.scale * 1.08);
  if (Math.abs(next - res.scale) > 0.01) {
    res.scale = next;
    res.wait = 1.5;
    applyResolution();
  }
}

function applyQuality() {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadows, Q.shadows);
  post = new Post(renderer, scene, camera, Q);
}
applyQuality();

// ¿El navegador dibuja con la placa de video? Si está apagada la aceleración por hardware,
// todo va por el procesador y anda lentísimo.
const gpuName = (() => {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    return '';
  }
})();
const noGpu = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuName);

// Contador de cuadros por segundo: agregar ?fps al final del link
const fpsEl = /[?&]fps\b/.test(location.search) ? Object.assign(document.body.appendChild(document.createElement('div')), { id: 'fps' }) : null;
const fpsInfo = { frames: 0, t: 0 };
function showFps(dt) {
  if (!fpsEl) return;
  fpsInfo.frames++;
  fpsInfo.t += dt;
  if (fpsInfo.t < 0.5) return;
  const px = Math.round(innerWidth * renderer.getPixelRatio()) + '×' + Math.round(innerHeight * renderer.getPixelRatio());
  fpsEl.textContent = `${Math.round(fpsInfo.frames / fpsInfo.t)} fps · ${px} · ${Math.round(res.scale * 100)}% · ${gpuName || 'GPU desconocida'}`;
  fpsInfo.frames = fpsInfo.t = 0;
}

// ---------- Mundo ----------
const city = buildCity(scene);
const heightAt = makeGround();

// Gaspi arranca en la vereda de Av. Meeks, del lado de la estación
function spawnPoint() {
  const door = city.spots.stationDoor;
  const sw = city.spots.stationWall;
  let best = null;
  for (const r of ROADS) {
    if (r.name !== 'Avenida Meeks') continue;
    const p = project(r.pts, r.cum, door.x, door.z);
    if (!best || p.dist < best.p.dist) best = { r, p };
  }
  if (!best || best.p.dist > 140) return { x: door.x + (sw?.nx ?? 1) * 8, z: door.z + (sw?.nz ?? 0) * 8, face: Math.atan2(-(sw?.nx ?? 1), -(sw?.nz ?? 0)) };
  const { p, r } = best;
  const tx = door.x - p.x;
  const tz = door.z - p.z;
  const l = Math.hypot(tx, tz) || 1;
  const off = r.w / 2 + 1.6;
  return { x: p.x + (tx / l) * off, z: p.z + (tz / l) * off, face: Math.atan2(tx, tz) };
}
// la comisaría: sobre una avenida, a un par de cuadras
function stationHouse() {
  const c = city.curbSpots.find((c) => c.road.avenue && c.d > 180 && c.d < 280) ?? city.curbSpots[0];
  return { x: c.x - Math.cos(c.heading) * 3, z: c.z + Math.sin(c.heading) * 3, face: c.heading + Math.PI / 2 };
}

const audio = new Audio();
const input = new Input(canvas);
const hud = new Hud();
const fx = new Fx(scene);
fx.setScale(innerHeight);
const player = new Player(scene, city, heightAt);
player.setSpawn(spawnPoint());
loadGaspiPhoto();
const traffic = new Traffic(scene, audio);
traffic.populate(city, player);
const nav = new Nav(traffic.graph);
const npcs = new Npcs(scene, city, traffic.graph, heightAt, audio);
npcs.populate(player);
const crime = new Crime(scene, traffic, city.colliders, audio);
const events = new Events(scene, traffic, audio);
const trains = new Trains(scene, audio);
glows = new Glows(scene, city);
buildProps(scene, city);
const lights = new TrafficLights(scene);
const blobs = new BlobShadows(scene);
fx.ground = heightAt;
const pickups = new Pickups(scene, audio);
pickups.placeWorld(city, heightAt);
buildLampMap(city.lamps, pickups.shops);
// postes que se caen al chocarlos: se apaga el halo y la luz que tiraban al piso
const smash = new Smash(city, fx, audio);
smash.onLampOff = (i) => {
  glows.lampOff(i);
  const lit = city.lamps.filter((_, k) => !smash.down.has(k));
  const old = [LAMPS.lampPool.value, LAMPS.lampSpot.value];
  buildLampMap(lit, pickups.shops);
  for (const t of old) t?.dispose();
};
const combat = new Combat(scene, fx, audio);
combat.setupPlayer(player);
const police = new Police(scene, audio, nav);
const radio = new Radio(audio);
const comisaria = stationHouse();

const time = { hour: 17.5, night: false, label: '17:30' };
const weather = { rain: 0, target: 0, wet: 0, slick: false, next: R.range(200, 320), t: 0, boltT: R.range(10, 25), flash: 0 };
const world = { scene, camera, city, input, audio, hud, player, traffic, npcs, crime, events, trains, time, lights, colliders: city.colliders, fx, pickups, combat, police, nav, radio, weather, night: NIGHT, heightAt };
world.smash = smash;
// portazo: se oye si Gaspi está cerca
Vehicle.onSlam = (v, k) => {
  const d = Math.hypot(v.x - player.x, v.z - player.z);
  if (d < 25) audio.golpe(0.4 * k * (1 - d / 25));
};
const transit = new Transit(city, trains, traffic);
world.transit = transit;
const interiors = new Interiors(scene, city, city.colliders, pickups);
world.interiors = interiors;
const races = new Races(scene, traffic, nav, city.colliders);
world.races = races;
police.world = world;
const missions = new Missions(scene, world);
world.missions = missions;
const ufo = new Ufo(scene, world);
world.ufo = ufo;

// ---------- Lo que postean los vecinos ----------
const HANDLES = ['vecinosdetemperley', 'temperleyalerta', 'lomasnoticias', 'lachusma_tmp', 'rocaaldia', 'lavecinadelabarrera', 'turco_del_kiosco'];
const POSTS = {
  estrellas: (c) => [`¡Persecución en ${c}! La Bonaerense atrás de un tipo de traje`, `Patrulleros a full por ${c}. ¿Qué pasó?`, `Sirenas en ${c}, no salgan`],
  perdio: () => ['Se les escapó otra vez. ¿Para qué pagamos impuestos?', 'La cana dando vueltas y el de traje ni rastro', 'Se les perdió. Clásico.'],
  boom: (c) => [`¡Explotó un auto en ${c}! Humo negro por todo el barrio`, `¿Escucharon la explosión? Fue en ${c}`, `Se prendió fuego un auto en ${c}, ¡llamen a los bomberos!`],
  ko: (c) => [`Piñas en ${c}. Uno quedó durmiendo en la vereda`, `Terrible trompada en ${c}, lo dejaron nocaut`, `Otra vez bardo en ${c}`],
  muerte: (c) => [`Mataron a un vecino en ${c}. Hay sangre por todos lados`, `Un muerto en ${c}. ¿Dónde está la policía?`, `Terrible lo de ${c}, quedó tirado en la vereda`],
  robo_auto: (c) => [`Otro auto robado en ${c}. Cuiden los autos, vecinos`, `Le sacaron el auto a un señor en ${c}, a plena luz del día`],
  willy: (c) => [`Un loco haciendo willy por ${c}. Así estamos`, `Pasó uno en una sola rueda por ${c}, casi se mata`],
  robo: (c) => [`Asaltaron un negocio en ${c}. Estamos a la deriva`, `Robo en ${c}: se llevó toda la caja`],
  medias: () => ['Llegó el de las medias a la estación: tres pares dos lucas, de algodón', 'Compré medias en la estación y son buenísimas, recomiendo'],
  ovni: (c) => [`¡UN PLATO VOLADOR EN ${c.toUpperCase()}! No es joda, miren el video`, `Bajó un OVNI al lado del carrito de panchos de ${c}. El marciano pidió uno con todo`, `¿Alguien más vio las luces en ${c}? Era una nave, lo juro`],
  ovni_robo: (c) => [`¡El de traje se robó el plato volador del marciano en ${c}!`, `Le choreó la nave al extraterrestre mientras comía un pancho. Temperley, la capital del bardo`, `El marciano quedó a pie en ${c}. Ni los de otro planeta se salvan`],
  delivery: (c) => [`Un delivery de traje llegó volando a ${c}. Cinco estrellas`, `Me trajo el pedido un pibe de traje y corbata, re atento`],
};
const socialT = {};
world.social = (kind, x = player.x, z = player.z) => {
  const now = performance.now() / 1000;
  if (socialT[kind] && now - socialT[kind] < 25) return;
  socialT[kind] = now;
  const lines = POSTS[kind]?.(cornerName(x, z));
  if (lines) hud.post(R.pick(HANDLES), R.pick(lines));
};

// ---------- Changas de delivery (arriba de una moto con caja) ----------
const job = { active: false, offered: false };
function startDelivery() {
  const p = npcs.sidewalkPoint(player.x, player.z, 140, 320);
  if (!p) return;
  const d = Math.hypot(p.x - player.x, p.z - player.z);
  Object.assign(job, { active: true, x: p.x, z: p.z, t: Math.round(d / 7 + 25), pay: Math.round((2500 + d * 12) / 100) * 100, street: nearestStreetName(p.x, p.z) });
  hud.flash('CHANGA DE DELIVERY', `Llevá el pedido a ${job.street}. Pagan $${job.pay.toLocaleString('es-AR')}`, 'ok', 3);
}
function updateJob(dt) {
  const v = player.vehicle;
  if (!job.active) {
    if (v?.model === 'delivery' && !job.offered) {
      job.offered = true;
      startDelivery();
    }
    if (!v) job.offered = false;
    return;
  }
  job.t -= dt;
  if (job.t <= 0) {
    job.active = false;
    hud.flash('SE ENFRIÓ EL PEDIDO', 'Llegaste tarde. Nada de propina.', 'bad', 2.6);
    return;
  }
  if (Math.hypot(job.x - player.x, job.z - player.z) < 7 && (!v || Math.abs(v.speed) < 4)) {
    const tip = Math.round(job.t * 40 / 100) * 100;
    player.addMoney(job.pay + tip);
    audio.plata();
    hud.flash('¡PEDIDO ENTREGADO!', `+$${job.pay.toLocaleString('es-AR')} y $${tip.toLocaleString('es-AR')} de propina`, 'ok', 2.6);
    player.addRespeto(1);
    world.social('delivery', job.x, job.z);
    job.active = false;
    if (v?.model === 'delivery') setTimeout(startDelivery, 2500);
  }
}

// ---------- Changa de remís (arriba de un taxi o remís): buscás al pasajero y lo llevás a tiempo ----------
const fare = { active: false, offered: false, n: null, x: null, streak: 0 };
const isCab = (v) => v?.model === 'taxi' || v?.model === 'remis';
function startFare() {
  const n = npcs.spawnWalker(null, player, 50, 140);
  if (!n) return;
  Object.assign(n, { vmax: 0, mission: true });
  n.say('¡Remís! ¡Remís!', 4);
  Object.assign(fare, { active: true, n, x: null, t: 60 });
  hud.flash('CHANGA DE REMÍS', 'Un pasajero te está llamando. Buscalo', 'ok', 2.6);
}
function endFare(msg) {
  if (fare.n && !fare.n.dead) Object.assign(fare.n, { mission: false, vmax: 1.3 });
  Object.assign(fare, { active: false, n: null, x: null, streak: 0 });
  if (msg) hud.flash('SE CAYÓ EL VIAJE', msg, 'bad', 2.6);
}
function updateFare(dt) {
  const v = player.vehicle;
  if (!fare.active) {
    if (isCab(v) && !fare.offered && !missions.m) {
      fare.offered = true;
      startFare();
    }
    if (!v) fare.offered = false;
    return;
  }
  if (!isCab(v)) return endFare('Te bajaste del remís');
  fare.t -= dt;
  const slow = Math.abs(v.speed) < 2.5;
  if (fare.x == null) {
    // buscando al pasajero
    const n = fare.n;
    if (n.down || n.dead) return endFare('Al pasajero le pasó algo');
    if (fare.t <= 0) return endFare('El pasajero se cansó de esperar');
    if (slow && Math.hypot(n.x - v.x, n.z - v.z) < 7) {
      n.dead = true; // se sube al auto
      fare.n = null;
      const p = npcs.sidewalkPoint(v.x, v.z, 180, 420);
      if (!p) return endFare();
      const d = Math.hypot(p.x - v.x, p.z - v.z);
      Object.assign(fare, { x: p.x, z: p.z, t: Math.round(d / 8 + 20), pay: Math.round((1500 + d * 9) / 100) * 100, street: nearestStreetName(p.x, p.z) });
      hud.flash('SUBIÓ EL PASAJERO', `Llevalo a ${fare.street}`, 'ok', 2.4);
    }
    return;
  }
  if (fare.t <= 0) return endFare('Llegaste tarde y el pasajero se bajó sin pagar');
  if (slow && Math.hypot(fare.x - v.x, fare.z - v.z) < 8) {
    // viajes seguidos: premio que crece, como en Vice City
    fare.streak++;
    const bonus = fare.streak > 1 ? fare.streak * 500 : 0;
    player.addMoney(fare.pay + bonus);
    audio.plata();
    hud.flash('¡VIAJE COMPLETO!', `+$${fare.pay.toLocaleString('es-AR')}${bonus ? ` y $${bonus.toLocaleString('es-AR')} por ${fare.streak} viajes seguidos` : ''}`, 'ok', 2.6);
    if (fare.streak % 3 === 0) player.addRespeto(1);
    Object.assign(fare, { active: false, x: null });
    setTimeout(() => isCab(player.vehicle) && !fare.active && !missions.m && startFare(), 2500);
  }
}

// ---------- Changa de patrullero: con el patrullero salís a bajar motochorros ----------
const cop = { active: false, offered: false, m: null, level: 0, t: 0 };
{
  // un patrullero estacionado en la puerta de la comisaría
  const nr = nearestRoad(comisaria.x, comisaria.z);
  if (nr) {
    const off = (nr.road.w ?? 8) / 2 - 1.3;
    const k = off / (nr.dist || 1);
    traffic.addParked(makeCar('patrullero'), nr.x + (comisaria.x - nr.x) * k, nr.z + (comisaria.z - nr.z) * k, Math.atan2(nr.dx, nr.dz));
  }
}
function startCop() {
  const m = crime.spawn(player);
  if (!m) return;
  Object.assign(cop, { active: true, m, t: 100 });
  hud.flash('CHANGA DE PATRULLERO', `Motochorros por ${cornerName(m.v.x, m.v.z)}. Chocalos para bajarlos`, 'ok', 2.8);
}
function endCop(msg) {
  Object.assign(cop, { active: false, m: null, level: 0 });
  if (msg) hud.flash('SE ESCAPARON', msg, 'bad', 2.6);
}
function updateCop(dt) {
  const isCop = player.vehicle?.model === 'patrullero';
  if (!cop.active) {
    if (isCop && !cop.offered && !missions.m && !fare.active && !rescue.active) {
      cop.offered = true;
      startCop();
    }
    if (!player.vehicle) cop.offered = false;
    return;
  }
  if (!isCop) return endCop('Te bajaste del patrullero');
  cop.t -= dt;
  const m = cop.m;
  if (m.state === 'down') {
    // cada nivel paga más y aparece otro
    cop.level++;
    const pay = 2000 + cop.level * 1500;
    player.addMoney(pay);
    player.addRespeto(1);
    audio.cumplida?.();
    hud.flash('¡MOTOCHORROS AL PISO!', `+$${pay.toLocaleString('es-AR')} · Nivel ${cop.level}`, 'ok', 2.6);
    Object.assign(cop, { active: false, m: null });
    setTimeout(() => player.vehicle?.model === 'patrullero' && !cop.active && startCop(), 3000);
    return;
  }
  if (cop.t <= 0 || !crime.motos.includes(m)) endCop('Los motochorros se perdieron');
}

// ---------- Chapa y pintura: entrás con el auto, sale arreglado, de otro color y la cana te pierde ----------
const GARAGE_COST = 1500;
const garages = [];
{
  const shops = pickups.shops || [];
  for (const s of [shops[6], shops[Math.floor(shops.length * 0.6)]]) {
    if (!s) continue;
    const gar = { x: s.x + s.nx * 2.4, z: s.z + s.nz * 2.4, used: false, mesh: makeMarker() };
    gar.mesh.userData.tube.material.color.set(0x3ddc84);
    gar.mesh.userData.ring.material.color.set(0x7dffb0);
    gar.mesh.scale.set(2.2, 1.4, 2.2);
    gar.mesh.position.set(gar.x, heightAt(gar.x, gar.z), gar.z);
    scene.add(gar.mesh);
    garages.push(gar);
  }
}
world.garages = garages;

// ---------- Gym El Kaiser, a pasos de la estación ----------
const gym = new Gym(scene, city.colliders, npcs, heightAt);
for (const s of gym.slots) gym.spawn(s);
world.gym = gym;
const stunts = new Stunts(scene);
world.palms = addPalms(scene, city.colliders, heightAt);
// Laban the Creator paseando en la Ferrari amarilla por la estación
const laban = new Laban(scene, traffic);
// personas con modelo de artista (CC0): cargan de fondo y los NPC nuevos las van usando
loadPeople();
loadAnimals();
// changas de paramédico y bombero (ambulancia y autobomba de Kenney, CC0)
const rescue = new Rescue(world);
world.rescue = rescue;
world.laban = laban;
// la Ferrari de Ciro, estacionada frente al gym (modelo bajado de internet)
if (gym.x != null) {
  loadFerrari()
    .then((mesh) => {
      const p = gym.world(2.8, gym.edge + 1.3);
      const v = traffic.addParked(mesh, p.x, p.z, gym.h + Math.PI / 2);
      world.ferrari = v;
      // si había otro auto estacionado en el lugar, se va
      for (const o of traffic.parked.slice()) {
        if (o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 5.5) {
          scene.remove(o.mesh);
          traffic.parked.splice(traffic.parked.indexOf(o), 1);
        }
      }
    })
    .catch((e) => console.warn('No cargó la Ferrari', e));
}
world.stunts = stunts;

// ---------- Armería "El Tano": entrás a pie y elegís qué comprar ----------
const armeria = (() => {
  const shops = pickups.shops || [];
  const s = shops[Math.floor(shops.length * 0.3)];
  if (!s) return null;
  const a = { x: s.x, z: s.z, used: false, mesh: makeMarker() };
  a.mesh.userData.tube.material.color.set(0xff5a36);
  a.mesh.userData.ring.material.color.set(0xff8a66);
  a.mesh.position.set(a.x, heightAt(a.x, a.z), a.z);
  scene.add(a.mesh);
  return a;
})();
world.armeria = armeria;
const ARMERIA = [
  { label: 'Metra · $7.000', cost: 7000, give: () => combat.give(player, 'metra') },
  { label: '3 molotov · $3.000', cost: 3000, give: () => combat.give(player, 'molotov') },
  { label: 'Balas para todo · $2.000', cost: 2000, give: () => {
    for (const [id, a] of Object.entries(player.ammo)) if (WEAPONS[id]?.gun) a.res += WEAPONS[id].ammoPickup;
  } },
  { label: 'Bastón presidencial · $9.000', cost: 9000, give: () => combat.give(player, 'baston') },
  { label: 'Ametralladora · $14.000', cost: 14000, give: () => combat.give(player, 'ametralladora') },
  { label: 'Bazuca · $25.000', cost: 25000, give: () => combat.give(player, 'bazuca') },
];
// truco a lo GTA: escribir FIERROS en cualquier momento da todo el arsenal
const ARSENAL = ['revolver', 'pistola', 'metra', 'ametralladora', 'escopeta', 'molotov', 'bazuca', 'baston'];
function checkCheats() {
  // OVNI: llama al plato volador ya mismo
  if (input.typed?.endsWith('ovni')) {
    input.typed = '';
    if (ufo.state === 'away') ufo.nextT = 0;
    hud.toast('Algo se acerca desde el cielo...', 2.4);
    return;
  }
  if (!input.typed?.endsWith('fierros')) return;
  input.typed = '';
  for (const id of ARSENAL) {
    combat.give(player, id);
    combat.give(player, id);
  }
  hud.flash('FIERROS', 'Arsenal completo. La cana ya se enteró.', 'ok', 2.6);
  audio.plata();
}
function updateArmeria() {
  const a = armeria;
  if (!a) return;
  a.mesh.visible = Math.hypot(a.x - player.x, a.z - player.z) < 180;
  const d = Math.hypot(a.x - player.x, a.z - player.z);
  if (d > 3) a.used = false;
  if (a.used || d > 1.6 || player.vehicle || player.dead || hud.dialog) return;
  a.used = true;
  hud.ask(`🔫 Armería "El Tano": ¿qué llevás? (tenés $${player.money.toLocaleString('es-AR')})`, [
    ...ARMERIA.map((o) => ({
      label: o.label,
      run: () => {
        if (player.money < o.cost) return hud.toast('No te alcanza, pibe', 1.8);
        player.addMoney(-o.cost);
        o.give();
        audio.recarga?.();
        hud.toast('¡Llevalo, es tuyo!', 1.6);
      },
    })),
    { label: 'Nada', run: () => {} },
  ], 12);
}
function updateGarages() {
  const v = player.vehicle;
  for (const gar of garages) {
    gar.mesh.visible = Math.hypot(gar.x - player.x, gar.z - player.z) < 180;
    const d = v ? Math.hypot(gar.x - v.x, gar.z - v.z) : 99;
    if (d > 7) gar.used = false;
    if (!v || gar.used || d > 4.5 || Math.abs(v.speed) > 3) continue;
    gar.used = true;
    if (!police.stars && !v.damage && !v.flat) {
      hud.flash('CHAPA Y PINTURA', 'Está impecable. Volvé cuando lo choques o te busque la cana', 'ok', 2.4);
      continue;
    }
    if (player.money < GARAGE_COST) {
      hud.flash('CHAPA Y PINTURA', `Son $${GARAGE_COST.toLocaleString('es-AR')} y no te alcanza`, 'bad', 2.4);
      continue;
    }
    const wanted = police.stars > 0;
    player.addMoney(-GARAGE_COST);
    police.clear();
    Object.assign(v, { damage: 0, burning: 0, flat: false, warned: false });
    repairCar(v);
    if (!['taxi', 'remis', 'patrullero'].includes(v.model)) {
      v.mesh.traverse((o) => {
        if (o.userData.paint) o.material = paintMat(R.pick(CAR_COLORS.filter((c) => c !== o.material.color.getHex())));
      });
    }
    audio.plata();
    hud.flash('CHAPA Y PINTURA', wanted ? 'Color nuevo: la cana ya no te reconoce' : 'Quedó como nuevo', 'ok', 2.8);
  }
}

// ---------- Robar un negocio (con un fierro en la mano) ----------
function robShop(shop) {
  shop.cool = 240;
  const k = npcs.spawnWalker({ x: shop.x - shop.nx * 0.4, z: shop.z - shop.nz * 0.4, heading: Math.atan2(shop.nx, shop.nz) });
  if (k) {
    npcs.setState(k, 'cower');
    k.cowerT = 4;
    k.money = 0;
    k.say(R.pick(['¡No tirés! ¡Tomá, llevate todo!', '¡Tranquilo, tranquilo! ¡Tomá la caja!', '¡Llevate todo, pero no tirés!']), 3.5);
  }
  for (let i = 0; i < 3; i++) pickups.money(shop.x + R.range(-1.2, 1.2), shop.z + R.range(-1.2, 1.2), R.int(3, 9) * 1000);
  police.crime('robo_negocio', shop.x, shop.z);
  audio.alerta();
  world.social('robo', shop.x, shop.z);
  hud.flash('¡ROBO!', 'Levantá la plata y rajá antes de que llegue la cana', 'warn', 2.6);
}

// ---------- Clima ----------
const grey = new THREE.Color(0x6f7780);
const wetColor = new THREE.Color(0.62, 0.62, 0.64);
const dryColor = new THREE.Color(1, 1, 1);
const flashColor = new THREE.Color(0xdfe6ff);
function updateWeather(dt) {
  weather.t += dt;
  if (weather.t > weather.next) {
    // cada tanto se larga (o para) de llover
    weather.target = weather.target > 0 ? 0 : R.chance(0.6) ? R.range(0.55, 1) : 0;
    weather.next = weather.t + R.range(150, 330);
  }
  weather.rain += Math.sign(weather.target - weather.rain) * Math.min(Math.abs(weather.target - weather.rain), dt * 0.04);
  const wetting = weather.rain > 0.15;
  weather.wet += ((wetting ? 1 : 0) - weather.wet) * Math.min(1, dt * (wetting ? 0.08 : 0.02));
  weather.slick = weather.wet > 0.4;
  for (const m of city.wetMats) {
    m.roughness = 0.92 - weather.wet * 0.62;
    m.envMapIntensity = 0.5 + weather.wet * 1.1;
    m.color.copy(dryColor).lerp(wetColor, weather.wet);
  }
  fx.setRain(world.inside ? 0 : weather.rain, camera, weather.t, dt);
  audio.lluvia(weather.rain);
  // relámpagos con tormenta fuerte
  weather.flash = Math.max(0, weather.flash - dt * 6);
  if (weather.rain > 0.7) {
    weather.boltT -= dt;
    if (weather.boltT <= 0) {
      weather.flash = 1;
      weather.boltT = R.range(12, 35);
      audio.trueno(R.range(0.5, 1), R.range(0.6, 2.5));
    }
  }
}

// ---------- Día y noche ----------
const lampColor = new THREE.Color();
const nightTop = new THREE.Color(0x040817);
const nightBottom = new THREE.Color(0x17213a);
const dayTop = new THREE.Color(0x2c6bd3);
const dayBottom = new THREE.Color(0xb3d0ea);
// atardecer a lo Vice City: horizonte rosa coral y cielo violeta
const duskBottom = new THREE.Color(0xff6f7d);
const duskTop = new THREE.Color(0x5a2f8a);
const greyTmp = new THREE.Color();
const cityGlow = new THREE.Color(0x4a3240);
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
  const rain = weather.rain;
  time.night = day < 0.15;
  const U = sky.uniforms;
  U.zenith.value.copy(nightTop).lerp(dayTop, day).lerp(duskTop, dusk * 0.75 * (1 - rain));
  U.horizon.value.copy(nightBottom).lerp(dayBottom, day).lerp(duskBottom, dusk * 0.85 * (1 - rain));
  // nublado: el cielo se pone gris
  U.zenith.value.lerp(greyTmp.copy(grey).multiplyScalar(0.25 + day * 0.75), rain * 0.8);
  U.horizon.value.lerp(greyTmp.copy(grey).multiplyScalar(0.3 + day * 0.9), rain * 0.8);
  // de noche el horizonte toma el resplandor anaranjado de la ciudad (más con nubes)
  U.horizon.value.lerp(cityGlow, (1 - day) * (0.45 + rain * 0.3));
  if (weather.flash > 0) {
    U.zenith.value.lerp(flashColor, weather.flash * 0.7);
    U.horizon.value.lerp(flashColor, weather.flash * 0.7);
  }
  U.night.value = (1 - THREE.MathUtils.clamp(day * 3, 0, 1)) * (1 - rain * 0.9);
  U.time.value += dt;
  U.sunColor.value.setHSL(0.1 - dusk * 0.1, 0.9, 0.62 - dusk * 0.05);
  scene.fog.color.copy(U.horizon.value).lerp(U.zenith.value, 0.15);
  scene.fog.far = (280 + day * 230) * (1 - rain * 0.45);
  scene.fog.near = scene.fog.far * 0.55;
  // bruma: más espesa con lluvia y de noche; del lado del sol se pone dorada
  ATMO.fogParams.value.set((0.0022 + (1 - day) * 0.0012 + rain * 0.005) * (1 + dusk * 0.4), 0.04, 0, 0);
  ATMO.fogSunColor.value.copy(U.sunColor.value).multiplyScalar((0.3 + dusk * 1.1) * day * (1 - rain * 0.8));
  // la luz del sol viene de donde se ve el sol; de noche, de la luna
  const az = ((h - 6) / 24) * Math.PI * 2;
  U.sunDir.value.set(Math.cos(az), Math.max(-0.2, elev * 0.9), Math.sin(az) * 0.5 - 0.33).normalize();
  ATMO.fogSunDir.value.copy(U.sunDir.value);
  if (elev > 0) lightDir.copy(U.sunDir.value);
  else lightDir.copy(U.sunDir.value).negate().add(moonUp).normalize();
  lightDir.y = Math.max(lightDir.y, 0.2);
  lightDir.normalize();
  // cuando el sol cruza el horizonte la luz se apaga un instante (sin saltos de sombra)
  const cross = THREE.MathUtils.smoothstep(Math.abs(elev), 0.0, 0.08);
  sun.intensity = (0.35 + day * 2.9) * (1 - rain * 0.75) * cross;
  sun.color.setHSL(0.085 - dusk * 0.045, 0.55 + dusk * 0.4, 0.74 - dusk * 0.12);
  if (elev <= 0) sun.color.set(0x8fa8ff);
  // cielo: relleno azulado para que las sombras tengan color
  hemi.intensity = (0.62 + day * 0.26) * (1 - rain * 0.1) + rain * day * 0.45 + weather.flash * 2.5;
  hemi.color.copy(U.zenith.value).lerp(time.night ? nightFill : dayFill, 0.6);
  hemi.groundColor.set(time.night ? 0x2a2733 : 0x6b5e4c);
  scene.environmentIntensity = 0.55 + day * 0.35;
  // la sombra cubre sobre todo lo que tenemos adelante, y se mueve de a un texel (sin temblequeo)
  camera.getWorldDirection(camFwd);
  camFwd.y = 0;
  camFwd.normalize();
  shadowCenter.set(player.x + camFwd.x * 28, 0, player.z + camFwd.z * 28);
  snapShadow(shadowCenter);
  sun.target.position.copy(shadowCenter);
  sun.position.copy(shadowCenter).addScaledVector(lightDir, 220);
  sky.updateEnv(h, scene);
  post?.setMood(1 - day, dusk, rain);
  // faroles de sodio (con lluvia se prenden antes)
  const lit = day - rain * 0.3;
  const lampsOn = lit < 0.35;
  lampColor.set(lampsOn ? 0xffc46b : 0x3a3226);
  for (const m of city.lampMats) m.color.copy(lampColor);
  lightMat.color.setScalar(lampsOn ? 2.2 : 0.9);
  tailMat.color.setScalar(lampsOn ? 1.5 : 0.75);
  brakeMat.color.setScalar(lampsOn ? 4.5 : 2.6);
  city.lampPools.visible = false;
  time.glow = THREE.MathUtils.clamp((0.42 - lit) * 2.6, 0, 1);
  // la luz de sodio de los faroles sobre todo lo que está cerca (y su reflejo si está mojado)
  LAMPS.lampParams.value.w = lampsOn ? time.glow * NIGHT.faroles : 0;
  LAMPS.lampWet.value = weather.wet * NIGHT.reflejo;
  city.windowMat.emissiveIntensity = THREE.MathUtils.clamp((0.45 - lit) * 2.2, 0, 0.85);
  if (city.signMat) city.signMat.emissiveIntensity = THREE.MathUtils.clamp((0.5 - lit) * 2.4, 0, 1);
  if (city.neonMesh) {
    const on = THREE.MathUtils.clamp((0.45 - lit) * 3, 0, 1);
    city.neonMesh.visible = on > 0.01;
    city.neonMesh.material.opacity = on;
  }
  city.lampPools.material.opacity = THREE.MathUtils.clamp((0.35 - lit) * 0.8, 0, 0.2);
  renderer.toneMappingExposure = 0.95 + (1 - day) * 0.5;
}

const lightDir = new THREE.Vector3();
const moonUp = new THREE.Vector3(0, 0.6, 0);
const dayFill = new THREE.Color(0xb4cdf0);
const nightFill = new THREE.Color(0x6a7cc4);
const camFwd = new THREE.Vector3();
const shadowCenter = new THREE.Vector3();
const lx = new THREE.Vector3();
const ly = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// Redondea el centro de la sombra a la grilla de texels vista desde la luz.
function snapShadow(c) {
  const texel = (sc.right - sc.left) / Math.max(1, sun.shadow.mapSize.x);
  lx.crossVectors(UP, lightDir).normalize();
  ly.crossVectors(lightDir, lx);
  const a = Math.round(c.dot(lx) / texel) * texel;
  const b = Math.round(c.dot(ly) / texel) * texel;
  const d = c.dot(lightDir);
  c.copy(lx).multiplyScalar(a).addScaledVector(ly, b).addScaledVector(lightDir, d);
}

// ---------- Objetivos ----------
const flags = { pancho: false, medias: false };
function dist(p) {
  return p ? Math.hypot(p.x - player.x, p.z - player.z) : Infinity;
}
function nearestOf(list) {
  let best = null;
  let bd = Infinity;
  for (const v of list) {
    const d = dist(v);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}
const steps = [
  { text: 'Andá a la estación Temperley', target: () => city.spots.stationDoor, done: () => dist(city.spots.stationDoor) < 6 },
  { text: coarse ? 'Comprale medias al vendedor' : 'Comprale medias al vendedor (E)', target: () => nearestOf(npcs.vendors.filter((n) => !n.down)), done: () => flags.medias },
  { text: 'Comprate un pancho en el carrito ($1.500)', target: () => city.spots.pancho, done: () => flags.pancho },
  { text: 'Agarrá el palo que quedó en la plaza', target: () => pickups.spots.palo, done: () => !!player.inv.palo },
  { text: coarse ? 'Robate una moto: acercate y tocá el botón' : 'Robate una moto: acercate y apretá F', target: () => nearestOf(traffic.all().filter((v) => v.kind === 'moto' && !v.wreck)), done: () => player.vehicle?.kind === 'moto' },
  { text: 'Andá a ver qué pasa en el corte', target: () => nearestCorte(), done: () => { const c = nearestCorte(); return c && dist(c) < 32; } },
  { text: 'Conseguí un fierro: hay un 38 escondido en una plaza', target: () => pickups.spots.revolver, done: () => !!player.inv.revolver },
  { text: 'Temperley es tuyo. Cuidá el celu (y no te hagas buscar).', target: () => null, done: () => false },
];
let step = 0;
function nearestCorte() {
  const best = nearestOf(events.list.filter((e) => e.type === 'corte' && !e.leaving));
  if (!best && step === 5 && !events.firstForced) {
    events.firstForced = true;
    return events.spawnCorte(player, true);
  }
  return best;
}
const praise = ['¡BIEN AHÍ!', '¡VAMOS, GASPI!', '¡DE UNA!', '¡ESO!', '¡QUÉ CRACK!'];
function updateObjective() {
  const rc = races.objective();
  if (rc) {
    hud.setObjective(rc.text, rc.target);
    hud.updateObjective(player);
    return;
  }
  if (job.active) {
    hud.setObjective(`Delivery a ${job.street}: ${Math.ceil(job.t)} s`, { x: job.x, z: job.z });
    hud.updateObjective(interiors.focus(player));
    return;
  }
  const ro = rescue.objective();
  if (ro) {
    hud.setObjective(ro.text, ro.target);
    hud.updateObjective(interiors.focus(player));
    return;
  }
  if (cop.active) {
    hud.setObjective(`Bajá a los motochorros: ${Math.ceil(cop.t)} s`, cop.m.v);
    hud.updateObjective(interiors.focus(player));
    return;
  }
  if (fare.active) {
    const pick = fare.x == null;
    hud.setObjective(pick ? `Buscá al pasajero: ${Math.ceil(fare.t)} s` : `Llevá al pasajero a ${fare.street}: ${Math.ceil(fare.t)} s`, pick ? fare.n : { x: fare.x, z: fare.z });
    hud.updateObjective(interiors.focus(player));
    return;
  }
  // misiones (después del tutorial)
  const mo = step >= steps.length - 1 ? missions.objective() : null;
  if (mo) {
    hud.setObjective(mo.text, mo.target);
    hud.updateObjective(interiors.focus(player));
    return;
  }
  const s = steps[step];
  if (s.done()) {
    if (step < steps.length - 1) {
      hud.flash(praise[step % praise.length], step === 5 ? 'Los cortes aparecen solos: fijate en el zócalo de abajo' : '', 'ok', 2.4);
      step++;
    }
  }
  const cur = steps[step];
  hud.setObjective(cur.text, cur.target());
  hud.updateObjective(interiors.focus(player));
}

// GPS: camino por las calles hasta el objetivo, en violeta en el minimapa
let gpsT = 0;
function updateGps(dt) {
  gpsT -= dt;
  if (gpsT > 0) return;
  gpsT = 1;
  const t = hud.objective?.target;
  if (!t || dist(t) < 35) {
    hud.setRoute(null);
    return;
  }
  const edges = nav.path(nav.nearestNode(player.x, player.z), nav.nearestNode(t.x, t.z));
  if (!edges) {
    hud.setRoute(null);
    return;
  }
  const pts = [[player.x, player.z]];
  if (edges.length) pts.push([edges[0].from.x, edges[0].from.z]);
  for (const e of edges) pts.push([e.to.x, e.to.z]);
  pts.push([t.x, t.z]);
  hud.setRoute(pts);
}

// ---------- Acciones con E ----------
function interactions() {
  if (player.dead || hud.dialog || player.jack) {
    hud.prompt(null);
    return;
  }
  // a bordo del plato volador el cartel lo pone src/ufo.js
  if (player.ufo) return;
  if (ufo.canSteal && !player.vehicle) {
    hud.prompt('F', ufo.state === 'parked' ? 'Subir al plato volador' : 'Robar el plato volador');
    return;
  }
  if (player.vehicle) {
    // en la largada de la picada
    const ra = races.action(world);
    if (ra) {
      hud.prompt('E', ra.text);
      if (input.hit('e')) ra.run();
      return;
    }
    const slow = Math.abs(player.vehicle.speed) < 3;
    hud.prompt(slow ? 'F' : null, slow ? (player.vehicle.kind === 'moto' ? 'Bajarse de la moto' : 'Bajarse') : null);
    return;
  }
  let action = null;
  const vendor = npcs.vendors.find((n) => !n.down && n.state === 'idle' && dist(n) < 2.6);
  if (vendor) {
    action = {
      text: 'Comprar medias: 3 pares $2.000',
      run: () => {
        if (player.money < 2000) {
          vendor.say('¿No tenés dos lucas? Bueno, otro día', 2.5);
          return;
        }
        player.addMoney(-2000);
        player.say('Dame tres pares, maestro', 2);
        vendor.say(R.pick(['¡Gracias, papá! Son de algodón, eh', '¡Llevás calidad, jefe!', '¡Que las disfrutes!']), 3);
        audio.plata();
        player.buffs.medias = 180;
        hud.toast('Medias nuevas: corrés más rápido (3 min)', 2.6);
        flags.medias = true;
        world.social('medias');
      },
    };
  }
  const pancho = city.spots.pancho;
  if (!action && dist(pancho) < 2.6) {
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
    const beggar = npcs.list.find((n) => n.type === 'mendigo' && n.state === 'sit' && dist(n) < 2.6);
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
  const w = player.ammo?.[player.weapon];
  if (!action && w !== undefined) {
    const shop = pickups.shops?.find((s) => s.cool <= 0 && dist(s) < 3.2);
    if (shop) action = { text: `Robar ${shop.name ? `"${shop.name}"` : 'el negocio'}`, run: () => robShop(shop) };
  }
  if (!action && crime.motos.some((m) => m.state !== 'down' && m.v.speed < 2.5 && Math.hypot(m.v.x - player.x, m.v.z - player.z) < 2.2)) {
    action = { text: 'Voltearles la moto', run: () => crime.tryShove(world) };
  }
  if (!action) action = interiors.action(world);
  if (!action) action = transit.action(world);
  const car = player.nearestVehicle(world);
  if (action) hud.prompt('E', action.text);
  else if (car) {
    let txt = car.kind === 'moto' ? (car.fallen ? 'Levantar la moto' : 'Subirse a la moto') : car.kind === 'carro' ? 'Subirse al carro' : 'Subir al auto';
    if (car.police) txt = 'Robar el patrullero';
    else if (car.ai || car.rider) txt = car.kind === 'moto' ? 'Bajar al de la moto' : 'Sacarle el auto';
    hud.prompt('F', txt);
  } else hud.prompt(null);
  if (action && input.hit('e')) action.run();
}

// ---------- Ganchos ----------
player.say = (text, dur = 2.5) => (player.bubble = { text, t: dur });
const hurtEl = document.getElementById('hurt');
let hurtFx = 0;
player.hooks.hurt = (n, msg) => {
  if (msg && n >= 15) hud.toast(msg, 2);
  hurtFx = Math.min(1, hurtFx + 0.25 + n / 40);
};
function updateHurt(dt) {
  hurtFx = Math.max(0, hurtFx - dt * 1.4);
  const low = player.dead ? 0 : Math.max(0, (35 - player.health) / 35) * (0.55 + Math.sin(performance.now() / 260) * 0.15);
  const k = Math.max(hurtFx, low);
  if (Math.abs(k - (updateHurt.k ?? -1)) > 0.01) {
    updateHurt.k = k;
    hurtEl.style.opacity = k.toFixed(2);
  }
}
function screen(kind, title, sub) {
  const el = document.getElementById('wasted');
  el.hidden = false;
  el.className = kind === 'busted' ? 'busted' : '';
  document.getElementById('wasted-title').textContent = title;
  document.getElementById('wasted-sub').textContent = sub;
}
player.hooks.die = (msg) => {
  radio.setOn(false);
  if (msg === 'TE PASÓ POR ENCIMA EL ROCA') screen('dead', 'TE PASÓ EL ROCA', 'Nunca cruces con la barrera baja');
  else if (msg === 'VOLASTE POR EL AIRE') screen('dead', 'VOLASTE', 'El auto explotó con vos adentro');
  else screen('dead', 'TE BAJARON', msg);
};
player.hooks.respawn = (cause) => {
  document.getElementById('wasted').hidden = true;
  const lost = Math.round(player.money * 0.3);
  player.addMoney(-lost);
  police.reset(world);
  if (cause === 'comisaria') hud.flash('LIBERADO', `La coima te salió $${lost.toLocaleString('es-AR')}. Y te sacaron los fierros.`, 'warn', 3.5);
  else hud.flash('HOSPITAL GANDULFO', `Te dieron el alta. La cuenta: $${lost.toLocaleString('es-AR')}`, 'warn', 3.5);
};
player.hooks.respeto = (n) => {
  if (n > 0) hud.toast(`Respeto +${n}`, 1.6);
  if (n < 0) hud.toast(`Respeto ${n}`, 1.6);
};
player.hooks.enter = (v) => {
  if (v.kind === 'car' || v.kind === 'bus') {
    radio.setOn(true);
    hud.showRadio(radio.station);
  }
};
player.hooks.exit = () => radio.setOn(false);
police.hooks = {
  busted: () => {
    missions.busted();
    screen('busted', 'TE AGARRÓ LA BONAERENSE', 'Te llevan a la comisaría');
    radio.setOn(false);
    if (player.vehicle) player.exitVehicle(world, true);
    player.busted = 3.5;
    player.attack = null;
    player.jack = null;
    police.reset(world);
  },
  wanted: () => audio.alerta(),
};
events.onNews = () => hud.setTicker(events.news);
hud.setTicker(events.news);

// ---------- Globos ----------
function speakers() {
  const out = [];
  const add = (x, y, z, b, bad, voice = {}) => {
    const d = Math.hypot(x - player.x, z - player.z);
    if (d < 38) out.push({ x, y, z, text: b.text, bad, d, b, voice });
  };
  for (const n of npcs.list) if (n.bubble) add(n.x, n.y + 2.35 * n.h.root.scale.y, n.z, n.bubble, n.type === 'trapito' || n.type === 'cana' || n.state === 'fight', { female: n.h.female, key: n.h.phase });
  for (const m of crime.motos) if (m.bubble) add(m.v.x, 2.6, m.v.z, m.bubble, true, { key: 7 });
  if (player.bubble) add(player.x, player.y + 2.4, player.z, player.bubble, false, { key: 3 });
  if (laban.bubble && laban.v) add(laban.v.x, 2.3, laban.v.z, laban.bubble, false, { female: laban.bubble.female, key: laban.bubble.female ? 31 : 17 });
  // la gente del corte canta
  for (const e of events.list) {
    if (e.leaving || dist(e) > 30) continue;
    if (!e.chant || e.chant.t <= 0) e.chant = R.chance(0.02) ? { text: R.pick(['¡No se pasa, flaco!', '¡Luz! ¡Luz! ¡Luz!', '¡Queremos soluciones!', '¡Vamos, vamos, compañeros!', '¡Tocá bocina si nos apoyás!']), t: 3 } : null;
    if (e.chant) add(e.x, 3, e.z, e.chant, true, { female: R.chance(0.5), key: e.x });
  }
  out.sort((a, b) => a.d - b.d);
  // voces: dice en voz alta lo más cercano que todavía no se dijo (lo lejano queda solo en el globito)
  for (const s of out) {
    if (s.b.spoken || s.d > 24) continue;
    s.b.spoken = true;
    if (audio.speak(s.text, { ...s.voice, vol: 1.1 - s.d / 24 })) break;
  }
  return out;
}

// ---------- Partida guardada (en este navegador) ----------
const SAVE = 'gta-conurbano-partida';
function saveGame() {
  try {
    localStorage.setItem(SAVE, JSON.stringify({ money: player.money, respeto: player.respeto, phone: player.phone, step, hour: time.hour, inv: player.inv, ammo: player.ammo, weapon: player.weapon, armor: player.armor, flags, missions: missions.save(), figus: [...player.figus], saltos: [...player.saltos] }));
  } catch {
    /* sin almacenamiento */
  }
}
function loadGame() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE) || 'null');
    if (!d || typeof d.money !== 'number') return false;
    player.money = d.money;
    player.respeto = d.respeto ?? 0;
    player.phone = d.phone ?? true;
    step = Math.min(steps.length - 1, d.step ?? 0);
    time.hour = d.hour ?? time.hour;
    player.inv = { punos: true, motosierra: true, ...(d.inv || {}) };
    player.ammo = d.ammo || {};
    player.weapon = player.inv[d.weapon] ? d.weapon : 'punos';
    player.armor = d.armor ?? 0;
    player.figus = new Set(d.figus || []);
    player.saltos = new Set(d.saltos || []);
    Object.assign(flags, d.flags || {});
    missions.next = d.missions?.next ?? 0;
    missions.done = d.missions?.done ?? 0;
    combat.syncHand(player);
    return true;
  } catch {
    return false;
  }
}
let saveT = 0;
const loaded = loadGame();
document.getElementById('start-saldo').textContent = `$ ${player.money.toLocaleString('es-AR')}`;
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('¿Empezar de cero? Se borra la plata, las armas y el avance.')) return;
  try {
    localStorage.removeItem(SAVE);
  } catch {
    /* sin almacenamiento */
  }
  location.reload();
});

// ---------- Pausa con el mapa grande ----------
let paused = false;
function setPaused(p) {
  paused = p;
  document.getElementById('pausemap').hidden = !p;
  if (p) {
    hud.drawBig(world);
    // cuánto del juego hiciste, como el porcentaje de los GTA
    const mis = Math.min(missions.done, 3);
    const figus = player.figus.size;
    const saltos = player.saltos.size;
    const pct = Math.round((mis / 3) * 35 + (figus / FIGUS) * 30 + (saltos / RAMPS) * 15 + (Math.min(step, steps.length - 1) / (steps.length - 1)) * 20);
    document.getElementById('stats').textContent = `Completado ${pct}% · Misiones ${mis}/3 · Figuritas ${figus}/${FIGUS} · Saltos ${saltos}/${RAMPS}`;
    try {
      document.exitPointerLock?.();
    } catch {
      /* nada */
    }
    audio.master && (audio.master.gain.value = audio.muted ? 0 : 0.15);
  } else {
    audio.master && (audio.master.gain.value = audio.muted ? 0 : 0.55);
    last = performance.now();
  }
}
document.getElementById('minimap').addEventListener('click', () => started && setPaused(!paused));
document.getElementById('bigmap').addEventListener('click', () => setPaused(false));
document.getElementById('resume').addEventListener('click', () => setPaused(false));

// ---------- Loop ----------
let started = false;
let last = performance.now();
let intro = 0;
function frame(now) {
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  // golpe que "pega": el tiempo casi se frena un instante
  if (world.hitStop > 0) {
    world.hitStop -= dt;
    dt *= 0.08;
  }
  const real = (now - (frame.prev ?? now)) / 1000;
  frame.prev = now;
  // muerte a lo GTA: todo en cámara lenta y la imagen se va a blanco y negro (preso: a medias)
  const out = player.dead ? 1 : player.busted > 0 ? 0.6 : 0;
  world.wasted = out ? Math.min(out, (world.wasted || 0) + Math.min(real, 0.1) * 0.9) : 0;
  if (post) post.wasted = world.wasted;
  if (player.dead) dt *= 0.35;
  // en el aire de un salto: cámara lenta
  if (player.vehicle?.air) dt *= 0.5;
  dynamicResolution(real);
  showFps(real);
  updateWeather(started ? dt : dt * 0.2);
  updateTime(started ? dt : dt * 0.2);
  ATMO.windT.value += dt * (1 + weather.rain * 1.5);
  if (!started) {
    // cámara dando vueltas sobre la estación
    intro += dt * 0.06;
    camera.position.set(STATION.x + Math.cos(intro) * 150, 70, STATION.z + Math.sin(intro) * 150);
    camera.lookAt(STATION.x, 0, STATION.z);
    trains.update(dt, null);
    events.update(dt, world);
    traffic.update(dt, world);
    glows.update(world, time.glow);
    lights.update(dt);
    fx.update(dt);
    sky.follow(camera);
    post.render();
    requestAnimationFrame(frame);
    return;
  }
  if (input.hit('m')) {
    const muted = audio.toggleMute();
    document.getElementById('mute').textContent = muted ? 'Sin sonido' : 'Sonido';
  }
  if (input.hit('p')) setPaused(!paused);
  if (paused) {
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  saveT += dt;
  if (saveT > 8) {
    saveT = 0;
    saveGame();
  }
  // radio: R cambia de estación arriba de un auto
  if (player.vehicle && player.vehicle.kind !== 'moto' && input.hit('r')) {
    const st = radio.cycle();
    radio.setOn(true);
    hud.showRadio(st);
  }
  hud.handleKeys(input);
  if (player.busted > 0) {
    // detenido: pantalla azul y a la comisaría
    player.busted -= dt;
    if (player.busted <= 0) {
      combat.strip(player);
      player.respawn(comisaria, 'comisaria');
    }
  } else if (!transit.update(dt, world)) {
    ufo.update(dt, world);
    interactions();
    player.update(dt, world);
    combat.update(dt, world);
  }
  if (player.bubble) {
    player.bubble.t -= dt;
    if (player.bubble.t <= 0) player.bubble = null;
  }
  traffic.update(dt, world);
  npcs.update(dt, world);
  interiors.update(dt, world);
  races.update(dt, world);
  crime.update(dt, world);
  police.update(dt, world);
  events.update(dt, world);
  trains.update(dt, player);
  pickups.update(dt, world);
  for (const s of pickups.shops || []) if (s.cool > 0) s.cool -= dt;
  updateJob(dt);
  updateGarages();
  updateArmeria();
  checkCheats();
  gym.update(dt, world);
  stunts.update(dt, world);
  laban.update(dt, world);
  updateFare(dt);
  updateCop(dt);
  rescue.update(dt);
  missions.update(dt, step >= steps.length - 1 && !job.active && !fare.active && !cop.active && !rescue.active);
  updateObjective();
  updateGps(dt);
  player.updateCamera(camera, dt, city.colliders, fx);
  fx.update(dt);
  smash.update(dt);
  radio.update();
  const moto = crime.nearestMoto(player.x, player.z, 80);
  audio.update(player.vehicle?.speed ?? 0, !!player.vehicle, moto ? Math.hypot(moto.x - player.x, moto.z - player.z) : 999, player.vehicle?.kind === 'moto');
  hud.update(dt, world);
  updateHurt(dt);
  hud.bubbles(camera, speakers());
  glows.update(world, time.glow);
  lights.update(dt);
  blobs.update(world, heightAt);
  if ((frame.n = (frame.n || 0) + 1) % 8 === 1) updateHumanLod(camera, Q.lodNear);
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
  document.body.classList.add('playing');
  hud.show();
  // en el celu: pantalla completa si el navegador deja
  if (coarse && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => window.screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
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
  const mapHint = coarse ? 'El mapa está en ☰.' : 'P abre el mapa.';
  if (noGpu) setTimeout(() => hud.flash('SIN PLACA DE VIDEO', 'El navegador tiene apagada la aceleración por hardware: activala en la configuración para que ande fluido.', 'bad', 7), 3500);
  hud.flash('TEMPERLEY', loaded ? `Partida recuperada. ${mapHint}` : `Av. Meeks · Estación del Roca. ${mapHint}`, 'warn', 3);
});
document.getElementById('mute').addEventListener('click', () => {
  const muted = audio.toggleMute();
  document.getElementById('mute').textContent = muted ? 'Sin sonido' : 'Sonido';
});

addEventListener('resize', () => {
  applyResolution();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fx.setScale(innerHeight);
});

// Para pruebas desde la consola
window.__gta = world;
window.__renderer = renderer;
