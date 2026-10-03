// El chofer de "Uver" (una app trucha, como las marcas de los GTA): cada tanto, si andás a pie, un
// sedán negro con el cartelito UVER en el techo se arrima al cordón, toca bocina y el chofer (bigote,
// lentes oscuros, demasiado simpático) te ofrece llevarte gratis. Si te subís, traba las puertas y
// arranca a toda velocidad: o forcejeás (E repetido) hasta que se le escapa el volante y te tirás, o
// te lleva lejos, te saca la plata del rescate y te suelta en cualquier lado.
import * as THREE from 'three';
import { makeCar } from './cars.js';
import { textTexture } from './textures.js';
import { R } from './rng.js';

const OFFER = [
  '¡Eh, lindo! ¿Te llevo? Gratis, eh...',
  'Subí, bombón, que te llevo a donde quieras',
  'Viaje gratis para vos. Tengo aire y musiquita lenta',
  'Qué lindo traje... ¿lo estrenaste para mí?',
  'No tengas miedo, que no muerdo... mucho',
  'Dale, subí adelante que hay lugar',
];
const LEAVE = ['¡Uh, qué arisco! Otro día será, bombón', 'Bueno, bueno... ya nos vamos a cruzar', 'Te lo pierdes, papito'];
const RIDE = ['Ponete cómodo... las puertas no abren, ¿viste?', 'Shhh, tranqui, que conozco un lugar re lindo', 'No grites que nadie te escucha, bombón'];
const FIRST = 100; // segundos hasta el primero
const EVERY = [170, 300]; // y después, cada tanto

let signMat = null;
function uverCar() {
  const mesh = makeCar(R.pick(['p504', 'falcon', 'duna']), 0x111214);
  const u = mesh.userData;
  // cartelito en el techo, negro con letras blancas
  signMat ??= new THREE.MeshBasicMaterial({ map: textTexture('UVER', { w: 256, h: 96, bg: '#0b0b0b', fg: '#ffffff', font: 64 }) });
  const sign = new THREE.Group();
  sign.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0x0b0b0b })));
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.18), signMat);
    p.position.z = s * 0.101;
    if (s < 0) p.rotation.y = Math.PI;
    sign.add(p);
  }
  sign.position.set(0, (u.tall ?? 1.4) + 0.1, -0.1);
  sign.rotation.y = Math.PI / 2;
  mesh.add(sign);
  return mesh;
}

export class Uver {
  constructor(traffic, npcs) {
    this.traffic = traffic;
    this.npcs = npcs;
    this.t = FIRST;
    this.v = null;
    this.state = null;
    this.bubble = null;
    this.fade = document.createElement('div');
    Object.assign(this.fade.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.8s', zIndex: '40' });
    document.body.appendChild(this.fade);
  }

  say(text, t = 3) {
    this.bubble = { text, t };
  }

  // aparece en la calle de Gaspi, unos metros atrás, y viene despacio por su carril
  spawn(world) {
    const P = world.player;
    const e0 = this.npcs.nearestEdge(P.x, P.z);
    const T = this.traffic;
    // ¿hay algún auto (andando o estacionado) en el carril entre s y Gaspi?
    const clear = (e, s, tp) => {
      const lx = e.from.x + e.rx * e.lane;
      const lz = e.from.z + e.rz * e.lane;
      for (const o of [...T.cars, ...T.parked]) {
        const ox = o.x - lx;
        const oz = o.z - lz;
        const at = ox * e.dx + oz * e.dz;
        if (at > s - 6 && at < tp + 4 && Math.abs(ox * e.rx + oz * e.rz) < 2.3) return false;
      }
      return true;
    };
    let pick = null;
    for (const e of [e0, e0.rev]) {
      if (!e || e.street.w < 7) continue;
      const tp = (P.x - e.from.x) * e.dx + (P.z - e.from.z) * e.dz;
      for (const back of [50, 42, 34, 28]) {
        const s = tp - back;
        if (s < 2) continue;
        if (clear(e, s, tp)) {
          pick = { e, s };
          break;
        }
      }
      if (pick) break;
    }
    if (!pick) return false;
    const v = T.spawnOn(uverCar(), pick.e, pick.s);
    v.keep = true;
    v.uver = true;
    v.ai.vmax = 7;
    v.speed = 6;
    this.v = v;
    this.state = 'approach';
    this.stateT = 0;
    return true;
  }

  remove() {
    const v = this.v;
    if (v) {
      this.traffic.release(v);
      v.mesh.parent?.remove(v.mesh);
    }
    this.v = null;
    this.state = null;
    this.bubble = null;
    this.t = R.range(...EVERY);
  }

  leave(world, line = true) {
    if (line) this.say(R.pick(LEAVE), 3);
    this.state = 'leave';
    this.stateT = 0;
    if (this.v?.ai) {
      this.v.ai.hold = false;
      this.v.ai.vmax = 14;
    }
  }

  update(dt, world) {
    const P = world.player;
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) this.bubble = null;
    }
    if (!this.v) {
      this.t -= dt;
      if (this.t > 0) return;
      // solo con Gaspi a pie y tranquilo
      if (P.vehicle || P.riding || P.dead || P.busted || world.police.stars || world.missions?.m || world.matanzas?.active || world.races?.race || world.inside || world.transit?.ride) {
        this.t = 12;
        return;
      }
      if (!this.spawn(world)) this.t = 8;
      return;
    }
    const v = this.v;
    if (this.state === 'ride') return;
    this.stateT += dt;
    // se lo robaron, lo chocaron o se lo llevó la grúa: el chofer se va a otra parte
    if (v.wreck || P.vehicle === v || !this.traffic.cars.includes(v)) {
      if (P.vehicle === v) {
        this.v = null;
        this.state = null;
        this.t = R.range(...EVERY);
      } else this.remove();
      return;
    }
    const d = Math.hypot(v.x - P.x, v.z - P.z);
    if (this.state === 'approach') {
      // cuando queda al lado de Gaspi, frena al cordón
      const along = (P.x - v.x) * v.fx + (P.z - v.z) * v.fz;
      if (d < 12 && along < 3) {
        v.ai.hold = true;
        this.state = 'offer';
        this.stateT = 0;
        this.sayT = 0;
        world.audio.bocina?.(0.5);
        setTimeout(() => world.audio.bocina?.(0.5), 260);
      } else if (this.stateT > 30 || (along < -10 && d > 20)) this.remove();
    } else if (this.state === 'offer') {
      v.ai.hold = true;
      this.sayT -= dt;
      if (this.sayT <= 0 && d < 22) {
        this.say(R.pick(OFFER), 3.2);
        this.sayT = R.range(4, 6);
      }
      if (d > 28 || this.stateT > 35 || world.police.stars) this.leave(world);
    } else if (this.state === 'leave') {
      if (d > 140 || this.stateT > 40) this.remove();
    }
  }

  // E al lado de la ventanilla
  action(world) {
    const P = world.player;
    const v = this.v;
    if (this.state !== 'offer' || !v || P.vehicle) return null;
    if (Math.hypot(v.x - P.x, v.z - P.z) > v.W / 2 + 3.8 || Math.abs(v.speed) > 1.5) return null;
    return { text: 'Subirte al Uver (gratis)', run: () => this.board(world) };
  }

  board(world) {
    const { player: P, hud, audio } = world;
    const v = this.v;
    this.state = 'ride';
    this.ride = { t: 0, grip: 0, zoom: P.zoom, pitch: P.camPitch, sayT: 1.5 };
    P.h.root.visible = false;
    P.riding = true;
    P.zoom = 2.2;
    P.camPitch = 0.3;
    v.ai.hold = false;
    v.ai.vmax = 19;
    audio.metal?.(0.4); // el clac de las trabas
    hud.flash('¡TE SECUESTRARON!', 'El de Uver trabó las puertas. Apretá E repetido para forcejear y tirarte', 'bad', 3.6);
    this.say('Ahora sí... ponete el cinturón, bombón', 3);
  }

  // mientras vas secuestrado (devuelve true: Gaspi no se mueve solo)
  riding(dt, world) {
    if (this.state !== 'ride') return false;
    const r = this.ride;
    const { player: P, input, hud } = world;
    const v = this.v;
    r.t += dt;
    if (r.done) {
      P.speed = 0;
      hud.prompt(null);
      return true;
    }
    if (!v || v.wreck || !this.traffic.cars.includes(v)) {
      this.escape(world, false);
      return true;
    }
    P.x = v.x;
    P.z = v.z;
    P.heading = v.heading;
    P.speed = 0;
    r.sayT -= dt;
    if (r.sayT <= 0) {
      this.say(R.pick(RIDE), 3);
      r.sayT = R.range(5, 7);
    }
    // forcejeo: cada E suma, y se va aflojando
    r.grip = Math.max(0, r.grip - dt * 0.12);
    if (input.hit('e')) {
      r.grip += 0.075;
      world.audio.golpe?.(0.4);
      world.fx.shake = Math.max(world.fx.shake || 0, 0.25);
    }
    hud.prompt('E', `Forcejear ${'■'.repeat(Math.round(r.grip * 10))}${'□'.repeat(10 - Math.round(Math.min(1, r.grip) * 10))}`);
    if (r.grip >= 1) this.escape(world, true);
    else if (r.t > 14) this.ransom(world);
    return true;
  }

  // le diste una piña y te tiraste del auto andando
  escape(world, fought) {
    const { player: P, hud } = world;
    const v = this.v;
    this.endRide(world);
    if (v) {
      const rx = -v.fz;
      const rz = v.fx;
      P.x = v.x + rx * (v.W / 2 + 1);
      P.z = v.z + rz * (v.W / 2 + 1);
      P.heading = v.heading;
      P.hurt?.(Math.min(25, 6 + Math.abs(v.speed) * 0.8), 'Te tiraste del Uver andando');
      P.knockDown?.(1.4, rx, rz);
    }
    if (fought) {
      hud.flash('¡TE ESCAPASTE!', 'Le diste una piña al chofer y te tiraste del auto', 'ok', 3);
      this.say('¡Volvé, bombón! ¡Ingrato!', 3);
    }
    P.addRespeto?.(fought ? 2 : 0);
    this.leave(world, false);
  }

  // no te escapaste: te llevan lejos, te sacan la plata y te sueltan
  ransom(world) {
    const { player: P, hud, time, audio } = world;
    const r = this.ride;
    r.done = true;
    this.fade.style.opacity = '1';
    setTimeout(() => {
      const pay = Math.min(P.money, Math.max(5000, Math.round((P.money * 0.3) / 1000) * 1000));
      P.addMoney(-pay);
      const p = this.npcs.sidewalkPoint(P.x, P.z, 300, 480) || this.npcs.sidewalkPoint(P.x, P.z, 150, 300);
      this.endRide(world);
      if (p) {
        P.x = p.x;
        P.z = p.z;
      }
      P.health = Math.min(P.health, 55);
      time.hour = (time.hour + 2) % 24;
      this.remove();
      hud.flash('TE LARGARON EN ' + (world.streetName?.(P.x, P.z) || 'CUALQUIER LADO').toUpperCase(), pay ? `El de Uver se quedó con $${pay.toLocaleString('es-AR')} de rescate. La próxima, tomate un remís` : 'No tenías un mango y te largaron. La próxima, tomate un remís', 'bad', 4.5);
      audio.alerta?.();
      this.fade.style.opacity = '0';
    }, 1000);
  }

  endRide(world) {
    const P = world.player;
    const r = this.ride;
    P.h.root.visible = true;
    P.riding = false;
    P.mvx = P.mvz = 0;
    if (r) {
      P.zoom = r.zoom;
      P.camPitch = r.pitch;
    }
    this.ride = null;
    if (this.state === 'ride') this.state = null;
  }
}
