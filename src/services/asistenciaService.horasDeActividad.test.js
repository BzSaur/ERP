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
  assert.deepEqual(horasPorParesVista([ch(8), ch(12), ch(15)]), { real: 0, red: 0 });
});
