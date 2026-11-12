import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularHorasPorPares, calcularHorasDia, dedupChecadas, reglaToleranciaPorFecha, redondearSalida, minutosAHora
} from './checadorImportService.js';

const ck = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { hora: h, minuto: m, totalMinutos: h * 60 + m, horaStr: hhmm };
};
const R = { restrictivo: true, toleranciaMin: 10 };

test('regla por fecha: restrictiva desde el corte, no antes', () => {
  assert.equal(reglaToleranciaPorFecha(new Date(2026, 9, 18)).restrictivo, false);
  assert.equal(reglaToleranciaPorFecha(new Date(2026, 9, 19)).restrictivo, true);
});

test('redondearSalida: piso a la hora', () => {
  assert.equal(minutosAHora(redondearSalida(17 * 60 + 59)), '17:00');
  assert.equal(minutosAHora(redondearSalida(18 * 60)), '18:00');
});

test('entrada <=10 min baja a la hora, >10 sube; salida baja (08:10-18:50 = 9h netas)', () => {
  const r = calcularHorasPorPares([ck('08:10'), ck('18:50')], R);
  assert.equal(r.horasTrabajadas, 9); // 08:00 a 18:00 menos 1 h comida
  const tarde = calcularHorasPorPares([ck('08:11'), ck('18:00')], R);
  assert.equal(tarde.horasTrabajadas, 8); // 09:00 a 18:00 menos comida
});

test('sin salida = 0 horas (no se estima 18:00)', () => {
  assert.equal(calcularHorasPorPares([ck('08:00')], R).horasTrabajadas, 0);
  assert.equal(calcularHorasPorPares([ck('08:00'), ck('13:00'), ck('15:30')], R).horasTrabajadas, 5);
  assert.equal(calcularHorasDia([ck('08:00')], R).horasTrabajadas, 0);
});

test('reglas anteriores siguen estimando 18:00 sin salida', () => {
  assert.ok(calcularHorasDia([ck('08:00')], { toleranciaMin: 10 }).horasTrabajadas > 0);
});

test('dedup: checadas a menos de 20 min cuentan como una', () => {
  const out = dedupChecadas([ck('08:00'), ck('08:15'), ck('08:20'), ck('18:00')]);
  assert.deepEqual(out.map(c => c.horaStr), ['08:00', '08:20', '18:00']);
});

test('restrictivo: toda entrada pasa por la tolerancia, no solo la primera (día en horas enteras)', () => {
  // 2º par: 13:05 dentro de tolerancia -> 13:00; 13:12 fuera -> 14:00. Salidas a la hora.
  const dentro = calcularHorasPorPares([ck('08:00'), ck('12:30'), ck('13:05'), ck('18:20')], R);
  assert.equal(dentro.horasTrabajadas, 8); // 08-12 (4) + 13-18 menos comida (4)
  const fuera = calcularHorasPorPares([ck('08:00'), ck('12:30'), ck('13:12'), ck('18:20')], R);
  assert.equal(fuera.horasTrabajadas, 7); // 08-12 (4) + 14-18 menos comida (3)
  assert.equal(Number.isInteger(fuera.horasTrabajadas), true);
});

test('antes del corte: entradas posteriores siguen con la hora real', () => {
  const r = calcularHorasPorPares([ck('08:00'), ck('12:00'), ck('13:12'), ck('18:00')], { toleranciaMin: 10 });
  assert.equal(r.horasTrabajadas, 7.8); // 4 + (13:12-18:00 = 4:48 menos 1h comida = 3:48)
});
