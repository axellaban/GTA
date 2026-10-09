// Canastos de basura de la calle que se rompen (pedido del dueño: no fijos). Siguen dibujándose todos juntos
// (instancias de src/props.js); al romper uno, su instancia se esconde y salen piezas sueltas:
// - un auto lo lleva puesto: el caño se dobla hasta el piso, el canasto sale volando dando vueltas y la
//   bolsa revienta y desparrama la basura;
// - una piña, una patada, un palazo o un tiro: el canasto se suelta del caño y cae (el caño queda);
// - una explosión: todo vuela.
// Las piezas caen con gravedad, rebotan, ruedan y quedan en el piso.
import * as THREE from 'three';

const G = 9.8;
const POST_H = 1.2; // del piso de la vereda al centro del canasto
const BASE = 0.15; // la vereda
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const AXIS = new THREE.Vector3();
// la basura: papeles, bolsitas, latas, botellas (colores de lo que hay en un canasto del conurbano)
const BASURA = [[0.92, 0.9, 0.85], [0.75, 0.72, 0.65], [0.85, 0.2, 0.15], [0.2, 0.45, 0.25], [0.95, 0.85, 0.3], [0.12, 0.12, 0.13], [0.6, 0.75, 0.9]];
const rnd = (a, b) => a + Math.random() * (b - a);

export const CANASTOS = {
  list: [],
  loose: [],
  bending: [],
  scene: null,
  inst: null,
  // props.js: los canastos y sus instancias (caño, canasto, bolsa)
  init(scene, post, basket, bag, list) {
    this.scene = scene;
    this.inst = { post, basket, bag };
    this.list = list.map(([x, z, full, rot, i, j]) => ({ x, z, full, rot, i, j, hp: 2, down: false, loose: false }));
  },
  near(x, z, r) {
    return this.list.filter((c) => !c.loose && Math.abs(c.x - x) < r + 0.5 && Math.abs(c.z - z) < r + 0.5 && Math.hypot(c.x - x, c.z - z) < r + 0.4);
  },
  hide(inst, i) {
    if (!inst || i == null || i < 0) return;
    inst.setMatrixAt(i, hidden);
    inst.instanceMatrix.needsUpdate = true;
  },
  // el marco de hierro y el caño vienen en la misma malla (canasto_marco de tools/blender/canasto.py): se
  // separan las piezas (cada caja o tubo, por sus vértices compartidos) y las que bajan del fondo del canasto
  // (el caño, la placa y la ménsula) quedan plantadas; el resto (aro, esquineros y fondo) se va con el canasto
  parts() {
    const { post, basket } = this.inst;
    const pos = post.geometry.attributes.position;
    if (this.split?.n === pos.count && this.split.src === pos) return this.split;
    basket.geometry.computeBoundingBox();
    const cut = basket.geometry.boundingBox.min.y - 0.02;
    const g = post.geometry.index ? post.geometry.toNonIndexed() : post.geometry;
    const attrs = Object.keys(g.attributes);
    const P = g.attributes.position;
    const nt = P.count / 3;
    // unión de triángulos que comparten un vértice (por posición)
    const up = new Int32Array(nt).map((_, i) => i);
    const root = (i) => {
      while (up[i] !== i) i = up[i] = up[up[i]];
      return i;
    };
    const seen = new Map();
    for (let v = 0; v < P.count; v++) {
      const key = `${Math.round(P.getX(v) * 1e4)},${Math.round(P.getY(v) * 1e4)},${Math.round(P.getZ(v) * 1e4)}`;
      const t = (v / 3) | 0;
      const o = seen.get(key);
      if (o === undefined) seen.set(key, t);
      else up[root(t)] = root(o);
    }
    const minY = new Map();
    for (let v = 0; v < P.count; v++) {
      const r = root((v / 3) | 0);
      minY.set(r, Math.min(minY.get(r) ?? Infinity, P.getY(v)));
    }
    const frame = Object.fromEntries(attrs.map((k) => [k, []]));
    const cano = Object.fromEntries(attrs.map((k) => [k, []]));
    for (let t = 0; t < nt; t++) {
      const dst = minY.get(root(t)) < cut ? cano : frame;
      for (const k of attrs) {
        const a = g.attributes[k];
        for (let v = t * 3; v < t * 3 + 3; v++) for (let c = 0; c < a.itemSize; c++) dst[k].push(a.array[v * a.itemSize + c]);
      }
    }
    const build = (d) => {
      if (!d.position.length) return null;
      const out = new THREE.BufferGeometry();
      for (const k of attrs) {
        const a = g.attributes[k];
        out.setAttribute(k, new THREE.BufferAttribute(new a.array.constructor(d[k]), a.itemSize, a.normalized));
      }
      return out;
    };
    this.split = { n: pos.count, src: pos, frame: build(frame), cano: build(cano) };
    return this.split;
  },
  // una pieza suelta (una o más mallas) en el mismo lugar que la instancia
  piece(meshes, x, y, z, rot, o = {}) {
    const m = new THREE.Group();
    for (const [geo, mat] of meshes) {
      if (!geo) continue;
      const k = new THREE.Mesh(geo, mat);
      k.castShadow = true;
      m.add(k);
    }
    m.position.set(x, y, z);
    m.rotation.set(0, rot, 0);
    this.scene.add(m);
    const p = { m, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, w: new THREE.Vector3(o.wx ?? 0, o.wy ?? 0, o.wz ?? 0), r: o.r ?? 0.22, rest: false, bag: !!o.bag, t: 0 };
    this.loose.push(p);
    return p;
  },
  // el caño solo, parado donde estaba (cuando se le cae el canasto)
  cano(c) {
    if (c.cano) return c.cano;
    const { post } = this.inst;
    this.hide(post, c.i);
    const m = new THREE.Mesh(this.parts().cano || post.geometry, post.material);
    m.castShadow = true;
    m.position.set(c.x, BASE + POST_H, c.z);
    m.rotation.y = c.rot;
    this.scene.add(m);
    c.cano = m;
    return m;
  },
  // se suelta el canasto (y la bolsa, si tenía): (fx, fz) hacia dónde lo empujan, k: cuánta fuerza
  drop(c, fx, fz, k, world) {
    if (c.loose) return;
    c.loose = true;
    const { basket, bag, post } = this.inst;
    this.hide(basket, c.i);
    // (si el caño sigue parado, queda solo; si se dobló, ya está aparte)
    if (!c.down) this.cano(c);
    const y = BASE + POST_H;
    this.piece([[basket.geometry, basket.material], [this.parts().frame, post.material]], c.x, y, c.z, c.rot, { vx: fx * k, vy: 1.2 + k * 0.35, vz: fz * k, wx: rnd(-1, 1) * k * 1.5, wy: rnd(-1, 1) * 2, wz: rnd(-1, 1) * k * 1.5, r: 0.24 });
    if (c.full && c.j >= 0) {
      this.hide(bag, c.j);
      this.piece([[bag.geometry, bag.material]], c.x, y + 0.05, c.z, 0, { vx: fx * k * 0.8 + rnd(-0.6, 0.6), vy: 1.5 + k * 0.3, vz: fz * k * 0.8 + rnd(-0.6, 0.6), wx: rnd(-3, 3), wz: rnd(-3, 3), r: 0.2, bag: true });
    }
    // la basura que tenía adentro sale volando
    this.basura(world, c.x, y, c.z, fx * k * 0.6, fz * k * 0.6, c.full ? 16 : 7);
    world.audio?.metal?.(0.35 + Math.min(0.5, k * 0.06));
    world.audio?.burst?.(0.25, 1800, 'bandpass', 0.12, 0, 0.8);
  },
  basura(world, x, y, z, vx, vz, n) {
    const fx = world.fx;
    if (!fx) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.8, 3.2);
      const c = BASURA[(Math.random() * BASURA.length) | 0];
      // papeles y latas: caen, rebotan y quedan un rato en el piso
      fx.alpha.add({ x: x + rnd(-0.2, 0.2), y: y + rnd(-0.1, 0.2), z: z + rnd(-0.2, 0.2), vx: vx + Math.cos(a) * sp, vy: rnd(1, 3.5), vz: vz + Math.sin(a) * sp, grav: -9.8, drag: rnd(0.4, 1.6), life: 0, max: rnd(25, 40), s0: rnd(0.07, 0.13), s1: rnd(0.07, 0.12), c0: c, a: 1 });
    }
  },
  // el caño se dobla hasta el piso (como los carteles de las esquinas)
  bend(c, fx, fz, speed) {
    if (c.down) return;
    c.down = true;
    const g = new THREE.Group();
    g.position.set(c.x, BASE, c.z);
    const m = this.cano(c);
    m.position.set(0, POST_H, 0);
    g.add(m);
    this.scene.add(g);
    this.bending.push({ g, dx: fx, dz: fz, a: 0.12, w: Math.min(4, 1 + speed * 0.15), stop: rnd(1.25, 1.45) });
  },
  // un auto lo lleva puesto (el colisionador del caño): (vx, vz) velocidad del auto
  knock(box, vx, vz, world) {
    const c = this.list[box.canasto];
    if (!c || c.down) return false;
    box.x = box.z = 1e6;
    const sp = Math.hypot(vx, vz) || 1;
    const fx = vx / sp;
    const fz = vz / sp;
    this.bend(c, fx, fz, sp);
    this.drop(c, fx, fz, Math.min(9, 2 + sp * 0.45), world);
    world.fx?.sparks?.(c.x, 0.5, c.z, 8, 4);
    world.audio?.golpe?.(0.5);
    return true;
  },
  // un golpe (piña, patada, palo) o un tiro en (x, z): el canasto se suelta; (fx, fz) hacia dónde empuja
  hit(x, z, r, fx, fz, world, force = 3) {
    let any = false;
    for (const c of this.near(x, z, r)) {
      c.hp -= force > 5 ? 2 : 1;
      if (c.hp > 0) {
        // primer golpe: se sacude y suena
        world.audio?.metal?.(0.25);
        continue;
      }
      this.drop(c, fx, fz, force, world);
      any = true;
    }
    return any;
  },
  // una explosión: todo vuela
  blast(x, z, r, world) {
    for (const c of this.near(x, z, r)) {
      const d = Math.hypot(c.x - x, c.z - z) || 1;
      const k = (1 - d / (r + 0.5)) * 10 + 3;
      const fx = (c.x - x) / d;
      const fz = (c.z - z) / d;
      this.bend(c, fx, fz, k);
      this.drop(c, fx, fz, k, world);
    }
  },
  // para los tiros (src/combat.js): ¿pega en un canasto?
  shootables() {
    return this.list.filter((c) => !c.loose);
  },
  update(dt, world) {
    for (const b of this.bending) {
      if (b.done) continue;
      // caño que se dobla: cae como un palo, más rápido cuanto más inclinado
      b.w += ((3 * G) / (2 * 1.4)) * Math.sin(b.a) * dt;
      b.a += b.w * dt;
      if (b.a >= b.stop) {
        b.a = b.stop;
        b.done = true;
        world.audio?.metal?.(0.4);
      }
      b.g.quaternion.setFromAxisAngle(AXIS.set(b.dz, 0, -b.dx), b.a);
    }
    for (const p of this.loose) {
      if (p.rest) continue;
      p.t += dt;
      p.vy -= G * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      e.set(p.w.x * dt, p.w.y * dt, p.w.z * dt);
      q.setFromEuler(e);
      p.m.quaternion.premultiply(q);
      const floor = BASE + p.r * 0.6;
      if (p.m.position.y < floor) {
        p.m.position.y = floor;
        if (p.vy < -2.5) {
          world.audio?.metal?.(p.bag ? 0.05 : Math.min(0.4, -p.vy * 0.05));
          if (p.bag && !p.burst) {
            // la bolsa revienta al pegar contra el piso
            p.burst = true;
            this.basura(world, p.m.position.x, BASE + 0.2, p.m.position.z, p.vx * 0.3, p.vz * 0.3, 14);
            p.m.scale.set(1.25, 0.45, 1.15);
          }
        }
        p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.3 : 0;
        // rozamiento contra la vereda: rueda y se frena
        const f = Math.exp(-dt * 4);
        p.vx *= f;
        p.vz *= f;
        p.w.multiplyScalar(Math.exp(-dt * 3));
        if (Math.hypot(p.vx, p.vz) < 0.15 && Math.abs(p.vy) < 0.1) {
          // queda apoyado: de costado (o la bolsa, aplastada)
          p.rest = true;
          if (!p.bag) {
            // (0,6 de ancho, 0,35 de alto y 0,45 de fondo: según de qué lado cae, a qué altura queda el centro)
            const yaw = new THREE.Euler().setFromQuaternion(p.m.quaternion, 'YXZ').y;
            const lado = Math.random();
            const rx = lado < 0.4 ? Math.PI / 2 : 0;
            const rz = lado >= 0.4 && lado < 0.7 ? Math.PI / 2 : 0;
            p.m.quaternion.setFromEuler(new THREE.Euler(rx, yaw, rz, 'YXZ'));
            p.m.position.y = BASE + (rx ? 0.225 : rz ? 0.3 : 0.175);
          }
        }
      }
      // contra una pared no pasa
      const pt = { x: p.m.position.x, z: p.m.position.z };
      if (world.colliders?.resolveCircle(pt, p.r)) {
        p.m.position.x = pt.x;
        p.m.position.z = pt.z;
        p.vx *= -0.3;
        p.vz *= -0.3;
      }
    }
    // (muchas piezas quietas: las más viejas se van)
    if (this.loose.length > 60) {
      const old = this.loose.shift();
      this.scene.remove(old.m);
      // (la geometría es compartida con las instancias: no se libera)
    }
  },
};
