// Gente del barrio: vecinos que caminan por las veredas reales, trapitos, gente pidiendo,
// perdidos que deambulan, el vendedor de medias, la cana a pie y los perros.
// Cada uno tiene vida: se asusta con los tiros, se defiende de las piñas o sale corriendo.
import * as THREE from 'three';
import { makeHuman, animateHuman, randomCivilian, SKINS, HAIRS } from './human.js';
import { makeDog } from './animals.js';
import { makePerson, makeLook, PEOPLE, ANIMALS, makeAnimal, animalPlay, swapHuman, disposeHuman } from './people.js';
import { setLod } from './rig.js';
import { DATA as D } from './map.js';
import { R } from './rng.js';
import { walkwayHeight } from './physics.js';
import { lowFilter } from './bajonivel.js';
import { NADAR, VADEO } from './agua.js';

const OFF = (e) => e.street.w / 2 + 1.5; // mitad de la vereda
const EG = 40; // grilla de aristas

// cuerpo para un look de human.js: el modelo MakeHuman que más se parece o, si todavía no cargaron, el
// hecho por código (y después se cambia: ver la vuelta de los "plain" en update)
const body = (look) => makeLook(look) || makeHuman(look);

export class Npc {
  constructor(type, human, x, z) {
    this.type = type;
    this.h = human;
    this.x = x;
    this.z = z;
    this.y = 0.15;
    this.heading = R.range(0, Math.PI * 2);
    this.speed = 0;
    this.state = 'walk';
    this.t = 0;
    this.knockT = 0;
    this.bubble = null;
    this.cool = 0;
    this.r = 0.32;
    this.hp = 100;
    this.act = null; // golpe o reacción en curso {pose, t, dur}
    this.fightCd = 0;
  }
  say(text, dur = 3) {
    this.bubble = { text, t: dur };
  }
  get mesh() {
    return this.h.root;
  }
  get down() {
    return this.state === 'down' || this.state === 'ko';
  }
}

const LINES = {
  zombie: ['¿Tenés un peso, amigo?', 'Amigo... amigo...', '¿Me convidás un pucho?', 'Eeeh... pará, pará...', '¿Qué hacés, rey?'],
  mendigo: ['¿Una monedita, pa?', 'Una ayudita para comer, jefe', 'Dios te bendiga'],
  vecino: ['¡Qué calor!', 'Otra vez sin luz...', '¿Viste el partido?', 'Uh, se viene el corte en Meeks', 'Ya ni el Roca pasa a horario', '¡Chau, Gaspi!', 'Está todo carísimo', '¿Vas para Lomas?'],
  susto: ['¡Aaah! ¡Tiros!', '¡Corré, corré!', '¡Llamen a la policía!', '¡Al piso, al piso!', '¡Está loco este!', '¡Mamita!'],
  pelea: ['¿Qué te pasa, gil?', '¡Vení, vení!', '¡Te voy a dar!', '¡A mí no me tocás!', '¿Querés cobrar?'],
  duele: ['¡Ay!', '¡Pará, animal!', '¡Eh! ¡Qué hacés!', '¡Me mataste, loco!', '¡Uuuf!'],
  panchero: ['¡Panchos, panchos! ¡Con lluvia de papas!', '¿Con qué lo querés, jefe? ¿Mayo, ketchup, golf?', '¡Pancho y gaseosa, mil quinientos!', '¡Calentitos los panchos!', 'Pasá, pasá, que hay superpancho'],
  florista: ['¡Flores, flores! Ramos a dos mil', 'Llevale un ramo a la novia, jefe', '¡Rosas, claveles, fresias, fresquitas!', '¿Para la vieja? Llevá las fresias', 'Ramito de jazmines, ¡perfuma toda la casa!'],
  medias: ['¡Medias, medias! Tres pares dos mil', '¡Llevá medias, jefe! De algodón', '¡Soquetes, medias, tres por dos mil!', '¡Medias de toalla para el invierno!'],
  charla: ['¿Viste lo del Celeste?', 'Y bueno, qué le vas a hacer...', '¡Jajaja, no te puedo creer!', 'No, pará, escuchá...', 'El sábado hay asado en lo de Rubén', 'Está todo carísimo, loco', '¿Y tu vieja cómo anda?', 'Le dije: "así no se puede"', '¡Noooo! ¿En serio?', 'El Roca otra vez parado...'],
  cana: ['¡Alto, policía!', '¡Quieto ahí!', '¡Al piso, al piso!', '¡Las manos donde las vea!', '¡No te hagás el vivo!'],
};
export const lines = (t) => LINES[t];
const WEAPON_OUT = (p) => !!p.weapon && p.weapon !== 'punos';
const notUfo = (b) => b.kind !== 'ufo';

export class Npcs {
  constructor(scene, city, graph, heightAt, audio) {
    this.scene = scene;
    this.city = city;
    this.colliders = city.colliders;
    this.heightAt = heightAt;
    this.audio = audio;
    this.list = [];
    this.dogs = [];
    this.groups = []; // grupitos charlando en la vereda
    this.graph = graph;
    this.recycleT = 0;
    // puentes peatonales (src/city.js, addStation): altura del piso y recorridos para cruzarlos
    this.walkways = city.walkways || [];
    this.routes = (city.bridgeRoutes || []).filter((r) => r.ends.length === 2);
    // solo se usan los que bajan a la calle (no a un andén) en las dos puntas
    for (const r of this.routes) r.ok = r.ends.every((e) => heightAt(e.foot.x, e.foot.z) < 0.5 && !this.colliders.resolveCircle({ x: e.foot.x, z: e.foot.z }, 0.35));
    this.wb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const w of this.walkways) {
      if (w.ring) continue;
      this.wb.x0 = Math.min(this.wb.x0, w.ax - 3, w.bx - 3);
      this.wb.x1 = Math.max(this.wb.x1, w.ax + 3, w.bx + 3);
      this.wb.z0 = Math.min(this.wb.z0, w.az - 3, w.bz - 3);
      this.wb.z1 = Math.max(this.wb.z1, w.az + 3, w.bz + 3);
    }
    for (const n of graph.nodes) n.maxW = Math.max(...n.out.map((e) => e.street.w), 6);
    // aristas caminables: calles con vereda (no pasillos ni vías de servicio angostas)
    // (por el bajo nivel no camina nadie: no tiene veredas)
    this.walkEdges = graph.edges.filter((e) => e.street.w >= 6 && e.len > 8 && !e.street.bajo);
    this.grid = new Map();
    for (const e of this.walkEdges) {
      const n = Math.ceil(e.len / 15);
      const seen = new Set();
      for (let i = 0; i <= n; i++) {
        const x = e.from.x + e.dx * (e.len * i) / n;
        const z = e.from.z + e.dz * (e.len * i) / n;
        const k = `${Math.floor(x / EG)},${Math.floor(z / EG)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(e);
      }
    }
  }

  // ---------- Navegación por las veredas ----------
  nearestEdge(x, z) {
    let best = null;
    let bd = Infinity;
    const i0 = Math.floor(x / EG);
    const j0 = Math.floor(z / EG);
    for (let r = 1; r <= 3 && !best; r++) {
      for (let a = -r; a <= r; a++) {
        for (let b = -r; b <= r; b++) {
          for (const e of this.grid.get(`${i0 + a},${j0 + b}`) || []) {
            const t = Math.max(0, Math.min(e.len, (x - e.from.x) * e.dx + (z - e.from.z) * e.dz));
            const d = Math.hypot(x - (e.from.x + e.dx * t), z - (e.from.z + e.dz * t));
            if (d < bd) {
              bd = d;
              best = e;
            }
          }
        }
      }
    }
    return best ?? R.pick(this.walkEdges);
  }
  cornerK(node, e) {
    return node.deg > 2 ? Math.min(e.len * 0.45, node.maxW / 2 + 1.5) : 0;
  }
  // se engancha a la vereda más cercana y sigue caminando desde ahí
  attach(n) {
    n.bridge = null;
    if (n.y > 1.5 && this.bridgeExit(n)) return;
    const e = this.nearestEdge(n.x, n.z);
    const lat = (n.x - e.from.x) * e.rx + (n.z - e.from.z) * e.rz;
    // caminar en el sentido que más se parece a hacia dónde mira
    const fw = Math.sin(n.heading) * e.dx + Math.cos(n.heading) * e.dz;
    if (fw < 0 && e.rev) {
      n.edge = e.rev;
      n.side = lat >= 0 ? -1 : 1;
    } else {
      n.edge = e;
      n.side = lat >= 0 ? 1 : -1;
    }
    this.legEnd(n);
  }
  legEnd(n) {
    const e = n.edge;
    const k = this.cornerK(e.to, e);
    const off = OFF(e) * n.side;
    n.target = { x: e.to.x - e.dx * k + e.rx * off, z: e.to.z - e.dz * k + e.rz * off };
    n.leg = 'walk';
  }
  // llegó a la esquina: elige la próxima cuadra y a veces cruza la calle
  nextLeg(n) {
    if (n.leg === 'corner') {
      this.legEnd(n);
      return;
    }
    const e = n.edge;
    const opts = e.to.out.filter((o) => o !== e.rev && o.street.w >= 6);
    const ne = opts.length ? R.pick(opts) : e.rev || e;
    const lat = (n.x - ne.from.x) * ne.rx + (n.z - ne.from.z) * ne.rz;
    let side = lat >= 0 ? 1 : -1;
    if (ne.from.deg > 2 && ne.street.w < 16 && R.chance(0.22)) side = -side;
    n.edge = ne;
    n.side = side;
    const k = this.cornerK(ne.from, ne);
    n.target = { x: ne.from.x + ne.dx * k + ne.rx * OFF(ne) * side, z: ne.from.z + ne.dz * k + ne.rz * OFF(ne) * side };
    n.leg = 'corner';
  }
  // ---------- Puente peatonal de la estación ----------
  // de la punta a a la otra: pie de la escalera, escalones, descanso, el puente y la otra escalera
  bridgeRoute(r, a) {
    const A = r.ends[a];
    const B = r.ends[1 - a];
    const deck = a ? [...r.deck].reverse() : r.deck;
    return [A.foot, A.bottom, A.top, A.land, ...deck, B.land, B.top, B.bottom, B.foot];
  }
  // alguien que quedó arriba (se asustó, se cayó): sigue hasta la escalera más cerca
  bridgeExit(n) {
    let best = null;
    for (const r of this.routes) {
      for (const a of [0, 1]) {
        const pts = this.bridgeRoute(r, a);
        let i0 = 0;
        let d0 = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const d = Math.hypot(pts[i].x - n.x, pts[i].z - n.z);
          if (d < d0) {
            d0 = d;
            i0 = i;
          }
        }
        if (d0 > 8) continue;
        let rest = 0;
        for (let i = i0 + 1; i < pts.length; i++) rest += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        if (!best || rest < best.rest) best = { rest, pts: pts.slice(i0) };
      }
    }
    if (!best) return false;
    n.bridge = { pts: best.pts, i: 0, t: 0 };
    n.target = best.pts[0];
    n.leg = 'bridge';
    return true;
  }
  // camina el recorrido; al llegar abajo vuelve a la vereda
  bridgeStep(n, dt, dp) {
    const b = n.bridge;
    let p = b.pts[b.i];
    const d = Math.hypot(p.x - n.x, p.z - n.z);
    // trabado = hace rato que no se acerca (no cuenta mientras está parado)
    b.t += n.pauseT > 0 ? 0 : dt;
    if (d < (b.best ?? Infinity) - 0.3) {
      b.best = d;
      b.t = 0;
    }
    if (d < 0.7) {
      b.i++;
      b.t = 0;
      b.best = Infinity;
      if (b.i >= b.pts.length) {
        n.bridge = null;
        this.attach(n);
        return;
      }
      p = b.pts[b.i];
      // en el medio, alguno se apoya en la baranda a mirar pasar el tren
      if (b.pts[b.i - 1].mid && R.chance(0.35)) {
        n.pauseT = R.range(3, 7);
        const l = b.pts[b.i];
        n.heading = Math.atan2(l.x - n.x, l.z - n.z) + (R.chance(0.5) ? 1 : -1) * Math.PI / 2;
      }
    } else if (b.t > 8) {
      // trabado (alguien estacionó en la escalera): se va
      n.bridge = null;
      if (dp > 50) n.dead = true;
      else this.attach(n);
      return;
    }
    n.target = p;
  }
  // de a poco, algunos vecinos de los que andan cerca suben al puente para cruzar las vías
  bridgeTraffic(player, night) {
    const ok = this.routes.filter((r) => r.ok);
    if (!ok.length) return;
    let on = 0;
    for (const n of this.list) if (n.bridge) on++;
    if (on >= (night ? 2 : 5) || !R.chance(0.35)) return;
    const r = R.pick(ok);
    const a = R.chance(0.5) ? 1 : 0;
    const f = r.ends[a].foot;
    const df = Math.hypot(f.x - player.x, f.z - player.z);
    if (df > 200) return;
    let pick = null;
    let bd = 40;
    for (const n of this.list) {
      if (n.type !== 'vecino' || n.state !== 'walk' || n.bridge || n.mission || n.group || n.down || n.pauseT > 0) continue;
      const d = Math.hypot(n.x - f.x, n.z - f.z);
      if (d < bd && this.colliders.blocked(n.x, n.z, f.x, f.z, 0.8) >= 1) {
        bd = d;
        pick = n;
      }
    }
    // si no pasa nadie, aparece uno en el pie de la escalera (lejos de Gaspi, que no lo vea aparecer)
    if (!pick && df > 60) pick = this.spawnWalker({ x: f.x, z: f.z, heading: Math.atan2(r.ends[a].bottom.x - f.x, r.ends[a].bottom.z - f.z) }, player);
    if (!pick) return;
    pick.bridge = { pts: this.bridgeRoute(r, a), i: 0, t: 0 };
    pick.target = pick.bridge.pts[0];
    pick.leg = 'bridge';
    pick.phone = false;
  }

  // un punto de vereda al azar entre rmin y rmax de (x, z)
  sidewalkPoint(x, z, rmin, rmax) {
    for (let tries = 0; tries < 30; tries++) {
      const a = R.range(0, Math.PI * 2);
      const d = R.range(rmin, rmax);
      const e = this.nearestEdge(x + Math.cos(a) * d, z + Math.sin(a) * d);
      const s = R.range(0, e.len);
      const side = R.chance(0.5) ? 1 : -1;
      const px = e.from.x + e.dx * s + e.rx * OFF(e) * side;
      const pz = e.from.z + e.dz * s + e.rz * OFF(e) * side;
      const dd = Math.hypot(px - x, pz - z);
      if (dd < rmin * 0.8 || dd > rmax * 1.2) continue;
      return { x: px, z: pz, edge: e, side, heading: Math.atan2(e.dx, e.dz) };
    }
    return null;
  }

  add(npc) {
    this.scene.add(npc.mesh);
    this.list.push(npc);
    return npc;
  }

  populate(center) {
    for (let i = 0; i < 44; i++) this.spawnWalker(null, center, 8, 150);
    for (let i = 0; i < 3; i++) this.spawnGroup(center, i ? 30 : 12, i ? 120 : 40);
    for (const s of this.city.spots.trapitos) {
      const look = { ...randomCivilian(), female: false, vest: 0xc6ff00, cap: R.chance(0.5) ? 0x1a237e : null, franela: true };
      const n = this.add(new Npc('trapito', body(look), s.x, s.z));
      n.look = look;
      n.state = 'idle';
      n.home = { x: s.x, z: s.z };
    }
    for (const s of this.city.spots.mendigos) {
      const look = { skin: R.pick(SKINS), hair: R.pick(HAIRS), shirt: R.pick([0x6d5c47, 0x4e4e4e, 0x5d4037]), pants: 0x3e3a36, beard: true, hairStyle: 'long', cup: true, tired: true };
      const n = this.add(new Npc('mendigo', body(look), s.x, s.z));
      n.look = look;
      n.state = 'sit';
      n.heading = s.heading;
      n.hp = 60;
    }
    this.spawnVendors();
    this.spawnPanchero();
    for (let i = 0; i < 6; i++) this.spawnZombie(center);
    for (let i = 0; i < 8; i++) this.spawnDog(center);
  }

  // Vendedores de medias: en los andenes y en la puerta de la estación
  spawnVendors() {
    const homes = [];
    const door = this.city.spots.stationDoor;
    const sw = this.city.spots.stationWall;
    if (door) homes.push({ x: door.x + (sw ? sw.nx * 3 + sw.ux * 4 : 3), z: door.z + (sw ? sw.nz * 3 + sw.uz * 4 : 0) });
    // centro de los andenes más largos
    const plats = D.platforms.map((p) => {
      const r = p[0];
      let cx = 0;
      let cz = 0;
      for (const [x, z] of r) {
        cx += x;
        cz += z;
      }
      return { x: cx / r.length, z: cz / r.length, n: r.length };
    });
    plats.sort((a, b) => Math.hypot(a.x - door.x, a.z - door.z) - Math.hypot(b.x - door.x, b.z - door.z));
    for (const p of plats.slice(0, 2)) homes.push(p);
    this.vendors = [];
    for (const home of homes) {
      const look = { skin: R.pick(SKINS), hair: R.pick(HAIRS), shirt: R.pick([0xe65100, 0x2e7d32, 0x283593]), pants: 0x2d3440, cap: 0xf5f5f5, belly: R.chance(0.5), longSleeves: true };
      const h = body(look);
      // la bolsa de medias de colores colgando de la mano izquierda
      const bag = new THREE.Group();
      const cols = [0xf5f5f5, 0x212121, 0x1565c0, 0xc62828, 0x9e9e9e, 0xf9a825];
      for (let i = 0; i < 6; i++) {
        const sock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.04), new THREE.MeshLambertMaterial({ color: cols[i] }));
        sock.position.set(-0.08 + (i % 3) * 0.08, -0.14 - Math.floor(i / 3) * 0.05, 0.03 * (i % 2));
        sock.rotation.z = (i - 2.5) * 0.08;
        bag.add(sock);
      }
      bag.position.set(0, -0.06, 0.02);
      h.bones.handL.add(bag);
      const n = this.add(new Npc('medias', h, home.x, home.z));
      n.look = look;
      n.state = 'idle';
      n.home = home;
      n.hp = 80;
      this.vendors.push(n);
    }
  }

  // el panchero del carrito de la estación: chaqueta y gorro blancos, atrás del carrito
  spawnPanchero() {
    const at = this.city.spots.panchero;
    if (!at) return;
    const look = { skin: R.pick(SKINS), hair: 0x2b1d14, hairStyle: 'short', shirt: 0xf5f5f5, longSleeves: true, pants: 0x2d3440, cap: 0xf5f5f5, mustache: true, belly: true, scale: 1.02 };
    const n = this.add(new Npc('panchero', body(look), at.x, at.z));
    n.look = look;
    n.state = 'idle';
    n.home = { x: at.x, z: at.z };
    n.heading = at.heading;
    n.hp = 90;
    n.mission = true;
    this.panchero = n;
  }

  // human: un personaje ya armado (por ejemplo el motochorro que se cae de la moto)
  // le cambia el cuerpo a alguien que ya anda por ahí (Ciro, cuando carga su modelo de artista)
  reskin(n, h) {
    n.h = swapHuman(n.h, h);
    n.shade = undefined;
  }

  spawnWalker(at, near, rmin = 60, rmax = 150, look = null, human = null) {
    let p = at;
    if (!p) {
      p = this.sidewalkPoint(near.x, near.z, rmin, rmax);
      if (!p) return null;
    }
    // la mayoría con modelo de artista (CC0, ver src/people.js) cuando ya cargaron
    const h = human || (!look && PEOPLE.ready && R.chance(0.9) && makePerson(R.chance(0.5) ? 'female' : 'male')) || makeHuman(look ?? randomCivilian());
    const n = this.add(new Npc('vecino', h, p.x, p.z));
    // un vecino cualquiera hecho por código (antes de que cargaran los modelos): se cambia después
    n.plain = !human && !look && !h.rig;
    n.heading = p.heading ?? R.range(0, Math.PI * 2);
    n.vmax = R.range(1.1, 1.6);
    n.state = 'walk';
    n.phone = R.chance(0.2);
    n.brave = R.chance(0.3) ? R.range(0.4, 0.9) : R.range(0, 0.2);
    n.money = R.int(3, 25) * 200;
    this.attach(n);
    return n;
  }

  // dos o tres vecinos parados charlando en ronda; se turnan para hablar y después se van cada uno
  spawnGroup(near, rmin = 40, rmax = 130) {
    const p = this.sidewalkPoint(near.x, near.z, rmin, rmax);
    if (!p) return null;
    const k = R.chance(0.6) ? 2 : 3;
    const g = { x: p.x, z: p.z, members: [], speaker: null, t: 0, nextT: 0, endT: R.range(50, 110) };
    const a0 = R.range(0, Math.PI * 2);
    for (let i = 0; i < k; i++) {
      const a = a0 + (i / k) * Math.PI * 2 + R.range(-0.3, 0.3);
      const r = R.range(0.6, 0.8);
      const x = p.x + Math.sin(a) * r;
      const z = p.z + Math.cos(a) * r;
      const n = this.spawnWalker({ x, z, heading: Math.atan2(p.x - x, p.z - z) }, near);
      if (!n) continue;
      n.state = 'chat';
      n.phone = false;
      n.group = g;
      n.h.phase = R.range(0, 20);
      g.members.push(n);
    }
    if (g.members.length < 2) {
      for (const n of g.members) {
        n.state = 'walk';
        n.group = null;
      }
      return null;
    }
    this.groups.push(g);
    return g;
  }
  updateGroups(dt, player) {
    for (const g of this.groups) {
      g.t += dt;
      const live = g.members.filter((n) => n.state === 'chat' && !n.dead);
      if (live.length < 2 || g.t > g.endT) {
        // se despiden y cada uno sigue para su lado
        for (const n of live) {
          n.state = 'walk';
          n.group = null;
          this.attach(n);
        }
        g.done = true;
        continue;
      }
      if (g.t >= g.nextT || !live.includes(g.speaker)) {
        const others = live.filter((n) => n !== g.speaker);
        g.speaker = R.pick(others.length ? others : live);
        g.nextT = g.t + R.range(2.5, 6);
        const dp = Math.hypot(player.x - g.x, player.z - g.z);
        if (dp < 14 && R.chance(0.5)) g.speaker.say(dp < 5 && R.chance(0.3) ? 'Ese es Gaspi, ¿no?' : R.pick(LINES.charla), 2.6);
      }
    }
    this.groups = this.groups.filter((g) => !g.done);
  }
  spawnZombie(near, rmin = 40, rmax = 140) {
    const p = this.sidewalkPoint(near.x, near.z, rmin, rmax);
    if (!p) return null;
    const look = { skin: R.pick([0xa9b08f, 0x98a078, 0x8a9070]), hair: 0x2b2420, shirt: R.pick([0x4e4a45, 0x5d5348, 0x3d3d3d]), pants: 0x333333, hood: R.chance(0.5) ? 0x3a3a3a : null, beard: R.chance(0.5), tired: true, scale: R.range(0.9, 1) };
    const n = this.add(new Npc('zombie', body(look), p.x, p.z));
    n.look = look;
    n.state = 'walk';
    n.vmax = R.range(0.5, 0.9);
    n.hp = 45;
    n.money = R.int(0, 3) * 100;
    this.attach(n);
    return n;
  }

  // Cana a pie (la maneja la policía, pero camina, pega y cae como cualquiera)
  // gendarme: con 6 estrellas bajan de las camionetas con pasamontañas y equipo táctico
  spawnCop(x, z, gendarme = false) {
    // la Bonaerense de MakeHuman (camisa celeste), con gorra azul e insignia la mayoría
    const look = { skin: R.pick(SKINS), hair: 0x1a1a1a, hairStyle: R.pick(['short', 'buzz']), police: true, female: R.chance(0.2), shirt: 0x8fb4d8, pants: 0x1c2a44, shoes: 0x111111, cap: R.chance(0.65) ? 0x1c2a44 : null, stubble: R.chance(0.4), scale: R.range(0.98, 1.06) };
    const h = (gendarme && PEOPLE.ready && makePerson('swat')) || makeLook({ ...look, hair: null, skin: null }) || makeHuman({ ...look, female: false, cap: 0x1c2a44 });
    const n = this.add(new Npc('cana', h, x, z));
    if (!h.rig && !gendarme) n.look = { ...look, hair: null, skin: null };
    n.gendarme = gendarme;
    n.state = 'chase';
    n.hp = gendarme ? 200 : 140;
    n.vmax = R.range(4.6, 5.6);
    n.money = R.int(2, 8) * 1000;
    return n;
  }

  spawnDog(near) {
    const col = R.pick([0x6b4a2b, 0x2a2420, 0xb88a4a, 0xd9c7a3, 0x8a6a4a, 0x3a3230]);
    const { g, legs, tail } = makeDog(col);
    g.traverse((o) => (o.castShadow = true));
    const p = this.sidewalkPoint(near.x, near.z, 20, 140) ?? { x: near.x, z: near.z };
    // tinte para el modelo de perro (manto más claro o más oscuro)
    const tint = R.pick([0xffffff, 0xffffff, 0xe8d8c0, 0x9a8070, 0x6a5a50]);
    const dog = { g, legs, tail, tint, x: p.x, z: p.z, heading: 0, speed: 0, t: R.range(0, 5), barkT: 0, phase: 0 };
    this.attach(dog);
    this.scene.add(g);
    this.dogs.push(dog);
  }

  // Gente que camina (para que el tránsito frene)
  walkers() {
    return this.list.filter((n) => !n.down && n.state !== 'sit');
  }

  // ---------- Golpes ----------
  // fx, fz: dirección del golpe. Devuelve 'ko' si lo dejó fuera de combate y 'muerte' si lo mató.
  hurt(n, dmg, fx, fz, o = {}) {
    const res = this.damage(n, dmg, fx, fz, o);
    // las matanzas cuentan lo que mata Gaspi
    if (res === 'muerte' && o.byPlayer) o.world?.matanzas?.onKill(n);
    return res;
  }
  damage(n, dmg, fx, fz, o) {
    const w = o.world;
    // a los chicos no se los lastima (como en los GTA): se asustan y salen corriendo
    if (n.type === 'chico') {
      if (n.state !== 'flee') this.setState(n, 'flee', { x: n.x - fx * 3, z: n.z - fz * 3 });
      return null;
    }
    // una explosión los tira por el aire (vivos o no)
    if (o.blast && !n.fly) n.fly = { vx: fx * o.blast, vy: 2.5 + o.blast * 0.45, vz: fz * o.blast, y: 0, spin: 0, ws: (Math.random() < 0.5 ? -1 : 1) * (4 + o.blast) };
    if (n.killed) return null;
    if (n.state === 'ko') {
      // pegarle o tirarle a alguien que está tirado lo termina de matar
      n.hp -= dmg;
      if (o.gun || n.hp < -45) {
        this.kill(n, fx, fz, w);
        return 'muerte';
      }
      return null;
    }
    // peleando de frente, a veces ataja el directo o el cruzado con la guardia (no si ya lo estaban
    // golpeando: el que recibe una seguidilla queda abierto)
    if (o.blow && (o.blow === 'jab' || o.blow === 'cross') && n.state === 'fight' && n.type !== 'zombie' && !n.down && !(n.act?.pose === 'hit') && (n.stunT ?? 0) <= 0 && Math.random() < (n.guardP ?? 0.3)) {
      n.act = { pose: 'block', t: 0, dur: 0.38 };
      n.stag = { vx: fx * 1.2, vz: fz * 1.2, t: 0.2 };
      n.hp -= dmg * 0.15;
      return 'block';
    }
    n.hpMax ??= Math.max(1, n.hp);
    n.hp -= dmg;
    n.cool = 0;
    // un tiro en las piernas: rengo un buen rato (y a veces se cae)
    if (o.zone === 'piernas') n.limpT = 14;
    // una seguidilla de golpes lo deja medio groggy un rato
    if (o.blow) n.stunT = 1.1;
    if (n.hp <= 0) {
      if (!n.down) n.fallT = 0.3;
      n.state = 'ko';
      n.koT = 0;
      n.act = null;
      // sale despedido para atrás (se desliza, no se teletransporta)
      const ko = Math.min(2.5, 0.4 + dmg * 0.02);
      n.stag = { vx: fx * ko * 3, vz: fz * ko * 3, t: 0.33 };
      n.heading = Math.atan2(-fx, -fz);
      n.bubble = null;
      if (n.money && w) w.pickups.money(n.x + R.range(-0.6, 0.6), n.z + R.range(-0.6, 0.6), n.money);
      n.money = 0;
      // la cana suelta el arma (el gendarme, siempre: la ametralladora es el premio)
      if (w && n.type === 'cana' && (n.gendarme || R.chance(0.6))) w.pickups.weapon(n.x - fz, n.z + fx, n.gunId && n.gunId !== 'pistola' ? n.gunId : R.chance(0.7) ? 'pistola' : 'escopeta', true);
      // los de las bandas sueltan su arma (y los jubilados, los remedios)
      if (w && n.dropGun) w.pickups.weapon(n.x - fz, n.z + fx, n.dropGun, true);
      if (w && n.dropHealth) w.pickups.spawn('health', n.x + fz, n.z - fx, {}, { life: 60 });
      if (n.gang) w?.gangs?.lost(n);
      this.audio.golpe(0.7);
      // un tiro, un golpe muy fuerte o seguir pegándole: muere
      if (o.gun || dmg >= 45 || n.hp < -20) {
        this.kill(n, fx, fz, w);
        return 'muerte';
      }
      return 'ko';
    }
    if (o.knock || dmg >= 34 || (o.zone === 'piernas' && Math.random() < 0.45)) {
      if (!n.down) n.fallT = 0.3;
      n.state = 'down';
      n.knockT = o.knockT ?? 2.4;
      n.stag = { vx: fx * 2.6, vz: fz * 2.6, t: 0.3 };
      n.heading = Math.atan2(-fx, -fz);
      n.act = null;
    } else {
      // la reacción depende del golpe (src/moves.js): un gancho lo da vuelta de costado, un uppercut le
      // levanta la cabeza, una patada lo dobla; dura más cuanto más fuerte
      const blow = o.blow ?? (o.zone === 'cabeza' ? 'head' : o.zone === 'piernas' ? 'leg' : o.gun ? 'bullet' : null);
      n.act = { pose: 'hit', t: 0, dur: { jab: 0.42, cross: 0.52, hook: 0.65, swing: 0.65, uppercut: 0.7, kick: 0.85, head: 0.7, leg: 0.8 }[blow] ?? 0.5 };
      n.h.hitKind = blow;
      // la cabeza se va para donde la empuja el golpe (o.lat: el costado al que empuja la mano que pegó)
      const lx = o.lat?.x ?? fx;
      const lz = o.lat?.z ?? fz;
      n.h.hitSide = lx * Math.cos(n.heading) - lz * Math.sin(n.heading) > 0 ? 1 : -1;
      // y trastabilla para atrás (medio paso; más con la patada y el gancho, que lo corre de costado)
      const back = { jab: 0.9, cross: 1.3, hook: 1.1, swing: 1.4, uppercut: 1, kick: 2.6, head: 1.2, leg: 0.3, bullet: 0.8 }[blow] ?? 1;
      const lat = blow === 'hook' || blow === 'swing' ? 1 : 0;
      n.stag = { vx: fx * back + (o.lat?.x ?? 0) * lat, vz: fz * back + (o.lat?.z ?? 0) * lat, t: 0.32 };
    }
    if (!n.bubble || R.chance(0.5)) n.say(R.pick(LINES.duele), 1.6);
    if (o.byPlayer) this.react(n, w, o.gun);
    return 'hit';
  }

  // Muere: queda tirado, despatarrado, sin moverse, con un charco de sangre que crece.
  // La gente cerca se asusta y se va.
  kill(n, fx, fz, w) {
    n.killed = true;
    if (n.state !== 'ko') {
      if (!n.down) n.fallT = 0.3;
      n.state = 'ko';
      n.koT = 0;
    }
    n.deadPose = R.range(0, 1);
    n.act = null;
    n.bubble = null;
    if (w?.fx) {
      w.fx.blood(n.x, n.y + 0.9, n.z, fx, fz, 18, 3.5);
      // el charco sale del torso, que queda para el lado del golpe
      setTimeout(() => w.fx.pool(n.x + fx * 0.55, n.z + fz * 0.55, R.range(0.7, 1.1)), 900);
    }
    this.panic(n.x, n.z, 18, w?.player);
  }

  // qué hace cuando lo lastima Gaspi
  react(n, w, gun) {
    // al armero no se lo toca: es bravo
    if (n.type === 'armero') {
      w?.interiors?.armeroAngry(n, w);
      n.after = 'idle';
      return;
    }
    // a uno de la banda no se lo toca: salen todos a los tiros
    if (n.type === 'banda') {
      w?.gangs?.provoke(n.gang, w);
      n.after = 'gang';
      return;
    }
    if (n.type === 'cana') {
      n.state = n.state === 'down' ? 'down' : 'chase';
      n.after = 'chase';
      return;
    }
    let next;
    if (n.type === 'zombie') next = 'fight';
    else if (n.type === 'trapito') next = gun ? 'flee' : R.chance(0.7) ? 'fight' : 'flee';
    else if (n.barra) next = 'fight';
    else if (n.type === 'vecino' || n.type === 'piquetero') next = !gun && R.chance(n.brave) ? 'fight' : 'flee';
    else next = 'flee';
    // a un manifestante no se le pega gratis: los compañeros salen a defenderlo
    if (n.type === 'piquetero' && !gun) w?.events?.rally(n, w);
    if (n.state === 'down') n.after = next;
    else this.setState(n, next, w?.player);
    if (next === 'fight' && !n.bubble) n.say(R.pick(LINES.pelea), 2);
  }

  setState(n, s, threat) {
    n.state = s;
    n.t = 0;
    if (s === 'flee') {
      n.fleeT = R.range(7, 12);
      n.from = threat ? { x: threat.x, z: threat.z } : { x: n.x, z: n.z };
      if (!n.bubble) n.say(R.pick(LINES.susto), 2);
    } else if (s === 'fight') {
      n.fightT = 14;
    } else if (s === 'cower') {
      n.cowerT = R.range(3, 6);
    }
  }

  // tiros o una explosión: la gente cerca se asusta
  panic(x, z, r, threat) {
    for (const n of this.list) {
      if (n.down || n.type === 'cana' || n.state === 'fight') continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d > r) continue;
      if (n.type === 'mendigo' || n.type === 'medias' || n.type === 'panchero' || n.type === 'florista' || n.type === 'trapito' || n.type === 'vecino' || n.type === 'piquetero' || n.type === 'borracho' || n.type === 'chico' || n.type === 'pasajero') {
        if (n.state === 'flee' || n.state === 'cower') {
          n.fleeT = Math.max(n.fleeT || 0, 6);
          continue;
        }
        if (d < 7 && R.chance(0.45)) this.setState(n, 'cower');
        else this.setState(n, 'flee', threat ?? { x, z });
      }
    }
  }

  // ---------- Loop ----------
  update(dt, world) {
    const { player, time } = world;
    const night = time.night;
    this.agua = world.agua;
    // quiénes están cerca (para esquivarse entre ellos y a Gaspi)
    const near = [];
    for (const n of this.list) if (!n.down && n.state !== 'sit' && Math.abs(n.x - player.x) < 40 && Math.abs(n.z - player.z) < 40) near.push(n);
    if (!player.vehicle && !player.dead) near.push({ x: player.x, y: player.y, z: player.z, wide: 1.15 });
    // los vecinos que nacieron antes de que cargaran los modelos de artista pasan a uno de a poco, cuando
    // están lejos de Gaspi (que no se vea el cambio)
    if (PEOPLE.ready && (this.upT = (this.upT ?? 0) - dt) <= 0) {
      this.upT = 0.05;
      const n = this.list.find((o) => (o.plain || (o.look && !o.h.rig)) && !o.dead && !o.down && !o.lifted && Math.hypot(player.x - o.x, player.z - o.z) > 35);
      if (n) {
        const h = n.plain ? makePerson(R.chance(0.5) ? 'female' : 'male') : makeLook(n.look);
        n.plain = false;
        if (h) this.reskin(n, h);
        else n.look = null;
      }
    }
    for (const n of this.list) {
      n.t += dt;
      if (n.bubble) {
        n.bubble.t -= dt;
        if (n.bubble.t <= 0) n.bubble = null;
      }
      n.cool -= dt;
      n.fightCd -= dt;
      const dp = Math.hypot(player.x - n.x, player.z - n.z);
      const far = dp > 150;
      n.mesh.visible = !far;
      // de lejos, la malla liviana (~1.200 triángulos en vez de 5.000)
      if (n.h.lods) setLod(n.h, dp > 28);
      // sombra de verdad solo cerca (de lejos alcanza con la mancha de contacto)
      const shade = dp < 40;
      if (shade !== n.shade) {
        n.shade = shade;
        n.mesh.traverse((o) => {
          if (o.isMesh) o.castShadow = shade;
        });
      }
      // colgando del rayo tractor: patalea en el aire (la nave lo mueve)
      if (n.lifted) {
        if (!far) animateHuman(n.h, dt, 3, n.killed ? 'dead' : 'flee', n.deadPose);
        continue;
      }
      if (n.fly) this.flyStep(n, dt, world);
      if (n.fallT > 0) {
        // cayéndose: de parado al piso
        n.fallT -= dt;
        if (!far) animateHuman(n.h, dt, 0, 'getup', Math.max(0, n.fallT / 0.3));
        this.place(n);
        continue;
      }
      // trastabilla por un golpe o sale despedido: se desliza y frena (también tirado)
      if (n.stag) this.stagger(n, dt);
      n.stunT = (n.stunT ?? 0) - dt;
      if (n.state === 'ko') {
        n.koT += dt;
        if (!far) animateHuman(n.h, dt, 0, n.killed ? 'dead' : 'knocked', n.deadPose);
        if (n.koT > (n.killed ? 90 : 45) && dp > 60) n.dead = true;
        this.place(n);
        continue;
      }
      if (n.state === 'down') {
        n.knockT -= dt;
        if (n.knockT <= 0) {
          n.getupT = 0.6;
          n.state = n.after || (n.type === 'mendigo' ? 'sit' : n.type === 'cana' ? 'chase' : n.type === 'banda' ? 'gang' : n.ev && !n.ev.leaving ? 'protest' : n.home ? 'idle' : 'walk');
          n.after = null;
          if (n.state === 'walk') this.attach(n);
          if (n.state === 'flee') this.setState(n, 'flee', player);
          if (n.state === 'fight') this.setState(n, 'fight');
        }
        if (!far) animateHuman(n.h, dt, 0, 'knocked');
        this.place(n);
        continue;
      }
      if (n.getupT > 0) {
        n.getupT -= dt;
        if (!far) animateHuman(n.h, dt, 0, 'getup', 1 - n.getupT / 0.6);
        this.place(n);
        continue;
      }
      let pose = 'walk';
      let want = 0;
      let anim = null;
      if (n.state === 'protest' && !n.ev) n.state = 'walk';
      if (n.state === 'protest') {
        // en un corte o una marcha: su lugar en el grupo (ver Events.protestBrain)
        const r = world.events.protestBrain(n, dt);
        want = r.want;
        pose = r.pose;
        anim = r.anim ?? null;
        if (player.aiming && dp < 12 && this.inSights(player, n)) {
          pose = 'handsup';
          want = 0;
          if (!n.bubble) n.say(R.pick(['¡No tirés!', '¡Estamos reclamando!', '¡Tranqui, loco!']), 2);
        }
      } else if (n.state === 'flee') {
        // correr lejos de la amenaza
        n.fleeT -= dt;
        const ax = n.x - n.from.x;
        const az = n.z - n.from.z;
        const l = Math.hypot(ax, az) || 1;
        n.target = { x: n.x + (ax / l) * 6, z: n.z + (az / l) * 6 };
        want = n.type === 'mendigo' ? 3.2 : 5.2;
        pose = 'flee';
        if (n.fleeT <= 0) {
          if (n.ev && !n.ev.leaving) n.state = 'protest';
          else if (n.type === 'vecino' || n.type === 'zombie' || n.type === 'piquetero') {
            n.state = 'walk';
            this.attach(n);
          } else if (n.type === 'mendigo') {
            n.state = 'walk';
            n.type = 'vecino';
            n.vmax = 1;
            this.attach(n);
          } else n.state = 'idle';
        }
      } else if (n.state === 'cower') {
        n.cowerT -= dt;
        pose = 'cower';
        if (n.cowerT <= 0) this.setState(n, 'flee', player);
      } else if (n.state === 'fight') {
        want = this.updateFight(n, dt, world, dp);
        pose = 'guard';
      } else if (n.state === 'chat') {
        // charlando: mira al centro de la ronda; el que habla gesticula
        const g = n.group;
        pose = g?.speaker === n ? 'talk' : 'listen';
        if (g) {
          let d = Math.atan2(g.x - n.x, g.z - n.z) - n.heading;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          n.heading += d * Math.min(1, dt * 3);
        }
        if (player.aiming && dp < 12 && this.inSights(player, n)) {
          pose = 'handsup';
          if (!n.bubble) n.say(R.pick(['¡No tirés!', '¡Tranqui, tranqui!']), 2);
        }
      } else if (n.type === 'alien') {
        const r = world.ufo?.alienBrain(n, dt, world, dp) ?? { want: 0, pose: 'walk' };
        want = r.want;
        pose = r.pose;
      } else if (n.type === 'vecino') {
        want = n.vmax;
        pose = n.phone ? 'phone' : 'walk';
        if (n.pauseT > 0) {
          n.pauseT -= dt;
          want = 0;
        } else if (n.bridge) {
          this.bridgeStep(n, dt, dp);
          // en la escalera, más despacio
          if (n.y > 0.6 && n.y < 7) want *= 0.75;
        } else if (Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.9) {
          // a veces se para: en la esquina antes de cruzar, o en la cuadra a mirar el celu
          const corner = n.leg === 'walk';
          this.nextLeg(n);
          if (!n.mission && R.chance(corner ? 0.3 : 0.1)) n.pauseT = R.range(1.2, corner ? 3.5 : 5);
        }
        if (dp < 4 && n.cool <= 0 && R.chance(0.01)) {
          n.say(R.pick(LINES.vecino), 2.5);
          n.cool = 20;
        }
        // Gaspi apuntando: manos arriba
        if (player.aiming && dp < 12 && this.inSights(player, n)) {
          pose = 'handsup';
          want = 0;
          if (!n.bubble) n.say(R.pick(['¡No tirés!', '¡Tranqui, tranqui!', '¡Llevate todo!']), 2);
        }
      } else if (n.type === 'trapito') {
        want = this.updateTrapito(n, dt, world, dp);
        pose = n.state === 'approach' ? 'walk' : 'wave';
        if (n.state === 'idle' && !world.traffic.cars.some((v) => v.speed > 1 && Math.abs(v.x - n.x) < 14 && Math.abs(v.z - n.z) < 14)) pose = 'walk';
      } else if (n.type === 'mendigo') {
        pose = 'sit';
        if (dp < 3.5 && n.cool <= 0 && !player.vehicle) {
          n.say(R.pick(LINES.mendigo.slice(0, 2)), 3.5);
          n.cool = 25;
        }
      } else if (n.type === 'panchero' || n.type === 'florista') {
        // atrás del carrito (o del puesto de flores): si se fue (un susto), vuelve; con clientes cerca ofrece
        const away = Math.hypot(n.home.x - n.x, n.home.z - n.z);
        if (away > 0.4) {
          n.target = { x: n.home.x, z: n.home.z };
          want = 1.2;
          pose = 'walk';
        } else {
          n.target = null;
          if (dp < 9 && !player.vehicle) {
            let d = Math.atan2(player.x - n.x, player.z - n.z) - n.heading;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            n.heading += d * Math.min(1, dt * 3);
          }
          pose = dp < 9 ? 'talk' : n.t % 9 < 1.2 ? 'wave' : 'walk';
          if (dp < 12 && n.cool <= 0 && !player.vehicle) {
            n.say(R.pick(LINES[n.type]), 3);
            n.cool = R.range(9, 16);
          }
        }
      } else if (n.type === 'medias') {
        want = this.wanderHome(n, 3, 0.7);
        pose = 'carry';
        if (dp < 9 && n.cool <= 0 && !player.vehicle) {
          n.say(R.pick(LINES.medias), 3);
          n.cool = 14;
        }
      } else if (n.type === 'zombie') {
        pose = 'zombie';
        want = n.vmax;
        if (dp < 11 && !player.vehicle && !player.dead) {
          n.target = { x: player.x, z: player.z };
          want = n.vmax * 1.5;
          n.chasing = true;
          if (dp < 1.3) {
            player.grabbed = Math.max(player.grabbed, 0.4);
            if (!n.bubble) n.say(R.pick(LINES.zombie), 2.5);
          }
        } else {
          if (n.chasing) {
            n.chasing = false;
            this.attach(n);
          }
          if (Math.hypot(n.target.x - n.x, n.target.z - n.z) < 1) this.nextLeg(n);
        }
        if (!night && dp > 150 && this.count('zombie') > 7) n.dead = true;
      } else if (n.type === 'pasajero') {
        // gente de los andenes (src/andenes.js)
        const r = world.andenes?.brain(n, dt, world, dp) ?? { want: 0, pose: 'walk' };
        want = r.want;
        pose = r.pose;
        n.poseT = r.t || 0;
      } else if (n.type === 'borracho' || n.type === 'chico') {
        const r = world.barrio?.brain(n, dt, world, dp) ?? { want: 0, pose: 'walk' };
        want = r.want;
        pose = r.pose;
        n.poseT = r.t || 0;
      } else if (n.type === 'armero') {
        const r = world.interiors?.armeroBrain(n, dt, world, dp) ?? { want: 0, pose: 'walk' };
        want = r.want;
        pose = r.pose;
      } else if (n.type === 'banda') {
        const r = world.gangs?.brain(n, dt, world, dp) ?? { want: 0, pose: 'guard' };
        want = r.want;
        pose = r.pose;
      } else if (n.type === 'cana') {
        const r = world.police?.copBrain(n, dt, world, dp);
        want = r?.want ?? 0;
        pose = r?.pose ?? 'walk';
      }
      // golpe o reacción en curso: pisa la pose
      let t = n.type === 'borracho' || n.type === 'chico' || n.type === 'pasajero' ? n.poseT || 0 : 0;
      // los del gym entrenan mientras nadie los moleste
      if (n.exercise && n.state === 'walk') {
        pose = n.exercise;
        t = (n.t * 0.42) % 1;
      }
      if (n.act) {
        n.act.t += dt;
        if (n.act.t >= n.act.dur) n.act = null;
        else {
          pose = n.act.pose;
          t = n.act.t / n.act.dur;
          want = Math.min(want, 0.5);
        }
      }
      // inundación (src/agua.js): con agua a la cintura caminan despacio; sin hacer pie, nadan
      const ag = world.agua;
      const wd = ag && ag.wet && !n.fly ? ag.depth(n.x, n.z, this.heightAt(n.x, n.z)) : 0;
      n.swim = wd > NADAR;
      if (wd > VADEO) want *= n.swim ? 0.5 : 1 - 0.5 * Math.min(1, (wd - VADEO) / (NADAR - VADEO));
      if (n.swim && !n.down) {
        n.swimT = (n.swimT || 0) + dt * (n.speed > 0.3 ? 0.24 + n.speed * 0.24 : 0.45);
        pose = n.speed > 0.3 ? 'swim' : 'tread';
        t = n.swimT;
        anim = n.speed;
      }
      if (wd > 0.08 && dp < 35 && n.speed > 0.4) {
        n.ripT = (n.ripT || 0) - dt;
        if (n.ripT <= 0) {
          n.ripT = n.swim ? 0.4 : 0.55;
          ag.ripple(n.x + Math.sin(n.heading) * 0.3, n.z + Math.cos(n.heading) * 0.3, Math.min(0.6, 0.12 + wd * 0.3));
        }
      }
      // rengo por un tiro en la pierna: va más despacio
      if (n.limpT > 0) {
        n.limpT -= dt;
        want *= 0.5;
      }
      if (want > 0 && n.target) {
        if (dp < 40 && n.state !== 'fight' && n.state !== 'protest' && n.type !== 'cana') this.avoidance(n, near, dt);
        else n.avoid = 0;
        this.steer(n, dt, want);
      } else if (n.speed > 0) {
        // frena en un par de pasos, no en seco
        n.speed = Math.max(0, n.speed - 6 * dt);
        n.x += Math.sin(n.heading) * n.speed * dt;
        n.z += Math.cos(n.heading) * n.speed * dt;
        n.turnW = 0;
      }
      // choque contra casas y rejas
      if (n.type !== 'mendigo' || n.state !== 'sit') {
        const p = { x: n.x, z: n.z };
        // el marciano baja por la rampa de su propia nave
        this.colliders.resolveCircle(p, n.r, n.type === 'alien' ? notUfo : n.y > 1.3 ? this.upFilter(n) : n.y < -1 ? lowFilter : undefined);
        n.x = p.x;
        n.z = p.z;
      }
      if (!far) animateHuman(n.h, dt, anim ?? n.speed, pose, t, dp < 30 && !n.act ? this.lifeLook(n, dt, player, dp) : null);
      this.place(n);
    }
    this.list = this.list.filter((n) => {
      if (n.dead) {
        this.scene.remove(n.mesh);
        disposeHuman(n.h);
      }
      return !n.dead;
    });
    this.updateGroups(dt, player);
    this.recycle(dt, world);
    this.updateDogs(dt, world);
  }

  count(type) {
    let c = 0;
    for (const n of this.list) if (n.type === type) c++;
    return c;
  }

  inSights(player, n) {
    const dx = n.x - player.x;
    const dz = n.z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.sin(player.heading) + dz * Math.cos(player.heading)) / d > 0.9;
  }

  // camina hacia n.target: acelera y frena de a poco, afloja para doblar y esquiva (n.avoid)
  steer(n, dt, want) {
    const dx = n.target.x - n.x;
    const dz = n.target.z - n.z;
    const d = Math.hypot(dx, dz);
    let h = Math.atan2(dx, dz) + (n.avoid || 0);
    if (n.type === 'zombie' && n.state === 'walk') h += Math.sin(n.t * 1.7) * 0.6;
    let diff = h - n.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const h0 = n.heading;
    n.heading += diff * Math.min(1, dt * (n.speed > 3 ? 5 : 7));
    // para un giro cerrado primero afloja (nadie camina de costado)
    const align = Math.max(0.3, Math.cos(Math.min(Math.PI / 2, Math.abs(diff) * 0.8)));
    const tgt = d < 0.2 ? 0 : Math.min(want, d * 2) * align;
    const rate = tgt > n.speed ? (want > 3 ? 10 : 2.6) : 6;
    n.speed += Math.sign(tgt - n.speed) * Math.min(Math.abs(tgt - n.speed), rate * dt);
    n.x += Math.sin(n.heading) * n.speed * dt;
    n.z += Math.cos(n.heading) * n.speed * dt;
    let dh = n.heading - h0;
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    n.turnW = (n.turnW || 0) + ((dt > 0 ? dh / dt : 0) - (n.turnW || 0)) * Math.min(1, dt * 8);
  }
  // se corre para no llevarse puesto a nadie (ni a Gaspi): a un costado, y si viene de frente, a la derecha
  avoidance(n, near, dt) {
    let push = 0;
    const fx = Math.sin(n.heading);
    const fz = Math.cos(n.heading);
    for (const o of near) {
      if (o === n || Math.abs((o.y ?? 0) - (n.y ?? 0)) > 2) continue;
      const ox = o.x - n.x;
      const oz = o.z - n.z;
      const ahead = ox * fx + oz * fz;
      if (ahead < 0.1 || ahead > 3.4) continue;
      const lat = ox * fz - oz * fx;
      const wide = o.wide ?? 0.85;
      if (Math.abs(lat) > wide) continue;
      const side = Math.abs(lat) < 0.12 ? -1 : -Math.sign(lat);
      push += side * (1.15 - ahead / 3.4) * (1.2 - Math.abs(lat) / wide) * 1.3;
    }
    const want = Math.max(-1, Math.min(1, push)) * 0.95;
    n.avoid = (n.avoid || 0) + (want - (n.avoid || 0)) * Math.min(1, dt * 6);
  }
  // retoques sobre la pose: la cabeza sigue a Gaspi si pasa cerca, y el cuerpo se inclina al doblar corriendo
  lifeLook(n, dt, player, dp) {
    let look = 0;
    const calm = n.state === 'walk' || n.state === 'idle' || n.state === 'sit' || n.state === 'approach' || n.state === 'chat';
    if (calm && dp < 9 && !player.dead && n.type !== 'zombie') {
      let rel = Math.atan2(player.x - n.x, player.z - n.z) - n.heading;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      // de reojo: si lo tiene detrás no se da vuelta; con Gaspi armado o en auto mira más
      const interest = player.vehicle ? 0.6 : WEAPON_OUT(player) ? 1 : n.lookMood ?? 0.7;
      if (Math.abs(rel) < 1.9) look = Math.max(-1.15, Math.min(1.15, rel)) * interest;
    }
    n.lookYaw = (n.lookYaw || 0) + (look - (n.lookYaw || 0)) * Math.min(1, dt * 4);
    const lean = Math.max(-0.22, Math.min(0.22, -(n.turnW || 0) * n.speed * 0.03));
    if (Math.abs(n.lookYaw) < 0.01 && Math.abs(lean) < 0.01) return null;
    return (b) => {
      b.neck.rotation.y += n.lookYaw * 0.4;
      b.head.rotation.y += n.lookYaw * 0.55;
      b.chest.rotation.y += n.lookYaw * 0.12;
      b.spine.rotation.z += lean * 0.7;
      b.hips.rotation.z += lean * 0.25;
    };
  }

  // el empujón de un golpe: se desliza sin atravesar paredes y frena en un ratito
  stagger(n, dt) {
    const s = n.stag;
    const p = { x: n.x + s.vx * dt, z: n.z + s.vz * dt };
    this.colliders.resolveCircle(p, n.r, n.y > 1.3 ? this.upFilter(n) : n.y < -1 ? lowFilter : undefined);
    n.x = p.x;
    n.z = p.z;
    const f = Math.exp(-dt * 7);
    s.vx *= f;
    s.vz *= f;
    s.t -= dt;
    if (s.t <= 0) n.stag = null;
  }

  // pelea a las piñas contra Gaspi
  updateFight(n, dt, world, dp) {
    const { player } = world;
    n.fightT -= dt;
    if (n.fightT <= 0 || dp > 28 || player.dead) {
      n.state = n.type === 'trapito' || n.type === 'medias' ? 'idle' : n.ev && !n.ev.leaving ? 'protest' : 'walk';
      if (n.state === 'walk') this.attach(n);
      return 0;
    }
    n.target = { x: player.x, z: player.z };
    if (player.vehicle) {
      // le pega al auto o se aleja puteando
      if (dp > 4) return n.type === 'zombie' ? n.vmax : 2;
      return 0;
    }
    // los grandotes (Ciro) pegan desde más lejos, más fuerte, y te tiran
    const reach = n.reach ?? 1.25;
    if (dp > reach) return n.type === 'zombie' ? n.vmax * 1.6 : n.chaseV ?? 4.2;
    n.heading = Math.atan2(player.x - n.x, player.z - n.z);
    if (n.fightCd <= 0 && !n.act) {
      const pose = R.pick(['jab', 'cross', 'cross', 'hook']);
      n.act = { pose, t: 0, dur: pose === 'hook' ? 0.55 : 0.42, hit: false, punch: true };
      n.fightCd = R.range(0.8, 1.5);
    }
    // (solo sus piñas: no la reacción a un golpe ni la guardia)
    if (n.act?.punch && !n.act.hit && n.act.t / n.act.dur > 0.45) {
      n.act.hit = true;
      if (dp < reach + 0.35 && player.blockT <= 0) {
        const dmg = (n.type === 'zombie' ? 4 : n.act.pose === 'hook' ? 10 : 7) * (n.dmgMul ?? 1);
        player.hurt(dmg, n.killMsg ?? 'Te cagaron a trompadas');
        if (n.knocks && n.act.pose === 'hook') player.knockDown?.(1.6, (player.x - n.x) / (dp || 1), (player.z - n.z) / (dp || 1));
        else player.hitReact?.(n.x, n.z);
        this.audio.golpe(0.5);
      }
    }
    return 0;
  }

  wanderHome(n, rad, v) {
    if (!n.target || Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.5) {
      if (n.t > 3.5) {
        n.t = 0;
        n.target = { x: n.home.x + R.range(-rad, rad), z: n.home.z + R.range(-rad, rad) };
      } else return 0;
    }
    return v;
  }

  // recicla gente lejana cerca de Gaspi (así el barrio siempre está lleno)
  recycle(dt, world) {
    this.recycleT -= dt;
    if (this.recycleT > 0) return;
    this.recycleT = 0.5;
    const { time } = world;
    // si Gaspi está adentro de algún lugar, la calle se mantiene alrededor de la puerta
    const player = world.interiors?.focus(world.player) ?? world.player;
    const wantWalkers = time.night ? 22 : 44;
    const wantZombies = time.night ? 16 : 6;
    let walkers = 0;
    for (const n of this.list) {
      const d = Math.hypot(n.x - player.x, n.z - player.z);
      if (n.type === 'vecino' && !n.down) {
        if (d > 175 && (n.state === 'walk' || n.state === 'chat') && !n.mission) {
          n.dead = true;
          continue;
        }
        walkers++;
      }
      if (n.type === 'zombie' && d > 190 && this.count('zombie') > wantZombies) n.dead = true;
    }
    for (let i = walkers; i < wantWalkers && i < walkers + 3; i++) this.spawnWalker(null, player, 70, 150);
    if (this.groups.length < (time.night ? 1 : 3) && R.chance(0.2)) this.spawnGroup(player, 70, 140);
    this.bridgeTraffic(player, time.night);
    if (this.count('zombie') < wantZombies && R.chance(0.3)) this.spawnZombie(player);
    for (const d of this.dogs) {
      if (Math.hypot(d.x - player.x, d.z - player.z) > 190) {
        const p = this.sidewalkPoint(player.x, player.z, 70, 150);
        if (!p) continue;
        d.x = p.x;
        d.z = p.z;
        this.attach(d);
      }
    }
  }

  // arriba del puente: chocan las barandas de su altura, no las paredes de abajo
  upFilter(n) {
    return (b) => (b.y0 ? n.y > b.y0 - 0.6 && n.y < b.h : n.y < 1 || n.y < b.h - 0.3);
  }

  place(n) {
    let y = this.heightAt(n.x, n.z);
    // nadando flota en la superficie
    if (n.swim && this.agua) y = this.agua.level;
    const k = this.wb;
    if (n.x > k.x0 && n.x < k.x1 && n.z > k.z0 && n.z < k.z1) y = Math.max(y, walkwayHeight(this.walkways, n.x, n.z, n.y));
    n.y += (y - n.y) * 0.3;
    n.mesh.position.set(n.x, n.y + (n.fly ? n.fly.y : 0), n.z);
    n.mesh.rotation.set(n.fly ? n.fly.spin : 0, n.heading, 0);
  }
  // volando por una explosión: parábola dando vueltas; al caer queda tirado
  flyStep(n, dt, world) {
    const f = n.fly;
    f.vy -= 9.8 * dt;
    f.y += f.vy * dt;
    n.x += f.vx * dt;
    n.z += f.vz * dt;
    f.spin += f.ws * dt;
    const p = { x: n.x, z: n.z };
    if (this.colliders.resolveCircle(p, n.r)) {
      f.vx *= -0.3;
      f.vz *= -0.3;
    }
    n.x = p.x;
    n.z = p.z;
    if (f.y <= 0 && f.vy < 0) {
      n.fly = null;
      this.audio.golpe(0.4);
      // soltado desde arriba: el golpe contra el piso
      if (f.land > 8) this.hurt(n, f.land, 0, 0, { knock: true, knockT: 3, world, byPlayer: true });
    }
  }

  updateTrapito(n, dt, world, dp) {
    const { player, hud, audio } = world;
    if (n.state === 'idle') return this.wanderHome(n, 4, 0.8);
    if (n.state === 'approach') {
      n.target = { x: player.x, z: player.z };
      if (player.vehicle) {
        n.state = 'idle';
        return 0;
      }
      if (dp < 1.8) {
        n.state = 'ask';
        const car = n.car;
        n.say('¡Te lo cuido, jefe! Son $3.000', 4);
        hud.ask(
          'El trapito te pide $3.000 para "cuidarte" el auto',
          [
            {
              label: 'Pagar $3.000',
              run: () => {
                if (player.money >= 3000) {
                  player.addMoney(-3000);
                  car.cuidado = true;
                  n.say('¡Quedate tranquilo, maestro!', 3);
                } else {
                  n.say('¿No tenés? Bueno, después vemos...', 3);
                  car.revenge = true;
                }
                n.state = 'idle';
              },
            },
            {
              label: 'No, gracias',
              run: () => {
                n.say('Mmm... bueno. Cuidate el auto, eh.', 3.5);
                car.revenge = true;
                n.state = 'idle';
                audio.alerta();
              },
            },
          ],
          7,
          1,
        );
      }
      if (n.t > 25) n.state = 'idle';
      return 3;
    }
    return 0;
  }

  // Cuando Gaspi deja un auto: el trapito más cercano viene a cobrar.
  onPark(v) {
    let best = null;
    let bd = 35;
    for (const n of this.list) {
      if (n.type !== 'trapito' || n.state !== 'idle') continue;
      const d = Math.hypot(n.x - v.x, n.z - v.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best && !v.cuidado && v.kind !== 'moto') {
      best.state = 'approach';
      best.car = v;
      best.t = 0;
      best.say('¡Eeeh, maestro! ¡Maestro!', 2);
    }
  }

  updateDogs(dt, world) {
    const { player, crime } = world;
    for (const d of this.dogs) {
      d.t += dt;
      d.barkT -= dt;
      const moto = crime.nearestMoto(d.x, d.z, 35) ?? (player.vehicle?.kind === 'moto' && Math.hypot(player.x - d.x, player.z - d.z) < 30 ? player.vehicle : null);
      let want = 1.2;
      if (moto) {
        d.target = { x: moto.x, z: moto.z };
        d.chasing = true;
        want = 7.5;
        if (d.barkT <= 0) {
          const dist = Math.hypot(player.x - d.x, player.z - d.z);
          this.audio.ladrido(Math.max(0, 1 - dist / 80));
          d.barkT = R.range(0.6, 1.4);
        }
      } else {
        const dp = Math.hypot(player.x - d.x, player.z - d.z);
        if (dp < 7 && !player.vehicle) {
          d.target = { x: player.x - Math.sin(player.heading) * 1.5, z: player.z - Math.cos(player.heading) * 1.5 };
          d.chasing = true;
          want = Math.min(4, dp);
        } else {
          if (d.chasing) {
            d.chasing = false;
            this.attach(d);
          }
          if (Math.hypot(d.target.x - d.x, d.target.z - d.z) < 1) this.nextLeg(d);
        }
      }
      const dx = d.target.x - d.x;
      const dz = d.target.z - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6 && want > 0) {
        d.heading = Math.atan2(dx, dz);
        d.speed = Math.min(want, dist * 2);
      } else d.speed = 0;
      d.x += Math.sin(d.heading) * d.speed * dt;
      d.z += Math.cos(d.heading) * d.speed * dt;
      const p = { x: d.x, z: d.z };
      this.colliders.resolveCircle(p, 0.35);
      d.x = p.x;
      d.z = p.z;
      const vis = Math.abs(d.x - player.x) < 190 && Math.abs(d.z - player.z) < 190;
      d.g.visible = vis;
      if (!vis) continue;
      // cuando cargó el modelo de perro (CC0), se cambia el perro hecho por código
      if (!d.anim && ANIMALS.dog) {
        const a = makeAnimal('dog', { length: R.range(0.8, 1.05), tint: d.tint });
        if (a) {
          this.scene.remove(d.g);
          d.g = a.g;
          d.anim = a;
          this.scene.add(d.g);
        }
      }
      if (d.anim) {
        // quieto, caminando o corriendo según la velocidad (y ladra cuando persigue)
        const name = d.speed > 3 ? 'run' : d.speed > 0.2 ? 'walk' : d.chasing && d.barkT > 0.4 ? 'bark' : 'idle';
        animalPlay(d.anim, name, name === 'walk' ? Math.max(0.6, d.speed / 1.2) : name === 'run' ? Math.max(0.7, d.speed / 6) : 1);
        d.anim.mixer.update(dt);
      } else {
        d.phase += dt * (4 + d.speed * 3);
        // patas: la rodilla se dobla cuando la pata va hacia adelante
        const amp = Math.min(0.8, d.speed * 0.25);
        d.legs.forEach((l, i) => {
          const w = Math.sin(d.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0));
          l.rotation.x = w * amp;
          l.userData.lower.rotation.x = (i > 1 ? -1 : 1) * Math.max(0, i > 1 ? w : -w) * amp * 1.4;
        });
        d.tail.rotation.y = Math.sin(d.t * 12) * 0.6;
      }
      d.g.position.set(d.x, this.heightAt(d.x, d.z), d.z);
      d.g.rotation.y = d.heading;
    }
  }
}
