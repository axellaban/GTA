// Autos que flotan: con el agua alta los autos (estacionados, del tránsito, patrulleros, el de Gaspi) se
// levantan del piso, se mecen y se los lleva la corriente hasta trabarse contra una pared o un poste.
// La flotación es la de los "FloatingBodies" de WaterThreeJS (Mohamed Achref Elouafi, MIT): un resorte que
// empuja según cuánto del auto está abajo del agua, amortiguado contra el movimiento del agua y en pasos
// cortos (estable aunque el juego vaya lento); cuando el agua baja, el auto vuelve a apoyarse en el piso.
import { allVehicles } from './vehicle-physics.js';

const G = 14;
// medio alto de la carrocería (m) y densidad (qué fracción queda abajo del agua al flotar)
function spec(v) {
  if (v.kind === 'bus' || v.model === 'camion' || v.model === 'firetruck') return { r: 1.45, dens: 0.62 };
  if (v.kind === 'moto') return { r: 0.5, dens: 0.75 };
  if (v.model === 'trafic' || v.model === 'q_suv' || v.model === 'l_suv' || v.model === 'ambulance') return { r: 0.95, dens: 0.48 };
  return { r: 0.72, dens: 0.44 };
}

export class Flote {
  constructor() {
    this.t = 0;
  }
  update(dt, world) {
    const ag = world.agua;
    this.t += dt;
    if (!ag) return;
    const wet = ag.wet;
    const P = world.player;
    const ai = new Set(world.traffic.cars);
    for (const v of allVehicles(world)) {
      if (v.kind === 'tank' || v.kind === 'carro' || v.wreck === 'gone') continue;
      const g = world.heightAt(v.x, v.z);
      const S = spec(v);
      const eq = 2 * S.r * S.dens;
      const wd = wet ? ag.level - g : -1;
      let f = v.fl;
      if (!f) {
        if (wd < eq * 0.9) continue;
        f = v.fl = { y: g, vy: 0, vx: 0, vz: 0, spin: (Math.random() - 0.5) * 0.25, ph: Math.random() * 10, x: v.x, z: v.z, tx: 0, tz: 0 };
      }
      // lo movió otro (lo reciclaron lejos, lo agarró una explosión): se arranca de nuevo
      if (Math.abs(v.x - f.x) > 12 || Math.abs(v.z - f.z) > 12) f.y = g;
      // flotación en pasos de ~8 ms
      const sub = Math.min(6, Math.max(1, Math.ceil(dt / 0.008)));
      const h = dt / sub;
      let displaced = 0;
      for (let i = 0; i < sub; i++) {
        displaced = wet ? Math.min(Math.max(ag.level - f.y, 0), 2 * S.r) : 0;
        const k = G / Math.max(eq, 0.3);
        const wetK = displaced / (2 * S.r);
        const damp = 2 * Math.sqrt(k) * 0.9 * wetK + 0.6;
        f.vy += (-G + k * displaced - damp * f.vy) * h;
        f.y += f.vy * h;
        if (f.y < g) {
          f.y = g;
          if (f.vy < 0) f.vy = 0;
        }
      }
      const floating = displaced > 0.05 && f.y > g + 0.04;
      // la corriente se lo lleva (si nadie lo maneja con el motor andando) y gira despacio
      if (floating) {
        const fl = ag.flow;
        f.vx += (fl.x * 1.6 - f.vx) * Math.min(1, dt * 0.35);
        f.vz += (fl.y * 1.6 - f.vz) * Math.min(1, dt * 0.35);
        const x0 = v.x;
        const z0 = v.z;
        v.x += f.vx * dt;
        v.z += f.vz * dt;
        v.heading += f.spin * dt;
        // contra las casas y los postes se traba
        for (const c of v.circles?.() ?? []) {
          const p = { x: c.x, z: c.z };
          if (world.colliders.resolveCircle(p, c.r)) {
            v.x += p.x - c.x;
            v.z += p.z - c.z;
            f.vx *= 0.3;
            f.vz *= 0.3;
            f.spin = -f.spin * 0.6;
          }
        }
        // si se trabó en un lugar con poca agua, queda ahí
        if (ag.level - world.heightAt(v.x, v.z) < eq * 0.6) {
          v.x = x0;
          v.z = z0;
          f.vx = f.vz = 0;
        }
        if (!v.driver && v !== world.player.vehicle) {
          v.speed = 0;
          v.vx = v.vz = 0;
        }
      }
      // se mece: más con lluvia y con ondas; la trompa (el motor) pesa más
      const rock = floating ? 1 + (ag.rain || 0) * 1.2 : 0;
      f.tx += ((floating ? Math.sin(this.t * 0.9 + f.ph) * 0.045 * rock + 0.05 : 0) - f.tx) * Math.min(1, dt * 2);
      f.tz += ((floating ? Math.cos(this.t * 0.7 + f.ph * 1.3) * 0.055 * rock : 0) - f.tz) * Math.min(1, dt * 2);
      f.x = v.x;
      f.z = v.z;
      v.floating = floating;
      v.floatY = f.y;
      v.floatTilt = f;
      // las ondas que hace al moverse
      // (solo cerca: las ondas son pocas y si no, los autos lejos se comían las de Gaspi)
      if (floating && Math.random() < dt * 1.5 && Math.abs(v.x - P.x) < 40 && Math.abs(v.z - P.z) < 40) ag.ripple(v.x + (Math.random() - 0.5) * 2, v.z + (Math.random() - 0.5) * 2, 0.35);
      // estacionados y varados: nadie más los dibuja en su lugar nuevo
      if (!v.driver && v !== P.vehicle && !ai.has(v)) v.sync?.(dt);
      // volvió a tocar el piso y bajó el agua: queda donde quedó
      if (!floating && wd < eq * 0.5 && Math.abs(f.y - g) < 0.02) {
        v.fl = null;
        v.floating = false;
        v.floatY = undefined;
        v.floatTilt = null;
      }
    }
  }
}
