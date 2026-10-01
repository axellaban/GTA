// Viajar de pasajero, como en GTA: subirse al tren del Roca cuando para en el andén y al
// colectivo cuando frena en una parada. Gaspi va adentro (no se lo ve), la cámara sigue al
// vehículo desde afuera y se baja con E cuando frena. En el tren hasta la próxima estación,
// la cana te pierde el rastro.
import { DATA as D, ROADS, project } from './map.js';

const FARE = { tren: 650, bus: 700 };
// próxima estación según el destino del tren (las que están fuera del mapa)
const NEXT = { Constitución: 'Lomas de Zamora', Glew: 'Adrogué', Korn: 'Adrogué', Ezeiza: 'Turdera' };

export class Transit {
  constructor(city, trains, traffic) {
    this.city = city;
    this.trains = trains;
    this.traffic = traffic;
    this.ride = null;
    // paradas reales del mapa, proyectadas sobre el eje de la calle (ahí frena el colectivo)
    this.stops = [];
    for (const [sx, sz] of D.stops || []) {
      let best = null;
      for (const r of ROADS) {
        const p = project(r.pts, r.cum, sx, sz);
        if (!best || p.dist < best.p.dist) best = { r, p };
      }
      if (!best || best.p.dist > 25) continue;
      this.stops.push({ x: best.p.x, z: best.p.z, w: best.r.w });
    }
    traffic.busStops = this.stops;
    // fundido a negro para el viaje en tren
    this.fade = document.createElement('div');
    Object.assign(this.fade.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.6s', zIndex: '40' });
    document.body.appendChild(this.fade);
  }

  // Lo que hace E cuando Gaspi está a pie al lado de un tren parado o de un colectivo frenado
  action(world) {
    const P = world.player;
    if (this.ride || P.vehicle || P.dead) return null;
    for (const t of this.trains.trains) {
      if (t.state !== 'stopped' || !t.boxes) continue;
      for (const b of t.boxes) {
        const dx = P.x - b.x;
        const dz = P.z - b.z;
        const s = Math.sin(b.h);
        const c = Math.cos(b.h);
        if (Math.abs(dx * s + dz * c) < 9 && Math.abs(dx * c - dz * s) < 4.5) {
          return { text: `Subirse al tren a ${t.route.name} (SUBE $${FARE.tren})`, run: () => this.board(world, 'tren', t) };
        }
      }
    }
    for (const v of this.traffic.cars) {
      if (v.kind !== 'bus' || !v.ai || v.ai.hold || Math.abs(v.speed) > 1) continue;
      if (Math.hypot(P.x - v.x, P.z - v.z) < v.L / 2 + 2.2) return { text: `Subirse al colectivo (SUBE $${FARE.bus})`, run: () => this.board(world, 'bus', v) };
    }
    return null;
  }

  board(world, kind, x) {
    const { player: P, hud, audio } = world;
    if (P.money < FARE[kind]) {
      hud.toast('No te alcanza la SUBE');
      return;
    }
    P.addMoney(-FARE[kind]);
    audio.tone?.([2300], 0.14, 'square', 0.12); // el pip de la SUBE
    this.ride = { kind, t: kind === 'tren' ? x : null, v: kind === 'bus' ? x : null, time: 0, zoom: P.zoom, pitch: P.camPitch };
    P.h.root.visible = false;
    P.riding = true;
    P.zoom = kind === 'tren' ? 3.2 : 2.4;
    P.camPitch = 0.32;
    if (kind === 'bus') x.ai.stopWait = Math.max(x.ai.stopWait || 0, 2);
    hud.flash(kind === 'tren' ? 'ARRIBA DEL ROCA' : 'ARRIBA DEL BONDI', kind === 'tren' ? 'Viajás hasta la próxima estación: si te busca la cana, te pierde el rastro' : 'Te bajás cuando frena en una parada (E)', 'ok', 3);
  }

  // Mientras viaja: Gaspi va con el vehículo. Devuelve true si está arriba de algo.
  update(dt, world) {
    const r = this.ride;
    if (!r) return false;
    const { player: P, input, hud } = world;
    r.time += dt;
    if (r.kind === 'fade') {
      P.speed = 0;
      hud.prompt(null);
      return true;
    }
    let canExit = false;
    if (r.kind === 'tren') {
      const t = r.t;
      const b = t.boxes?.[Math.floor(t.boxes.length / 2)];
      // el tren se va del mapa: llegó a la próxima estación
      const leaving = t.state === 'idle' || !b || (t.state === 'running' && (t.dir > 0 ? t.s > t.route.length - 25 : t.s - t.n * 20 < 25));
      if (leaving) {
        this.arrive(world);
        return true;
      }
      P.x = b.x;
      P.z = b.z;
      P.heading = b.h;
      canExit = t.state === 'stopped' && r.time > 2;
    } else {
      const v = r.v;
      if (!this.traffic.cars.includes(v) || v.wreck || !v.ai) {
        this.getOff(world);
        return true;
      }
      // un poco atrás del centro, para que el colectivo no frene por "tener a alguien adelante"
      P.x = v.x - v.fx * (v.L / 2 - 1.2);
      P.z = v.z - v.fz * (v.L / 2 - 1.2);
      P.heading = v.heading;
      canExit = Math.abs(v.speed) < 1 && r.time > 2;
    }
    P.speed = 0;
    hud.prompt(canExit ? 'E' : null, canExit ? 'Bajarse' : null);
    if (canExit && input.hit('e')) this.getOff(world);
    return true;
  }

  getOff(world) {
    const r = this.ride;
    if (!r) return;
    const P = world.player;
    if (r.kind === 'bus') {
      // por la puerta de adelante, del lado de la vereda
      const v = r.v;
      const rx = -v.fz;
      const rz = v.fx;
      P.x = v.x + v.fx * (v.L / 2 - 1.6) + rx * (v.W / 2 + 0.9);
      P.z = v.z + v.fz * (v.L / 2 - 1.6) + rz * (v.W / 2 + 0.9);
    } else {
      const p = this.platformNear(P.x, P.z);
      if (p) {
        P.x = p.x;
        P.z = p.z;
      }
    }
    this.end(world);
  }

  end(world) {
    const P = world.player;
    const r = this.ride;
    P.h.root.visible = true;
    P.riding = false;
    P.mvx = P.mvz = 0;
    P.zoom = r.zoom;
    P.camPitch = r.pitch;
    this.ride = null;
  }

  // El tren sale del mapa: se viaja hasta la próxima estación y se vuelve en el de la vuelta.
  arrive(world) {
    const r = this.ride;
    const { player: P, hud, time, police, audio } = world;
    const dest = NEXT[r.t.route.name];
    this.fade.style.opacity = '1';
    this.ride = { ...r, t: { boxes: null, state: 'fade' }, kind: 'fade' };
    setTimeout(() => {
      time.hour = (time.hour + 0.5) % 24;
      const door = this.city.spots.stationDoor;
      const p = this.platformNear(door.x, door.z) || door;
      P.x = p.x;
      P.z = p.z;
      this.ride = r;
      this.end(world);
      let sub = dest ? `Fuiste hasta ${dest} y te volviste en el de la vuelta` : `Fuiste para el lado de ${r.t.route.name} y te volviste`;
      if (police.stars > 0) {
        police.clear();
        sub += '. La cana te perdió el rastro';
      }
      hud.flash('ESTACIÓN TEMPERLEY', sub, 'ok', 3.5);
      audio.campana?.(0.4);
      this.fade.style.opacity = '0';
    }, 900);
  }

  // un punto arriba del andén más cercano (para bajarse del tren): el borde más cercano, 1,5 m adentro
  platformNear(x, z) {
    let best = null;
    for (const rings of D.platforms || []) {
      const ring = rings[0];
      if (!ring?.length) continue;
      let cx = 0;
      let cz = 0;
      for (const [a, b] of ring) {
        cx += a;
        cz += b;
      }
      cx /= ring.length;
      cz /= ring.length;
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        const ex = bx - ax;
        const ez = bz - az;
        const l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const qx = ax + ex * t;
        const qz = az + ez * t;
        const d = Math.hypot(x - qx, z - qz);
        if (best && d >= best.d) continue;
        const l = Math.sqrt(l2);
        let nx = -ez / l;
        let nz = ex / l;
        if ((cx - qx) * nx + (cz - qz) * nz < 0) {
          nx = -nx;
          nz = -nz;
        }
        best = { d, x: qx + nx * 1.5, z: qz + nz * 1.5 };
      }
    }
    return best;
  }
}
