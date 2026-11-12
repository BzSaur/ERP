import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularHorasPorPares, detectarCruceNocturno, salidaHuerfanaNocturna } from './checadorImportService.js';

const ck = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { hora: h, minuto: m, totalMinutos: h * 60 + m, horaStr: hhmm };
};
const R = { restrictivo: true, toleranciaMin: 10 };
// Checadas consolidadas: { Fecha_Hora } en hora local. Lunes 9-nov-2026.
const at = (dia, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { Fecha_Hora: new Date(2026, 10, 9 + dia, h, m) };
};

test('caso A: lun 08:00 -> mar 02:00. Lun normal 08-18 menos comida + extra 18-22; mar 4 h normales sin retardo', () => {
  const lun = calcularHorasPorPares([ck('08:00')], { ...R, salidaNocturna: true });
  assert.equal(lun.horasNormales, 9);
  assert.equal(lun.horasExtras, 4);
  assert.equal(lun.incompleta, false);
  const mar = calcularHorasPorPares([ck('02:00')], { ...R, entradaNocturnaMin: -120 });
  assert.equal(mar.horasNormales, 4);
  assert.equal(mar.horasExtras, 0);
  assert.equal(mar.retardo, false);
  assert.equal(mar.incompleta, false);
});

test('caso B: mar 15 -> mié 06, mié 16 -> 20', () => {
  const mar = calcularHorasPorPares([ck('15:00')], { ...R, salidaNocturna: true });
  assert.equal(mar.horasNormales, 3);
  assert.equal(mar.horasExtras, 4);
  const mie = calcularHorasPorPares([ck('06:00'), ck('16:00'), ck('20:00')], { ...R, entradaNocturnaMin: -120 });
  assert.equal(mie.horasNormales, 10); // 22-06 (8) + 16-18 (2)
  assert.equal(mie.horasExtras, 2);    // 18-20
  assert.equal(mie.retardo, false);
});

test('entrada después de las 22:00: todo cuenta al día siguiente', () => {
  const lun = calcularHorasPorPares([ck('23:00')], { ...R, salidaNocturna: true });
  assert.equal(lun.horasTrabajadas, 0);
  const mar = calcularHorasPorPares([ck('07:00')], { ...R, entradaNocturnaMin: 23 * 60 - 1440 });
  assert.equal(mar.horasTrabajadas, 8);
});

test('tramo nocturno no descuenta comida aunque salga después de las 15:00', () => {
  const r = calcularHorasPorPares([ck('16:00')], { ...R, entradaNocturnaMin: -120 });
  assert.equal(r.horasTrabajadas, 18);
});

test('detección: caso A y caso B se emparejan', () => {
  assert.ok(detectarCruceNocturno([at(0, '08:00')], [at(1, '02:00')]));
  assert.ok(detectarCruceNocturno([at(0, '08:00'), at(0, '14:00'), at(0, '15:00')], [at(1, '02:00')]));
  assert.ok(detectarCruceNocturno([at(0, '15:00')], [at(1, '06:00'), at(1, '16:00'), at(1, '20:00')]));
});

test('detección: olvidó salida y al día siguiente sella normal (par) no es nocturna', () => {
  const lun = [at(0, '08:00'), at(0, '14:00'), at(0, '15:00')];
  const mar = [at(1, '08:00'), at(1, '14:00'), at(1, '15:00'), at(1, '18:00')];
  assert.equal(detectarCruceNocturno(lun, mar), null);
});

test('detección: día cerrado, salida después de mediodía, gap > 24 h o RECHAZADA no cruzan', () => {
  assert.equal(detectarCruceNocturno([at(0, '08:00'), at(0, '18:00')], [at(1, '02:00')]), null);
  assert.equal(detectarCruceNocturno([at(0, '18:00')], [at(1, '13:00')]), null);
  assert.equal(detectarCruceNocturno([at(0, '05:00')], [at(1, '06:00')]), null); // 25 h
  assert.equal(detectarCruceNocturno([at(0, '08:00')], [at(1, '02:00')], 'RECHAZADA'), null);
});

test('detección: noches seguidas (sale 02:00 y vuelve a entrar 15:00 el mismo día)', () => {
  assert.ok(detectarCruceNocturno([at(0, '07:50')], [at(1, '02:00'), at(1, '15:00')]));
  assert.ok(detectarCruceNocturno([at(1, '15:00')], [at(2, '06:00'), at(2, '16:00'), at(2, '20:00')]));
});

test('detección: "salida" a las 07:30 o después parece llegada normal (olvidó salida), no nocturna', () => {
  assert.equal(detectarCruceNocturno([at(0, '09:35'), at(0, '14:00'), at(0, '15:00')], [at(1, '08:02')]), null);
  assert.equal(detectarCruceNocturno([at(0, '18:00')], [at(1, '07:35')]), null);
  assert.ok(detectarCruceNocturno([at(0, '18:00')], [at(1, '06:57')]));
});

test('detección: checada abierta en la noche + día siguiente normal de 2 checadas no es nocturna', () => {
  assert.equal(detectarCruceNocturno([at(0, '06:00'), at(0, '16:00'), at(0, '20:00')], [at(1, '07:55'), at(1, '18:00')]), null);
});

test('detección: MANUAL/CONFIRMADA fuerzan el cruce aunque D+1 no cuadre', () => {
  const lun = [at(0, '18:00')];
  const mar = [at(1, '06:00'), at(1, '12:00'), at(1, '13:00'), at(1, '18:00')];
  assert.equal(detectarCruceNocturno(lun, mar), null);
  assert.equal(detectarCruceNocturno(lun, mar, 'MANUAL'), mar[0]);
  assert.equal(detectarCruceNocturno(lun, mar, 'CONFIRMADA'), mar[0]);
});

test('detección: turno de 08:00 a 06:00 del día siguiente (22 h) se detecta', () => {
  assert.ok(detectarCruceNocturno([at(0, '08:00')], [at(1, '06:00')]));
});

test('salida huérfana: día 05:00 y 20:00 con salida 05:00 mañana = noche sin entrada + nueva noche', () => {
  const hoy = [at(0, '05:00'), at(0, '20:00')];
  const manana = [at(1, '05:00')];
  assert.equal(salidaHuerfanaNocturna(hoy, manana), hoy[0]);
  assert.equal(salidaHuerfanaNocturna(hoy, manana, 'RECHAZADA'), null); // RH dijo No: día normal
  // Turno de día normal (08:00-18:00) o día siguiente normal: no aplica
  assert.equal(salidaHuerfanaNocturna([at(0, '08:00'), at(0, '18:00')], manana), null);
  assert.equal(salidaHuerfanaNocturna(hoy, [at(1, '08:00'), at(1, '18:00')]), null);
});
