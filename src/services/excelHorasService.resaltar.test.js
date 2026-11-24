import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { resaltarCeldas } from './excelHorasService.js';

test('resaltarCeldas: amarillo + wrap en las celdas pedidas, conserva formato [h]:mm', () => {
  const ws = XLSX.utils.aoa_to_sheet([['CAMPO: instalación larga en cliente', 'x', 0.25], ['otra', 'y', 0.5]]);
  ws.C1.z = '[h]:mm'; ws.C2.z = '[h]:mm';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Horas');
  const out = resaltarCeldas(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }), ['A1', 'B1', 'C1']);

  const { CFB } = XLSX.default || XLSX;
  const cfb = CFB.read(out, { type: 'buffer' });
  const txt = (p) => Buffer.from(CFB.find(cfb, p).content).toString('utf8');
  const styles = txt('/xl/styles.xml');
  const xfs = styles.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  const lista = xfs[2].match(/<xf [^>]*?(\/>|>.*?<\/xf>)/g);
  assert.equal(Number(xfs[1]), lista.length);
  const sOf = (ref) => Number(txt('/xl/worksheets/sheet1.xml').match(new RegExp(`<c r="${ref}"(?: s="(\\d+)")?`))[1] || 0);
  const fillAmarillo = styles.match(/<fills count="(\d+)"/)[1] - 1;
  for (const ref of ['A1', 'C1']) {
    assert.match(lista[sOf(ref)], new RegExp(`fillId="${fillAmarillo}".*wrapText="1"`));
  }
  assert.equal(lista[sOf('C1')].match(/numFmtId="(\d+)"/)[1], lista[sOf('C2')].match(/numFmtId="(\d+)"/)[1]);
  assert.doesNotMatch(lista[sOf('A2')], /wrapText/);
  // El archivo sigue siendo legible y con los mismos datos.
  const re = XLSX.read(out, { type: 'buffer' });
  assert.equal(re.Sheets.Horas.A1.v, 'CAMPO: instalación larga en cliente');
});
