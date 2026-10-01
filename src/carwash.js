// Lavadero de autos, como en GTA: entrás despacio con el auto debajo del pórtico, los rodillos lo
// lavan con espuma y sale de otro color y reluciente. Con hasta dos estrellas la cana te pierde (con
// más no te salva ni el lavadero). No arregla los golpes: para eso está chapa y pintura.
import * as THREE from 'three';
import { nearestRoad } from './map.js';
import { makeMarker } from './missions.js';
import { paintMat } from './cars.js';
import { CAR_COLORS } from './vehicles.js';
import { R } from './rng.js';

const COST = 700;
const WASH_T = 3.4;

export class CarWash {
  constructor(scene, city, pickups) {
    this.scene = scene;
    this.city = city;
    const door = city.spots.stationDoor;
    const near = (p) => Math.hypot(p.x - door.x, p.z - door.z);
    // un local con cartel de lavadero; si no hay, uno de los locales de una avenida
    const signs = (city.shopSigns || []).filter((s) => /LAVADERO|LAVACAR|LAVA ?AUTO/i.test(s.name || '') && near(s) < 700).sort((a, b) => near(a) - near(b));
    let at = signs[0];
    if (!at) {
      const shops = (pickups.shops || []).filter((s) => near(s) > 120 && near(s) < 400);
      at = shops.find((s) => nearestRoad(s.x, s.z)?.road.avenue) ?? shops[0];
      if (at) at = { ...at, name: 'LAVADERO' };
    }
    if (!at) return;
    const nr = nearestRoad(at.x, at.z);
    if (!nr) return;
    // el pórtico va sobre el carril de la calle que pasa por la puerta
    const side = Math.sign((at.x - nr.x) * -nr.dz + (at.z - nr.z) * nr.dx) || 1;
    const off = Math.max(1.6, nr.road.w / 2 - 1.7);
    this.x = nr.x - nr.dz * off * side;
    this.z = nr.z + nr.dx * off * side;
    this.dx = nr.dx;
    this.dz = nr.dz;
    this.name = at.name;
    this.state = 'idle';
    this.t = 0;
    this.used = false;
    this.build();
    // los parantes del pórtico se chocan
    for (const s of [-1, 1]) city.colliders.addCircle(this.x - this.dz * s * 1.8, this.z + this.dx * s * 1.8, 0.16, 3.3, 'post');
  }

  build() {
    const g = new THREE.Group();
    g.position.set(this.x, 0, this.z);
    g.rotation.y = Math.atan2(this.dx, this.dz);
    const steel = new THREE.MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.4, metalness: 0.5 });
    const W = 3.6;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.3, 0.22), steel);
      post.position.set(s * (W / 2), 1.65, 0);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.45, 0.5), steel);
    beam.position.y = 3.3;
    beam.castShadow = true;
    g.add(beam);
    // cartel arriba del pórtico
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#0d47a1';
    x.fillRect(0, 0, 512, 96);
    x.fillStyle = '#ffffff';
    x.font = 'bold 54px Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(`${this.name} · $${COST}`, 256, 50, 490);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    for (const s of [-1, 1]) {
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.66), new THREE.MeshBasicMaterial({ map: tex }));
      sg.position.set(0, 3.95, s * 0.02);
      sg.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(sg);
    }
    // rodillos: cilindros azules con cerdas (rayas) que giran
    const bristle = document.createElement('canvas');
    bristle.width = 64;
    bristle.height = 64;
    const b = bristle.getContext('2d');
    for (let i = 0; i < 16; i++) {
      b.fillStyle = i % 2 ? '#1e88e5' : '#64b5f6';
      b.fillRect(i * 4, 0, 4, 64);
    }
    const bt = new THREE.CanvasTexture(bristle);
    bt.wrapS = THREE.RepeatWrapping;
    bt.repeat.set(3, 1);
    const brushMat = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9 });
    this.brushes = [-1, 1].map((s) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.3, 16), brushMat);
      m.position.set(s * (W / 2 - 0.6), 1.25, 0);
      g.add(m);
      return m;
    });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, W - 0.6, 16).rotateZ(Math.PI / 2), brushMat);
    top.position.y = 2.75;
    g.add(top);
    this.top = top;
    this.group = g;
    this.scene.add(g);
    // marcador azul donde se para el auto
    this.mesh = makeMarker();
    this.mesh.userData.tube.material.color.set(0x2196f3);
    this.mesh.userData.ring.material.color.set(0x90caf9);
    this.mesh.scale.set(2.2, 1.4, 2.2);
    this.mesh.position.set(this.x, 0.15, this.z);
    this.scene.add(this.mesh);
  }

  update(dt, world) {
    if (this.x == null) return;
    const { player: P, police, hud, audio, fx } = world;
    const v = P.vehicle;
    const d = v ? Math.hypot(this.x - v.x, this.z - v.z) : 99;
    this.mesh.visible = this.state === 'idle' && Math.hypot(this.x - P.x, this.z - P.z) < 180;
    if (this.state === 'wash') {
      this.t += dt;
      const k = this.t / WASH_T;
      // el auto quieto y los rodillos girando, yendo y viniendo a lo largo
      if (v) {
        v.speed = 0;
        v.vx = v.vz = 0;
      }
      const along = Math.sin(k * Math.PI * 2) * 1.6;
      for (const b of this.brushes) {
        b.rotation.y += dt * 14;
        b.position.z = along;
      }
      this.top.rotation.x += dt * 12;
      this.top.position.z = along;
      // espuma y agua
      if (Math.random() < dt * 30) {
        const s = R.chance(0.5) ? 1 : -1;
        const px = this.x + this.dz * s * 1.2 + this.dx * along;
        const pz = this.z - this.dx * s * 1.2 + this.dz * along;
        fx.dust(px, R.range(0.4, 1.6), pz, 2, [0.95, 0.97, 1], 0.8);
        fx.spray(px, pz, -this.dz * s * 1.5, this.dx * s * 1.5, 1.4);
      }
      if (this.t >= WASH_T) this.finish(world, v);
      return;
    }
    for (const b of this.brushes) b.rotation.y += dt * 1.5;
    if (d > 7) this.used = false;
    if (!v || v.kind === 'moto' || v.kind === 'bus' || this.used || d > 3.2 || Math.abs(v.speed) > 3) return;
    this.used = true;
    if (P.money < COST) {
      hud.flash('LAVADERO', `Son $${COST} y no te alcanza`, 'bad', 2.2);
      return;
    }
    P.addMoney(-COST);
    this.state = 'wash';
    this.t = 0;
    audio.plata();
    audio.tone?.([180, 140, 180], 0.9, 'sawtooth', 0.05);
    hud.flash('LAVADERO', 'Quedate quieto que te lo dejamos reluciente', 'ok', 2);
    this.stars0 = police.stars;
  }

  finish(world, v) {
    const { police, hud, audio } = world;
    this.state = 'idle';
    for (const b of this.brushes) b.position.z = 0;
    this.top.position.z = 0;
    if (v && !['taxi', 'remis', 'patrullero'].includes(v.model)) {
      let mat = null;
      v.mesh.traverse((o) => {
        if (o.userData.paint) o.material = mat ??= paintMat(R.pick(CAR_COLORS.filter((c) => c !== o.material.color.getHex())));
      });
    }
    audio.plata();
    if (police.stars > 0 && police.stars <= 2) {
      police.clear();
      hud.flash('LAVADERO', 'Reluciente y de otro color: la cana ya no te reconoce', 'ok', 2.8);
    } else if (police.stars > 2) hud.flash('LAVADERO', 'Reluciente... pero con tantas estrellas no te salva ni el lavadero', 'warn', 2.8);
    else hud.flash('LAVADERO', 'Quedó reluciente', 'ok', 2.4);
  }
}
