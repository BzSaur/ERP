import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularHorasPorPares, detectarCruceNocturno, salidaHuerfanaNocturna, minutoCorteNocturno } from './checadorImportService.js';

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

test('caso B: mar 15 -> mié 06, mié 16 -> 20. Corte a las 00:00 (9 h cumplidas), sin comida', () => {
  const mar = calcularHorasPorPares([ck('15:00')], { ...R, salidaNocturna: true, salidaNocturnaMin: 1440 + 360 });
  assert.equal(mar.corteNocturnoMin, 1440);
  assert.equal(mar.horasNormales, 9);
  assert.equal(mar.horasExtras, 0);
  const mie = calcularHorasPorPares([ck('06:00'), ck('16:00'), ck('20:00')], { ...R, entradaNocturnaMin: 0 });
  assert.equal(mie.horasNocturnas, 6);  // 00-06
  assert.equal(mie.horasNormales, 8);   // 00-06 (6) + 16-18 (2)
  assert.equal(mie.horasExtras, 2);     // 18-20
  assert.equal(mie.retardo, false);
});

test('corte nunca pasa la salida real: 17:00 -> 01:00 es todo jornada del día', () => {
  const lun = calcularHorasPorPares([ck('17:00')], { ...R, salidaNocturna: true, salidaNocturnaMin: 1440 + 60 });
  assert.equal(lun.corteNocturnoMin, 1500);
  assert.equal(lun.horasNormales, 8);
  const mar = calcularHorasPorPares([ck('01:00')], { ...R, entradaNocturnaMin: 60 });
  assert.equal(mar.horasTrabajadas, 0);
});

test('noches seguidas: recibe 00-06 y vuelve a entrar 16:00; sus 9 h propias se cortan a la 01:00', () => {
  const r = calcularHorasPorPares([ck('06:00'), ck('16:00')], { ...R, entradaNocturnaMin: 0, salidaNocturna: true });
  assert.equal(r.corteNocturnoMin, 1500);
  assert.equal(r.horasNocturnas, 6);
  assert.equal(r.horasNormales, 15);
  assert.equal(r.horasExtras, 0);
});

test('minutoCorteNocturno: 9 h cumplidas, nunca antes de 22:00; entrada >= 22:00 = hasta la salida real', () => {
  const c = (hhmm, extra = []) => minutoCorteNocturno([...extra, ck(hhmm)], R);
  assert.equal(c('08:00'), 22 * 60);           // 9 h a las 18:00 -> 22:00
  assert.equal(c('12:00'), 22 * 60);           // 12-14 + 15-22 = 9 h (comida)
  assert.equal(c('13:00'), 23 * 60);           // 13-14 + 15-23
  assert.equal(c('15:00'), 24 * 60);           // sin comida
  assert.equal(c('23:00'), 23 * 60 + 540);      // sin salida conocida: 9 h desde la entrada
  assert.equal(minutoCorteNocturno([ck('23:00')], { ...R, salidaRealMin: 1440 + 420 }), 1440 + 420);
  assert.equal(c('16:00', [ck('08:00'), ck('12:00')]), 22 * 60); // ya llevaba 4 h: 16-21 -> 22:00
  assert.equal(minutoCorteNocturno([ck('17:00')], { ...R, salidaRealMin: 1440 + 60 }), 1440 + 60); // 17+9 = 02:00 > salida 01:00
  assert.equal(minutoCorteNocturno([ck('08:00'), ck('18:00')], R), null); // nada abierto
  // emp 61, 30-oct: entra 20:02, cumple 9 h a las 05:00, sale 05:29. El tramo 05:00-05:29
  // vale 0 h redondeado: no se corta, la salida real queda en el día que entró.
  assert.equal(minutoCorteNocturno([ck('20:02')], { ...R, salidaRealMin: 1440 + 329 }), 1440 + 329);
  const d = calcularHorasPorPares([ck('20:02')], { ...R, salidaNocturna: true, salidaNocturnaMin: 1440 + 329 });
  assert.equal(d.horasTrabajadas, 9);
});

test('entrada después de las 22:00: todo el turno queda en el día que entró', () => {
  const lun = calcularHorasPorPares([ck('23:00')], { ...R, salidaNocturna: true, salidaNocturnaMin: 1440 + 420 });
  assert.equal(lun.corteNocturnoMin, 1440 + 420); // corte = salida real 07:00
  assert.equal(lun.horasNormales, 8);
  assert.equal(lun.horasExtras, 0);
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
  assert.ok(detectarCruceNocturno([at(0, '20:00')], [at(1, '06:57')]));
});

test('detección: sello solo entre 17:30 y 19:00 = olvidó la entrada, no se asume nocturna', () => {
  assert.equal(detectarCruceNocturno([at(0, '18:05')], [at(1, '07:00')]), null);
  assert.equal(detectarCruceNocturno([at(0, '17:30')], [at(1, '02:00')]), null);
  assert.ok(detectarCruceNocturno([at(0, '18:05')], [at(1, '07:00')], 'MANUAL')); // RH la convierte
  assert.ok(detectarCruceNocturno([at(0, '08:00'), at(0, '14:00'), at(0, '18:05')], [at(1, '02:00')])); // con más sellos sí
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
