// Bandas a lo GTA, cada una con su territorio en una punta distinta del mapa:
// - Los Arbolitos: los del dólar blue, en la vereda de los bancos de Almirante Brown, patrullando con
//   ametralladoras. "¡Cambio, cambio!". Si te acercás demasiado (o pasás despacio), te avisan y
//   después te cagan a tiros.
// - Los Jubilados: hartos de que les saquen el descuento de la farmacia, plantados en la puerta de
//   la ANSES con molotovs, lanzallamas y bazucas. Más lentos, pero pegan mucho más fuerte.
// Si les pegás o les tirás a uno, salen todos. Muertos sueltan plata, el arma (y los jubilados, los
// remedios); al rato, si estás lejos, vuelven a aparecer.
import * as THREE from 'three';
import { Npc } from './npcs.js';
import { makeHuman } from './human.js';
import { handWeapon } from './weapons.js';
import { textTexture, bannerTexture } from './textures.js';
import { nearestRoad, STATION } from './map.js';
import { R, Rng } from './rng.js';
import OSM from './data/osm.json';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const DEFS = {
  arbolitos: {
    name: 'LOS ARBOLITOS',
    arms: ['ametralladora', 'ametralladora', 'ametralladora', 'ametralladora', 'ametralladora'],
    hp: 160,
    vmax: 4.2,
    walk: 1.3,
    warn: 26, // te avisan
    fire: 14, // si te quedás, tiran
    leash: 48, // no se alejan más que esto de su cuadra
    acc: 0.26,
    money: [6, 18],
    calm: ['¡Cambio, cambio! ¡Dólar, euro, real!', '¡Cambio! ¿Compra o vende?', 'Dólar, dólar... ¡mejor que el banco!', '¡Blue, blue! ¡Pagamos bien!'],
    warnLines: ['¿Qué mirás? ¿Venís a comprar o a molestar?', 'Esta cuadra es nuestra, flaco. Rajá.', 'Seguí caminando, campeón.', '¡Ni se te ocurra, eh!'],
    war: ['¡Le vendo plomo al blue!', '¡Tomá, cotización oficial!', '¡Fuego, fuego!', '¡No se toca la cueva!', '¡Bajalo, bajalo!'],
  },
  jubilados: {
    name: 'LOS JUBILADOS',
    arms: ['molotov', 'lanzallamas', 'bazuca', 'molotov', 'lanzallamas', 'bazuca'],
    hp: 120,
    vmax: 2.6,
    walk: 0.8,
    warn: 30,
    fire: 17,
    leash: 38,
    acc: 0.3,
    money: [1, 4],
    calm: ['¡Los remedios no se tocan!', '¡Cuarenta años aportando para esto!', '¡Devuelvan el descuento de la farmacia!', '¡Aguante el PAMI!', 'Pibe, ¿no tenés una aspirina?'],
    warnLines: ['¡Andá a laburar, pendejo!', '¡Rajá o te quemo el traste!', '¿Vos también venís a sacarnos algo?', '¡Respetá las canas, nene!'],
    war: ['¡Por los remedios!', '¡Esto es por mi presión!', '¡Tomá, para que aprendas!', '¡Jubilados al ataque!', '¡Ni la ANSES nos para!'],
  },
};

function arbolitoLook(i) {
  return {
    skin: R.pick([0xd9a882, 0xc68b62, 0xe8c0a0]),
    hair: R.pick([0x1a1a1a, 0x2b1d14]),
    hairStyle: R.pick(['short', 'buzz']),
    top: 'jacket',
    jacket: R.pick([0x2b1d14, 0x1a1a1a, 0x3b2a20]),
    shirt: R.pick([0xf2f2f2, 0x2a3f6a, 0x111111]),
    bottom: 'pants',
    pants: R.pick([0x2c3e5c, 0x22304a]),
    shoes: R.pick([0x111111, 0x5a3a22]),
    glasses: i % 2 === 0,
    stubble: R.chance(0.6),
    mustache: R.chance(0.3),
    cap: i === 3 ? 0x111111 : null,
    scale: R.range(0.98, 1.06),
  };
}
function jubiladoLook(i) {
  const female = i % 3 === 2;
  return {
    female,
    skin: R.pick([0xe8c0a0, 0xd9a882, 0xc68b62]),
    hair: R.pick([0xd9d9d9, 0xbdbdbd, 0xf0f0f0]),
    hairStyle: female ? R.pick(['bun', 'bob']) : R.pick(['bald', 'short', 'bald']),
    top: female ? 'long' : 'jacket',
    jacket: R.pick([0x6d4c41, 0x8d6e63, 0x546e7a, 0x4e5b3a]),
    shirt: female ? R.pick([0x8e5a9e, 0x5a7a9e, 0xb0485a]) : R.pick([0xe8e0c8, 0xb8c8d8]),
    longSleeves: true,
    bottom: female ? 'skirt' : 'pants',
    skirt: R.pick([0x4a4a5a, 0x5a3a2a, 0x2e3a4a]),
    pants: R.pick([0x7a6a55, 0x5a5a5a, 0x3d3d48]),
    shoes: R.pick([0x4a3020, 0x222222]),
    glasses: R.chance(0.7),
    mustache: !female && R.chance(0.6),
    tired: true,
    belly: !female && R.chance(0.5),
    scale: R.range(0.93, 0.99),
  };
}

export class Gangs {
  constructor(scene, npcs, city, pickups) {
    this.scene = scene;
    this.npcs = npcs;
    this.list = [];
    const door = city.spots.stationDoor ?? STATION;
    // Los Arbolitos: en la vereda de los bancos (datos de OpenStreetMap)
    const banks = (OSM.pois || []).filter((p) => p.c === 'bank' && Math.hypot(p.x - door.x, p.z - door.z) < 560);
    let a = banks.length ? { x: banks.reduce((s, p) => s + p.x, 0) / banks.length, z: banks.reduce((s, p) => s + p.z, 0) / banks.length } : null;
    if (!a) a = (pickups.shops || []).find((s) => dist(s, door) > 250) ?? { x: door.x + 250, z: door.z - 250 };
    this.add('arbolitos', a);
    // Los Jubilados: en la puerta de "la ANSES", un local de avenida en la otra punta del mapa
    const shops = (pickups.shops || []).filter((s) => dist(s, a) > 420 && dist(s, door) > 140 && dist(s, door) < 460 && !/LAVADERO|BAR|PIZZ|KIOSCO/i.test(s.name || ''));
    const anses = shops.find((s) => nearestRoad(s.x, s.z)?.road.avenue) ?? shops[0];
    if (anses) {
      this.add('jubilados', anses);
      this.ansesSign(anses);
    }
  }

  add(kind, at) {
    const def = DEFS[kind];
    const g = { kind, def, x: at.x, z: at.z, members: [], war: false, heat: 0, calmT: 0, respawnT: 0, points: [] };
    // los de la vereda: puntos para patrullar (arbolitos) o para pararse en ronda (jubilados)
    for (let i = 0; i < 6; i++) {
      const p = this.npcs.sidewalkPoint(at.x, at.z, 2, kind === 'arbolitos' ? 26 : 9);
      if (p) g.points.push({ x: p.x, z: p.z });
    }
    if (!g.points.length) g.points.push({ x: at.x, z: at.z });
    this.list.push(g);
    this.fill(g);
    return g;
  }

  // completa la banda (al empezar y cuando vuelven a aparecer)
  fill(g) {
    g.members = g.members.filter((n) => !n.killed && !n.dead && this.npcs.list.includes(n));
    const def = g.def;
    for (let i = g.members.length; i < def.arms.length; i++) {
      const p = g.points[i % g.points.length];
      const h = makeHuman(g.kind === 'arbolitos' ? arbolitoLook(i) : jubiladoLook(i));
      const n = this.npcs.add(new Npc('banda', h, p.x + R.range(-1, 1), p.z + R.range(-1, 1)));
      n.gang = g;
      n.state = 'gang';
      n.arm = def.arms[i];
      n.hp = def.hp;
      n.vmax = def.vmax;
      n.money = R.int(def.money[0], def.money[1]) * 1000;
      n.dropGun = n.arm === 'molotov' ? 'molotov' : n.arm;
      n.dropHealth = g.kind === 'jubilados' && R.chance(0.6);
      n.pi = i % g.points.length;
      n.mission = true;
      n.gun = handWeapon(n.arm);
      n.h.bones.handR.add(n.gun);
      g.members.push(n);
    }
  }

  // un local cualquiera pasa a ser "la ANSES": cartel celeste y blanco y un pasacalle de los jubilados
  ansesSign(s) {
    const nx = s.nx ?? 0;
    const nz = s.nz ?? 1;
    const ux = nz;
    const uz = -nx;
    const g = new THREE.Group();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.05), new THREE.MeshBasicMaterial({ map: textTexture('ANSES · ATENCIÓN AL PÚBLICO', { w: 1024, h: 168, bg: '#0d5aa7', fg: '#ffffff', font: 92, border: '#ffffff' }) }));
    sign.position.set(s.x - nx * 1.25, 3.55, s.z - nz * 1.25);
    sign.rotation.y = Math.atan2(nx, nz);
    g.add(sign);
    // pasacalle entre dos palos, en el borde de la vereda
    const rng = new Rng(8);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.1), new THREE.MeshLambertMaterial({ map: bannerTexture('LOS REMEDIOS NO SE TOCAN', rng), side: THREE.DoubleSide }));
    const bx = s.x + nx * 2.2;
    const bz = s.z + nz * 2.2;
    ban.position.set(bx, 2.2, bz);
    ban.rotation.y = Math.atan2(nx, nz);
    g.add(ban);
    const poleGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.9, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    for (const k of [-1, 1]) {
      const p = new THREE.Mesh(poleGeo, poleMat);
      p.position.set(bx + ux * 2.8 * k, 1.45, bz + uz * 2.8 * k);
      g.add(p);
    }
    g.traverse((o) => (o.castShadow = o.isMesh));
    this.scene.add(g);
    this.ansesAt = { x: s.x, z: s.z, nx, nz };
  }

  provoke(g, world) {
    if (!g || g.war) return;
    g.war = true;
    g.calmT = 0;
    g.heat = 0;
    for (const n of g.members) {
      n.cd = R.range(0.2, 1.2);
      if (!n.down && R.chance(0.6)) n.say(R.pick(g.def.war), 2.2);
    }
    world?.hud?.flash(g.def.name, g.kind === 'arbolitos' ? '¡Te metiste en la cuadra de los arbolitos!' : '¡Los jubilados se pudrieron!', 'bad', 2.2);
  }

  lost(n) {
    const g = n.gang;
    if (!g) return;
    g.respawnT = 90;
  }

  update(dt, world) {
    const P = world.player;
    for (const g of this.list) {
      const tgt = P.vehicle ?? P;
      const d = P.dead ? 999 : Math.hypot(tgt.x - g.x, tgt.z - g.z);
      const alive = g.members.filter((n) => !n.killed && !n.down);
      if (!g.war) {
        // cuánto te quedaste cerca: pasar rápido de largo no alcanza
        const near = alive.some((n) => Math.hypot(tgt.x - n.x, tgt.z - n.z) < g.def.fire);
        const aimed = P.aiming && alive.some((n) => Math.hypot(P.x - n.x, P.z - n.z) < 30 && world.npcs.inSights(P, n));
        const loud = (P.shootT || 0) > 0 && d < 40;
        if (loud) this.provoke(g, world);
        else if (near || aimed) g.heat += dt * (aimed ? 3 : 1) * (P.vehicle && Math.abs(P.vehicle.speed) > 9 ? 0.25 : 1);
        else g.heat = Math.max(0, g.heat - dt * 0.5);
        if (g.heat > 1.8) this.provoke(g, world);
      } else {
        // se calman cuando Gaspi se va lejos un rato (o lo bajaron)
        if (d > g.def.leash + 45 || P.dead) g.calmT += dt;
        else g.calmT = 0;
        if (g.calmT > 9 || !alive.length) {
          g.war = false;
          g.heat = 0;
        }
      }
      // los caídos vuelven al rato, si Gaspi no está cerca
      if (g.respawnT > 0) {
        g.respawnT -= dt;
        if (g.respawnT <= 0) {
          if (d > 160 && !g.war) this.fill(g);
          else g.respawnT = 20;
        }
      }
    }
  }

  // Lo que hace cada uno (lo llama Npcs.update): { want: velocidad, pose }
  brain(n, dt, world, dp) {
    const g = n.gang;
    const def = g.def;
    const P = world.player;
    const tgt = P.vehicle ?? P;
    const dT = Math.hypot(tgt.x - n.x, tgt.z - n.z);
    const home = g.points[n.pi] ?? g;
    n.cd = (n.cd ?? R.range(0.5, 1.5)) - dt;
    const face = () => {
      n.heading = Math.atan2(tgt.x - n.x, tgt.z - n.z);
      n.target = null;
    };
    if (!g.war || P.dead) {
      n.burst = null;
      n.aimT = 0;
      // te avisan: te miran, apuntan y te dicen algo
      if (dT < def.warn && !P.dead) {
        face();
        if (n.cool <= 0 && (g.heat > 0.2 || R.chance(0.3))) {
          n.say(R.pick(g.heat > 0.2 ? def.warnLines : def.calm), 2.4);
          n.cool = R.range(4, 7);
        }
        return { want: 0, pose: n.arm === 'molotov' ? 'fist' : g.kind === 'arbolitos' || g.heat > 0.4 ? 'aimLong' : 'holdGun' };
      }
      if (n.cool <= 0 && dp < 60 && R.chance(dt * 0.5)) {
        n.say(R.pick(def.calm), 2.6);
        n.cool = R.range(6, 12);
      }
      // los arbolitos patrullan la cuadra; los jubilados hacen su ronda en la puerta
      if (Math.hypot(home.x - n.x, home.z - n.z) > 1) {
        n.target = { x: home.x, z: home.z };
        return { want: def.walk, pose: n.arm === 'molotov' ? 'walk' : 'holdGun' };
      }
      n.pauseT = (n.pauseT ?? R.range(2, 6)) - dt;
      if (g.kind === 'arbolitos' && n.pauseT <= 0) {
        n.pauseT = null;
        n.pi = (n.pi + 1 + R.int(0, g.points.length - 2)) % g.points.length;
      }
      if (g.kind === 'jubilados') {
        // mirando para afuera de la ronda, puteando con el puño en alto
        n.heading = Math.atan2(n.x - g.x, n.z - g.z);
        return { want: 0, pose: n.arm === 'molotov' ? 'fist' : n.t % 6 < 3 ? 'talk' : 'holdGun' };
      }
      return { want: 0, pose: n.t % 7 < 2 ? 'wave' : 'holdGun' };
    }
    // ---- a los tiros ----
    const los = dT < 70 && world.colliders.blocked(n.x, n.z, tgt.x, tgt.z, 1.5) > 0.99;
    const away = Math.hypot(n.x - g.x, n.z - g.z) > def.leash;
    if (n.cool <= 0 && R.chance(dt * 0.4)) {
      n.say(R.pick(def.war), 2);
      n.cool = R.range(4, 8);
    }
    if (n.arm === 'ametralladora' && los && dT < 48) {
      face();
      if (n.cd <= 0) {
        world.combat.enemyShoot(world, n, def.acc, 'ametralladora');
        // ráfagas cortas y una pausa para apuntar de nuevo
        n.burst = (n.burst ?? R.int(3, 7)) - 1;
        if (n.burst > 0) n.cd = 0.1;
        else {
          n.burst = null;
          n.cd = R.range(1.3, 2.6);
        }
      }
      return { want: 0, pose: 'aimLong' };
    }
    if (n.arm === 'molotov' && los && dT > 3.5 && dT < 24) {
      face();
      if (n.cd <= 0) {
        // apunta adonde va a estar el auto (a pie, adonde está)
        const lead = P.vehicle ? Math.min(1.6, dT / 12) : 0.2;
        const vx = P.vehicle ? P.vehicle.vx ?? P.vehicle.fx * P.vehicle.speed : 0;
        const vz = P.vehicle ? P.vehicle.vz ?? P.vehicle.fz * P.vehicle.speed : 0;
        n.act = { pose: 'swing', t: 0, dur: 0.45 };
        world.combat.enemyMolotov(world, n, tgt.x + vx * lead + R.range(-1.2, 1.2), tgt.z + vz * lead + R.range(-1.2, 1.2));
        n.cd = R.range(2.2, 3.6);
      }
      return { want: 0, pose: 'guard' };
    }
    if (n.arm === 'lanzallamas' && los && dT < 7.8) {
      face();
      // chorros de un segundo y medio con un respiro
      n.flameOn = (n.flameOn ?? 0) + dt;
      if (n.flameOn < 1.5) world.combat.flame(world, n, dt);
      else if (n.flameOn > 2.3) n.flameOn = 0;
      return { want: dT > 4.5 ? 1.2 : 0, pose: 'aimLong' };
    }
    if (n.arm === 'bazuca' && los && dT > 8 && dT < 65) {
      face();
      // se toma su tiempo para apuntar (y avisa)
      n.aimT = (n.aimT || 0) + dt;
      if (n.aimT > 1.3 && n.cd <= 0) {
        if (!n.bubble) n.say('¡Tomá, pendejo!', 1.4);
        world.combat.enemyRocket(world, n, tgt.x, P.vehicle ? 0.8 : (P.y || 0) + 1.1, tgt.z, 0.6 + dT * 0.05);
        n.cd = R.range(5, 7.5);
        n.aimT = 0;
      }
      return { want: 0, pose: 'aimLong' };
    }
    n.aimT = 0;
    // con la bazuca no se tira de cerca: retrocede para tomar distancia
    if (n.arm === 'bazuca' && dT < 8 && !away) {
      const l = dT || 1;
      n.target = { x: n.x + ((n.x - tgt.x) / l) * 6, z: n.z + ((n.z - tgt.z) / l) * 6 };
      return { want: n.vmax, pose: 'holdGun' };
    }
    // sin tiro: se acerca (cada uno a su distancia), sin irse de su territorio
    const keep = n.arm === 'lanzallamas' ? 4 : n.arm === 'bazuca' ? 22 : n.arm === 'molotov' ? 12 : 16;
    if (away || P.dead) n.target = { x: g.x, z: g.z };
    else if (dT > keep) n.target = { x: tgt.x, z: tgt.z };
    else n.target = null;
    return { want: n.target ? n.vmax : 0, pose: n.arm === 'molotov' ? 'guard' : 'holdGun' };
  }

  // para el mapa: dónde está cada banda
  markers() {
    return this.list.map((g) => ({ kind: g.kind === 'arbolitos' ? 'arbolitos' : 'jubilados', x: g.x, z: g.z }));
  }
}
