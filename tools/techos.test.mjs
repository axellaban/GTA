import test from 'node:test';
import assert from 'node:assert/strict';
import { Techos } from '../src/techos.js';

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const city = {
  buildingList: [
    { ring: rect(0, 0, 10, 8), h: 3.3, kind: 'casa' },
    { ring: rect(20, 0, 30, 6), h: 3.3, kind: 'casa', pitched: true },
    { ring: rect(40, 0, 60, 12), h: 6.2, kind: 'galpon' },
    { ring: rect(70, 0, 80, 10), h: 30, kind: 'edificio' },
    { ring: rect(90, 0, 95, 5), h: 21, kind: 'iglesia' },
  ],
};

test('techo plano, a dos aguas y bóveda: la altura donde se para Gaspi', () => {
  const T = new Techos(city);
  assert.equal(T.at(5, 4).y, 3.3);
  assert.equal(T.at(-1, 4), null);
  // a dos aguas: la cumbrera al medio (a lo largo del lado más largo), más bajo en los bordes
  const top = T.at(25, 3).y;
  const edge = T.at(25, 0.2).y;
  assert.ok(top > 4.5 && top < 5.6, `cumbrera ${top}`);
  assert.ok(edge > 3.3 && edge < top - 1, `borde ${edge}`);
  // la bóveda de chapa del galpón: más alta al medio
  assert.ok(T.at(50, 6).y > T.at(50, 0.5).y + 1);
});

test('el piso del techo cuenta solo si se llega de un paso o se cae desde arriba', () => {
  const T = new Techos(city);
  assert.equal(T.floor(5, 4, 0.15), -Infinity); // en la vereda, al lado de la pared: no lo sube al techo
  assert.equal(T.floor(5, 4, 3.0), 3.3);
  assert.equal(T.floor(5, 4, 12), 3.3); // cayendo desde el helicóptero
});

test('la iglesia y las terrazas que ya tienen su piso no se repiten; una casa derrumbada no tiene techo', () => {
  const T = new Techos(city, [rect(69, -1, 81, 11)]);
  assert.equal(T.at(92, 2), null);
  assert.equal(T.at(75, 5), null);
  const c = { buildingList: [{ ring: rect(0, 0, 10, 8), h: 3.3, kind: 'casa' }] };
  const T2 = new Techos(c);
  c.buildingList[0].down = true;
  assert.equal(T2.at(5, 4), null);
});

test('un tiro de arriba queda en el techo; uno que pasa por encima no', () => {
  const T = new Techos(city);
  const dir = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
  // desde el helicóptero a 40 m, apuntando al medio de la casa
  const o = { x: 5, y: 40, z: -30 };
  const d = dir(0, 3.3 - 40, 34);
  const t = T.ray(o, d, 200);
  assert.ok(Math.abs(o.y + d.y * t - 3.3) < 1e-6 && Math.abs(o.z + d.z * t - 4) < 0.01, `t ${t}`);
  // por encima del techo, a la calle de atrás
  assert.equal(T.ray({ x: 5, y: 5, z: -10 }, dir(0, -0.05, 1), 200) < 30, false);
  // al techo a dos aguas, en la cumbrera
  const t2 = T.ray({ x: 25, y: 30, z: 3 }, { x: 0, y: -1, z: 0 }, 100);
  assert.ok(Math.abs(30 - t2 - T.at(25, 3).y) < 0.3);
});
