import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarDiasHabiles, factorJornada } from './vacacionesController.js';

const d = s => new Date(s + 'T00:00:00Z');

test('contarDiasHabiles: lunes a viernes, misma semana, sin festivo', () => {
  assert.equal(contarDiasHabiles(d('2026-08-10'), d('2026-08-14')), 5);
});

test('contarDiasHabiles: excluye sábado y domingo', () => {
  assert.equal(contarDiasHabiles(d('2026-08-08'), d('2026-08-09')), 0);
});

test('contarDiasHabiles: excluye un festivo LFT entre semana', () => {
  // 14 sep 2026 lunes, 15 mar, 16 mié (festivo, Independencia), 17 jue, 18 vie.
  // L-V completo = 5 días hábiles - 1 festivo (miércoles) = 4.
  assert.equal(contarDiasHabiles(d('2026-09-14'), d('2026-09-18')), 4);
});

test('contarDiasHabiles: festivo entre semana resta exactamente 1', () => {
  // 28 dic 2026 lunes, 29 mar, 30 mié, 31 jue, 1 ene 2027 viernes (festivo).
  // L-V completo = 5 días hábiles - 1 festivo (viernes) = 4.
  assert.equal(contarDiasHabiles(d('2026-12-28'), d('2027-01-01')), 4);
});

test('factorJornada: tiempo completo o sin dato = 1', () => {
  assert.equal(factorJornada(45, 45), 1);
  assert.equal(factorJornada(48, 45), 1);
  assert.equal(factorJornada(null, 45), 1);
});

test('factorJornada: menos de jornada completa = la mitad', () => {
  assert.equal(factorJornada(20, 45), 0.5);
  assert.equal(factorJornada(44, 45), 0.5);
  assert.equal(Math.round(12 * factorJornada(20, 45)), 6);
});
