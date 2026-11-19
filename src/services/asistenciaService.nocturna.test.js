import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entranteAplicada, horasNocturnas, turnoNocturnoPrevio, salidaEsCorte } from './asistenciaService.js';

// Mié 11-nov-2026 recibe la nocturna del martes. Fecha @db.Date llega 00:00Z.
const fila = (horaEntrada, checadas) => ({
  Fecha: new Date('2026-11-11T00:00:00Z'),
  Nocturna_Entrante: true,
  Hora_Entrada: horaEntrada,
  historial_checadas: checadas.map(h => ({ Fecha_Hora: h }))
});

test('tramo recibido con corte a medianoche o después también cuenta', () => {
  const a = fila(new Date(2026, 10, 11, 0, 0), [new Date(2026, 10, 11, 6, 20)]);
  assert.equal(entranteAplicada(a), true);
  assert.equal(horasNocturnas(a), 6); // salida baja a la hora completa
  const b = fila(new Date(2026, 10, 10, 22, 0), [new Date(2026, 10, 11, 6, 0)]);
  assert.equal(horasNocturnas(b), 8);
});

test('nocturna por confirmar: sin entrada o entrada propia después de la salida, no hay tramo', () => {
  assert.equal(entranteAplicada(fila(null, [new Date(2026, 10, 11, 6, 0)])), false);
  const propia = fila(new Date(2026, 10, 11, 16, 0), [new Date(2026, 10, 11, 6, 0), new Date(2026, 10, 11, 16, 0)]);
  assert.equal(entranteAplicada(propia), false);
  assert.equal(horasNocturnas(propia), 0);
});

test('entró 23:00 y salió 07:00: todo en el día que entró, 8 h nocturnas, salida real (no corte)', () => {
  const a = {
    Fecha: new Date('2026-11-10T00:00:00Z'), Nocturna_Estado: 'CONFIRMADA', Notas: '1 periodo(s) · nocturna',
    Hora_Entrada: new Date(2026, 10, 10, 23, 0), Hora_Salida: new Date(2026, 10, 11, 7, 0),
    historial_checadas: [{ Fecha_Hora: new Date(2026, 10, 10, 23, 0) }]
  };
  assert.equal(salidaEsCorte(a), false);
  assert.equal(horasNocturnas(a), 8);
  assert.equal(salidaEsCorte({ ...a, Notas: 'Corte de jornada · 1 periodo(s)' }), true);
});

test('día que solo cierra el turno de ayer: "Turno nocturno 8 h cumplidas"', () => {
  const a = {
    Nocturna_Entrante: true, Hora_Entrada: null, Hora_Salida: new Date(2026, 10, 11, 1, 0),
    Notas: 'Salida de turno nocturno cumplido (8 h)',
    historial_checadas: [{ Fecha_Hora: new Date(2026, 10, 11, 1, 0) }]
  };
  assert.deepEqual(turnoNocturnoPrevio(a), { salida: new Date(2026, 10, 11, 1, 0), horas: 8 });
  assert.equal(turnoNocturnoPrevio({ ...a, Notas: 'Salida de jornada nocturna por confirmar' }), null);
});
