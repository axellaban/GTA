// Messi y la Selección en la plaza Espora (pedido del dueño, por la despedida de Messi del 6/10/2026): a
// la noche los campeones del mundo de Qatar 2022 se juntan en la punta norte de la plaza, con Messi
// adelante, y miran para arriba el show de drones (src/drones.js) que pasa en el cielo hacia el norte:
// SANCOR SEGUROS primero (silbatina, "¡Chiqui...!"), después el 10, la camiseta, el jugador que patea con
// la derecha, la Copa, el Obelisco y ¡GRACIAS LEO!. Cada uno con su nombre y su número en la espalda (en
// el shader de la camiseta: src/people.js). Son personajes hechos acá con MakeHuman, sin fotos (como el
// Comandante); no se los puede lastimar (si hay lío salen corriendo y vuelven). Con Messi te podés sacar
// una foto, y con la E mirás el show desde atrás del grupo.
import * as THREE from 'three';
import { Npc } from './npcs.js';
import { makeHuman } from './human.js';
import { loadSeleccion, makeJugador } from './people.js';
import { Drones } from './drones.js';
import { R } from './rng.js';

// un claro en la punta norte de la plaza (medido con los colliders del mapa: sin árboles ni faroles)
export const SEL_SPOT = { x: -75.5, z: -31 };
// el show: arriba de las vías, del otro lado de la estación (desde la plaza es el lado con menos árboles en
// el medio), a ~150 m del grupo y a 92 m de alto: se ve desde todo Temperley
export const SHOW = { x: 70, y: 92, z: -8 };
// de qué hora a qué hora están (el show, solo de noche)
export const SEL_HOURS = [19, 5.5];
const PAUSA = 35; // segundos entre un show y otro

// los 26 campeones del mundo (Qatar 2022) con su número y el modelo que les toca
// (a: sin barba, b: barba, c: morocho, arquero: buzo verde)
const PLANTEL = [
  [1, 'ARMANI', 'arquero'],
  [2, 'FOYTH', 'a'],
  [3, 'TAGLIAFICO', 'a'],
  [4, 'MONTIEL', 'c'],
  [5, 'PAREDES', 'b'],
  [6, 'PEZZELLA', 'b'],
  [7, 'DE PAUL', 'b'],
  [8, 'ACUÑA', 'c'],
  [9, 'J. ÁLVAREZ', 'a'],
  [10, 'MESSI', 'messi'],
  [11, 'DI MARÍA', 'c'],
  [12, 'RULLI', 'arquero'],
  [13, 'ROMERO', 'c'],
  [14, 'PALACIOS', 'a'],
  [15, 'CORREA', 'c'],
  [16, 'ALMADA', 'a'],
  [17, 'GÓMEZ', 'b'],
  [18, 'RODRÍGUEZ', 'b'],
  [19, 'OTAMENDI', 'b'],
  [20, 'MAC ALLISTER', 'a'],
  [21, 'DYBALA', 'a'],
  [22, 'L. MARTÍNEZ', 'c'],
  [23, 'E. MARTÍNEZ', 'arquero'],
  [24, 'E. FERNÁNDEZ', 'a'],
  [25, 'LI. MARTÍNEZ', 'b'],
  [26, 'MOLINA', 'c'],
];
const FILE = { messi: 'mh_messi', a: 'mh_sel_a', b: 'mh_sel_b', c: 'mh_sel_c', arquero: 'mh_sel_arquero' };

// lo que dicen (antes del show, y con cada figura)
const ANTES = ['¿A qué hora arrancan los drones?', 'Dicen que son mil drones, loco', 'Leo, ¿estás nervioso?', 'Qué noche, eh', 'Mirá cuánta gente vino', '¡Vamos que ya empieza!', 'Esto no me lo pierdo por nada', 'Che, ¿y el asado después?'];
const MESSI_ANTES = ['Un poco nervioso sí, la verdad', 'Gracias por venir, eh', 'Qué lindo el barrio', 'Disfrutemos, muchachos'];
const DICEN = {
  sancor: ['¿Sancor Seguros? ¿En serio?', '¡Fiuuuuuu!', '¡Chiqui, la con...!', '¿S de Súper Messi? No: de Sancor Seguros', '¡Sacá eso, Chiqui!', '¡Buuuuh!', 'Jajaja, ¡no te puedo creer!'],
  messi: ['¡Ahí está el 10!', '¡Messi, Messi, Messi!', '¡Ahora sí!', '¡El más grande!'],
  camiseta: ['¡La celeste y blanca!', '¡Qué lindo, loco!', '¡La camiseta!'],
  jugadorB: ['¡Pateó con la derecha!', '¿Ese es Leo? ¡Si es zurdo!', 'Jajaja, ¡con la derecha!', '¿Quién armó esto?'],
  copa: ['¡La tercera!', '¡Campeones del mundo!', '¡La Copa, la Copa!', '¡Dale campeón, dale campeón!'],
  obelisco: ['¡Al Obelisco!', '¡Vamos Argentina!', '¡Como en el 2022!'],
  gracias: ['¡Olé, olé, olé, olé, Leo, Leo!', '¡Gracias, Leo!', '¡Gracias, capitán!', '¡Leo, Leo!'],
  aterrizaje: ['¡Otra, otra!', 'Qué lindo, loco', 'Se me pianta un lagrimón'],
};
const MESSI_DICE = {
  sancor: '…',
  messi: 'Uh, qué lindo…',
  jugadorB: 'Yo con la derecha no le pego, eh',
  copa: 'La que más quería',
  gracias: 'Gracias a ustedes, de corazón',
};
// qué hacen con las manos durante cada figura (src/human.js, pose 'cielo')
const MANOS = { sancor: [0, 0, 5, 3], messi: [1, 2, 4, 0, 2], camiseta: [2, 0, 1, 5], jugadorA: [0, 5, 2], jugadorB: [3, 1, 4], copa: [4, 1, 2, 3], obelisco: [2, 1, 0, 4], gracias: [4, 4, 1, 2], aterrizaje: [4, 0, 5] };
const PHONE = new THREE.BoxGeometry(0.075, 0.15, 0.012);
const PHONE_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.5 });

// nombre y número de cada uno en un solo atlas (6×5 celdas); el shader de la camiseta toma su celda
function dorsales() {
  const W = 768;
  const H = 768;
  const cw = W / 6;
  const ch = H / 5;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cells = {};
  PLANTEL.forEach(([num, name], i) => {
    const x0 = (i % 6) * cw;
    const y0 = Math.floor(i / 6) * ch;
    g.fillStyle = '#111114';
    let px = 19;
    g.font = `700 ${px}px "Arial Narrow", Arial, sans-serif`;
    while (g.measureText(name).width > cw * 0.86 && px > 10) g.font = `700 ${--px}px "Arial Narrow", Arial, sans-serif`;
    g.fillText(name, x0 + cw / 2, y0 + ch * 0.13);
    g.font = `900 ${Math.round(ch * 0.62)}px "Arial Black", Arial, sans-serif`;
    g.fillText(String(num), x0 + cw / 2, y0 + ch * 0.58, cw * 0.92);
    cells[num] = new THREE.Vector4(x0 / W, y0 / H, (x0 + cw) / W, (y0 + ch) / H);
  });
  const map = new THREE.CanvasTexture(c);
  map.flipY = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return { map, cells };
}

export class Seleccion {
  constructor(scene, npcs) {
    this.scene = scene;
    this.npcs = npcs;
    this.spot = SEL_SPOT; // (el ícono del mapa)
    this.list = [];
    this.messi = null;
    this.ready = false;
    this.loading = false;
    this.clock = 0;
    this.wait = 6;
    this.fig = null;
    this.watching = false;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.hintT = 0;
    this.noticia = 0;
    this.fotos = 0;
    this.drones = new Drones(scene, SHOW, SEL_SPOT);
  }

  // dónde se para cada uno: Messi adelante en el medio, los demás en filas que se abren en arco
  lugares() {
    const fx = SHOW.x - SEL_SPOT.x;
    const fz = SHOW.z - SEL_SPOT.z;
    const l = Math.hypot(fx, fz);
    const F = { x: fx / l, z: fz / l };
    const S = { x: F.z, z: -F.x };
    const at = (ahead, side) => ({ x: SEL_SPOT.x + F.x * ahead + S.x * side + R.range(-0.2, 0.2), z: SEL_SPOT.z + F.z * ahead + S.z * side + R.range(-0.2, 0.2) });
    const out = [at(2.4, 0)];
    const rows = [6, 7, 7, 5];
    rows.forEach((n, r) => {
      for (let i = 0; i < n; i++) {
        const side = (i - (n - 1) / 2) * 1.35 + (r % 2 ? 0.6 : 0);
        out.push(at(-r * 1.55 - side * side * 0.035, side));
      }
    });
    return out;
  }

  spawn() {
    const D = (this.dors ??= dorsales());
    const spots = this.lugares();
    let k = 1;
    for (const [num, name, kind] of PLANTEL) {
      const p = kind === 'messi' ? spots[0] : spots[k++];
      const height = kind === 'messi' ? 1.7 : kind === 'arquero' ? R.range(1.88, 1.95) : R.range(1.72, 1.86);
      const hair = kind === 'messi' ? 'castano' : kind === 'c' ? R.pick(['negro', 'oscuro']) : R.pick(['oscuro', 'castano', 'oscuro', 'claro', 'negro']);
      const skin = kind === 'c' ? [R.range(0.8, 0.95), R.range(0.78, 0.9), R.range(0.75, 0.88)] : [R.range(0.95, 1.04), R.range(0.92, 1.0), R.range(0.88, 0.97)];
      const h = makeJugador(FILE[kind], { height, hair, skin, dorsal: { map: D.map, cell: D.cells[num] } }) || makeHuman({ jersey: 'argentina', top: 'jersey', pants: 0x151515, scale: height / 1.75 });
      const n = this.npcs.add(new Npc('chico', h, p.x, p.z));
      n.state = 'idle';
      n.hp = 9999;
      n.mission = true;
      n.name = name;
      n.num = num;
      n.sel = { spot: p, off: R.range(0, 6), manos: 0, talkT: R.range(0, 8) };
      n.heading = Math.atan2(SHOW.x - p.x, SHOW.z - p.z);
      if (kind === 'messi') {
        this.messi = n;
        // la cinta de capitán en el brazo izquierdo
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.05, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, side: THREE.DoubleSide }));
        band.position.set(0.004, -0.13, 0);
        h.bones.uaL.add(band);
      }
      // algunos filman con el celu
      if (R.chance(0.3) && kind !== 'messi') {
        const ph = new THREE.Mesh(PHONE, PHONE_MAT);
        ph.position.set(-0.03, -0.09, 0.04);
        ph.rotation.set(0.2, 0, 1.4);
        h.bones.handR.add(ph);
        n.sel.celu = true;
      }
      this.list.push(n);
    }
  }

  clear() {
    for (const n of this.list) n.dead = true;
    this.list = [];
    this.messi = null;
  }

  update(dt, world, camera, renderer) {
    const P = world.player;
    const hour = world.time.hour;
    const d = Math.hypot(P.x - SEL_SPOT.x, P.z - SEL_SPOT.z);
    const open = hour >= SEL_HOURS[0] || hour < SEL_HOURS[1];
    // los modelos se bajan de a poco cuando se acerca la hora y Gaspi anda cerca
    if (!this.ready && !this.loading && (hour > SEL_HOURS[0] - 2.5 || open) && d < 400) {
      this.loading = true;
      loadSeleccion().then((ok) => {
        this.ready = ok;
        this.loading = false;
      });
    }
    const want = open && d < 200;
    this.hintT -= dt;
    if (!open && d < 40 && this.hintT <= 0) {
      world.hud?.flash('LA SELECCIÓN', `Messi y los campeones vienen a la plaza a la noche (desde las ${SEL_HOURS[0]} h): show de drones`, 'ok', 4.5);
      this.hintT = 120;
    }
    if (want && this.ready && !this.list.length) this.spawn();
    if (!want && this.list.length && d > 220) this.clear();
    this.list = this.list.filter((n) => !n.dead);
    this.clock += dt;

    // el show: de noche, cada tanto (los drones se ven desde todo el barrio)
    const night = world.time.night && open;
    const dr = this.drones;
    if (!dr.on) {
      if (night) {
        dr.preparar(); // las figuras se preparan de a una por cuadro (no traba)
        this.wait -= dt;
        if (this.wait <= 0) this.empezar(world, d);
      } else {
        this.wait = Math.min(this.wait, 6);
        this.noticia = 0;
      }
    }
    dr.update(dt, camera, renderer);
    world.audio?.zumbido?.(dr.on ? Math.max(0, 1 - Math.hypot(P.x - SHOW.x, P.z - SHOW.z) / 420) : 0);
    const f = dr.figura;
    if (f && f.armada && f.fig !== this.fig) {
      this.fig = f.fig;
      this.reaccion(world, f.fig, d);
    }
    if (!dr.on && this.fig) {
      this.fig = null;
      this.wait = PAUSA;
    }
    // charlas antes del show
    if (!dr.on && this.list.length && d < 30) {
      for (const n of this.list) {
        n.sel.talkT -= dt;
        if (n.sel.talkT <= 0 && !n.bubble && n.state !== 'flee') {
          n.sel.talkT = R.range(9, 20);
          if (R.chance(0.3)) n.say(n === this.messi ? R.pick(MESSI_ANTES) : R.pick(ANTES), 3);
        }
      }
    }
    // Gaspi mirando el show: se para mirando al cielo
    if (this.watching) {
      const moving = Math.hypot(P.mvx || 0, P.mvz || 0) > 0.3;
      if (!dr.on || P.vehicle || P.dead || P.swimming || moving) this.watching = false;
      else {
        P.cieloT = 0.2;
        P.cieloClock = this.clock;
        P.h.cieloV = f?.fig === 'gracias' ? 4 : 0;
        P.h.cieloK = 0.9;
        P.heading = Math.atan2(SHOW.x - P.x, SHOW.z - P.z);
      }
    }
  }

  empezar(world, d) {
    this.drones.start();
    this.fig = null;
    if (d < 600) world.hud?.flash('SHOW DE DRONES', 'Mirá al cielo arriba de la plaza Espora: la despedida de Messi', 'ok', 4);
    // (las noticias, una vez por noche)
    if (!this.noticia) {
      this.noticia = 1;
      world.events?.pushNews?.('Temperley: la Selección despide a Messi en la plaza Espora con un show de mil drones');
    }
  }

  reaccion(world, fig, d) {
    const A = world.audio;
    const near = d < 60;
    const k = Math.max(0.15, 1 - d / 180);
    if (fig === 'sancor') {
      if (near) A?.silbatina?.(k);
      if (this.noticia === 1) {
        this.noticia = 2;
        world.events?.pushNews?.('Show de drones para Messi: arrancó con la publicidad de Sancor Seguros y se ligó una silbatina');
      }
    }
    if (near && (fig === 'messi' || fig === 'copa' || fig === 'gracias' || fig === 'aterrizaje')) A?.aplausos?.(k, fig === 'gracias' ? 5 : 3);
    // las manos de cada uno para esta figura
    const op = MANOS[fig] ?? [0];
    for (const n of this.list) n.sel.manos = n.sel.celu && R.chance(0.6) ? 2 : R.pick(op);
    if (this.messi) this.messi.sel.manos = fig === 'gracias' || fig === 'aterrizaje' ? 4 : fig === 'messi' ? 0 : fig === 'jugadorB' ? 1 : 0;
    if (!near) return;
    // dos o tres dicen algo (y Messi, a veces)
    const lines = DICEN[fig];
    if (lines) {
      const who = this.list.filter((n) => n !== this.messi && n.state !== 'flee');
      for (let i = 0; i < 3 && who.length; i++) {
        const n = who.splice((Math.random() * who.length) | 0, 1)[0];
        const t = i * 1.3;
        setTimeout(() => n.dead || n.say(R.pick(lines), 2.6), t * 1000);
      }
    }
    const m = this.messi;
    if (m && MESSI_DICE[fig]) setTimeout(() => m.dead || m.say(MESSI_DICE[fig], 3), 2200);
    if (fig === 'jugadorB' && world.player && d < 25) setTimeout(() => world.player.say?.('¿Con la derecha? Jajaja', 2.4), 3800);
  }

  // lo que hace cada uno (lo llama Barrio.brain): va a su lugar y mira al show
  brain(n, dt, world) {
    const s = n.sel;
    n.target = { x: s.spot.x, z: s.spot.z };
    if (Math.hypot(s.spot.x - n.x, s.spot.z - n.z) > 0.35) return { want: 1.2, pose: 'walk' };
    n.heading = Math.atan2(SHOW.x - n.x, SHOW.z - n.z);
    if (!this.drones.on) {
      // charlando entre ellos, a la espera
      n.poseT = this.clock + s.off;
      return { want: 0, pose: n.bubble ? 'talk' : 'listen', t: 0 };
    }
    const h = n.h;
    h.cieloV = s.manos;
    // cuánto se levanta la cabeza: el ángulo de la figura (más cerca, más arriba)
    const el = Math.atan2(SHOW.y - 1.6, Math.hypot(SHOW.x - n.x, SHOW.z - n.z));
    h.cieloK = Math.min(1.3, el / 0.42);
    return { want: 0, pose: 'cielo', t: this.clock + s.off };
  }

  // la E: una foto con Messi (de cerca) o mirar el show desde atrás del grupo
  action(world) {
    const P = world.player;
    if (P.vehicle || P.swimming || !this.list.length) return null;
    const m = this.messi;
    if (m && !m.dead && m.state !== 'flee' && Math.hypot(m.x - P.x, m.z - P.z) < 2.3 && !this.watching) {
      return {
        text: 'Sacarte una foto con Messi',
        run: () => {
          this.fotos++;
          P.phoneT = 1.6;
          world.audio?.click?.();
          m.say(this.fotos === 1 ? '¡Dale! ¿De qué cuadro sos?' : this.fotos < 4 ? '¿Otra? Dale, la última' : 'Bueno, ya está, che', 2.8);
          if (this.fotos === 1) {
            P.addRespeto?.(5);
            world.audio?.plata?.();
            world.hud?.flash('¡FOTO CON MESSI!', '+5 de respeto. La subís y te explota el celu', 'good', 4);
          }
        },
      };
    }
    if (this.drones.on && Math.hypot(P.x - SEL_SPOT.x, P.z - SEL_SPOT.z) < 14) {
      return { text: this.watching ? 'Dejar de mirar' : 'Mirar el show con la Selección', run: () => (this.watching = !this.watching) };
    }
    return null;
  }

  // la cámara mirando el show desde atrás del grupo, a la altura de un celu en alto (las espaldas con los
  // números abajo y el cielo arriba). El lugar está elegido entre los árboles de la plaza: desde ahí no
  // tapan ninguna figura (probado con capturas); se mece despacio, como alguien filmando.
  camera(camera, dt) {
    if (!this.watching) {
      this.camInit = false;
      return false;
    }
    const sway = Math.sin(this.clock * 0.09);
    const goal = new THREE.Vector3(SEL_SPOT.x - 9 + sway * 1.4, 2.1 + Math.sin(this.clock * 0.23) * 0.05, SEL_SPOT.z - 5.8 - sway * 1.1);
    const look = new THREE.Vector3(SHOW.x, 44, SHOW.z);
    if (!this.camInit) {
      this.camPos.copy(camera.position);
      this.camLook.copy(look);
      this.camInit = true;
    }
    const k = Math.min(1, dt * 2);
    this.camPos.lerp(goal, k);
    this.camLook.lerp(look, k);
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
    // más cerrado, como filmando con el celu (al dejar de mirar, la cámara de Gaspi lo vuelve a abrir)
    if (Math.abs(camera.fov - 54) > 0.05) {
      camera.fov += (54 - camera.fov) * k;
      camera.updateProjectionMatrix();
    }
    return true;
  }
}

