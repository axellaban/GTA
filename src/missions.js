// Misiones con historia: te llaman al celu (si todavía lo tenés), aparece un marcador amarillo en
// el mapa y al entrar empieza. Cada misión tiene etapas con su objetivo; se falla si te bajan,
// te agarra la cana o se acaba el tiempo. Al cumplirla: plata, respeto y la próxima llamada.
import * as THREE from 'three';
import { STATION, nearestStreetName } from './map.js';
import { R } from './rng.js';
import { makeCar } from './vehicles.js';

const fmt = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Marcador de GTA: cilindro amarillo translúcido que late, con una luz que sube
export function makeMarker() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 28, 1, true), mat);
  tube.position.y = 0.8;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.position.y = 0.06;
  g.add(tube, ring);
  g.userData = { tube, ring };
  g.visible = false;
  return g;
}

// pibes de gorrita que paran en la esquina (chorros, los del desarmadero)
function spawnThugs(c, spot, k, spread = 1.4) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const n = c.npcs.spawnWalker({ x: spot.x + Math.cos(a) * spread, z: spot.z + Math.sin(a) * spread, heading: a + Math.PI }, null, 0, 0, {
      skin: R.pick([0xc68b62, 0xd9a882, 0xa86f4a]),
      hair: 0x1a1a1a,
      hairStyle: 'buzz',
      top: 'hoodie',
      shirt: R.pick([0x222222, 0x3a3a3a, 0x1e2a44]),
      bottom: 'pants',
      pants: 0x1a1a1a,
      shoes: 0xf2f2f2,
      cap: i % 2 ? 0x111111 : null,
    });
    if (n) {
      n.vmax = 0;
      n.brave = 1;
      n.money = 2000;
      n.mission = true;
      out.push(n);
    }
  }
  return out;
}
// mientras estén parados y Gaspi ande cerca, pelean
function thugsFight(c, list, r = 30) {
  for (const n of list) if (n && !n.down && n.state !== 'fight' && dist(c.P, n) < r) {
    c.npcs.setState(n, 'fight');
    n.fightT = 999;
    if (!n.bubble) n.say(R.pick(['¿Qué querés, gil?', '¡De acá no te llevás nada!', '¡Rajá, amigo!']), 2.5);
  }
}
// el desarmadero: tres lugares de cordón seguidos, lejos del origen
function yardSpots(c, from, rmin, rmax) {
  const curb = c.city.curbSpots || [];
  const far = curb.filter((s) => dist(s, from) > rmin && dist(s, from) < rmax);
  for (let t = 0; t < 40 && far.length; t++) {
    const a = R.pick(far);
    const row = [a];
    for (const s of curb) {
      if (row.length >= 3) break;
      if (row.every((r) => dist(r, s) > 5.6) && dist(a, s) < 20) row.push(s);
    }
    if (row.length >= 3) return row;
  }
  // sin cordones: en fila sobre la vereda
  const p = c.near(from, rmin, rmax);
  return [0, 1, 2].map((i) => ({ x: p.x + i * 6, z: p.z, heading: Math.PI / 2 }));
}

// Las misiones. start(ctx): dónde está el marcador. stages: lo que hay que hacer, en orden.
// Cada etapa: text (objetivo), target (a dónde apunta el GPS), enter (arranca), update (devuelve
// true si se cumplió, o un texto si falló).
const DEFS = [
  {
    id: 'encomienda',
    title: 'LA ENCOMIENDA DEL TURCO',
    name: 'La encomienda del Turco',
    giver: 'El Turco del kiosco',
    call: 'Gaspi, tengo una encomienda urgente para un cliente. ¿Me la llevás en auto? Pasá por el kiosco.',
    reward: 8000,
    respeto: 2,
    start: (c) => c.near(STATION, 30, 80),
    stages: [
      {
        text: () => 'Conseguí un auto (sin romperlo)',
        skip: (c) => c.inCar(),
        target: (c) => c.nearestCar(),
        update: (c) => c.inCar(),
      },
      {
        enter: (c) => {
          c.m.dest = c.near(c.m.origin, 300, 460);
          c.m.timer = 105;
          c.m.damage0 = c.P.vehicle?.damage || 0;
        },
        text: (c) => `Llevá la encomienda a ${nearestStreetName(c.m.dest.x, c.m.dest.z)}`,
        target: (c) => c.m.dest,
        update: (c, dt) => {
          c.m.timer -= dt;
          if (c.m.timer <= 0) return 'Llegaste tarde: el cliente se fue';
          const v = c.P.vehicle;
          if (v && (v.damage || 0) - c.m.damage0 > 60) return 'Chocaste tanto que se rompió la encomienda';
          return dist(c.P, c.m.dest) < 9 && (!v || Math.abs(v.speed) < 4);
        },
      },
    ],
  },
  {
    id: 'celu',
    title: 'EL CELU DE DOÑA MARTA',
    name: 'El celu de Doña Marta',
    giver: 'Doña Marta',
    call: 'Nene, unos vivos me arrebataron el celu. Están parando por el barrio. ¿Me lo recuperás?',
    reward: 6000,
    respeto: 3,
    start: (c) => c.near(c.P, 60, 150),
    begin: (c) => {
      // la señora espera en el marcador
      c.m.lady = c.npcs.spawnWalker({ x: c.m.origin.x + 1.2, z: c.m.origin.z + 1.2, heading: 0 }, null, 0, 0, { female: true, skin: 0xe8c4a8, hair: 0x9a9a9a, hairStyle: 'bun', top: 'long', shirt: 0x7e5a8c, bottom: 'skirt', skirt: 0x3a3a48, shoes: 0x3a2a20, glasses: true, scale: 0.94 });
      if (c.m.lady) {
        c.m.lady.vmax = 0;
        c.m.lady.mission = true;
        c.m.lady.say('¡Por favor, nene, era de mi nieta!', 3);
      }
    },
    stages: [
      {
        enter: (c) => {
          c.m.spot = c.near(c.m.origin, 170, 280);
          c.m.thugs = [0, 1].map((i) => {
            const n = c.npcs.spawnWalker({ x: c.m.spot.x + i * 1.4, z: c.m.spot.z + (i ? 0.8 : 0), heading: 0 }, null, 0, 0, {
              skin: R.pick([0xc68b62, 0xd9a882, 0xa86f4a]),
              hair: 0x1a1a1a,
              hairStyle: 'buzz',
              top: 'hoodie',
              shirt: R.pick([0x222222, 0x3a3a3a, 0x1e2a44]),
              bottom: 'pants',
              pants: 0x1a1a1a,
              shoes: 0xf2f2f2,
              cap: i ? 0x111111 : null,
            });
            if (n) {
              n.vmax = 0;
              n.brave = 1;
              n.money = 2000;
              n.mission = true;
            }
            return n;
          });
        },
        text: (c) => `Andá a donde paran los chorros, en ${nearestStreetName(c.m.spot.x, c.m.spot.z)}`,
        target: (c) => c.m.spot,
        update: (c) => dist(c.P, c.m.spot) < 16,
      },
      {
        enter: (c) => {
          for (const n of c.m.thugs) if (n && !n.down) {
            c.npcs.setState(n, 'fight');
            n.fightT = 999;
            n.say(R.pick(['¿Qué mirás, gil?', '¡Tomatelá!', 'Rajá de acá, amigo']), 2.5);
          }
          c.hud.flash('¡SON ELLOS!', 'Bajalos y recuperá el celu', 'warn', 2.2);
        },
        text: () => 'Bajá a los chorros',
        target: (c) => c.m.thugs.find((n) => n && !n.down) ?? c.m.spot,
        update: (c) => {
          // mientras estén parados, siguen peleando aunque Gaspi se aleje un poco
          for (const n of c.m.thugs) if (n && !n.down && n.state !== 'fight' && dist(c.P, n) < 40) {
            c.npcs.setState(n, 'fight');
            n.fightT = 999;
          }
          return c.m.thugs.every((n) => !n || n.down);
        },
      },
      {
        enter: (c) => c.hud.toast('¡Recuperaste el celu de Doña Marta!', 2.5),
        text: () => 'Devolvele el celu a Doña Marta',
        target: (c) => c.m.lady ?? c.m.origin,
        update: (c) => {
          if (c.m.lady?.down) return 'Doña Marta quedó tirada en la vereda';
          return dist(c.P, c.m.lady ?? c.m.origin) < 3.2;
        },
      },
    ],
    done: (c) => c.m.lady?.say('¡Gracias, nene! Sos un sol. Tomá, para la SUBE', 3.5),
  },
  {
    id: 'bolso',
    title: 'EL BOLSO DEL NEGRO',
    name: 'El bolso del Negro',
    giver: 'El Negro',
    call: 'Gaspi, dejé un bolso en la estación. Buscalo y traémelo al taller... ojo, que la cana lo tiene marcado.',
    reward: 15000,
    respeto: 4,
    start: (c) => c.near(c.P, 80, 160),
    stages: [
      {
        text: () => 'Buscá el bolso en la estación Temperley',
        target: (c) => c.city.spots.stationDoor,
        update: (c) => dist(c.P, c.city.spots.stationDoor) < 6,
      },
      {
        enter: (c) => {
          c.police.heat = Math.max(c.police.heat, 3.2);
          c.police.updateStars();
          c.police.lostT = 0;
          c.police.spawnT = 1;
          c.police.flash = 2;
          c.audio.alerta();
          c.hud.flash('¡LA CANA!', 'Te estaban esperando. Perdelos', 'bad', 2.6);
        },
        text: () => 'Perdé a la Bonaerense',
        target: () => null,
        update: (c) => c.police.stars === 0,
      },
      {
        enter: (c) => (c.m.dest = c.near(c.P, 220, 380)),
        text: (c) => `Llevá el bolso al taller en ${nearestStreetName(c.m.dest.x, c.m.dest.z)}`,
        target: (c) => c.m.dest,
        update: (c) => {
          if (c.police.stars > 0) return null;
          return dist(c.P, c.m.dest) < 7 && (!c.P.vehicle || Math.abs(c.P.vehicle.speed) < 4);
        },
      },
    ],
  },
  {
    id: 'motochorros',
    title: 'LA RECAUDACIÓN DEL TURCO',
    name: 'La recaudación del Turco',
    giver: 'El Turco del kiosco',
    call: '¡Gaspi! Dos en una moto me llevaron la recaudación del día. Van rajando por el barrio. ¡Bajalos!',
    reward: 9000,
    respeto: 3,
    start: (c) => c.near(STATION, 30, 90),
    stages: [
      {
        text: () => 'Conseguí un auto para perseguirlos',
        skip: (c) => c.inCar(),
        target: (c) => c.nearestCar(),
        update: (c) => c.inCar(),
      },
      {
        enter: (c) => {
          const crime = c.w.crime;
          let mo = null;
          for (let i = 0; i < 12 && !mo; i++) mo = crime.spawn(c.P);
          c.m.moto = mo;
          if (mo) {
            Object.assign(mo, { state: 'flee', t: 0, life: 0, loot: { phone: false, money: 20000 } });
            crime.say(mo, '¡Rajemos, rajemos!', 2.5);
          }
          c.hud.flash('¡AHÍ VAN!', 'Chocales la moto para bajarlos', 'warn', 2.4);
        },
        text: () => 'Bajá a los motochorros (chocales la moto)',
        target: (c) => (c.m.moto ? c.m.moto.v : null),
        update: (c) => {
          const mo = c.m.moto;
          if (!mo) return 'Se esfumaron antes de que los vieras';
          if (mo.state === 'down') {
            c.m.lootAt = { x: mo.v.x, z: mo.v.z };
            return true;
          }
          if (mo.state === 'gone') return 'Se escaparon con la plata';
          return false;
        },
      },
      {
        text: () => 'Juntá la recaudación que se les cayó',
        target: (c) => c.m.lootAt,
        update: (c) => dist(c.P, c.m.lootAt) < 3,
      },
    ],
    done: (c) => c.hud.toast('El Turco: "¡Sos un fenómeno! Quedate con una parte"', 3),
  },
  {
    id: 'tren',
    title: 'EL ROCA DE LAS SEIS',
    name: 'El Roca de las seis',
    giver: 'El Negro',
    call: 'Gaspi, la cana anda preguntando por vos en el barrio. Tomate el Roca un rato hasta que se calme la cosa.',
    reward: 7000,
    respeto: 2,
    start: (c) => c.near(c.P, 50, 120),
    stages: [
      {
        enter: (c) => {
          c.police.heat = Math.max(c.police.heat, 2.2);
          c.police.updateStars();
          c.police.lostT = 0;
          c.police.spawnT = 2;
          c.audio.alerta();
          c.hud.flash('¡TE ENCONTRARON!', 'Corré a la estación y subite al tren', 'bad', 2.6);
        },
        text: () => 'Subite al tren en la estación (E con el tren parado en el andén)',
        target: (c) => c.city.spots.stationDoor,
        update: (c) => !!c.w.transit?.ride && c.w.transit.ride.kind !== 'bus',
      },
      {
        text: () => 'Viajá hasta que se calme la cosa',
        target: () => null,
        update: (c) => {
          if (c.w.transit?.ride) return false;
          return c.police.stars === 0 ? true : 'Te bajaste antes de tiempo';
        },
      },
    ],
    done: (c) => c.hud.toast('El Negro: "Bien ahí. Ni se enteraron"', 3),
  },
  {
    id: 'proteina',
    title: 'LA PROTEÍNA DE CIRO',
    name: 'La proteína de Ciro',
    giver: 'Ciro, el profe del gym',
    call: '¡Gaspi! Se me terminó la proteína y los pibes están perdiendo músculo. Traeme un tarro ya, que el reloj corre.',
    reward: 6000,
    respeto: 3,
    start: (c) => (c.w.gym?.x != null ? c.w.gym.world(0, c.w.gym.edge - 0.3) : c.near(STATION, 40, 90)),
    stages: [
      {
        enter: (c) => {
          // una dietética o farmacia (por el cartel); si no hay, un autoservicio o kiosco
          const signs = c.city.shopSigns || [];
          const from = c.m.origin;
          const ok = (s, a, b) => dist(s, from) > a && dist(s, from) < b;
          c.m.shop =
            signs.find((s) => /DIET|NUTRI|FARMA/i.test(s.name || '') && ok(s, 100, 450)) ??
            signs.find((s) => /AUTOSERV|SUPER|ALMAC|KIOSCO|MERCADO/i.test(s.name || '') && ok(s, 100, 450)) ??
            { ...c.near(from, 150, 300), name: null };
          c.m.left = 120;
          c.m.timer = c.m.left;
        },
        text: (c) => (c.m.shop.name ? `Comprá la proteína en "${c.m.shop.name}"` : 'Comprá la proteína en un kiosco'),
        target: (c) => c.m.shop,
        update: (c, dt) => {
          c.m.timer -= dt;
          c.m.left = c.m.timer;
          if (c.m.timer <= 0) return 'Se te pasó el tiempo: Ciro está furioso';
          return dist(c.P, c.m.shop) < 3.5;
        },
      },
      {
        enter: (c) => {
          c.m.timer = c.m.left;
          c.hud.toast('Tarro de proteína sabor vainilla: ¡corré!', 2);
        },
        text: () => 'Llevale la proteína a Ciro al gym',
        target: (c) => c.m.origin,
        update: (c, dt) => {
          c.m.timer -= dt;
          if (c.m.timer <= 0) return 'Llegaste tarde: Ciro está furioso';
          return dist(c.P, c.m.origin) < 4 && (!c.P.vehicle || Math.abs(c.P.vehicle.speed) < 3);
        },
      },
    ],
    done: (c) => c.hud.toast('Ciro: "¡Eso, campeón! Ahora sos de la casa"', 3),
  },
  {
    id: 'panchos',
    title: 'PANCHOS PARA EL MARCIANO',
    name: 'Panchos para el marciano',
    giver: 'El panchero de la estación',
    call: 'Gaspi, se me acabaron las salchichas y está por bajar el marciano a comprar. Si no tengo, se calienta y abduce a alguien. ¡Traeme un paquete, rápido!',
    reward: 7000,
    respeto: 3,
    start: (c) => c.near(c.city.spots.pancho, 4, 14),
    stages: [
      {
        enter: (c) => {
          const signs = c.city.shopSigns || [];
          const from = c.m.origin;
          const ok = (s) => dist(s, from) > 90 && dist(s, from) < 420;
          c.m.shop = signs.find((s) => /AUTOSERV|SUPER|ALMAC|CARNIC|FIAMBR|MERCADO/i.test(s.name || '') && ok(s)) ?? { ...c.near(from, 150, 280), name: null };
          c.m.timer = 130;
        },
        text: (c) => (c.m.shop.name ? `Comprá salchichas en "${c.m.shop.name}"` : 'Comprá salchichas en un almacén'),
        target: (c) => c.m.shop,
        update: (c, dt) => {
          c.m.timer -= dt;
          c.m.left = c.m.timer;
          if (c.m.timer <= 0) return 'El panchero cerró: no llegaste con las salchichas';
          return dist(c.P, c.m.shop) < 3.5;
        },
      },
      {
        enter: (c) => {
          c.m.timer = c.m.left;
          c.hud.toast('Paquete de salchichas de las largas', 2);
        },
        text: () => 'Llevale las salchichas al panchero de la estación',
        target: (c) => c.city.spots.pancho,
        update: (c, dt) => {
          c.m.timer -= dt;
          if (c.m.timer <= 0) return 'Llegaste tarde: el marciano se fue con hambre';
          return dist(c.P, c.city.spots.pancho) < 4 && (!c.P.vehicle || Math.abs(c.P.vehicle.speed) < 3);
        },
      },
      {
        enter: (c) => c.hud.toast('Panchero: "¡Justo a tiempo! Mirá, ahí baja"', 2.5),
        text: () => 'Esperá que el marciano compre y coma tranquilo',
        target: (c) => (c.w.ufo?.state !== 'away' ? c.w.ufo : null),
        update: (c) => {
          const u = c.w.ufo;
          if (!u) return true;
          // si recién se fue, baja en la próxima
          if (u.state === 'away') u.summon(c.w);
          if (u.state === 'player') return 'Le robaste la nave al cliente';
          if (u.alien && (u.alien.dead || u.alien.down) && !u.alien.aboard) return 'Le pegaste al cliente';
          return u.state === 'landed' && u.phase === 'eating';
        },
      },
    ],
    done: (c) => c.w.ufo?.alien?.say('¡Riquísimo, terrícola! Tomá, cristales de Plutón', 3.5),
  },
  {
    id: 'nave',
    title: 'LA NAVE DEL MARCIANO',
    name: 'La nave del marciano',
    giver: 'El marciano',
    call: '¡Terrícola! Mientras comía un pancho unos pibes me afanaron la nave y la escondieron en un desarmadero. Recuperala y te pago en cristales. Te espero en la estación.',
    reward: 18000,
    respeto: 5,
    start: (c) => c.near(c.city.spots.pancho, 6, 20),
    begin: (c) => {
      const u = c.w.ufo;
      if (!u) return;
      // la nave, escondida lejos (si estaba en otro lado, aparece allá)
      const at = u.openSpot(c.m.origin.x, c.m.origin.z, 260, 420) ?? c.near(c.m.origin, 260, 420);
      u.parkAt(c.w, at.x, at.z);
      c.m.ship = at;
      // el marciano espera en la estación
      const a = u.makeAlien(c.m.origin.x + 1.5, c.m.origin.z + 1.5);
      c.npcs.add(a);
      a.aboard = false;
      a.mission = true;
      u.alien = a;
      c.m.alien = a;
      a.say('¡Mi nave, terrícola! ¡Traémela!', 3);
    },
    stages: [
      {
        enter: (c) => (c.m.thugs = spawnThugs(c, { x: c.m.ship.x + 7, z: c.m.ship.z }, 3, 2.2)),
        text: (c) => `Andá al desarmadero en ${nearestStreetName(c.m.ship.x, c.m.ship.z)}`,
        target: (c) => c.m.ship,
        update: (c) => dist(c.P, c.m.ship) < 28,
      },
      {
        enter: (c) => c.hud.flash('¡AHÍ ESTÁ LA NAVE!', 'Los del desarmadero la cuidan', 'warn', 2.4),
        text: () => 'Subite a la nave (F)',
        target: (c) => c.m.ship,
        update: (c) => {
          thugsFight(c, c.m.thugs);
          return c.w.ufo?.state === 'player';
        },
      },
      {
        text: () => 'Llevale la nave al marciano a la estación y bajate (F)',
        target: (c) => c.city.spots.pancho,
        update: (c) => {
          const u = c.w.ufo;
          if (c.m.alien.dead) return 'El marciano quedó tirado';
          return u.state === 'parked' && dist(u, c.city.spots.pancho) < 35;
        },
      },
    ],
    done: (c) => {
      const u = c.w.ufo;
      c.m.alien.say('¡Mi nave! Sos un capo, terrícola. ¡Nos vemos en Andrómeda!', 3.5);
      // se la lleva apenas Gaspi se aleja (Ufo.parked)
      u.hold = false;
      u.parkT = 21;
    },
  },
  {
    id: 'desarmadero',
    title: 'EL DESARMADERO DEL TURCO',
    name: 'El desarmadero del Turco',
    giver: 'El Turco del kiosco',
    call: 'Gaspi, los del desarmadero me vendieron repuestos truchos. Pasá por el kiosco que te tengo un regalito con cohetes.',
    reward: 16000,
    respeto: 4,
    start: (c) => c.near(STATION, 30, 90),
    begin: (c) => {
      // la bazuca con seis cohetes
      c.w.combat.give(c.P, 'bazuca');
      const a = c.P.ammo.bazuca;
      if (a) a.res = Math.max(a.res, 5);
      c.hud.toast('El Turco te dio una bazuca con seis cohetes', 2.5);
    },
    stages: [
      {
        enter: (c) => {
          const row = yardSpots(c, c.m.origin, 240, 420);
          c.m.cars = row.map((s, i) => c.w.traffic.addParked(makeCar(['falcon', 'duna', 'pickup'][i], [0x6b5a3a, 0x5a6b6b, 0x7a3a2a][i]), s.x, s.z, s.heading));
          c.m.yard = row[1];
          c.m.thugs = spawnThugs(c, { x: row[1].x + 3, z: row[1].z + 3 }, 2, 1.5);
        },
        text: (c) => `Andá al desarmadero en ${nearestStreetName(c.m.yard.x, c.m.yard.z)}`,
        target: (c) => c.m.yard,
        update: (c) => dist(c.P, c.m.yard) < 70,
      },
      {
        enter: (c) => c.hud.flash('¡VOLALES LOS AUTOS!', 'Elegí la bazuca y apuntá', 'warn', 2.4),
        text: (c) => `Volá los autos del desarmadero (${c.m.cars.filter((v) => !v.wreck).length} de 3)`,
        target: (c) => c.m.cars.find((v) => !v.wreck) ?? c.m.yard,
        update: (c) => {
          thugsFight(c, c.m.thugs, 25);
          return c.m.cars.every((v) => v.wreck);
        },
      },
      {
        skip: (c) => c.police.stars === 0,
        enter: (c) => c.hud.flash('¡LA CANA!', 'Perdelos antes de volver', 'bad', 2.4),
        text: () => 'Perdé a la Bonaerense',
        target: () => null,
        update: (c) => c.police.stars === 0,
      },
    ],
    done: (c) => c.hud.toast('El Turco: "¡Así se arregla con los truchos! Quedate con la bazuca"', 3),
  },
];

// La última: cuando ganaste todas, llama el Comandante desde el cielo (ver src/cielo.js)
export const FINAL = {
  id: 'cielo',
  title: 'EL CIELO DEL COMANDANTE',
  name: 'El cielo del Comandante',
  giver: 'Número desconocido',
  call: 'Gaspi... soy yo, el Comandante. Te espero arriba de todo. Subí a lo más alto de Temperley, papi.',
  reward: 1000000,
  respeto: 20,
  start: (c) => c.w.tobogan?.t?.door ?? c.near(c.city.spots.stationDoor, 20, 60),
  stages: [
    {
      skip: (c) => c.w.tobogan?.where(c.P) !== 'calle',
      text: () => 'Subí en el ascensor a la terraza de la torre de Alte. Brown',
      target: (c) => c.w.tobogan?.t?.door ?? null,
      update: (c) => c.w.tobogan?.where(c.P) !== 'calle',
    },
    {
      enter: (c) => {
        c.w.cielo.beamOn(c.w);
        c.hud.flash('¡MIRÁ PARA ARRIBA!', 'Baja una luz dorada en el medio de la terraza', 'ok', 3);
      },
      text: () => 'Metete en la luz dorada',
      target: (c) => c.w.cielo.beam,
      update: (c) => c.w.cielo.inBeam(c.P),
    },
    {
      enter: (c) => c.w.cielo.ascend(c.w),
      text: () => 'Encontrá al Comandante',
      target: (c) => c.w.cielo.fortPos,
      update: (c) => c.w.cielo.near(c.P),
    },
    {
      enter: (c) => c.w.cielo.hug(c.w),
      text: () => 'El Comandante',
      target: () => null,
      update: (c) => c.w.cielo.hugDone,
    },
  ],
  done: (c) => c.w.cielo.ending(c.w),
};

export class Missions {
  constructor(scene, world, save = {}) {
    this.w = world;
    this.defs = DEFS;
    this.marker = makeMarker();
    scene.add(this.marker);
    this.next = save.next ?? 0; // próxima misión (vuelven a empezar al terminar todas)
    this.done = save.done ?? 0;
    this.finale = !!save.finale; // ya jugó el final en el cielo
    this.offer = null; // misión ofrecida: {def, origin}
    this.m = null; // misión en curso
    this.callT = 25; // primera llamada al rato de terminar el tutorial
    this.t = 0;
  }
  save() {
    return { next: this.next, done: this.done, finale: this.finale };
  }
  // mientras dura el encargo de Ciro, Ciro no le busca pelea a Gaspi
  get ciroPeace() {
    return (this.m ?? this.offer)?.def.id === 'proteina';
  }
  // contexto para las funciones de cada misión
  get c() {
    const w = this.w;
    const self = this;
    return {
      w,
      m: this.m ?? this.offer,
      P: w.player,
      npcs: w.npcs,
      hud: w.hud,
      police: w.police,
      audio: w.audio,
      city: w.city,
      inCar: () => !!w.player.vehicle && w.player.vehicle.kind !== 'bus',
      nearestCar: () => {
        let best = null;
        let bd = Infinity;
        for (const v of w.traffic.all()) {
          if (v.kind !== 'car' || v.wreck) continue;
          const d = dist(v, w.player);
          if (d < bd) {
            bd = d;
            best = v;
          }
        }
        return best;
      },
      near: (p, a, b) => self.near(p, a, b),
    };
  }
  near(p, rmin, rmax) {
    return this.w.npcs.sidewalkPoint(p.x, p.z, rmin, rmax) ?? { x: p.x + rmin, z: p.z };
  }

  // lo que muestra el HUD: {text, target} o null
  objective() {
    if (this.m) {
      const st = this.m.def.stages[this.m.stage];
      const t = st.text(this.c);
      return { text: this.m.timer > 0 ? `${t} · ${Math.ceil(this.m.timer)} s` : t, target: st.target(this.c) };
    }
    if (this.offer) return { text: `${this.offer.def.name}: andá al marcador amarillo`, target: this.offer.origin };
    return null;
  }
  markers() {
    return this.offer ? [{ x: this.offer.origin.x, z: this.offer.origin.z }] : [];
  }

  update(dt, ready) {
    const w = this.w;
    const P = w.player;
    this.t += dt;
    // marcador que late
    const mk = this.marker;
    mk.visible = !!this.offer && !this.m;
    if (mk.visible) {
      const o = this.offer.origin;
      mk.position.set(o.x, w.heightAt ? w.heightAt(o.x, o.z) : 0.15, o.z);
      const k = 0.85 + Math.sin(this.t * 3) * 0.15;
      mk.userData.tube.scale.set(k, 1, k);
      mk.userData.tube.material.opacity = 0.25 + Math.sin(this.t * 3) * 0.08;
    }
    if (this.m) return this.run(dt);
    if (this.offer) {
      if (dist(P, this.offer.origin) < 1.6 && !P.dead && !P.ufo && !(w.police.stars > 0)) this.begin();
      return;
    }
    // la próxima llamada
    if (!ready || w.hud.dialog || P.dead) return;
    this.callT -= dt;
    if (this.callT > 0) return;
    if (!P.phone) {
      w.hud.toast('Te quisieron llamar, pero no tenés celu', 2.5);
      this.callT = 60;
      return;
    }
    this.ring();
  }

  // la próxima: el final cuando ganaste todas (una sola vez), si no la que sigue
  nextDef() {
    return this.done >= DEFS.length && !this.finale && this.w.cielo ? FINAL : DEFS[this.next % DEFS.length];
  }
  ring() {
    const w = this.w;
    const def = this.nextDef();
    w.audio.ring?.();
    // la voz del que llama, como en el celu
    setTimeout(() => w.audio.speak?.(def.call, { female: /^Doña/.test(def.giver), key: this.next + 11, force: true }), 1300);
    w.hud.ask(`📱 ${def.giver}: "${def.call}"`, [
      {
        label: 'Atender: "Dale, voy"',
        run: () => {
          this.offer = { def, origin: null };
          this.offer.origin = def.start(this.c);
          w.hud.toast('Tenés una misión: andá al marcador amarillo', 2.5);
        },
      },
      { label: 'Cortar', run: () => (this.callT = 45) },
    ], 9, 1);
    this.callT = 45;
  }

  begin() {
    const w = this.w;
    const def = this.offer.def;
    this.m = { def, origin: this.offer.origin, stage: -1, timer: 0 };
    this.offer = null;
    w.hud.flash(def.title, def.giver, 'warn', 3);
    def.begin?.(this.c);
    this.advance();
  }
  advance() {
    const m = this.m;
    m.stage++;
    const def = m.def;
    // saltear etapas que ya están cumplidas (por ejemplo, si ya está arriba de un auto)
    while (m.stage < def.stages.length && def.stages[m.stage].skip?.(this.c)) m.stage++;
    if (m.stage >= def.stages.length) return this.complete();
    m.timer = 0;
    def.stages[m.stage].enter?.(this.c);
  }
  run(dt) {
    const w = this.w;
    const m = this.m;
    if (w.player.dead) return this.fail('Te bajaron');
    const r = m.def.stages[m.stage].update(this.c, dt);
    if (typeof r === 'string') return this.fail(r);
    if (r) {
      this.w.audio.plata();
      this.advance();
    }
  }
  complete() {
    const w = this.w;
    const def = this.m.def;
    def.done?.(this.c);
    w.player.addMoney(def.reward);
    w.player.addRespeto(def.respeto);
    w.audio.cumplida?.();
    w.hud.flash('¡MISIÓN CUMPLIDA!', `${fmt(def.reward)} · Respeto +${def.respeto}`, 'ok', 4);
    this.cleanup();
    this.m = null;
    if (def.id === 'cielo') this.finale = true;
    else this.next++;
    this.done++;
    this.callT = R.range(35, 60);
  }
  fail(reason) {
    const w = this.w;
    w.audio.fallida?.();
    w.hud.flash('MISIÓN FALLIDA', reason, 'bad', 3.5);
    const def = this.m.def;
    this.cleanup();
    this.m = null;
    // se puede volver a intentar: el marcador queda donde empezó
    this.offer = { def, origin: def.start(this.c) };
  }
  // la cana te agarró: la misión se cae
  busted() {
    if (this.m) this.fail('Te agarró la Bonaerense');
  }
  cleanup() {
    const m = this.m;
    if (!m) return;
    // los chorros que siguen parados se van; la señora vuelve a caminar
    for (const n of m.thugs || []) if (n && !n.down) this.w.npcs.setState(n, 'flee', this.w.player);
    for (const n of [...(m.thugs || []), m.lady]) if (n) n.mission = false;
    // la nave del marciano: si la misión se cayó, al rato se va sola
    const u = this.w.ufo;
    if (m.def.id === 'nave' && u) {
      u.hold = false;
      if (m.alien && !m.alien.dead && u.alien !== m.alien) m.alien.dead = true;
    }
    if (m.lady && !m.lady.down) m.lady.vmax = 1.1;
  }
}
