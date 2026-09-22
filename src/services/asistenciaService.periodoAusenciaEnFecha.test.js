import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodoAusenciaEnFecha, ausenciaEnFecha } from './asistenciaService.js';

const d = s => new Date(s + 'T00:00:00Z');

function mapaConVacaciones(empleadoId, desde, hasta) {
  const mapa = new Map();
  mapa.set(empleadoId, [{
    desde: Number(desde.replace(/-/g, '')),
    hasta: Number(hasta.replace(/-/g, '')),
    etiqueta: 'Vacaciones',
    creadaEn: new Date('2026-08-01T00:00:00Z'),
    conGoce: true
  }]);
  return mapa;
}

test('periodoAusenciaEnFecha: día normal con vacaciones activas devuelve Vacaciones', () => {
  const mapa = mapaConVacaciones(69, '2026-09-14', '2026-09-18');
  const p = periodoAusenciaEnFecha(mapa, 69, d('2026-09-14'));
  assert.equal(p.etiqueta, 'Vacaciones');
});

test('periodoAusenciaEnFecha: festivo LFT dentro del rango de vacaciones gana como Festivo', () => {
  // 16 sep 2026 (miércoles) es festivo y cae dentro del rango de vacaciones.
  const mapa = mapaConVacaciones(69, '2026-09-14', '2026-09-18');
  const p = periodoAusenciaEnFecha(mapa, 69, d('2026-09-16'));
  assert.equal(p.etiqueta, 'Festivo');
  assert.equal(p.conGoce, true);
});

test('ausenciaEnFecha: festivo sin ningún periodo registrado también se etiqueta', () => {
  const mapa = new Map(); // empleado sin vacaciones ni incidencias
  assert.equal(ausenciaEnFecha(mapa, 1, d('2026-01-01')), 'Festivo');
});

test('ausenciaEnFecha: día normal sin periodos devuelve null (no falso positivo)', () => {
  const mapa = new Map();
  assert.equal(ausenciaEnFecha(mapa, 1, d('2026-09-17')), null);
});

test('periodoAusenciaEnFecha: festivo con empleadoId sin entrada en el mapa igual gana', () => {
  const mapa = new Map();
  const p = periodoAusenciaEnFecha(mapa, 999, d('2026-05-01'));
  assert.equal(p.etiqueta, 'Festivo');
});
