import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horasDeActividad, fmtMinutos, fmtTramo, actividadJustificaRetardo } from './asistenciaService.js';

const act = (ini, fin, extra = {}) => ({ horaInicio: ini, horaFin: fin, ...extra });
const hm = (h, m = 0) => h * 60 + m;
const checada = (h, m = 0) => new Date(2026, 9, 26, h, m);

test('tramo corto sin checada cuenta solo el tramo', () => {
  assert.equal(horasDeActividad(act(hm(16), hm(17)), null, null), 1);
});

test('sin tramo y sin checada = jornada fija 9h', () => {
  assert.equal(horasDeActividad(act(null, null), null, null), 9);
});

test('tramo nocturno que cruza medianoche cuenta completo', () => {
  assert.equal(horasDeActividad(act(hm(22), hm(26)), null, null), 4);
});

test('tramo nocturno con checada diurna se suma entero', () => {
  assert.equal(horasDeActividad(act(hm(22), hm(26)), checada(9), checada(18)), 4);
});

test('recurrente sin tramo + puntual 19-21 = 9 + 2', () => {
  const rec = act(null, null);
  const punt = act(hm(19), hm(21));
  assert.equal(horasDeActividad({ ...rec, todas: [rec, punt] }, null, null), 11);
});

test('dos tramos traslapados se fusionan', () => {
  const a = act(hm(16), hm(18));
  const b = act(hm(17), hm(19));
  assert.equal(horasDeActividad({ ...a, todas: [a, b] }, null, null), 3);
});

test('formato de tramo', () => {
  assert.equal(fmtMinutos(1560), '02:00');
  assert.equal(fmtTramo(hm(16), hm(17)), '16:00-17:00');
  assert.equal(fmtTramo(hm(22), 1560), '22:00-02:00 (+1)');
});

test('tramo posterior a la entrada no justifica retardo', () => {
  assert.equal(actividadJustificaRetardo(act(hm(22), 1560), checada(9)), false);
  assert.equal(actividadJustificaRetardo(act(null, null), checada(9)), true);
  assert.equal(actividadJustificaRetardo(act(hm(7), hm(8)), checada(9)), true);
});

test('horasPorParesVista: suma pares, hueco no cuenta; impar = 0', async () => {
  const { horasPorParesVista } = await import('./asistenciaService.js');
  const ch = (h, m = 0) => ({ ID_Checada: h * 100 + m, Origen_Sincronizacion: 'ADMS_PUSH', Fecha_Hora: new Date(2026, 9, 20, h, m) });
  const r = horasPorParesVista([ch(8), ch(12), ch(15), ch(18)]);
  assert.equal(r.real, 7);
  assert.equal(r.red, 7);
  // impar: par abierto no suma, pares cerrados sí
  assert.equal(horasPorParesVista([ch(8), ch(12), ch(15)]).real, 4);
  assert.deepEqual(horasPorParesVista([ch(8)]), { real: 0, red: 0, pares: [] });
  assert.deepEqual(r.pares.map(x => [x.e, x.s]), [[480, 720], [900, 1080]]);
});

test('horasPorParesVista: redondeado aplica tolerancia a cada entrada; real sin centésimas acumuladas', async () => {
  const { horasPorParesVista } = await import('./asistenciaService.js');
  const ch = (h, m = 0) => ({ ID_Checada: h * 100 + m, Origen_Sincronizacion: 'ADMS_PUSH', Fecha_Hora: new Date(2026, 9, 20, h, m) });
  const r = horasPorParesVista([ch(8), ch(12, 50), ch(13, 12), ch(18, 20)]);
  assert.equal(r.red, 7); // 08-12 + 14-18 menos comida
  // real: 4:50 + (13:12-18:20 = 5:08 - 1:00 comida) = 8:58 exactos
  assert.equal(Math.round(r.real * 60), 538);
});

test('aMinutos + repartirSemanal: total = suma de celdas; extra por semana en horas completas', async () => {
  const { aMinutos, repartirSemanal } = await import('./asistenciaService.js');
  // 5 días de 8:40 -> 43:20 exactos (antes: celdas 8.7 y total 43.4)
  const cincoDias = Array(5).fill(aMinutos(8 + 40 / 60));
  assert.equal(repartirSemanal(cincoDias).total * 60, 5 * 520);
  // 45:59 en la semana: los minutos sueltos no hacen extra
  const casi = repartirSemanal([45 * 60 + 59]);
  assert.equal(casi.extras, 0);
  assert.equal(casi.normales * 60, 45 * 60 + 59);
  // 47:30 -> 2h extra, 45:30 normales (Norm + Extra = Total)
  const r = repartirSemanal([47 * 60 + 30]);
  assert.equal(r.extras, 2);
  assert.equal((r.normales + r.extras) * 60, 47 * 60 + 30);
  // Dos semanas de 45h: 90h, cero extra (antes daba 45h extra)
  const dos = repartirSemanal([...Array(7).fill(0).map((_, i) => i === 0 ? 2700 : 0), 2700, 0, 0, 0, 0, 0, 0]);
  assert.equal(dos.total, 90);
  assert.equal(dos.extras, 0);
  assert.equal(dos.semanas, 2);
});

test('sábado sin hora de comida: 10-15 = 5 h (checada, actividad y calcularHorasPorPares)', async () => {
  const { horasPorParesVista } = await import('./asistenciaService.js');
  const { calcularHorasPorPares } = await import('./checadorImportService.js');
  // 2026-11-21 es sábado; 2026-11-20 viernes.
  const ch = (d, h) => ({ ID_Checada: d * 100 + h, Origen_Sincronizacion: 'ADMS_PUSH', Fecha_Hora: new Date(2026, 10, d, h) });
  assert.equal(horasPorParesVista([ch(21, 10), ch(21, 15)]).real, 5);
  assert.equal(horasPorParesVista([ch(20, 10), ch(20, 15)]).real, 4); // viernes sí descuenta
  assert.equal(horasDeActividad(act(hm(10), hm(15), { sinComida: true }), null, null), 5);
  assert.equal(horasDeActividad(act(hm(10), hm(15)), null, null), 4);
  const c = (h) => ({ hora: h, minuto: 0, totalMinutos: h * 60, horaStr: `${h}:00` });
  assert.equal(calcularHorasPorPares([c(10), c(15)], { esSabado: true }).horasTrabajadas, 5);
});

test('domingo sin hora de comida igual que sábado', async () => {
  const { horasPorParesVista } = await import('./asistenciaService.js');
  const { calcularHorasPorPares } = await import('./checadorImportService.js');
  // 2026-11-22 es domingo.
  const ch = (h) => ({ ID_Checada: h, Origen_Sincronizacion: 'ADMS_PUSH', Fecha_Hora: new Date(2026, 10, 22, h) });
  assert.equal(horasPorParesVista([ch(10), ch(15)]).real, 5);
  const c = (h) => ({ hora: h, minuto: 0, totalMinutos: h * 60, horaStr: `${h}:00` });
  assert.equal(calcularHorasPorPares([c(10), c(15)], { esDomingo: true }).horasTrabajadas, 5);
});
