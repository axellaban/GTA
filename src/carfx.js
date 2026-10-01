// Efectos de los autos andando: humo del escape (negro en los colectivos al arrancar),
// petardeos al soltar el acelerador y el rocío de las gomas con la calle mojada.
const OLD = new Set(['falcon', 'p504', 'fiat600', 'duna', 'pickup', 'camion', 'colectivo', 'trafic']);

export function carEffects(v, dt, world, { throttle = null, player = false } = {}) {
  if (v.wreck || v.kind === 'moto' || v.kind === 'carro' || !v.mesh.visible) return;
  const { fx: effects } = world;
  const st = (v.cfx ??= { puff: Math.random(), thr: 0, pop: 0 });
  const sp = Math.abs(v.speed);
  const fx = v.fx;
  const fz = v.fz;
  const bus = v.kind === 'bus';
  const old = OLD.has(v.model);
  // acelerando: el jugador lo dice el pedal; los demás, cuánto ganan de velocidad
  const acc = throttle != null ? Math.max(0, throttle) : Math.min(1, Math.max(0, (v.sus?.aLong || 0) / 2));
  // caño de escape: atrás, del lado derecho (en el colectivo, abajo a la izquierda)
  const back = v.L / 2 + 0.05;
  const off = (bus ? -1 : 1) * (v.W / 2 - 0.35);
  const px = v.x - fx * back + fz * off;
  const pz = v.z - fz * back - fx * off;
  const py = bus ? 0.35 : 0.26;
  const dark = (v.damage || 0) > 60 || (bus && acc > 0.4 && sp < 8);
  // bocanadas: en ralentí cada tanto, acelerando seguido
  const rate = (0.2 + acc * (sp < 10 ? 2.4 : 1)) * (old ? 1.4 : 1) * (player ? 1.3 : 1);
  st.puff -= dt * rate * 4;
  if (st.puff <= 0) {
    st.puff += 1;
    const vx = player ? v.vx : fx * v.speed;
    const vz = player ? v.vz : fz * v.speed;
    effects.exhaust(px, py, pz, vx - fx * 1.6, vz - fz * 1.6, dark ? 1.4 : 0.25 + acc * 0.7, dark);
  }
  // petardeo: soltar el acelerador a fondo (solo el auto de Gaspi, más en los viejos)
  if (player) {
    st.pop -= dt;
    if (st.thr > 0.5 && throttle <= 0 && sp > 11 && st.pop <= 0 && Math.random() < (old ? 0.55 : 0.3)) {
      effects.backfire(px, py, pz, fx, fz);
      world.audio.petardeo?.(0.55);
      st.pop = 1.2;
    }
    st.thr = throttle ?? 0;
  }
  // rocío: la calle mojada levanta agua detrás de cada goma
  const wet = world.weather?.wet ?? 0;
  if (wet > 0.25 && sp > 4) {
    const k = Math.min(1, (sp - 4) / 14) * wet;
    const chance = (player ? 0.9 : 0.25) * k;
    const rz = -v.L / 2 + 0.85;
    for (const s of [-1, 1]) {
      if (Math.random() > chance) continue;
      const lx = s * (v.W / 2 - 0.15);
      const wx = v.x + fx * rz + fz * lx;
      const wz = v.z + fz * rz - fx * lx;
      effects.spray(wx, wz, fx * v.speed * 0.35 - fx * 1.2, fz * v.speed * 0.35 - fz * 1.2, 0.6 + k * 0.8);
    }
  }
}
