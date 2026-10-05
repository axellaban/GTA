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
  return {
    x: v.x + rx * side, z: v.z + rz * side, fx, fz, rx, rz,
    hw: (Math.abs(c) * v.W + Math.abs(s) * h) / 2 + SKIN,
    hl: v.L / 2 + SKIN,
    low: y + Math.min(0, h * c) - Math.abs(s) * v.W / 2,
    high: y + Math.max(0, h * c) + Math.abs(s) * v.W / 2,
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

export function startRollover(v, direction = 1, recover = false) {
  if (!['car', 'bus'].includes(v.kind) || v.wreck || v.blast || v.rollover || (!recover && v.overturned)) return false;
  const vel = velocity(v);
  const from = v.tilt?.z || 0;
  const sign = Math.sign(direction) || 1;
  const to = recover ? (sign > 0 ? Math.ceil(from / TAU) : Math.floor(from / TAU)) * TAU : sign * Math.PI;
  v.rollover = { t: 0, from, to, recover, duration: recover ? 1.05 : 1.15 };
  v.vx = recover ? 0 : vel.x; v.vz = recover ? 0 : vel.z;
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
  r.t = Math.min(r.duration, r.t + dt);
  const k = r.t / r.duration, ease = k * k * (3 - 2 * k);
  const angle = r.from + (r.to - r.from) * ease;
  const h = v.tall || 1.5;
  v.tilt.z = angle;
  v.tilt.y = Math.abs(Math.sin(angle)) * v.W / 2 + Math.max(0, -Math.cos(angle)) * h;
  v.x += (v.vx || 0) * dt; v.z += (v.vz || 0) * dt;
  v.vx *= Math.exp(-dt * 2.8); v.vz *= Math.exp(-dt * 2.8);
  v.speed = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
  v.throttle = 0;
  if (k === 1) {
    v.overturned = !r.recover;
    v.rollover = null;
    v.vx = v.vz = v.speed = 0;
    v.tilt = r.recover ? null : { x: 0, y: h, z: r.to };
    if (!r.recover) world.combat?.damageVehicle?.(world, v, 12, false, v.x, v.z);
    world.audio?.golpe?.(0.65);
    if (world.player?.vehicle === v && !r.recover) world.hud?.toast?.('Volcaste: soltá y mantené un giro para enderezar, o bajate.', 4);
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
