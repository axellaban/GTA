// El final del juego (la última misión, cuando ganaste todas): en la terraza de la torre del tobogán baja
// una luz dorada; te metés y subís al cielo, a una nube enorme arriba de Temperley. En la otra punta
// te espera el Comandante (pelo platinado, bronceado, traje blanco y lentes negros) y se dan un abrazo.
// Después, los créditos y de vuelta a la terraza: el juego sigue.
import * as THREE from 'three';
import { makeHuman, animateHuman } from './human.js';
import { makeStar, swapHuman } from './people.js';
import { roofWalkway } from './physics.js';
import { R } from './rng.js';

const HY = 420; // altura de la nube
const LEN = 56; // largo de la nube
const WID = 16;

const LINES = {
  llega: ['¡Gaspiii! ¡Viniste, papi!', '¡Miameee! Te estaba esperando', 'Acá arriba está todo bien, Gaspi'],
  abrazo: ['Vení, dame un abrazo', 'Para mí... para vos...', 'Sos un fenómeno, Gaspi'],
};

export class Cielo {
  constructor(scene, city, tobogan) {
    this.scene = scene;
    this.city = city;
    // la nube va arriba de la torre del tobogán (o de la estación si no está)
    const t = tobogan?.t;
    const base = t ? t.at(t.L / 2, t.Dp / 2, t.H) : new THREE.Vector3(0, 0, 0);
    this.base = base;
    this.roofY = t ? t.H : 0;
    // eje de la nube: hacia el norte
    this.ux = 0;
    this.uz = -1;
    this.start = { x: base.x, z: base.z };
    this.fortAt = { x: base.x + this.ux * (LEN - 8), z: base.z + this.uz * (LEN - 8) };
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.buildCloud();
    this.buildBeam();
    this.state = 'off';
    this.bubble = null;
  }

  // la nube: muchas bolas blancas aplastadas; arriba se camina
  buildCloud() {
    const g = this.group;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa4b8, emissiveIntensity: 0.35 });
    const N = 170;
    const inst = new THREE.InstancedMesh(geo, mat, N + 120);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let i = 0;
    const put = (x, y, z, s, sy) => {
      pos.set(x, y, z);
      sc.set(s, s * sy, s);
      m4.compose(pos, q, sc);
      inst.setMatrixAt(i++, m4);
    };
    const rx = -this.uz;
    const rz = this.ux;
    // el piso de la nube
    for (let k = 0; k < N; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const along = (0.5 + Math.cos(a) * r * 0.5) * LEN;
      const side = Math.sin(a) * r * (WID / 2) * (0.6 + 0.4 * Math.sin((along / LEN) * Math.PI));
      const s = R.range(2.2, 4.6);
      put(this.start.x + this.ux * along + rx * side, HY - s * 0.55, this.start.z + this.uz * along + rz * side, s, 0.6);
    }
    // nubes sueltas alrededor y abajo
    for (let k = 0; k < 120; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = R.range(40, 260);
      const s = R.range(4, 14);
      put(this.base.x + Math.cos(a) * d, HY + R.range(-90, 30), this.base.z + Math.sin(a) * d - LEN / 2, s, R.range(0.35, 0.6));
    }
    inst.count = i;
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    // por dónde se camina (óvalo) y bordes invisibles para no caerse
    const ring = [];
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      const along = (0.5 + Math.cos(a) * 0.5) * LEN;
      const side = Math.sin(a) * (WID / 2 - 2) * (0.55 + 0.45 * Math.sin((along / LEN) * Math.PI));
      ring.push([this.start.x + this.ux * along + rx * side, this.start.z + this.uz * along + rz * side]);
    }
    this.ring = ring;
    this.walk = roofWalkway(ring, HY);
    this.rails = [];
    // rayos de sol dorados
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (let k = 0; k < 7; k++) {
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 6, 140, 12, 1, true), rayMat);
      ray.position.set(this.fortAt.x + R.range(-10, 10), HY + 70, this.fortAt.z + R.range(-12, 6));
      ray.rotation.z = R.range(-0.25, 0.25);
      ray.rotation.x = R.range(-0.2, 0.2);
      g.add(ray);
    }
    // el Comandante: el de MakeHuman (traje blanco, platinado, anteojos y cadenita) o, si todavía no
    // cargó, uno hecho por código con sus anteojos y su cadenita (y se cambia en update)
    const h = makeStar('comandante') || this.plainFort();
    h.root.position.set(this.fortAt.x, HY, this.fortAt.z);
    h.root.rotation.y = Math.atan2(-this.ux, -this.uz);
    g.add(h.root);
    this.fort = h;
    this.fortPos = { x: this.fortAt.x, z: this.fortAt.z };
    // un resplandor detrás
    const halo = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.set(this.fortAt.x + this.ux * 3.5, HY + 2.4, this.fortAt.z + this.uz * 3.5);
    halo.rotation.y = Math.atan2(-this.ux, -this.uz);
    g.add(halo);
    this.halo = halo;
  }

  // la luz dorada que baja en la terraza
  buildBeam() {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 400, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    m.position.set(this.base.x, this.roofY + 200, this.base.z);
    m.visible = false;
    this.scene.add(m);
    this.beamMesh = m;
    this.beam = { x: this.base.x, z: this.base.z };
  }

  say(text, t = 3.2) {
    this.bubble = { text, t };
  }

  beamOn() {
    this.beamMesh.visible = true;
    this.state = 'beam';
  }
  inBeam(P) {
    return Math.hypot(P.x - this.beam.x, P.z - this.beam.z) < 1.7 && P.y > this.roofY - 1;
  }

  // sube: fundido a blanco y aparece en la punta de la nube
  ascend(world) {
    const P = world.player;
    this.state = 'up';
    this.group.visible = true;
    this.beamMesh.visible = false;
    if (!this.city.walkways.includes(this.walk)) this.city.walkways.push(this.walk);
    if (!this.rails.length) {
      const C = this.city.colliders;
      for (let k = 0; k < this.ring.length; k++) {
        const [ax, az] = this.ring[k];
        const [bx, bz] = this.ring[(k + 1) % this.ring.length];
        this.rails.push(C.add3d(ax, az, bx, bz, HY, 3));
      }
    }
    for (const r of this.rails) r.gone = false;
    const fade = this.fade();
    fade.style.background = '#fffbe8';
    fade.style.opacity = '1';
    this.saved = { hour: world.time.hour };
    setTimeout(() => {
      P.x = this.start.x + this.ux * 4;
      P.z = this.start.z + this.uz * 4;
      P.y = HY;
      P.vy = 0;
      P.heading = Math.atan2(this.ux, this.uz);
      P.camYaw = P.heading + Math.PI;
      world.time.hour = 18.4; // el cielo, siempre al atardecer
      fade.style.opacity = '0';
      world.hud.flash('EL CIELO', 'Arriba de todo, arriba de una nube', 'ok', 3.5);
      setTimeout(() => this.say(R.pick(LINES.llega), 3.5), 1500);
    }, 1200);
  }

  fade() {
    if (!this.fadeEl) {
      this.fadeEl = document.createElement('div');
      Object.assign(this.fadeEl.style, { position: 'fixed', inset: '0', background: '#fffbe8', opacity: '0', pointerEvents: 'none', transition: 'opacity 1.1s', zIndex: '45' });
      document.body.appendChild(this.fadeEl);
    }
    return this.fadeEl;
  }

  near(P) {
    return this.state === 'up' && Math.hypot(P.x - this.fortPos.x, P.z - this.fortPos.z) < 2.4;
  }

  // el abrazo: los dos se acercan, la cámara da la vuelta despacio
  hug(world) {
    const P = world.player;
    this.state = 'hug';
    this.hugT = 0;
    this.hugDone = false;
    P.cutscene = true;
    P.attack = null;
    const dx = P.x - this.fortPos.x;
    const dz = P.z - this.fortPos.z;
    const d = Math.hypot(dx, dz) || 1;
    // Gaspi a medio metro, de frente
    P.x = this.fortPos.x + (dx / d) * 0.52;
    P.z = this.fortPos.z + (dz / d) * 0.52;
    P.y = HY;
    P.heading = Math.atan2(-dx, -dz);
    this.fort.root.rotation.y = Math.atan2(dx, dz);
    this.say(R.pick(LINES.abrazo), 3);
    world.audio.tone?.([523, 659, 784, 1047], 1.2, 'sine', 0.12);
  }

  // los brazos alrededor del otro (sobre la pose quieta)
  hugPose(h, k) {
    const b = h.bones;
    if (!b.uaR) return;
    b.uaR.rotation.set(-1.25 * k, -0.25 * k, 0.75 * k);
    b.uaL.rotation.set(-1.25 * k, 0.25 * k, -0.75 * k);
    b.faR.rotation.set(-0.9 * k, 0, 0);
    b.faL.rotation.set(-0.9 * k, 0, 0);
    b.spine.rotation.x += 0.08 * k;
    b.head.rotation.y += 0.35 * k;
  }

  // la cámara del abrazo: da la vuelta alrededor de los dos
  camera(cam) {
    if (this.state !== 'hug') return false;
    const a = 0.6 + this.hugT * 0.35;
    const cx = (this.fortPos.x + this.px) / 2;
    const cz = (this.fortPos.z + this.pz) / 2;
    cam.position.set(cx + Math.sin(a) * 4.2, HY + 2.1, cz + Math.cos(a) * 4.2);
    cam.lookAt(cx, HY + 1.45, cz);
    return true;
  }

  plainFort() {
    const h = makeHuman({ skin: 0xc98654, hair: 0xf4ead0, hairStyle: 'side', shirt: 0xffffff, jacket: 0xfafafa, pants: 0xf5f5f5, shoes: 0xf0f0f0, muscle: true, scale: 1.03 });
    // lentes negros
    const shades = new THREE.Group();
    const lens = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.8 });
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.032, 0.012), lens);
      l.position.set(s * 0.032, 0, 0);
      shades.add(l);
    }
    shades.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.008, 0.008), lens));
    shades.position.set(0, 0.118, 0.12);
    h.bones.head.add(shades);
    // cadenita de oro
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.008, 6, 20), new THREE.MeshStandardMaterial({ color: 0xffcf40, roughness: 0.25, metalness: 1 }));
    chain.rotation.x = Math.PI / 2.3;
    chain.position.set(0, -0.03, 0.05);
    h.bones.neck.add(chain);
    h.plainParts = [shades, chain];
    return h;
  }

  update(dt, world) {
    // el Comandante hecho por código pasa al de MakeHuman apenas cargan los modelos
    if (this.fort?.plainParts) {
      const h = makeStar('comandante');
      if (h) {
        for (const o of this.fort.plainParts) o.removeFromParent();
        this.fort = swapHuman(this.fort, h);
      }
    }
    if (this.bubble) {
      this.bubble.t -= dt;
      if (this.bubble.t <= 0) this.bubble = null;
    }
    if (this.beamMesh.visible) this.beamMesh.material.opacity = 0.25 + Math.sin(performance.now() / 300) * 0.07;
    if (!this.group.visible) return;
    const P = world.player;
    this.px = P.x;
    this.pz = P.z;
    // el Comandante: quieto, saluda cuando Gaspi se acerca
    const d = Math.hypot(P.x - this.fortPos.x, P.z - this.fortPos.z);
    if (this.state === 'hug') {
      this.hugT += dt;
      const k = Math.min(1, this.hugT / 0.8);
      animateHuman(this.fort, dt, 0, 'idle');
      this.hugPose(this.fort, k);
      this.fort.rig?.apply();
      animateHuman(P.h, dt, 0, 'idle');
      this.hugPose(P.h, k);
      P.h.rig?.apply();
      P.h.root.position.set(P.x, P.y, P.z);
      P.h.root.rotation.y = P.heading;
      if (Math.random() < dt * 14) world.fx.dust(this.fortPos.x + R.range(-1.5, 1.5), HY + R.range(0.5, 2.6), this.fortPos.z + R.range(-1.5, 1.5), 2, [1, 0.85, 0.4], 1.2);
      if (this.hugT > 2.6 && !this.said2) {
        this.said2 = true;
        this.say('Te quiero, Gaspi. Seguí brillando allá abajo', 3.5);
      }
      if (this.hugT > 6.5) this.hugDone = true;
    } else {
      animateHuman(this.fort, dt, 0, d < 12 ? 'wave' : 'idle');
      if (d < 30) this.fort.root.rotation.y = Math.atan2(P.x - this.fortPos.x, P.z - this.fortPos.z);
    }
    this.halo.material.opacity = (this.state === 'hug' ? 0.08 : 0.2) + Math.sin(performance.now() / 500) * 0.05;
  }

  // los créditos y la vuelta a la terraza
  ending(world) {
    const P = world.player;
    this.state = 'end';
    P.cutscene = false;
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: 'radial-gradient(circle, rgba(255,236,170,0.92), rgba(255,190,110,0.96))', color: '#3a2410', fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", textAlign: 'center', zIndex: '46', opacity: '0', transition: 'opacity 1.2s', pointerEvents: 'none', padding: '16px' });
    el.innerHTML = '<div style="font-size:clamp(40px,9vw,96px);font-weight:900;letter-spacing:2px">FIN</div><div style="font-size:clamp(20px,4vw,34px)">Gaspi y el Comandante, para siempre</div><div style="font-size:clamp(16px,3vw,24px);opacity:0.85">GTA VI Conurba · Temperley · Gracias por jugar</div><div style="font-size:clamp(14px,2.6vw,20px);opacity:0.75">El barrio te sigue esperando: seguí jugando libre</div>';
    document.body.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
    setTimeout(() => {
      el.style.opacity = '0';
      // de vuelta a la terraza de la torre
      P.x = this.base.x + 3;
      P.z = this.base.z;
      P.y = this.roofY;
      P.vy = 0;
      this.group.visible = false;
      for (const r of this.rails) r.gone = true;
      const i = this.city.walkways.indexOf(this.walk);
      if (i >= 0) this.city.walkways.splice(i, 1);
      this.state = 'off';
      this.said2 = false;
      setTimeout(() => el.remove(), 1400);
    }, 7000);
  }
}
