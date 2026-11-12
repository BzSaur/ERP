import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarBonoPuntualidad } from './bonoPuntualidad.js';

// Semana lun 9 a dom 15 de nov 2026
const semana = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const habiles = semana.slice(0, 5);
const ent = (key, hhmm) => new Date(`${key}T${hhmm}:00`);
const todas = (hhmm) => new Map(habiles.map(k => [k, ent(k, hhmm)]));
const HOY = '2026-11-20';

test('lun-vie a las 08:00 o antes: aplica (sábado y domingo no cuentan)', () => {
  const r = evaluarBonoPuntualidad({ fechas: semana, entradas: todas('08:00'), hoy: HOY });
  assert.equal(r.aplica, true);
  assert.equal(evaluarBonoPuntualidad({ fechas: semana, entradas: todas('07:30'), hoy: HOY }).aplica, true);
});

test('un día a las 08:01 lo quita (sin tolerancia)', () => {
  const e = todas('07:55'); e.set('2026-11-11', ent('2026-11-11', '08:01'));
  const r = evaluarBonoPuntualidad({ fechas: semana, entradas: e, hoy: HOY });
  assert.equal(r.aplica, false);
  assert.deepEqual(r.fallas, [{ fecha: '2026-11-11', motivo: 'entró 08:01' }]);
});

test('cualquier ausencia en día hábil lo quita; festivo no cuenta', () => {
  const e = todas('07:55'); e.delete('2026-11-13');
  assert.equal(evaluarBonoPuntualidad({ fechas: semana, entradas: e, hoy: HOY }).aplica, false);
  const fest = evaluarBonoPuntualidad({ fechas: semana, entradas: e, hoy: HOY, esFestivo: k => k === '2026-11-13' });
  assert.equal(fest.aplica, true);
});

test('entrada nocturna (22:00 de la víspera) cuenta como a tiempo', () => {
  const e = todas('07:55'); e.set('2026-11-10', ent('2026-11-09', '22:00'));
  assert.equal(evaluarBonoPuntualidad({ fechas: semana, entradas: e, hoy: HOY }).aplica, true);
});

test('semana en curso: días por venir sin entrada = pendiente, no falla', () => {
  const e = new Map([['2026-11-09', ent('2026-11-09', '07:50')]]);
  const r = evaluarBonoPuntualidad({ fechas: semana, entradas: e, hoy: '2026-11-10' });
  assert.equal(r.aplica, false);
  assert.equal(r.pendiente, true);
  const tarde = new Map([['2026-11-09', ent('2026-11-09', '08:30')]]);
  assert.equal(evaluarBonoPuntualidad({ fechas: semana, entradas: tarde, hoy: '2026-11-10' }).pendiente, false);
});
