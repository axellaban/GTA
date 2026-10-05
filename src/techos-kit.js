// Techos a dos aguas (casas con tejas y la estación): los dos faldones con las tejas, los mojinetes del color
// del revoque de la casa, el cielorraso de machimbre debajo del alero y, de Blender (tools/blender/casas.py),
// la cumbrera de media caña y las cenefas del alero y de los mojinetes, estiradas a la medida de cada techo
// (el perfil no cambia a lo largo). Antes el techo era un prisma con tejas en todas las caras: el mojinete y
// el alero por abajo también salían de tejas.
import * as THREE from 'three';
import { swapGeometry, loadBlenderMeshes } from './blender.js';

const OV = 0.3; // alero sobre los costados largos
const GE = 0.2; // alero sobre los mojinetes
const SOFFIT = new THREE.Color(0xc8a77a); // machimbre
// cenefas blancas, de madera o verde inglés
const BOARDS = [0xf1eee6, 0xf1eee6, 0x7a5434, 0x3f6b4a].map((c) => new THREE.Color(c));

// gables: [{ ring, h, kind, color }]; tiles: el material de las tejas (UV en metros)
export function buildGableRoofs(gables, tiles) {
  const sp = [];
  const suv = [];
  const fp = [];
  const fc = [];
  const ridges = [];
  const boards = [];
  // triángulo con la cara hacia `want` (si no, se dan vuelta dos vértices); uvs: las tres uv o nada
  const tri = (arr, a, b, c, want, uvArr, uvs) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ok = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0;
    arr.push(...a, ...(ok ? b : c), ...(ok ? c : b));
    if (uvArr) uvArr.push(...uvs[0], ...(ok ? uvs[1] : uvs[2]), ...(ok ? uvs[2] : uvs[1]));
  };
  for (const t of gables) {
    // el rectángulo orientado del edificio (el lado más largo da la dirección de la cumbrera)
    const r = t.ring;
    let best = 0;
    let ux = 1;
    let uz = 0;
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
    const nx = -uz;
    const nz = ux;
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const [x, z] of r) {
      const a = x * ux + z * uz;
      const b = x * nx + z * nz;
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
      b0 = Math.min(b0, b);
      b1 = Math.max(b1, b);
    }
    const span = b1 - b0;
    const len = a1 - a0;
    const rise = t.kind === 'estacion' ? 3 : Math.min(2.2, span * 0.3);
    const am = (a0 + a1) / 2;
    const bm = (b0 + b1) / 2;
    const cx = ux * am + nx * bm;
    const cz = uz * am + nz * bm;
    const hs = span / 2 + OV;
    const hl = len / 2 + GE;
    // punto del techo: s a lo ancho (hacia n), y para arriba (desde el borde de la pared), l a lo largo
    const P = (s, y, l) => [cx + nx * s + ux * l, t.h + y, cz + nz * s + uz * l];
    // faldones (uv en metros: s a lo ancho, l a lo largo, como el techo de antes)
    for (const side of [-1, 1]) {
      const e0 = P(side * hs, 0, -hl);
      const e1 = P(side * hs, 0, hl);
      const r0 = P(0, rise, -hl);
      const r1 = P(0, rise, hl);
      const us = side * hs;
      const UP = [0, 1, 0];
      tri(sp, e0, e1, r1, UP, suv, [[us, -hl], [us, hl], [0, hl]]);
      tri(sp, e0, r1, r0, UP, suv, [[us, -hl], [0, hl], [0, -hl]]);
    }
    // cielorraso del alero (mira para abajo) y los mojinetes (del color de la casa, a ras de la pared)
    const wall = t.color ?? new THREE.Color(0xd8cfc0);
    const pushCol = (c, n) => {
      for (let i = 0; i < n; i++) fc.push(c.r, c.g, c.b);
    };
    const DOWN = [0, -1, 0];
    tri(fp, P(-hs, 0, -hl), P(hs, 0, -hl), P(hs, 0, hl), DOWN);
    tri(fp, P(-hs, 0, -hl), P(hs, 0, hl), P(-hs, 0, hl), DOWN);
    pushCol(SOFFIT, 6);
    for (const l of [-len / 2, len / 2]) {
      const out = [ux * Math.sign(l), 0, uz * Math.sign(l)];
      // el mojinete llega hasta apenas abajo del faldón, en la línea de la pared (que no asome entre las tejas)
      const w = (OV - 0.03) / hs;
      const a = P(-span / 2, rise * w, l);
      const b = P(span / 2, rise * w, l);
      const c = P(0, rise - 0.03, l);
      tri(fp, a, b, c, out);
      // y el rectángulo entre la pared y el triángulo
      const a2 = P(-span / 2, 0, l);
      const b2 = P(span / 2, 0, l);
      tri(fp, a2, b2, b, out);
      tri(fp, a2, b, a, out);
      pushCol(wall, 9);
    }
    // piezas de Blender: cumbrera, cenefas del alero (a los dos costados) y de los mojinetes (sobre la pendiente)
    const U = new THREE.Vector3(ux, 0, uz);
    const N = new THREE.Vector3(nx, 0, nz);
    const Y = new THREE.Vector3(0, 1, 0);
    const v = (a) => new THREE.Vector3(...a);
    const color = BOARDS[Math.abs(Math.round(cx * 3.1 + cz * 1.7)) % BOARDS.length];
    ridges.push({ x: U, y: Y, z: N, p: v(P(0, rise, 0)), sx: 2 * hl });
    for (const side of [-1, 1]) {
      boards.push({ x: U.clone().multiplyScalar(side), y: Y, z: N.clone().multiplyScalar(side), p: v(P(side * (hs + 0.012), 0.02, 0)), sx: 2 * hl, color });
    }
    const slopeLen = Math.hypot(hs, rise);
    for (const l of [-hl, hl]) {
      const out = U.clone().multiplyScalar(Math.sign(l));
      for (const side of [-1, 1]) {
        // a lo largo de la pendiente; la base (x, y, z) tiene que quedar derecha (si no, la tabla sale espejada
        // y se ve del revés): si el "arriba" da para abajo, se da vuelta la dirección
        let dir = new THREE.Vector3(-side * nx * hs, rise, -side * nz * hs).normalize();
        let up = new THREE.Vector3().crossVectors(out, dir);
        if (up.y < 0) {
          dir = dir.negate();
          up = new THREE.Vector3().crossVectors(out, dir);
        }
        up.normalize();
        // (el canto de arriba de la tabla queda sobre la teja)
        const mid = v(P((side * hs) / 2, rise / 2 + 0.02, l + Math.sign(l) * 0.012));
        boards.push({ x: dir, y: up, z: out, p: mid, sx: slopeLen, color });
      }
    }
  }
  const out = [];
  if (sp.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, tiles);
    m.castShadow = m.receiveShadow = true;
    out.push(m);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    fg.computeVertexNormals();
    const fm = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    fm.castShadow = fm.receiveShadow = true;
    out.push(fm);
  }
  // cumbreras y cenefas: instancias que aparecen cuando carga el modelo
  const empty = () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
  const m4 = new THREE.Matrix4();
  const S = new THREE.Matrix4();
  const make = (list, name) => {
    const m = new THREE.InstancedMesh(empty(), new THREE.MeshLambertMaterial(), Math.max(1, list.length));
    m.count = list.length;
    list.forEach((it, i) => {
      m4.makeBasis(it.x, it.y, it.z).multiply(S.makeScale(it.sx, 1, 1)).setPosition(it.p);
      m.setMatrixAt(i, m4);
      if (it.color) m.setColorAt(i, it.color);
    });
    m.castShadow = name === 'cumbrera';
    m.receiveShadow = true;
    m.userData.cell = 160;
    m.name = `techos-${name}`;
    return m;
  };
  const ridgeMesh = make(ridges, 'cumbrera');
  const boardMesh = make(boards, 'cenefa');
  loadBlenderMeshes('models/houses/casas.glb')
    .then((geo) => {
      if (geo.cumbrera) swapGeometry(ridgeMesh, geo.cumbrera, { white: true });
      if (geo.cenefa) swapGeometry(boardMesh, geo.cenefa, { white: true });
    })
    .catch((e) => console.warn('techos de Blender:', e.message));
  return { meshes: out, pieces: [ridgeMesh, boardMesh] };
}

// Galpones con techo parabólico de chapa (los de los talleres y depósitos del conurbano): la bóveda arranca
// detrás del pretil de los costados largos y los mojinetes curvos van del color de la pared. La chapa
// acanalada de siempre (roofTexture('chapa'): las ondas a lo largo de u), con las canaletas de punta a
// punta de la curva. vaults: [{ ring, h, color }]; chapa: { map, normal } y M (metros por repetición).
export function buildVaultRoofs(vaults, chapa, M) {
  const sp = [];
  const suv = [];
  const fp = [];
  const fc = [];
  const N = 10;
  const SPRING = 0.45; // la bóveda arranca casi arriba del pretil (0,55): de la calle no se ve el borde
  const tri = (arr, a, b, c, want) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ok = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0;
    arr.push(...a, ...(ok ? b : c), ...(ok ? c : b));
    return ok;
  };
  for (const t of vaults) {
    const r = t.ring;
    let best = 0;
    let ux = 1;
    let uz = 0;
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
    const nx = -uz;
    const nz = ux;
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const [x, z] of r) {
      a0 = Math.min(a0, x * ux + z * uz);
      a1 = Math.max(a1, x * ux + z * uz);
      b0 = Math.min(b0, x * nx + z * nz);
      b1 = Math.max(b1, x * nx + z * nz);
    }
    const fullSpan = b1 - b0;
    const len = a1 - a0;
    if (fullSpan < 4 || len < 4) continue;
    // solo los galpones rectangulares (si no, la bóveda del rectángulo que los encierra sale a la calle)
    let area = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) area += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    if (Math.abs(area / 2) < fullSpan * len * 0.9) continue;
    // los anchos van con varias bóvedas una al lado de la otra (de 16 m como mucho)
    const nv = Math.ceil(fullSpan / 16);
    for (let kv = 0; kv < nv; kv++) {
    const span = fullSpan / nv;
    const rise = Math.min(3.2, span * 0.16);
    const cx = ux * ((a0 + a1) / 2) + nx * (b0 + span * (kv + 0.5));
    const cz = uz * ((a0 + a1) / 2) + nz * (b0 + span * (kv + 0.5));
    const hs = span / 2 + (nv > 1 ? 0 : 0.12);
    const hl = len / 2 + 0.12;
    const P = (s, y, l) => [cx + nx * s + ux * l, t.h + y, cz + nz * s + uz * l];
    // la curva (parábola) y lo largo de cada tramo, para la uv
    const arc = [];
    let acc = 0;
    for (let i = 0; i <= N; i++) {
      const s = -hs + (2 * hs * i) / N;
      const y = SPRING + rise * (1 - (s / hs) ** 2);
      if (i) acc += Math.hypot(s - arc[i - 1].s, y - arc[i - 1].y);
      arc.push({ s, y, d: acc });
    }
    for (let i = 0; i < N; i++) {
      const A = arc[i];
      const Bp = arc[i + 1];
      const up = [nx * -(Bp.y - A.y), Bp.s - A.s, nz * -(Bp.y - A.y)];
      const q = [P(A.s, A.y, -hl), P(Bp.s, Bp.y, -hl), P(Bp.s, Bp.y, hl), P(A.s, A.y, hl)];
      const uvq = [[-hl / M, A.d / M], [-hl / M, Bp.d / M], [hl / M, Bp.d / M], [hl / M, A.d / M]];
      for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) {
        const ok = tri(sp, q[i0], q[i1], q[i2], up);
        suv.push(...uvq[i0], ...(ok ? uvq[i1] : uvq[i2]), ...(ok ? uvq[i2] : uvq[i1]));
      }
    }
    // mojinetes curvos, del color de la pared (de la losa del techo a la curva)
    const wall = t.color ?? new THREE.Color(0xc9c4b8);
    for (const l of [-len / 2, len / 2]) {
      const out = [ux * Math.sign(l), 0, uz * Math.sign(l)];
      const base = P(0, 0, l);
      for (let i = 0; i < N; i++) {
        const A = arc[i];
        const Bp = arc[i + 1];
        const sa = Math.max(-span / 2, Math.min(span / 2, A.s));
        const sb = Math.max(-span / 2, Math.min(span / 2, Bp.s));
        tri(fp, base, P(sa, A.y - 0.02, l), P(sb, Bp.y - 0.02, l), out);
        tri(fp, P(sa, 0, l), P(sa, A.y - 0.02, l), base, out);
        for (let k = 0; k < 6; k++) fc.push(wall.r, wall.g, wall.b);
      }
    }
    }
  }
  const out = [];
  if (sp.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: chapa.map, normalMap: chapa.normal, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    out.push(m);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    fg.computeVertexNormals();
    const fm = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    fm.castShadow = fm.receiveShadow = true;
    out.push(fm);
  }
  return out;
}
