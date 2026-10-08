import test from 'node:test';
import assert from 'node:assert/strict';
import { stepLevel, LEVELS, NADAR } from '../src/agua-nivel.js';

const { SECO, FONDO, CALLE } = LEVELS;
// simula `seg` segundos con lluvia constante
function run(level, rain, seg, diluvio = false) {
  for (let t = 0; t < seg; t += 0.1) level = stepLevel(level, rain, 0.1, diluvio);
  return level;
}

test('sin lluvia queda seco', () => {
  assert.equal(run(SECO, 0, 600), SECO);
});

test('con tormenta se llena primero el bajo nivel y después la calle', () => {
  const a = run(SECO, 1, 10);
  assert.ok(a > FONDO && a < CALLE, `a los 10 s el agua está en el bajo nivel (${a})`);
  const b = run(SECO, 1, 60);
  assert.ok(b > CALLE, `al minuto ya hay agua en la calle (${b})`);
});

test('una tormenta larga inunda hasta nadar; una lluvia común, hasta la rodilla', () => {
  assert.ok(run(SECO, 1, 300) > NADAR, 'con 5 minutos de tormenta no se hace pie');
  const comun = run(SECO, 0.55, 300);
  assert.ok(comun > 0.15 && comun < 0.6, `lluvia común: ${comun.toFixed(2)} m`);
});

test('el nivel tiene techo (no tapa las casas)', () => {
  assert.ok(run(SECO, 1, 3600) < 2.1);
});

test('cuando para de llover baja: primero la calle y al final se vacía el bajo nivel', () => {
  const lleno = run(SECO, 1, 300);
  const calle = run(lleno, 0, 420);
  assert.ok(calle < 0.2, `a los 7 minutos la calle ya casi no tiene agua (${calle.toFixed(2)})`);
  assert.equal(run(lleno, 0, 1800), SECO);
});

test('el diluvio sube mucho más rápido', () => {
  assert.ok(run(0.45 + CALLE, 1, 60, true) > NADAR);
});

test('"seco" queda abajo del fondo del bajo nivel (si no, habría agua sin llover)', () => {
  assert.ok(SECO < FONDO - 1, `SECO ${SECO} tiene que estar abajo del fondo ${FONDO}`);
  // con lluvia, el bajo nivel se llena desde el fondo
  assert.ok(Math.abs(stepLevel(SECO, 1, 0.01) - FONDO) < 0.05);
});
