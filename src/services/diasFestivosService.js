/**
 * Festivos oficiales LFT (Art. 74), calculados por año. Sin tabla en BD:
 * la regla (fija o "n-ésimo lunes de mes") cambia mucho menos seguido que
 * lo que cambiaría una captura manual anual. Fechas a medianoche UTC, mismo
 * criterio que el resto del proyecto para columnas @db.Date.
 */

// n-ésimo lunes (1-indexado) de un mes. mes: 0-11 (como Date.getUTCMonth()).
function nEsimoLunes(anio, mes, n) {
  const d = new Date(Date.UTC(anio, mes, 1));
  const primerDiaSemana = d.getUTCDay(); // 0=domingo..6=sábado
  const diasHastaLunes = (8 - primerDiaSemana) % 7; // 0 si el día 1 ya es lunes
  const diaDelPrimerLunes = 1 + diasHastaLunes;
  return new Date(Date.UTC(anio, mes, diaDelPrimerLunes + (n - 1) * 7));
}

const fija = (anio, mes, dia) => new Date(Date.UTC(anio, mes, dia));

// Cache en memoria por año: evita recalcular "n-ésimo lunes" en cada consulta.
const cachePorAnio = new Map();

export function festivosDelAnio(anio) {
  if (cachePorAnio.has(anio)) return cachePorAnio.get(anio);

  const festivos = [
    fija(anio, 0, 1),           // 1 ene — Año Nuevo
    nEsimoLunes(anio, 1, 1),    // 1er lunes de febrero — Constitución
    nEsimoLunes(anio, 2, 3),    // 3er lunes de marzo — Natalicio de Juárez
    fija(anio, 4, 1),           // 1 mayo — Día del Trabajo
    fija(anio, 8, 16),          // 16 sep — Independencia
    nEsimoLunes(anio, 10, 3),   // 3er lunes de noviembre — Revolución
    fija(anio, 11, 25)          // 25 dic — Navidad
  ];

  // Transmisión del Poder Ejecutivo: 1 dic, solo en años de cambio de
  // sexenio. 2024 es año de transmisión; el ciclo repite cada 6 años
  // (2024, 2030, 2036...). anio % 6 === 2024 % 6, no === 0.
  if (anio % 6 === 2024 % 6) {
    festivos.push(fija(anio, 11, 1));
  }

  cachePorAnio.set(anio, festivos);
  return festivos;
}

export function esFestivo(fecha) {
  const d = new Date(fecha);
  const anio = d.getUTCFullYear();
  const ymd = anio * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  return festivosDelAnio(anio).some(f => {
    const fYmd = f.getUTCFullYear() * 10000 + (f.getUTCMonth() + 1) * 100 + f.getUTCDate();
    return fYmd === ymd;
  });
}
