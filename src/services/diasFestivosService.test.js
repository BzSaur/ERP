import { test } from 'node:test';
import assert from 'node:assert/strict';
import { festivosDelAnio, esFestivo } from './diasFestivosService.js';

const ymd = fecha => fecha.toISOString().slice(0, 10);

test('festivosDelAnio 2026 incluye las 4 fechas fijas', () => {
  const fechas = festivosDelAnio(2026).map(ymd);
  assert.ok(fechas.includes('2026-01-01'), 'Año Nuevo');
  assert.ok(fechas.includes('2026-05-01'), 'Día del Trabajo');
  assert.ok(fechas.includes('2026-09-16'), 'Independencia');
  assert.ok(fechas.includes('2026-12-25'), 'Navidad');
});

test('festivosDelAnio 2026: 1er lunes de febrero es el 2 de febrero', () => {
  const fechas = festivosDelAnio(2026).map(ymd);
  assert.ok(fechas.includes('2026-02-02'));
});

test('festivosDelAnio 2026: 3er lunes de marzo es el 16 de marzo', () => {
  const fechas = festivosDelAnio(2026).map(ymd);
  assert.ok(fechas.includes('2026-03-16'));
});

test('festivosDelAnio 2026: 3er lunes de noviembre es el 16 de noviembre', () => {
  const fechas = festivosDelAnio(2026).map(ymd);
  assert.ok(fechas.includes('2026-11-16'));
});

test('festivosDelAnio 2026: sin transmisión de poder (no es año de sexenio)', () => {
  const fechas = festivosDelAnio(2026).map(ymd);
  assert.equal(fechas.includes('2026-12-01'), false);
  assert.equal(fechas.length, 7);
});

test('festivosDelAnio 2024: SÍ incluye transmisión de poder (año de sexenio)', () => {
  const fechas = festivosDelAnio(2024).map(ymd);
  assert.ok(fechas.includes('2024-12-01'));
  assert.equal(fechas.length, 8);
});

test('festivosDelAnio 2030: siguiente sexenio también lo incluye', () => {
  const fechas = festivosDelAnio(2030).map(ymd);
  assert.ok(fechas.includes('2030-12-01'));
});

test('esFestivo reconoce el 16 de septiembre 2026', () => {
  assert.equal(esFestivo(new Date('2026-09-16T00:00:00Z')), true);
});

test('esFestivo rechaza un día laboral normal', () => {
  assert.equal(esFestivo(new Date('2026-09-17T00:00:00Z')), false);
});

test('esFestivo funciona en el límite entre años (31 dic vs 1 ene)', () => {
  assert.equal(esFestivo(new Date('2025-12-31T00:00:00Z')), false);
  assert.equal(esFestivo(new Date('2026-01-01T00:00:00Z')), true);
});
