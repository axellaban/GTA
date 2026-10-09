// Carrocerías sólidas para todos los vehículos. La IA decide dónde manejar;
// este paso, después de sus movimientos, impide que dos carrocerías compartan espacio.
const SKIN = 0.025;
const CELL = 12;
const TAU = Math.PI * 2;

export function vehicleBody(v) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const rx = fz, rz = -fx;
  const roll = v.tilt?.z || 0;
  const h = v.tall ?? (v.kind === 'bus' ? 3.2 : 1.5);
  const c = Math.cos(roll), s = Math.sin(roll);
  const y = (v.y || 0) + (v.lift || 0) + (v.tilt?.y || 0);
  const side = -s * h / 2;
  let low = y + Math.min(0, h * c) - Math.abs(s) * v.W / 2;
  let high = y + Math.max(0, h * c) + Math.abs(s) * v.W / 2;
  if ((v.rollover || v.overturned) && v.tilt && ['car', 'bus'].includes(v.kind)) {
    // volcado o dando vueltas: la sección de verdad (el techo es más angosto que la caja), desde el centro de masa
    const S = rollShape(v);
    const yc = y + S.cy * c;
    low = yc + lowest(S, roll).y;
    high = yc - lowest(S, roll + Math.PI).y;
  }
  return {
    x: v.x + rx * side, z: v.z + rz * side, fx, fz, rx, rz,
    hw: (Math.abs(c) * v.W + Math.abs(s) * h) / 2 + SKIN,
    hl: v.L / 2 + SKIN,
    low,
    high,
  };
}

export function sameVehicleLevel(a, b) {
  const A = vehicleBody(a), B = vehicleBody(b);
  return A.low < B.high - 0.05 && B.low < A.high - 0.05;
}

const radius = (b, x, z) => Math.abs(b.fx * x + b.fz * z) * b.hl + Math.abs(b.rx * x + b.rz * z) * b.hw;
const axes = (A, B) => [[A.rx, A.rz], [A.fx, A.fz], [B.rx, B.rz], [B.fx, B.fz]];

// SAT: mínima traslación entre rectángulos orientados, incluso con centros idénticos.
export function vehicleContact(a, b) {
  const A = vehicleBody(a), B = vehicleBody(b);
  if (A.low >= B.high - 0.05 || B.low >= A.high - 0.05) return null;
  const dx = A.x - B.x, dz = A.z - B.z;
  let depth = Infinity, nx = 0, nz = 0;
  for (const [x, z] of axes(A, B)) {
    const d = dx * x + dz * z;
    const p = radius(A, x, z) + radius(B, x, z) - Math.abs(d);
    if (p <= 0) return null;
    if (p < depth) {
      depth = p;
      const sign = d < 0 ? -1 : 1;
      nx = x * sign; nz = z * sign;
    }
  }
  return { depth, nx, nz };
}

function previous(v, poses) {
  const p = poses.get(v);
  // Reaparecer lejos es un cambio de ubicación, no un viaje por todo el mapa.
  return p && Math.hypot(v.x - p.x, v.z - p.z) < 12 ? p : null;
}

function sweptContact(a, b, poses) {
  const pa = previous(a, poses), pb = previous(b, poses);
  if (!pa || !pb || !sameVehicleLevel(a, b)) return null;
  const A = vehicleBody(a), B = vehicleBody(b);
  const dx = pa.x - pb.x, dz = pa.z - pb.z;
  const vx = a.x - pa.x - (b.x - pb.x), vz = a.z - pa.z - (b.z - pb.z);
  if (Math.hypot(vx, vz) < 0.5 || vehicleContact({ ...a, ...pa }, { ...b, ...pb })) return null;
  let enter = 0, leave = 1, nx = 0, nz = 0;
  for (const [x, z] of axes(A, B)) {
    const d = dx * x + dz * z, motion = vx * x + vz * z;
    const r = radius(A, x, z) + radius(B, x, z);
    if (Math.abs(motion) < 1e-8) { if (Math.abs(d) >= r) return null; continue; }
    const t0 = (-r - d) / motion, t1 = (r - d) / motion;
    const first = Math.min(t0, t1), last = Math.max(t0, t1);
    if (first > enter) { enter = first; nx = x * -Math.sign(motion); nz = z * -Math.sign(motion); }
    leave = Math.min(leave, last);
    if (enter > leave) return null;
  }
  return enter > 0 && enter < 1 ? { time: enter, nx, nz, depth: 0 } : null;
}

export function allVehicles(world) {
  return [...new Set([
    ...(world.traffic?.cars || []), ...(world.traffic?.parked || []),
    ...(world.police?.cars || []), ...(world.tanks?.list || []),
    ...(world.crime?.motos || []).map((m) => m.v), world.player?.vehicle,
  ])].filter((v) => v && !v.gone && !v.pendingSpawn && v.W > 0 && v.L > 0);
}

function velocity(v) {
  const direct = v.driver || v.rollover || v.overturned || v.coast;
  const x = direct && Number.isFinite(v.vx) ? v.vx : Math.sin(v.heading) * (v.speed || 0);
  const z = direct && Number.isFinite(v.vz) ? v.vz : Math.cos(v.heading) * (v.speed || 0);
  return { x: x + (v.shove?.vx || 0), z: z + (v.shove?.vz || 0) };
}

function mass(v) {
  return v.kind === 'tank' ? 12 : v.kind === 'bus' ? 5 : v.model === 'camion' ? 3.5 :
    v.kind === 'moto' ? 0.35 : v.kind === 'carro' ? 0.8 : v.tall > 2 ? 2 : 1.4;
}

function setVelocity(v, x, z) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  if (v.driver || v.rollover || v.overturned || v.coast) {
    v.vx = x; v.vz = z;
    v.speed = x * fx + z * fz;
    v.shove = null;
  } else {
    v.speed = v.ai || v.police ? Math.max(0, x * fx + z * fz) : 0;
    const sx = x - fx * v.speed, sz = z - fz * v.speed;
    if (Math.hypot(sx, sz) > 0.05) v.shove = { t: 0, vx: sx, vz: sz, vy: 0 };
    else v.shove = null;
  }
}

// ---------- Vuelco ----------
// El vuelco es un cuerpo rígido en el plano de la sección del auto (de costado a costado): el centro de masa
// sube y baja con la gravedad, el auto gira sobre su eje largo y la sección (ruedas, hombros y techo, más
// angosto) choca con el piso en su punto más bajo. Cada golpe es un impulso con rebote y rozamiento: así
// rueda una, dos o tres veces según cómo venía, rebota, se arrastra y queda donde la física lo deja (sobre
// el techo, de costado o, si tiene suerte, sobre las ruedas). Enderezarlo (girando con el auto volcado)
// sigue siendo una ayuda del juego, como en los GTA: un medio giro guiado.
const G = 9.8;
function rollShape(v) {
  const bus = v.kind === 'bus';
  const h = v.tall ?? (bus ? 3.2 : 1.5);
  const W = v.W;
  const cy = h * (bus ? 0.45 : 0.4);
  const roof = bus ? W / 2 : W * 0.36;
  const sh = h * (bus ? 0.9 : 0.58);
  // vértices de la sección, desde el centro de masa (x a la derecha del auto, y arriba)
  const pts = [[-W * 0.47, 0.03 - cy], [W * 0.47, 0.03 - cy], [W / 2, sh - cy], [roof, h - cy], [-roof, h - cy], [-W / 2, sh - cy]];
  return { h, W, cy, pts, I: ((W * W + h * h) / 12) * 1.15 };
}
// los ángulos en que la sección queda apoyada de lleno sobre un lado y no se cae (el centro de masa cae
// adentro de ese lado): sobre las ruedas, de costado, sobre el parabrisas de costado o sobre el techo
function restAngles(S) {
  if (S.rest) return S.rest;
  const out = [];
  const n = S.pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = S.pts[i], [bx, by] = S.pts[(i + 1) % n];
    const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey);
    // normal hacia afuera (los vértices van en sentido antihorario)
    const nx = ey / len, ny = -ex / len;
    const t = -(ax * ex + ay * ey) / (len * len);
    if (t > 0.04 && t < 0.96) out.push(Math.atan2(nx, -ny));
  }
  S.rest = out;
  return out;
}
// el ángulo de apoyo más cercano a phi (con sus vueltas enteras)
function nearestRest(S, phi) {
  let best = phi, bd = Infinity;
  for (const a of restAngles(S)) {
    const q = a + Math.round((phi - a) / TAU) * TAU;
    if (Math.abs(q - phi) < bd) { bd = Math.abs(q - phi); best = q; }
  }
  return best;
}
// el punto más bajo de la sección girada phi (y relativa al centro de masa, y su x)
function lowest(S, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  let best = Infinity, bu = 0, bi = 0;
  S.pts.forEach(([x, y], i) => {
    const wy = -x * s + y * c;
    if (wy < best) { best = wy; bu = x * c + y * s; bi = i; }
  });
  // (i: qué vértice; 0 y 1 son las ruedas)
  return { y: best, u: bu, i: bi };
}

export function startRollover(v, direction = 1, recover = false) {
  if (!['car', 'bus'].includes(v.kind) || v.wreck || v.blast || v.rollover || (!recover && v.overturned)) return false;
  const vel = velocity(v);
  const from = v.tilt?.z || 0;
  const sign = Math.sign(direction) || 1;
  if (recover) {
    // enderezarlo: medio giro guiado hasta quedar sobre las ruedas
    const to = (sign > 0 ? Math.ceil(from / TAU) : Math.floor(from / TAU)) * TAU;
    v.rollover = { t: 0, from, to, recover, duration: 1.05 };
    v.vx = 0; v.vz = 0;
  } else {
    // arranca el vuelco: el auto se levanta del lado de afuera y sale girando, resbalando para ese lado
    const S = rollShape(v);
    const speed = Math.hypot(vel.x, vel.z);
    const rx = -Math.cos(v.heading), rz = Math.sin(v.heading); // la derecha del auto
    const slide = sign * Math.min(9, 2.2 + speed * 0.32);
    v.vx = vel.x * 0.88 + rx * slide; v.vz = vel.z * 0.88 + rz * slide;
    const low = lowest(S, from);
    v.rollover = {
      phys: true, t: 0, phi: from, w: sign * Math.min(7.5, 2.6 + speed * 0.13), vy: Math.min(4.5, 1.4 + speed * 0.07),
      yc: -low.y + 0.02, yaw: (v.spin || 0) * 0.5 + sign * 0.25, quiet: 0, hitCd: 0, hits: 0,
    };
  }
  v.shove = null;
  v.coast = false;
  v.air = null;
  v.lift = 0;
  v.tilt = { x: 0, y: v.tilt?.y || 0, z: from };
  v.rollRisk = v.recoverHold = 0;
  v.recoverReady = recover;
  return true;
}

export function turnRollover(v, dt, yawRate, { handbrake = false, slick = false } = {}) {
  if (!['car', 'bus'].includes(v.kind) || v.rollover || v.overturned || v.blast || v.wreck || v.air || (v.lift || 0) > 0.3) return false;
  const speed = Math.abs(v.speed || 0);
  const threshold = 24 * v.W / ((v.tall || 1.5) + 0.4);
  const load = speed * Math.abs(yawRate) * (handbrake ? 0.35 : 1) * (slick ? 0.7 : 1);
  if (speed > 18 && Math.abs(v.steer) > 0.75 && load > threshold) v.rollRisk = (v.rollRisk || 0) + dt * (load / threshold - 0.7);
  else v.rollRisk = Math.max(0, (v.rollRisk || 0) - dt * 2);
  return v.rollRisk > 0.48 && startRollover(v, Math.sign(yawRate));
}

export function recoverRollover(v, dt, steer) {
  if (!v.overturned || v.rollover) return false;
  if (Math.abs(steer) < 0.2) { v.recoverReady = true; v.recoverHold = 0; return false; }
  if (v.recoverReady === false) return false;
  if (Math.abs(steer) > 0.65 && Math.hypot(v.vx || 0, v.vz || 0) < 2) v.recoverHold = (v.recoverHold || 0) + dt;
  else v.recoverHold = 0;
  return v.recoverHold > 0.6 && startRollover(v, Math.sign(steer), true);
}

export function sideImpactRollover(v, nx, nz, impact) {
  const lateral = nx * Math.cos(v.heading) - nz * Math.sin(v.heading);
  const threshold = 20 * v.W / ((v.tall || 1.5) + 0.4);
  return Math.abs(lateral) > 0.65 && impact > Math.max(16, threshold) && startRollover(v, -Math.sign(lateral));
}

function stepRollover(v, dt, world) {
  const r = v.rollover;
  if (!r || v.blast) return;
  if (r.phys) return stepTumble(v, r, dt, world);
  r.t = Math.min(r.duration, r.t + dt);
  const k = r.t / r.duration, ease = k * k * (3 - 2 * k);
  const angle = r.from + (r.to - r.from) * ease;
  const S = rollShape(v);
  // rueda sobre el borde: siempre apoyado en su punto más bajo, con un saltito en el medio
  const low = lowest(S, angle);
  v.tilt.z = angle;
  v.tilt.y = -low.y - S.cy * Math.cos(angle) + Math.sin(k * Math.PI) * 0.25;
  v.throttle = 0;
  if (k === 1) {
    v.overturned = false;
    v.rollover = null;
    v.vx = v.vz = v.speed = 0;
    v.tilt = null;
    world.audio?.golpe?.(0.65);
  }
  v.sync?.(0);
}

// el vuelco con física (ver rollShape)
function stepTumble(v, r, dt, world) {
  const S = rollShape(v);
  const rx = -Math.cos(v.heading), rz = Math.sin(v.heading); // la derecha del auto
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  // el centro de masa (v.x, v.z es el pie de la carrocería, que se corre al girar)
  const off0 = S.cy * Math.sin(r.phi);
  let cx = v.x + rx * off0, cz = v.z + rz * off0;
  let vu = (v.vx || 0) * rx + (v.vz || 0) * rz;
  let vl = (v.vx || 0) * fx + (v.vz || 0) * fz;
  let hit = 0, contact = false, wheels = false;
  const n = Math.min(24, Math.max(1, Math.ceil(dt / 0.005)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    r.vy -= G * h;
    r.phi += r.w * h;
    r.yc += r.vy * h;
    const low = lowest(S, r.phi);
    const pen = r.yc + low.y;
    if (pen < 0) {
      contact = true;
      r.yc -= pen;
      const ru = low.u, ry = low.y;
      // velocidad del punto que toca: la del centro más la del giro
      const vpu = vu + r.w * ry, vpy = r.vy - r.w * ru;
      if (vpy < 0) {
        const e = vpy < -3 ? 0.28 : vpy < -1.2 ? 0.12 : 0;
        const jn = (-(1 + e) * vpy) / (1 + (ru * ru) / S.I);
        let jt = -vpu / (1 + (ry * ry) / S.I);
        const mu = 0.62;
        jt = Math.max(-mu * jn, Math.min(mu * jn, jt));
        vu += jt;
        r.vy += jn;
        r.w += (ry * jt - ru * jn) / S.I;
        hit = Math.max(hit, -vpy);
      }
      // arrastrándose: la chapa contra el asfalto frena lo que iba para adelante y el giro de costado; si
      // cae sobre las ruedas, ruedan (casi no frena)
      wheels = low.i < 2 && Math.cos(r.phi) > 0.8;
      const fr = (wheels ? 0.05 : 0.55) * G * h;
      vl = Math.abs(vl) <= fr ? 0 : vl - Math.sign(vl) * fr;
      r.yaw *= Math.exp(-h * 3);
    }
    r.w *= Math.exp(-h * 0.08);
    cx += (rx * vu + fx * vl) * h;
    cz += (rz * vu + fz * vl) * h;
  }
  r.t += dt;
  v.heading += r.yaw * dt;
  // vuelve al pie de la carrocería
  const off = S.cy * Math.sin(r.phi);
  const rx2 = -Math.cos(v.heading), rz2 = Math.sin(v.heading);
  const fx2 = Math.sin(v.heading), fz2 = Math.cos(v.heading);
  v.x = cx - rx2 * off; v.z = cz - rz2 * off;
  v.vx = rx2 * vu + fx2 * vl; v.vz = rz2 * vu + fz2 * vl;
  v.speed = vl;
  v.throttle = 0;
  v.tilt.z = r.phi;
  v.tilt.y = r.yc - S.cy * Math.cos(r.phi);
  v.tilt.x = 0;
  // cada golpe contra el piso: chispas, polvo, ruido, abolladura y sacudón (si va Gaspi adentro)
  r.hitCd -= dt;
  if (hit > 1.6 && r.hitCd <= 0) {
    r.hitCd = 0.18;
    r.hits++;
    const k = Math.min(1, hit / 9);
    const px = v.x, pz = v.z;
    world.fx?.sparks?.(px, 0.2, pz, 6 + Math.round(k * 14), 4 + k * 5);
    world.fx?.dust?.(px, 0.15, pz, 4 + Math.round(k * 8), [0.5, 0.47, 0.42], 1 + k);
    world.audio?.golpe?.(0.35 + k * 0.6);
    if (k > 0.35) world.audio?.metal?.(0.3 + k * 0.5);
    world.combat?.damageVehicle?.(world, v, 3 + hit * 2.2, v === world.player?.vehicle, px + rx2 * Math.sign(r.w || 1), pz + rz2 * Math.sign(r.w || 1));
    if (v === world.player?.vehicle) {
      if (world.fx) world.fx.shake += 0.15 + k * 0.45;
      world.player.hurt?.(Math.round(1 + k * 6), 'Volcaste');
    }
  }
  // cayó parado sobre las ruedas y ya no gira: sigue andando como venía (como en los GTA, se puede seguir
  // manejando)
  const parado = contact && wheels && Math.cos(r.phi) > 0.97 && Math.abs(r.w) < 1 && Math.abs(r.vy) < 0.8;
  r.landed = parado ? (r.landed || 0) + dt : 0;
  if (r.landed > 0.12 && Math.hypot(vu, vl) >= 0.8) {
    v.rollover = null;
    v.overturned = false;
    v.tilt = null;
    world.audio?.golpe?.(0.5);
    v.sync?.(0);
    return;
  }
  // quieto en el piso: queda como cayó (sobre el techo, de costado o sobre las ruedas)
  const still = contact && Math.abs(r.w) < 0.5 && Math.abs(r.vy) < 0.5 && Math.hypot(vu, vl) < 0.8;
  r.quiet = still ? r.quiet + dt : 0;
  // (quieto un instante arriba de un borde no cuenta: de ahí se cae para algún lado)
  const q = nearestRest(S, r.phi);
  if ((r.quiet > 0.3 && Math.abs(q - r.phi) < 0.12) || r.t > 9) {
    // apoyado de lleno sobre un lado (ruedas, costado, parabrisas o techo): ahí queda
    const upright = Math.cos(q) > 0.92;
    v.rollover = null;
    v.vx = v.vz = v.speed = 0;
    if (upright) {
      v.overturned = false;
      v.tilt = null;
      world.audio?.golpe?.(0.4);
    } else {
      v.overturned = true;
      v.tilt = { x: 0, y: -lowest(S, q).y - S.cy * Math.cos(q), z: q };
      if (v === world.player?.vehicle) world.hud?.toast?.('Volcaste: soltá y mantené un giro para enderezar, o bajate.', 4);
    }
  }
  v.sync?.(0);
}

export function beginVehicleFrame(world, dt) {
  const poses = new Map();
  for (const v of allVehicles(world)) {
    poses.set(v, { x: v.x, z: v.z, heading: v.heading, y: v.y || 0 });
    stepRollover(v, dt, world);
  }
  return poses;
}

function pairs(vehicles, poses, sweep) {
  const grid = new Map(), found = new Set(), out = [];
  vehicles.forEach((v, i) => {
    const b = vehicleBody(v), p = sweep ? previous(v, poses) : null;
    const ex = radius(b, 1, 0), ez = radius(b, 0, 1);
    const x0 = Math.floor((Math.min(b.x, p?.x ?? b.x) - ex) / CELL), x1 = Math.floor((Math.max(b.x, p?.x ?? b.x) + ex) / CELL);
    const z0 = Math.floor((Math.min(b.z, p?.z ?? b.z) - ez) / CELL), z1 = Math.floor((Math.max(b.z, p?.z ?? b.z) + ez) / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const key = `${x},${z}`, list = grid.get(key) || [];
      for (const j of list) {
        const id = j * vehicles.length + i;
        if (!found.has(id)) { found.add(id); out.push([vehicles[j], v]); }
      }
      list.push(i); grid.set(key, list);
    }
  });
  return out;
}

function collide(a, b, contact, world, impacts) {
  const { nx, nz, depth } = contact;
  const ia = 1 / mass(a), ib = 1 / mass(b), sum = ia + ib;
  if (depth > 0) {
    const distance = depth + 0.001;
    a.x += nx * distance * ia / sum; a.z += nz * distance * ia / sum;
    b.x -= nx * distance * ib / sum; b.z -= nz * distance * ib / sum;
  }
  const av = velocity(a), bv = velocity(b);
  const closing = (av.x - bv.x) * nx + (av.z - bv.z) * nz;
  if (closing >= -0.01) return;
  const impulse = -closing * (closing < -4 ? 1.12 : 1) / sum;
  setVelocity(a, av.x + nx * impulse * ia, av.z + nz * impulse * ia);
  setVelocity(b, bv.x - nx * impulse * ib, bv.z - nz * impulse * ib);
  if (-closing < 5) return;
  let seen = impacts.get(a);
  if (!seen) impacts.set(a, (seen = new Set()));
  if (seen.has(b)) return;
  seen.add(b);
  const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
  sideImpactRollover(a, -nx, -nz, impulse * ia);
  sideImpactRollover(b, nx, nz, impulse * ib);
  // Un golpe fuera del centro también hace girar la chapa.
  for (const [v, sign, inv] of [[a, 1, ia], [b, -1, ib]]) {
    if (v.rollover || v.overturned) continue;
    const torque = ((x - v.x) * nz - (z - v.z) * nx) * sign * impulse * inv / ((v.W ** 2 + v.L ** 2) / 12);
    if (v.driver) v.spin = Math.max(-4, Math.min(4, (v.spin || 0) - torque * 0.2));
    else v.heading -= Math.max(-0.2, Math.min(0.2, torque * 0.03));
  }
  const traffic = world.traffic;
  if (-closing > 5) {
    if (a.kind === 'moto' && a.rider) traffic?.ejectRider?.(a, world, nx, nz);
    if (b.kind === 'moto' && b.rider) traffic?.ejectRider?.(b, world, -nx, -nz);
  }
  const P = world.player;
  const moto = P?.vehicle;
  if (moto?.kind === 'moto' && (moto === a || moto === b) && -closing > 8.5) {
    const dx = Math.sin(moto.heading), dz = Math.cos(moto.heading);
    P.exitVehicle?.(world, true);
    moto.fallen = true; moto.lean = 1.35;
    P.hurt?.(-closing * 1.6, 'Te diste un palo con la moto');
    P.knockDown?.(2, dx, dz); P.vy = 3;
    world.hud?.toast?.('¡Volaste de la moto!', 1.6);
  }
  if (-closing > 8) {
    world.combat?.damageVehicle?.(world, a, -closing * 0.3, b === world.player?.vehicle, x, z);
    world.combat?.damageVehicle?.(world, b, -closing * 0.3, a === world.player?.vehicle, x, z);
  }
  if (a === world.player?.vehicle || b === world.player?.vehicle) {
    world.audio?.golpe?.(Math.min(1, -closing / 18));
    world.fx?.sparks?.(x, 0.6, z, 8, 5);
    if (world.fx) world.fx.shake += Math.min(0.6, -closing / 30);
    world.police?.crime?.('choque', x, z);
    if (a.police || b.police) world.police?.crime?.('pina', x, z);
  }
}

function walls(v, world) {
  if (!world.colliders || (v.lift || 0) > 2.5) return false;
  let moved = false;
  let circles = v.circles();
  if (v.rollover || v.overturned) {
    const b = vehicleBody(v), r = b.hw + 0.075, span = Math.max(0, b.hl - r);
    const count = Math.max(2, Math.ceil(v.L / (r * 2)));
    circles = Array.from({ length: count }, (_, i) => {
      const t = -span + 2 * span * i / (count - 1);
      return { x: b.x + b.fx * t, z: b.z + b.fz * t, r };
    });
  }
  for (const c of circles) {
    const p = { x: c.x, z: c.z };
    const filter = v.y < -1 ? (b) => !b.over && !(b.y0 > 1) : undefined;
    const hit = world.colliders.resolveCircle(p, c.r, filter);
    if (!hit) continue;
    if (Math.hypot(p.x - c.x, p.z - c.z) < 1e-5) continue;
    v.x += p.x - c.x; v.z += p.z - c.z;
    const vel = velocity(v), into = vel.x * hit.nx + vel.z * hit.nz;
    if (into < 0) setVelocity(v, vel.x - hit.nx * into, vel.z - hit.nz * into);
    moved = true;
  }
  return moved;
}

export function resolveVehicleFrame(world, poses = new Map()) {
  const vehicles = allVehicles(world), impacts = new Map();
  const touched = new Set(vehicles.filter((v) => v.rollover || v.overturned));
  for (const [a, b] of pairs(vehicles, poses, true)) {
    const hit = sweptContact(a, b, poses);
    if (!hit) continue;
    for (const v of [a, b]) {
      const p = poses.get(v), t = Math.max(0, hit.time - 0.0001);
      v.x = p.x + (v.x - p.x) * t; v.z = p.z + (v.z - p.z) * t;
      touched.add(v);
    }
    collide(a, b, hit, world, impacts);
  }
  // Recalcular cada pasada: un auto separado puede empujar al siguiente de una fila.
  for (let i = 0; i < 32; i++) {
    let changed = false;
    for (const [a, b] of pairs(vehicles, poses, false)) {
      const hit = vehicleContact(a, b);
      if (!hit) continue;
      collide(a, b, hit, world, impacts);
      touched.add(a); touched.add(b); changed = true;
    }
    for (const v of touched) if (walls(v, world)) changed = true;
    if (!changed) break;
  }
  for (const v of touched) v.sync?.(0);
  const P = world.player;
  if (P?.vehicle) { P.x = P.vehicle.x; P.z = P.vehicle.z; P.y = P.vehicle.y || 0; }
  return { contacts: touched.size, vehicles: vehicles.length };
}
