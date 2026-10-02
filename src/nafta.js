// Estación de servicio: la Shell de Av. Eva Perón y Almirante Brown (datos en NAFTA, src/map.js).
// Marquesinas sobre columnas (los dos techos que trae OSM), islas con surtidores, el cartel alto con
// los precios y luces blancas que se prenden de noche. Como en GTA, los surtidores explotan si les
// tirás, si les cae una explosión o si los chocás fuerte, y uno prende al de al lado.
// (Del nombre real solo va el texto, sin el logo: regla 1 de PLAN.md.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NAFTA } from './map.js';

const TOP = 5.6; // altura del techo de la marquesina
const THICK = 0.8;

function inRing(r, x, z) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// rectángulo orientado: dirección del lado más largo, centro y medidas
function oriented(r) {
  let ux = 1;
  let uz = 0;
  let best = 0;
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i];
    const [bx, bz] = r[(i + 1) % r.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l > best) {
      best = l;
      ux = (bx - ax) / l;
      uz = (bz - az) / l;
    }
  }
  let a0 = Infinity;
  let a1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (const [x, z] of r) {
    const a = x * ux + z * uz;
    const b = -x * uz + z * ux;
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    b0 = Math.min(b0, b);
    b1 = Math.max(b1, b);
  }
  const am = (a0 + a1) / 2;
  const bm = (b0 + b1) / 2;
  return { cx: ux * am - uz * bm, cz: uz * am + ux * bm, ux, uz, nx: -uz, nz: ux, len: a1 - a0, wid: b1 - b0 };
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// cartel alto: el nombre arriba y los precios abajo (pesos por litro, inventados)
function totemTexture(name) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#f6c90e';
    g.fillRect(0, 0, w, 230);
    g.fillStyle = '#d71920';
    g.fillRect(0, 196, w, 34);
    g.fillStyle = '#d71920';
    g.font = '900 78px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name.toUpperCase(), w / 2, 104, w - 24);
    g.fillStyle = '#16181c';
    g.fillRect(0, 230, w, h - 230);
    const rows = [['V-POWER', '1.389'], ['SÚPER', '1.219'], ['DIÉSEL', '1.264'], ['GNC', '689']];
    rows.forEach(([n, p], i) => {
      const y = 274 + i * 60;
      g.fillStyle = '#f4f4f4';
      g.font = 'bold 30px "Arial Narrow", Arial, sans-serif';
      g.textAlign = 'left';
      g.fillText(n, 16, y);
      g.fillStyle = '#ffb300';
      g.font = 'bold 40px "Courier New", monospace';
      g.textAlign = 'right';
      g.fillText(p, w - 14, y);
    });
  });
}

export class Nafta {
  constructor(scene, colliders) {
    this.pumps = [];
    this.lights = []; // manchas de luz blanca para el mapa de faroles (de noche)
    this.burning = [];
    if (!NAFTA) return;
    this.x = NAFTA.totem.x;
    this.z = NAFTA.totem.z;
    const white = new THREE.MeshStandardMaterial({ color: 0xf1f2f0, roughness: 0.55, metalness: 0.1 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd71920, roughness: 0.45, metalness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6 });
    const curb = new THREE.MeshLambertMaterial({ color: 0xb9b5aa });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xe9f0ff });
    const fascia = new THREE.MeshLambertMaterial({
      map: canvasTex(4, 64, (g) => {
        g.fillStyle = '#f6c90e';
        g.fillRect(0, 0, 4, 44);
        g.fillStyle = '#d71920';
        g.fillRect(0, 44, 4, 20);
      }),
    });
    const g = new THREE.Group();
    const roofs = [];
    const bands = [];
    const glows = [];
    const cols = [];
    for (const r of NAFTA.roofs) {
      const shape = new THREE.Shape(r.map(([x, z]) => new THREE.Vector2(x, z)));
      const slab = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false });
      slab.rotateX(Math.PI / 2);
      slab.translate(0, TOP, 0);
      roofs.push(slab);
      // el panel de luz de abajo (mira hacia el piso)
      const under = new THREE.ShapeGeometry(shape);
      under.rotateX(Math.PI / 2);
      under.translate(0, TOP - THICK - 0.02, 0);
      glows.push(under);
      // la banda amarilla y roja alrededor
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i];
        const [bx, bz] = r[(i + 1) % r.length];
        const l = Math.hypot(bx - ax, bz - az);
        if (l < 0.3) continue;
        const b = new THREE.BoxGeometry(l + 0.12, 0.95, 0.1);
        b.rotateY(-Math.atan2(bz - az, bx - ax));
        // del lado de afuera del techo
        let ox = (bz - az) / l;
        let oz = -(bx - ax) / l;
        if (inRing(r, (ax + bx) / 2 + ox * 0.5, (az + bz) / 2 + oz * 0.5)) {
          ox = -ox;
          oz = -oz;
        }
        b.translate((ax + bx) / 2 + ox * 0.06, TOP - 0.43, (az + bz) / 2 + oz * 0.06);
        bands.push(b);
      }
      // islas con surtidores a lo largo del techo, y las columnas en las puntas de cada isla
      const o = oriented(r);
      const lanes = o.wid > 11 ? [-0.25, 0.25] : [0];
      for (const k of lanes) {
        const ix = o.cx + o.nx * o.wid * k;
        const iz = o.cz + o.nz * o.wid * k;
        if (!inRing(r, ix, iz)) continue;
        const il = Math.min(6, o.len * 0.45);
        const isl = new THREE.Mesh(new THREE.BoxGeometry(il, 0.22, 1.2), curb);
        isl.position.set(ix, 0.11, iz);
        isl.rotation.y = -Math.atan2(o.uz, o.ux);
        isl.receiveShadow = true;
        g.add(isl);
        for (const s of [-1, 1]) {
          const px = ix + o.ux * s * il * 0.22;
          const pz = iz + o.uz * s * il * 0.22;
          this.addPump(g, px, pz, o, white, red, dark, colliders);
          const cx = ix + o.ux * s * (il / 2 + 0.2);
          const cz = iz + o.uz * s * (il / 2 + 0.2);
          if (inRing(r, cx, cz)) {
            const c = new THREE.BoxGeometry(0.45, TOP - THICK, 0.45);
            c.translate(cx, (TOP - THICK) / 2, cz);
            cols.push(c);
            colliders.addCircle(cx, cz, 0.32, TOP, 'column');
          }
        }
        this.lights.push({ x: ix, z: iz, r: 7 });
      }
    }
    const roofMesh = new THREE.Mesh(mergeGeometries(roofs), white);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    const bandMesh = new THREE.Mesh(mergeGeometries(bands), fascia);
    const glowMesh = new THREE.Mesh(mergeGeometries(glows), this.glowMat);
    g.add(roofMesh, bandMesh, glowMesh);
    if (cols.length) {
      const cm = new THREE.Mesh(mergeGeometries(cols), white);
      cm.castShadow = true;
      g.add(cm);
    }
    // cartel alto en la esquina, con el nombre y los precios de los dos lados
    const T = NAFTA.totem;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7.6, 0.45), new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 0.6, roughness: 0.4 }));
    pole.position.set(T.x, 3.8, T.z);
    pole.castShadow = true;
    this.totemMat = new THREE.MeshLambertMaterial({ map: totemTexture(NAFTA.name), emissiveMap: null, emissive: 0x000000 });
    this.totemMat.emissiveMap = this.totemMat.map;
    this.totemMat.emissive.set(0xffffff);
    this.totemMat.emissiveIntensity = 0;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.8, 0.36), [dark, dark, dark, dark, this.totemMat, this.totemMat]);
    panel.position.set(T.x, 7.4, T.z);
    panel.rotation.y = T.face;
    panel.castShadow = true;
    g.add(pole, panel);
    colliders.addCircle(T.x, T.z, 0.4, 8, 'column');
    scene.add(g);
    this.group = g;
  }

  addPump(g, x, z, o, white, red, dark, colliders) {
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.55, 0.5), white);
    body.position.y = 0.22 + 0.78;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.34, 0.56), red);
    head.position.y = 0.22 + 1.72;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.52), dark);
    screen.position.y = 0.22 + 1.25;
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), dark);
    hose.position.set(0.44, 0.22 + 0.9, 0);
    p.add(body, head, screen, hose);
    p.position.set(x, 0, z);
    p.rotation.y = -Math.atan2(o.uz, o.ux);
    p.traverse((m) => m.isMesh && (m.castShadow = true));
    g.add(p);
    const col = colliders.addCircle(x, z, 0.5, 2, 'pump');
    const pump = { x, z, hp: 60, mesh: p, col, fuse: 0, dead: false };
    col.pump = pump;
    this.pumps.push(pump);
  }

  // un golpe (tiro, choque): cuando se le acaba la vida, explota
  hit(world, pump, dmg, byPlayer) {
    if (pump.dead) return;
    pump.hp -= dmg;
    pump.byPlayer = pump.byPlayer || byPlayer;
    world.fx.sparks(pump.x, 1.2, pump.z, 6, 4);
    if (pump.hp <= 0 && pump.fuse <= 0) pump.fuse = 0.05;
    else if (pump.hp < 30 && !pump.leak) {
      // pierde nafta: chispea y humea hasta que revienta solo
      pump.leak = true;
      pump.fuse = 2.5 + Math.random() * 2;
    }
  }

  // una explosión cerca: los surtidores que alcanza revientan en cadena, uno atrás del otro
  blast(x, z, byPlayer) {
    for (const p of this.pumps) {
      if (p.dead || p.fuse > 0) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 7) {
        p.fuse = 0.25 + d * 0.08 + Math.random() * 0.3;
        p.byPlayer = p.byPlayer || byPlayer;
      }
    }
  }

  update(dt, world) {
    if (!this.group) return;
    // de noche: el panel de abajo de la marquesina y el cartel se prenden
    const glow = world.time.glow;
    // (sin pasarse: con más, el bloom la quema en blanco en el celu)
    this.glowMat.color.setScalar(0.32 + glow * 0.33);
    this.totemMat.emissiveIntensity = glow * 0.55;
    for (const p of this.pumps) {
      if (p.dead) continue;
      if (p.leak && Math.random() < dt * 4) world.fx.smoke(p.x, 1.6, p.z, 1, { s0: 0.3, s1: 1.2, life: 1.2 });
      if (p.fuse > 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) this.boom(world, p);
      }
    }
    for (const b of this.burning) {
      b.t -= dt;
      if (Math.random() < dt * 10) world.fx.fire(b.x, 0.4, b.z, 1, 0.8);
    }
    this.burning = this.burning.filter((b) => b.t > 0);
  }

  boom(world, p) {
    p.dead = true;
    p.mesh.visible = false;
    p.col.x = p.col.z = 1e6;
    this.burning.push({ x: p.x, z: p.z, t: 25 });
    world.combat.explode(world, p.x, p.z, 1.5, !!p.byPlayer, 0.8);
  }
}
