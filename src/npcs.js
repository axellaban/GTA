// Gente del barrio: vecinos que caminan por las veredas reales, trapitos, gente pidiendo,
// perdidos que deambulan, el vendedor de medias, la cana a pie y los perros.
// Cada uno tiene vida: se asusta con los tiros, se defiende de las piñas o sale corriendo.
import * as THREE from 'three';
import { makeHuman, animateHuman, randomCivilian, SKINS, HAIRS } from './human.js';
import { makeDog } from './animals.js';
import { makePerson, PEOPLE, ANIMALS, makeAnimal, animalPlay } from './people.js';
import { DATA as D } from './map.js';
import { R } from './rng.js';

const OFF = (e) => e.street.w / 2 + 1.5; // mitad de la vereda
const EG = 40; // grilla de aristas

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
  medias: ['¡Medias, medias! Tres pares dos mil', '¡Llevá medias, jefe! De algodón', '¡Soquetes, medias, tres por dos mil!', '¡Medias de toalla para el invierno!'],
  cana: ['¡Alto, policía!', '¡Quieto ahí!', '¡Al piso, al piso!', '¡Las manos donde las vea!', '¡No te hagás el vivo!'],
};
export const lines = (t) => LINES[t];

export class Npcs {
  constructor(scene, city, graph, heightAt, audio) {
    this.scene = scene;
    this.city = city;
    this.colliders = city.colliders;
    this.heightAt = heightAt;
    this.audio = audio;
    this.list = [];
    this.dogs = [];
    this.graph = graph;
    this.recycleT = 0;
    for (const n of graph.nodes) n.maxW = Math.max(...n.out.map((e) => e.street.w), 6);
    // aristas caminables: calles con vereda (no pasillos ni vías de servicio angostas)
    this.walkEdges = graph.edges.filter((e) => e.street.w >= 6 && e.len > 8);
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
    for (const s of this.city.spots.trapitos) {
      const h = makeHuman({ ...randomCivilian(), vest: 0xc6ff00, cap: R.chance(0.5) ? 0x1a237e : null, franela: true });
      const n = this.add(new Npc('trapito', h, s.x, s.z));
      n.state = 'idle';
      n.home = { x: s.x, z: s.z };
    }
    for (const s of this.city.spots.mendigos) {
      const h = makeHuman({ skin: R.pick(SKINS), hair: R.pick(HAIRS), shirt: R.pick([0x6d5c47, 0x4e4e4e, 0x5d4037]), pants: 0x3e3a36, beard: true, hairStyle: 'long', cup: true, tired: true });
      const n = this.add(new Npc('mendigo', h, s.x, s.z));
      n.state = 'sit';
      n.heading = s.heading;
      n.hp = 60;
    }
    this.spawnVendors();
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
      const h = makeHuman({ skin: R.pick(SKINS), hair: R.pick(HAIRS), shirt: R.pick([0xe65100, 0x2e7d32, 0x283593]), pants: 0x2d3440, cap: 0xf5f5f5, belly: R.chance(0.5), longSleeves: true });
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
      n.state = 'idle';
      n.home = home;
      n.hp = 80;
      this.vendors.push(n);
    }
  }

  // human: un personaje ya armado (por ejemplo el motochorro que se cae de la moto)
  spawnWalker(at, near, rmin = 60, rmax = 150, look = null, human = null) {
    let p = at;
    if (!p) {
      p = this.sidewalkPoint(near.x, near.z, rmin, rmax);
      if (!p) return null;
    }
    // la mayoría con modelo de artista (CC0, ver src/people.js) cuando ya cargaron
    const h = human || (!look && PEOPLE.ready && R.chance(0.75) && makePerson(R.chance(0.5) ? 'female' : 'male')) || makeHuman(look ?? randomCivilian());
    const n = this.add(new Npc('vecino', h, p.x, p.z));
    n.heading = p.heading ?? R.range(0, Math.PI * 2);
    n.vmax = R.range(1.1, 1.6);
    n.state = 'walk';
    n.phone = R.chance(0.2);
    n.brave = R.chance(0.3) ? R.range(0.4, 0.9) : R.range(0, 0.2);
    n.money = R.int(3, 25) * 200;
    this.attach(n);
    return n;
  }

  spawnZombie(near) {
    const p = this.sidewalkPoint(near.x, near.z, 40, 140);
    if (!p) return null;
    const h = makeHuman({ skin: R.pick([0xc9a88f, 0xb89478, 0xa88a70]), hair: 0x2b2420, shirt: R.pick([0x4e4a45, 0x5d5348, 0x3d3d3d]), pants: 0x333333, hood: R.chance(0.5) ? 0x3a3a3a : null, beard: R.chance(0.5), tired: true, scale: R.range(0.9, 1) });
    const n = this.add(new Npc('zombie', h, p.x, p.z));
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
    const h = (gendarme && PEOPLE.ready && makePerson('swat')) || (PEOPLE.ready && R.chance(0.85) && makePerson('police')) || makeHuman({ skin: R.pick(SKINS), hair: 0x1a1a1a, hairStyle: R.pick(['short', 'buzz']), police: true, shirt: 0x8fb4d8, pants: 0x1c2a44, shoes: 0x111111, cap: 0x1c2a44, stubble: R.chance(0.4), scale: R.range(0.98, 1.06) });
    const n = this.add(new Npc('cana', h, x, z));
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
    const w = o.world;
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
    n.hp -= dmg;
    n.cool = 0;
    if (n.hp <= 0) {
      if (!n.down) n.fallT = 0.3;
      n.state = 'ko';
      n.koT = 0;
      n.act = null;
      n.x += fx * Math.min(2.5, 0.4 + dmg * 0.02);
      n.z += fz * Math.min(2.5, 0.4 + dmg * 0.02);
      n.heading = Math.atan2(-fx, -fz);
      n.bubble = null;
      if (n.money && w) w.pickups.money(n.x + R.range(-0.6, 0.6), n.z + R.range(-0.6, 0.6), n.money);
      n.money = 0;
      if (w && n.type === 'cana' && R.chance(0.6)) w.pickups.weapon(n.x - fz, n.z + fx, R.chance(0.7) ? 'pistola' : 'escopeta', true);
      this.audio.golpe(0.7);
      // un tiro, un golpe muy fuerte o seguir pegándole: muere
      if (o.gun || dmg >= 45 || n.hp < -20) {
        this.kill(n, fx, fz, w);
        return 'muerte';
      }
      return 'ko';
    }
    if (o.knock || dmg >= 34) {
      if (!n.down) n.fallT = 0.3;
      n.state = 'down';
      n.knockT = o.knockT ?? 2.4;
      n.x += fx * 0.8;
      n.z += fz * 0.8;
      n.heading = Math.atan2(-fx, -fz);
      n.act = null;
    } else {
      n.act = { pose: 'hit', t: 0, dur: 0.35 };
      n.x += fx * 0.3;
      n.z += fz * 0.3;
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
    if (n.type === 'cana') {
      n.state = n.state === 'down' ? 'down' : 'chase';
      n.after = 'chase';
      return;
    }
    let next;
    if (n.type === 'zombie') next = 'fight';
    else if (n.type === 'trapito') next = gun ? 'flee' : R.chance(0.7) ? 'fight' : 'flee';
    else if (n.type === 'vecino') next = !gun && R.chance(n.brave) ? 'fight' : 'flee';
    else next = 'flee';
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
      if (n.type === 'mendigo' || n.type === 'medias' || n.type === 'trapito' || n.type === 'vecino') {
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
    for (const n of this.list) {
      n.t += dt;
      if (n.bubble) {
        n.bubble.t -= dt;
        if (n.bubble.t <= 0) n.bubble = null;
      }
      n.cool -= dt;
      n.fightCd -= dt;
      const dp = Math.hypot(player.x - n.x, player.z - n.z);
      const far = dp > 190;
      n.mesh.visible = !far;
      if (n.fallT > 0) {
        // cayéndose: de parado al piso
        n.fallT -= dt;
        if (!far) animateHuman(n.h, dt, 0, 'getup', Math.max(0, n.fallT / 0.3));
        this.place(n);
        continue;
      }
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
          n.state = n.after || (n.type === 'mendigo' ? 'sit' : n.type === 'cana' ? 'chase' : n.home ? 'idle' : 'walk');
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
      if (n.state === 'flee') {
        // correr lejos de la amenaza
        n.fleeT -= dt;
        const ax = n.x - n.from.x;
        const az = n.z - n.from.z;
        const l = Math.hypot(ax, az) || 1;
        n.target = { x: n.x + (ax / l) * 6, z: n.z + (az / l) * 6 };
        want = n.type === 'mendigo' ? 3.2 : 5.2;
        pose = 'flee';
        if (n.fleeT <= 0) {
          if (n.type === 'vecino' || n.type === 'zombie') {
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
      } else if (n.type === 'vecino') {
        want = n.vmax;
        pose = n.phone ? 'phone' : 'walk';
        if (Math.hypot(n.target.x - n.x, n.target.z - n.z) < 0.9) this.nextLeg(n);
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
      } else if (n.type === 'cana') {
        const r = world.police?.copBrain(n, dt, world, dp);
        want = r?.want ?? 0;
        pose = r?.pose ?? 'walk';
      }
      // golpe o reacción en curso: pisa la pose
      let t = 0;
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
      if (want > 0 && n.target) this.steer(n, dt, want);
      else n.speed = 0;
      // choque contra casas y rejas
      if (n.type !== 'mendigo' || n.state !== 'sit') {
        const p = { x: n.x, z: n.z };
        this.colliders.resolveCircle(p, n.r);
        n.x = p.x;
        n.z = p.z;
      }
      if (!far) animateHuman(n.h, dt, n.speed, pose, t);
      this.place(n);
    }
    this.list = this.list.filter((n) => {
      if (n.dead) this.scene.remove(n.mesh);
      return !n.dead;
    });
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

  steer(n, dt, want) {
    const dx = n.target.x - n.x;
    const dz = n.target.z - n.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      n.speed = 0;
      return;
    }
    let h = Math.atan2(dx, dz);
    if (n.type === 'zombie' && n.state === 'walk') h += Math.sin(n.t * 1.7) * 0.6;
    let diff = h - n.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    n.heading += diff * Math.min(1, dt * 7);
    n.speed = Math.min(want, d * 2);
    n.x += Math.sin(n.heading) * n.speed * dt;
    n.z += Math.cos(n.heading) * n.speed * dt;
  }

  // pelea a las piñas contra Gaspi
  updateFight(n, dt, world, dp) {
    const { player } = world;
    n.fightT -= dt;
    if (n.fightT <= 0 || dp > 28 || player.dead) {
      n.state = n.type === 'trapito' || n.type === 'medias' ? 'idle' : 'walk';
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
      n.act = { pose, t: 0, dur: pose === 'hook' ? 0.55 : 0.42, hit: false };
      n.fightCd = R.range(0.8, 1.5);
    }
    if (n.act && !n.act.hit && n.act.t / n.act.dur > 0.45) {
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
    const { player, time } = world;
    const wantWalkers = time.night ? 22 : 44;
    const wantZombies = time.night ? 16 : 6;
    let walkers = 0;
    for (const n of this.list) {
      const d = Math.hypot(n.x - player.x, n.z - player.z);
      if (n.type === 'vecino' && !n.down) {
        if (d > 175 && n.state === 'walk' && !n.mission) {
          n.dead = true;
          continue;
        }
        walkers++;
      }
      if (n.type === 'zombie' && d > 190 && this.count('zombie') > wantZombies) n.dead = true;
    }
    for (let i = walkers; i < wantWalkers && i < walkers + 3; i++) this.spawnWalker(null, player, 70, 150);
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

  place(n) {
    const y = this.heightAt(n.x, n.z);
    n.y += (y - n.y) * 0.3;
    n.mesh.position.set(n.x, n.y, n.z);
    n.mesh.rotation.y = n.heading;
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
