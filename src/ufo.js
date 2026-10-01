// Plato volador: cada tanto baja uno al lado del carrito de panchos de la estación y un
// extraterrestre verde se baja a comprar. Mientras come, se lo podés robar y salir volando:
// rayo que hace volar todo y rayo tractor que levanta autos y gente (y los suelta desde arriba).
import * as THREE from 'three';
import { makeHuman } from './human.js';
import { Npc } from './npcs.js';
import { R } from './rng.js';
import { TOUCH } from './input.js';

const RADIUS = 4.3;
const MAX_SPEED = 32;
const LINES = {
  llega: ['Dos completos, maestro. ¿Acepta cristales de Plutón?', '¿Tiene con papas pay? En mi planeta no hay', 'Uno con todo, por favor. Vengo de lejos'],
  come: ['Mmm... ¡qué rico, terrícola!', 'Esto no lo tenemos en Andrómeda', 'Le falta un poquito de mostaza'],
  enojo: ['¡EH! ¡MI NAVE!', '¡Devolvé eso, terrícola!', '¡Te voy a abducir a vos!', '¡Es leasing, la tengo que devolver!'],
  gente: ['¡UN PLATO VOLADOR!', '¡Filmalo, filmalo!', '¿Ese es un marciano?', '¡Vino a comprar panchos!', '¡Mirá, mamá, un OVNI!'],
};

// textura del rayo tractor: más fuerte arriba, bandas que bajan
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 128; y++) {
    const v = y / 127;
    const band = 0.65 + 0.35 * Math.sin(v * 40);
    const a = (0.25 + 0.75 * (1 - v)) * band;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.fillRect(0, y, 16, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Ufo {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.state = 'away';
    this.nextT = 150; // la primera visita, a los dos minutos y medio
    this.visits = 0;
    this.x = 0;
    this.y = 200;
    this.z = 0;
    this.vx = this.vy = this.vz = 0;
    this.spin = 0;
    this.held = [];
    this.laserT = 0;
    this.build();
    // luz propia (siempre en la escena: agregarla después recompila todos los materiales)
    this.light = new THREE.PointLight(0x7dffb0, 0, 30, 1.6);
    scene.add(this.light);
  }

  // ---------- Modelo ----------
  build() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xe2e8ee, metalness: 0.7, roughness: 0.28, envMapIntensity: 1.6, emissive: 0x1c232b });
    const dark = new THREE.MeshStandardMaterial({ color: 0x353b42, metalness: 0.9, roughness: 0.35 });
    const prof = [
      [0, -0.62], [1.3, -0.62], [2.4, -0.5], [3.5, -0.24], [4.3, -0.02], [4.3, 0.05], [3.5, 0.3], [2.3, 0.48], [1.3, 0.56], [0, 0.58],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const disc = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), metal);
    disc.castShadow = true;
    const band = new THREE.Mesh(new THREE.TorusGeometry(4.28, 0.08, 8, 64).rotateX(Math.PI / 2), dark);
    // cúpula de vidrio con el extraterrestre adentro
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8ff3ff, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.42, emissive: 0x135a5a, envMapIntensity: 2 }),
    );
    dome.position.y = 0.52;
    const pilot = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x86d65a, roughness: 0.6 });
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), skin);
    headM.scale.set(1, 1.2, 1);
    headM.position.y = 1.35;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xc3ccd6, metalness: 0.6, roughness: 0.4 }));
    body.position.y = 0.85;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x050505 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), eyeM);
      e.scale.set(1, 0.6, 0.5);
      e.position.set(s * 0.17, 1.38, 0.36);
      e.rotation.z = s * 0.5;
      pilot.add(e);
    }
    pilot.add(headM, body);
    this.pilot = pilot;
    // luces del borde que giran (cambian de color)
    this.rim = new THREE.Group();
    this.rimLights = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.set(Math.cos(a) * 3.9, 0.06, Math.sin(a) * 3.9);
      this.rim.add(m);
      this.rimLights.push(m);
    }
    // panza: anillo que brilla y la escotilla
    this.belly = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.14, 10, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7dffb0 }));
    this.belly.position.y = -0.6;
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8fff0, side: THREE.DoubleSide }));
    hatch.position.y = -0.63;
    this.hatch = hatch;
    // patas de aterrizaje (se esconden al volar)
    this.legs = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 8), dark);
      leg.position.set(Math.cos(a) * 2.5, -1.15, Math.sin(a) * 2.5);
      leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 12), dark);
      pad.position.set(Math.cos(a) * 2.75, -1.88, Math.sin(a) * 2.75);
      leg.castShadow = pad.castShadow = true;
      this.legs.add(leg, pad);
    }
    // rampa por donde baja el marciano (bisagra en el borde de la escotilla)
    this.ramp = new THREE.Group();
    const rampM = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 2.3), metal);
    rampM.position.z = 1.15;
    this.ramp.add(rampM);
    this.ramp.position.set(0, -0.62, 0.9);
    // rayo tractor
    const beamGeo = new THREE.CylinderGeometry(0.55, 1, 1, 40, 1, true).translate(0, -0.5, 0);
    this.beamTex = beamTexture();
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: this.beamTex, color: 0x9dffc8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beam.position.y = -0.62;
    this.beam.visible = false;
    // rayo de ataque (una línea gruesa verde con el centro blanco)
    const lz = new THREE.CylinderGeometry(0.09, 0.09, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.laser = new THREE.Group();
    this.laser.add(new THREE.Mesh(lz, new THREE.MeshBasicMaterial({ color: 0x3dff6a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));
    const core = new THREE.Mesh(lz, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    core.scale.set(0.35, 0.35, 1);
    this.laser.add(core);
    this.laser.visible = false;
    this.laserLife = 0;
    this.body = new THREE.Group();
    this.body.add(disc, band, dome, pilot, this.rim, this.belly, hatch, this.legs, this.ramp);
    g.add(this.body, this.beam);
    g.visible = false;
    this.mesh = g;
    this.scene.add(g, this.laser);
  }

  makeAlien(x, z) {
    const h = makeHuman({ skin: 0x86d65a, hair: 0x86d65a, hairStyle: 'bald', eyes: '#000000', alien: true, shirt: 0xc3ccd6, pants: 0xc3ccd6, shoes: 0x7d8790, longSleeves: true, scale: 0.84 });
    h.bones.head.scale.set(1.45, 1.55, 1.4);
    // antenitas
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5), new THREE.MeshStandardMaterial({ color: 0x5aa53a }));
      a.position.set(s * 0.05, 0.25, 0);
      a.rotation.z = -s * 0.35;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc8ff6a }));
      ball.position.set(s * 0.08, 0.33, 0);
      h.bones.head.add(a, ball);
    }
    // el pancho (en la mano, se ve cuando lo compra)
    const p = new THREE.Group();
    const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9a35a }));
    const sau = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.2, 4, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa8432a }));
    sau.position.y = 0.025;
    p.add(bun, sau);
    p.position.set(0, -0.08, 0.04);
    p.visible = false;
    h.bones.handR.add(p);
    this.pancho = p;
    const n = new Npc('alien', h, x, z);
    n.hp = 260;
    n.vmax = 1.1;
    n.state = 'alien';
    n.money = 0;
    return n;
  }

  // ---------- Dónde aterriza: un lugar despejado cerca del carrito ----------
  landingSpot() {
    const { city, colliders, heightAt } = this.world;
    const p = city.spots.pancho;
    for (let tries = 0; tries < 80; tries++) {
      const a = R.range(0, Math.PI * 2);
      const d = R.range(9, 26);
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      const q = { x, z };
      if (colliders.resolveCircle(q, RADIUS + 0.6)) continue;
      // mejor en la vereda o la plaza que en la calle (el tránsito no lo esquiva)
      if (tries < 60 && heightAt(x, z) < 0.1) continue;
      return { x, z };
    }
    return { x: p.x + 12, z: p.z };
  }

  // ---------- Loop ----------
  update(dt, world) {
    const P = world.player;
    this.t = (this.t || 0) + dt;
    if (this.state === 'away') {
      this.nextT -= dt;
      if (this.nextT <= 0 && !world.inside && !P.dead) this.arrive(world);
    } else if (this.state === 'arrive') this.arriving(dt, world);
    else if (this.state === 'landed') this.landed(dt, world);
    else if (this.state === 'leave') this.leaving(dt, world);
    else if (this.state === 'parked') this.parked(dt, world);
    // el piloto del marciano se ve en la cúpula si está adentro
    this.pilot.visible = this.state !== 'player' && this.state !== 'parked' && !(this.alien && !this.alien.aboard);
    if (this.state !== 'away') this.animate(dt, world);
    this.groundBlock(world);
    this.updateHeld(dt, world);
    this.updateLaser(dt);
    this.hum(world);
  }

  arrive(world) {
    const s = this.landingSpot();
    this.spot = s;
    this.gy = world.heightAt(s.x, s.z);
    this.x = s.x + R.range(-60, 60);
    this.z = s.z + R.range(-60, 60);
    this.y = 140;
    this.state = 'arrive';
    this.mesh.visible = true;
    this.legsK = 0;
    this.rampK = 0;
    this.visits++;
    this.alien = null;
    this.held = [];
    const { hud, npcs, player: P } = world;
    if (Math.hypot(P.x - s.x, P.z - s.z) < 400) {
      hud.flash('¡UN PLATO VOLADOR!', 'Está bajando en la estación de Temperley', 'ok', 3.2);
      world.social?.('ovni', s.x, s.z);
    }
    // la gente se queda mirando y lo filma
    for (const n of npcs.list) {
      if (n.type !== 'vecino' || n.down || Math.hypot(n.x - s.x, n.z - s.z) > 70) continue;
      n.pauseT = R.range(10, 22);
      n.phone = true;
      if (R.chance(0.25)) n.say(R.pick(LINES.gente), 3);
    }
  }
  arriving(dt, world) {
    // baja en espiral, frena al final y despliega las patas
    const s = this.spot;
    const dx = s.x - this.x;
    const dz = s.z - this.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.min(22, d * 1.2);
    if (d > 0.05) {
      this.x += (dx / d) * sp * dt;
      this.z += (dz / d) * sp * dt;
    }
    const target = this.gy + 1.95;
    this.y += (target - this.y) * Math.min(1, dt * (d < 3 ? 1.6 : 0.6));
    this.legsK = Math.min(1, Math.max(0, 1 - (this.y - target) / 6));
    this.beamOn = this.y - target < 25 ? 0.35 : 0;
    if (d < 0.3 && this.y - target < 0.08) {
      this.y = target;
      this.state = 'landed';
      this.phase = 'ramp';
      this.phaseT = 0;
      this.beamOn = 0;
      world.fx.dust(this.x, this.gy + 0.3, this.z, 20, [0.55, 0.52, 0.48], 2.4);
    }
  }
  landed(dt, world) {
    const P = world.player;
    this.phaseT += dt;
    if (this.phase === 'ramp') {
      this.rampK = Math.min(1, this.phaseT / 1.2);
      if (this.rampK >= 1) {
        // baja el marciano
        const out = this.rampEnd();
        const n = this.makeAlien(out.x, out.z);
        n.heading = this.yaw;
        world.npcs.add(n);
        this.alien = n;
        n.aboard = false;
        this.phase = 'toCart';
        this.phaseT = 0;
        world.audio.tone?.([660, 880, 1320], 0.5, 'sine', 0.12);
      }
    } else if (this.phase === 'gone') {
      // volvió a subir: cierra la rampa y se va
      this.rampK = Math.max(0, this.rampK - dt);
      if (this.rampK <= 0) this.takeOff();
    }
    // el marciano está lejos de la nave: se la pueden robar
    const a = this.alien;
    const free = a && !a.aboard && this.phase !== 'ramp' && this.phase !== 'gone';
    this.canSteal = free && !P.vehicle && !P.dead && Math.hypot(P.x - this.x, P.z - this.z) < RADIUS + 1.8;
    if (this.canSteal && world.input.hit('f')) {
      world.input.pressed.delete('f');
      this.board(world);
    }
  }
  // apoyada en el piso, la nave es un obstáculo: Gaspi y la gente la rodean (colisionador) y el
  // tránsito frena y pega la vuelta (`block`, lo lee Traffic)
  groundBlock(world) {
    const on = this.state === 'landed' || this.state === 'parked';
    if (on && !this.col) {
      this.col = world.colliders.addCircle(this.x, this.z, RADIUS - 1.1, 1.6, 'ufo');
      this.block = { x: this.x, z: this.z, r: RADIUS };
    } else if (!on && this.col) {
      // (la grilla no borra: el colisionador se va lejos, como los postes caídos)
      this.col.x = this.col.z = 1e6;
      this.col = null;
      this.block = null;
    }
  }
  rampEnd() {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    // la rampa apunta a +z local de la nave
    return { x: this.x + s * 3.4, z: this.z + c * 3.4 };
  }
  takeOff() {
    this.state = 'leave';
    this.leaveT = 0;
    this.alien = null;
  }
  leaving(dt) {
    this.leaveT += dt;
    this.legsK = Math.max(0, this.legsK - dt * 1.5);
    this.vy = Math.min(40, (this.vy || 0) + dt * 12);
    this.y += this.vy * dt;
    this.x += Math.cos(this.leaveT * 0.7) * dt * 8 * this.leaveT;
    this.z += Math.sin(this.leaveT * 0.7) * dt * 8 * this.leaveT;
    if (this.y > 260) {
      this.state = 'away';
      this.mesh.visible = false;
      this.vy = 0;
      this.nextT = R.range(420, 640);
    }
  }
  // estacionado por Gaspi: al rato el marciano se la lleva de vuelta con un haz de luz
  parked(dt, world) {
    const P = world.player;
    this.parkT += dt;
    const near = Math.hypot(P.x - this.x, P.z - this.z) < RADIUS + 1.8 && !P.vehicle && !P.dead;
    this.canSteal = near;
    if (near && world.input.hit('f')) {
      world.input.pressed.delete('f');
      this.board(world);
      return;
    }
    if (this.parkT > 20 && Math.hypot(P.x - this.x, P.z - this.z) > 18) {
      const a = this.alien;
      if (a && !a.dead && !a.killed) {
        world.fx.sparks(a.x, 1.2, a.z, 20, 4);
        a.dead = true; // npcs lo saca de la escena
        this.alien = null;
        world.hud.toast('El marciano recuperó su nave', 2.4);
      }
      this.takeOff();
    }
  }

  // ---------- El marciano ----------
  // lo llama npcs.update: devuelve cuánto camina y en qué pose
  alienBrain(n, dt, world, dp) {
    const P = world.player;
    const pan = world.city.spots.pancho;
    if (this.state === 'player' || this.state === 'parked') {
      // le robaron la nave: puteadas y le apunta con el dedo a Gaspi
      n.target = { x: pan.x, z: pan.z };
      if (!n.bubble && R.chance(dt * 0.4)) n.say(R.pick(LINES.enojo), 2.6);
      if (this.pancho) this.pancho.visible = false;
      const d = Math.hypot(n.target.x - n.x, n.target.z - n.z);
      if (d > 1.5) return { want: 1.8, pose: 'walk' };
      n.heading = Math.atan2(P.x - n.x, P.z - n.z);
      return { want: 0, pose: 'wave' };
    }
    if (this.phase === 'toCart') {
      n.target = { x: pan.x, z: pan.z };
      if (Math.hypot(pan.x - n.x, pan.z - n.z) < 0.8) {
        this.phase = 'buying';
        this.phaseT = 0;
        n.say(R.pick(LINES.llega), 3.5);
      }
      return { want: n.vmax, pose: 'walk' };
    }
    if (this.phase === 'buying') {
      n.heading = Math.atan2(pan.x - n.x, pan.z - n.z) + Math.PI;
      if (this.phaseT > 4) {
        this.phase = 'eating';
        this.phaseT = 0;
        this.pancho.visible = true;
      }
      return { want: 0, pose: 'talk' };
    }
    if (this.phase === 'eating') {
      if (!n.bubble && R.chance(dt * 0.12)) n.say(R.pick(LINES.come), 2.6);
      if (this.phaseT > 38) {
        this.phase = 'back';
        this.phaseT = 0;
        this.pancho.visible = false;
      }
      return { want: 0, pose: 'eat' };
    }
    if (this.phase === 'back') {
      const e = this.rampEnd();
      n.target = e;
      if (Math.hypot(e.x - n.x, e.z - n.z) < 0.7) {
        n.aboard = true;
        n.dead = true;
        this.phase = 'gone';
        this.phaseT = 0;
      }
      return { want: n.vmax, pose: 'walk' };
    }
    return { want: 0, pose: 'walk' };
  }

  // ---------- Gaspi a bordo ----------
  board(world) {
    const P = world.player;
    this.state = 'player';
    P.ufo = this;
    P.h.root.visible = false;
    P.mvx = P.mvz = 0;
    this.vx = this.vy = this.vz = 0;
    world.combat.syncHand(P);
    world.police.crime('ovni', this.x, this.z);
    world.audio.tone?.([440, 660, 990, 1320], 0.6, 'sine', 0.14);
    if (!this.stolenOnce) {
      this.stolenOnce = true;
      P.addRespeto(5);
      world.social?.('ovni_robo', this.x, this.z);
    }
    world.hud.flash(
      '¡TE ROBASTE UN PLATO VOLADOR!',
      TOUCH ? 'Joystick: volar · Subir/Bajar · Rayo · Tractor (mantené)' : 'WASD volar · Espacio sube · Shift baja · Clic: rayo · Clic derecho: rayo tractor · F para bajarte',
      'ok',
      4,
    );
    if (this.alien && !this.alien.dead) this.alien.say(LINES.enojo[0], 2.5);
  }
  // lo maneja Gaspi: se mueve hacia donde mira la cámara
  fly(dt, world) {
    const { input, player: P, colliders, heightAt } = world;
    const ax = input.axis();
    const c = P.camYaw;
    const fx = -Math.sin(c);
    const fz = -Math.cos(c);
    const rx = -fz;
    const rz = fx;
    const boost = input.down('mouse1') ? 1.6 : 1;
    const tx = (fx * -ax.y + rx * ax.x) * MAX_SPEED * boost;
    const tz = (fz * -ax.y + rz * ax.x) * MAX_SPEED * boost;
    const up = (input.down(' ', 'jump') ? 1 : 0) - (input.down('shift', 'c', 'down') ? 1 : 0);
    const k = Math.min(1, dt * 2.2);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    this.vy += (up * 14 - this.vy) * Math.min(1, dt * 3);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;
    const gy = heightAt(this.x, this.z);
    const floor = gy + 1.95;
    if (this.y < floor) {
      this.y = floor;
      this.vy = Math.max(0, this.vy);
    }
    this.y = Math.min(140, this.y);
    // paredes más altas que la panza de la nave
    const p = { x: this.x, z: this.z };
    if (colliders.resolveCircle(p, RADIUS - 0.4, (b) => b.h > this.y - 0.6 - gy)) {
      this.x = p.x;
      this.z = p.z;
      this.vx *= 0.5;
      this.vz *= 0.5;
    }
    this.legsK = Math.max(0, Math.min(1, 1 - (this.y - floor) / 2.5));
    // armas: rayo y tractor
    this.laserT -= dt;
    if (input.hit('mouse0', 'attack') && this.laserT <= 0) this.shoot(world);
    this.beamOn = input.down('mouse2', 'r', 'beam') ? 1 : 0;
    if (this.beamOn) this.tractor(dt, world);
    else if (this.held.length) this.dropAll(world);
    // Gaspi va adentro (la cámara lo sigue)
    P.x = this.x;
    P.z = this.z;
    P.y = this.y - 1.2;
    P.speed = Math.hypot(this.vx, this.vz);
    P.heading = Math.atan2(this.vx, this.vz) || P.heading;
    const low = this.y - floor < 1.2;
    world.hud.prompt('F', low ? 'Bajarse del plato volador' : 'Bajá hasta el piso para bajarte');
    if (input.hit('f')) {
      input.pressed.delete('f');
      if (low) this.leaveShip(world);
      else world.hud.toast('Bajá más (Shift) para bajarte', 1.6);
    }
  }
  leaveShip(world) {
    const P = world.player;
    this.dropAll(world);
    this.beamOn = 0;
    this.state = 'parked';
    this.parkT = 0;
    this.spot = { x: this.x, z: this.z };
    this.gy = world.heightAt(this.x, this.z);
    this.vx = this.vy = this.vz = 0;
    P.ufo = null;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    P.x = this.x + s * (RADIUS + 0.8);
    P.z = this.z + c * (RADIUS + 0.8);
    P.y = this.gy;
    P.h.root.visible = true;
    P.mvx = P.mvz = 0;
    world.combat.syncHand(P);
    world.hud.prompt(null);
  }
  // rayo: va adonde apunta la cámara y hace volar lo que toca
  shoot(world) {
    const { camera, combat, player: P } = world;
    this.laserT = 0.4;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const hit = combat.trace(world, camera.position, dir, 260, P);
    const o = new THREE.Vector3(this.x, this.y - 0.7, this.z);
    const end = new THREE.Vector3(hit.x, hit.y, hit.z);
    this.laser.position.copy(o);
    this.laser.lookAt(end);
    this.laser.scale.set(1, 1, o.distanceTo(end));
    this.laser.visible = true;
    this.laserLife = 0.14;
    world.audio.zap?.();
    if (hit.type) {
      if (hit.type === 'veh' && !hit.obj.wreck) {
        hit.obj.damage = 100;
        hit.obj.lastHitByPlayer = true;
        combat.explodeVehicle(world, hit.obj);
      } else combat.explode(world, hit.x, hit.z, 0.8, true, hit.y);
    }
  }
  updateLaser(dt) {
    if (this.laserLife > 0) {
      this.laserLife -= dt;
      const k = Math.max(0, this.laserLife / 0.14);
      this.laser.children[0].material.opacity = 0.85 * k;
      if (this.laserLife <= 0) this.laser.visible = false;
    }
  }
  // tractor: lo que está debajo sube hasta la panza; al soltar, cae
  tractor(dt, world) {
    const gy = world.heightAt(this.x, this.z);
    const alt = this.y - gy;
    const r = 2.6 + alt * 0.12;
    if (this.held.length < 3) {
      for (const n of world.npcs.list) {
        if (this.held.length >= 3) break;
        if (n.type === 'alien' || n.lifted || n.dead || Math.hypot(n.x - this.x, n.z - this.z) > r) continue;
        n.lifted = true;
        n.fly = null;
        this.held.push({ kind: 'npc', o: n, y: n.y, spin: R.range(1, 3) });
        if (!n.killed && !n.bubble) n.say(R.pick(['¡AAAAH!', '¡Bajame!', '¡Me abducen!', '¡Mamaaá!']), 2);
      }
      for (const v of world.combat.vehicles(world)) {
        if (this.held.length >= 3) break;
        if (v.lifted || v.kind === 'bus' || v === world.player.vehicle || Math.hypot(v.x - this.x, v.z - this.z) > r) continue;
        if (v.ai || v.driver) {
          if (v.rider) world.traffic.ejectRider(v, world, 0, 0);
          else if (v.ai) world.traffic.ejectDriver?.(v, world);
        }
        world.traffic.release(v);
        world.police.dropCar?.(v);
        v.lifted = true;
        v.blast = null;
        v.tilt = v.tilt || { x: 0, y: 0, z: 0 };
        this.held.push({ kind: 'car', o: v, y: v.tilt.y, spin: R.range(0.3, 0.8) });
      }
      if (this.held.length) world.npcs.panic(this.x, this.z, 30, { x: this.x, z: this.z });
    }
  }
  updateHeld(dt, world) {
    this.held.forEach((h, i) => {
      const o = h.o;
      // sube hasta quedar colgado debajo de la nave, en fila
      const top = this.y - 2.2 - i * (h.kind === 'car' ? 1.7 : 2);
      h.y += Math.min(6 * dt, Math.max(0, top - h.y)) + (top < h.y ? (top - h.y) * Math.min(1, dt * 4) : 0);
      o.x += (this.x - o.x) * Math.min(1, dt * 3);
      o.z += (this.z - o.z) * Math.min(1, dt * 3);
      if (h.kind === 'car') {
        o.tilt.y = h.y;
        o.tilt.x += h.spin * dt * 0.5;
        o.tilt.z += h.spin * dt * 0.3;
        o.heading += h.spin * dt;
        o.sync(0);
      } else {
        o.y = h.y;
        o.mesh.position.set(o.x, o.y, o.z);
        o.mesh.rotation.set(Math.sin(this.t * h.spin) * 0.8, o.heading + this.t * h.spin, 0);
      }
    });
  }
  // suelta todo: caen desde donde estén (y desde alto se hacen pelota)
  dropAll(world) {
    for (const h of this.held) {
      const o = h.o;
      o.lifted = false;
      if (h.kind === 'car') {
        const fall = h.y;
        o.blast = { vy: 0, wx: R.range(-1, 1), wz: R.range(-1, 1), flip: R.chance(0.4), vx: this.vx * 0.5, vz: this.vz * 0.5, drop: fall };
        if (!world.traffic.parked.includes(o)) world.traffic.parked.push(o);
        o.parked = true;
        o.dropFrom = fall;
        if (!o.wreck) o.dropped = true;
      } else {
        const gy = world.heightAt(o.x, o.z);
        const fall = h.y - gy;
        o.y = gy;
        o.fly = { vx: this.vx * 0.4, vy: 0, vz: this.vz * 0.4, y: fall, spin: 0, ws: R.range(3, 6), land: fall * 14 };
      }
    }
    this.held = [];
  }

  // ---------- Animación de la nave y sonido ----------
  animate(dt, world) {
    this.spin += dt * (this.state === 'player' ? 1.2 + Math.hypot(this.vx, this.vz) * 0.05 : 0.8);
    this.yaw = this.yaw ?? R.range(0, Math.PI * 2);
    const bob = this.state === 'landed' || this.state === 'parked' ? 0 : Math.sin(this.t * 1.7) * 0.18;
    this.mesh.position.set(this.x, this.y + bob, this.z);
    this.body.rotation.y = this.yaw;
    // se inclina hacia donde va
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.1) {
      const lx = (this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw)) / MAX_SPEED;
      const lz = (this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw)) / MAX_SPEED;
      this.body.rotation.x += (lz * 0.3 - this.body.rotation.x) * Math.min(1, dt * 4);
      this.body.rotation.z += (-lx * 0.3 - this.body.rotation.z) * Math.min(1, dt * 4);
    } else {
      this.body.rotation.x *= 1 - Math.min(1, dt * 3);
      this.body.rotation.z *= 1 - Math.min(1, dt * 3);
    }
    this.rim.rotation.y = this.spin;
    const hue = (this.t * 0.15) % 1;
    this.rimLights.forEach((m, i) => {
      const on = (Math.floor(this.t * 8) + i) % 4 === 0;
      m.material.color.setHSL((hue + i / 16) % 1, 1, on ? 0.75 : 0.45);
    });
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 5);
    this.belly.material.color.setHSL(0.38, 1, 0.45 + 0.2 * pulse);
    this.legs.scale.y = Math.max(0.05, this.legsK ?? 0);
    this.legs.visible = (this.legsK ?? 0) > 0.05;
    this.ramp.rotation.x = (this.rampK ?? 0) * 0.62;
    this.ramp.visible = (this.rampK ?? 0) > 0.02;
    // rayo tractor: cono hasta el piso
    const b = this.beamOn ?? 0;
    this.beamK = (this.beamK ?? 0) + (b - (this.beamK ?? 0)) * Math.min(1, dt * 6);
    const gy = world.heightAt(this.x, this.z);
    const h = Math.max(0.5, this.y - 0.62 - gy);
    const r = 2.6 + (this.y - gy) * 0.12;
    this.beam.scale.set(r, h, r);
    this.beam.visible = this.beamK > 0.02;
    this.beam.material.opacity = this.beamK * 0.55;
    this.beamTex.offset.y = -this.t * 1.5;
    this.light.position.set(this.x, this.y - 1.5, this.z);
    this.light.intensity = (18 + this.beamK * 60) * (world.time?.night ? 2.2 : 1);
    if (this.beamK > 0.3 && Math.random() < dt * 20) world.fx.dust(this.x + R.range(-r, r) * 0.6, gy + 0.2, this.z + R.range(-r, r) * 0.6, 1, [0.7, 1, 0.8], 0.6);
  }
  // zumbido de nave: dos tonos con vibrato que suben cuando acelera
  hum(world) {
    const a = world.audio;
    if (!a.ctx) return;
    const P = world.player;
    const d = Math.hypot(P.x - this.x, P.z - this.z) + Math.max(0, this.y - 20) * 0.5;
    const on = this.state !== 'away' && this.mesh.visible;
    const vol = on ? Math.max(0, 1 - d / 140) * (this.state === 'player' ? 0.22 : 0.16) : 0;
    if (!this.snd && vol > 0) {
      const ctx = a.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 7;
      lfo.connect(lfoG);
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 98;
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = 147;
      const o3 = ctx.createOscillator();
      o3.type = 'sine';
      o3.frequency.value = 880;
      const g3 = ctx.createGain();
      g3.gain.value = 0.06;
      lfoG.connect(o1.frequency);
      lfoG.connect(o2.frequency);
      lfoG.connect(o3.frequency);
      o1.connect(g);
      o2.connect(g);
      o3.connect(g3).connect(g);
      g.connect(a.master);
      for (const o of [lfo, o1, o2, o3]) o.start();
      this.snd = { g, o1, o2, o3 };
    }
    if (this.snd) {
      const t = a.ctx.currentTime;
      this.snd.g.gain.setTargetAtTime(vol, t, 0.2);
      const sp = Math.hypot(this.vx, this.vz) + Math.abs(this.vy);
      this.snd.o1.frequency.setTargetAtTime(98 + sp * 2, t, 0.3);
      this.snd.o2.frequency.setTargetAtTime(147 + sp * 3, t, 0.3);
      // theremin: el agudo va y viene
      this.snd.o3.frequency.setTargetAtTime(700 + Math.sin(this.t * 0.9) * 300 + this.beamK * 400, t, 0.2);
    }
  }
}
