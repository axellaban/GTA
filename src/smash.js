// Postes de luz que se caen cuando un auto los lleva puestos (como en Vice City): el poste gira
// sobre la base como un palo que se desploma, chispea al pegar en el piso y la luz se apaga.
import * as THREE from 'three';

const G = 9.8;
export class Smash {
  constructor(city, fx, audio) {
    this.city = city;
    this.fx = fx;
    this.audio = audio;
    this.falling = [];
    this.down = new Set();
    this.onLampOff = null;
    this.m4 = new THREE.Matrix4();
    this.m2 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.axis = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.one = new THREE.Vector3(1, 1, 1);
  }
  // box: el colisionador del poste; (vx, vz): velocidad del auto que lo choca
  knock(box, vx, vz) {
    const i = box.lamp;
    if (i == null || this.down.has(i)) return false;
    this.down.add(i);
    // el colisionador se va del mapa
    box.x = 1e6;
    box.z = 1e6;
    const sp = Math.hypot(vx, vz) || 1;
    const [x, z] = this.city.lampRig.data[i];
    const dx = vx / sp;
    const dz = vz / sp;
    // si cae contra una pared, queda apoyado en ella (no la atraviesa)
    const wall = this.city.colliders.blockedHit(x, z, x + dx * 9, z + dz * 9, 1);
    const reach = wall ? wall.t * 9 - 0.25 : 99;
    const stop = reach < 8.2 ? Math.asin(Math.max(0.15, Math.min(1, reach / 8.2))) : 1.5;
    this.falling.push({ i, x, z, dx, dz, a: 0.12, w: Math.min(2.2, sp * 0.09), stop, landed: false });
    this.fx.sparks(x, 0.6, z, 14, 6);
    this.fx.dust(x, 0.3, z, 6, [0.5, 0.48, 0.44], 1);
    this.audio.metal(0.9);
    this.audio.golpe(0.6);
    this.onLampOff?.(i);
    return true;
  }
  update(dt) {
    if (!this.falling.length) return;
    const R = this.city.lampRig;
    for (const f of this.falling) {
      if (!f.landed) {
        // palo que cae: aceleración angular 3g/(2L) sen(a)
        f.w += ((3 * G) / (2 * 8.5)) * Math.sin(f.a) * dt;
        f.a += f.w * dt;
        if (f.a >= f.stop) {
          f.a = f.stop;
          f.landed = true;
          // pega el cabezal contra el piso (o contra la pared): chispazo eléctrico y polvo
          const hx = f.x + f.dx * 7.6 * Math.sin(f.a);
          const hz = f.z + f.dz * 7.6 * Math.sin(f.a);
          this.fx.sparks(hx, 7.6 * Math.cos(f.a) + 0.4, hz, 26, 7);
          this.fx.dust(f.x + f.dx * 4, 0.3, f.z + f.dz * 4, 10, [0.5, 0.48, 0.44], 1.4);
          this.audio.metal(1);
          this.fx.shake += 0.15;
        }
      }
      // giro alrededor de la base, hacia donde iba el auto
      this.axis.set(f.dz, 0, -f.dx);
      this.q.setFromAxisAngle(this.axis, f.a);
      const base = this.m2.makeRotationFromQuaternion(this.q).setPosition(f.x, 0, f.z);
      const rot = R.data[f.i][2];
      this.q2.setFromAxisAngle(this.up, rot);
      R.poles.setMatrixAt(f.i, this.m4.makeTranslation(0, 4.25, 0).premultiply(base));
      R.arms.setMatrixAt(f.i, this.m4.compose(this.v.set(0, 0, 0), this.q2, this.one).premultiply(base));
      R.heads.setMatrixAt(f.i, this.m4.compose(this.v.set(Math.sin(rot) * 1.45, 7.72, Math.cos(rot) * 1.45), this.q2, this.one).premultiply(base));
    }
    R.poles.instanceMatrix.needsUpdate = true;
    R.arms.instanceMatrix.needsUpdate = true;
    R.heads.instanceMatrix.needsUpdate = true;
    this.falling = this.falling.filter((f) => !f.landed || (f.done = (f.done || 0) + 1) < 2);
  }
}
