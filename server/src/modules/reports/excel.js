// AExcelWrapper.CreateExcelDocument: header row, numeric columns as numbers, everything else as text
// (dates in the server culture). File name: "<Title>_dd-MMM-yyyy-hh-mm.xlsx" with spaces removed.
import ExcelJS from 'exceljs';
import { enInDateTime } from './format.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p = (n) => String(n).padStart(2, '0');

/** columns: [{name, type}], rows: arrays in column order. */
export async function sendXlsx(res, title, columns, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(columns.map((c) => c.name));
  const numeric = columns.map((c) => /int|decimal|numeric|money|float|real/i.test(c.type ?? ''));
  for (const r of rows) {
    ws.addRow(
      r.map((v, i) => {
        if (v === null || v === undefined) return numeric[i] ? null : '';
        if (numeric[i]) return Number.isFinite(Number(v)) ? Number(v) : null; // original skipped unparsable numbers
        if (v instanceof Date) return enInDateTime(v);
        if (Buffer.isBuffer(v)) return 'System.Byte[]';
        if (typeof v === 'boolean') return v ? 'True' : 'False';
        return String(v);
      }),
    );
  }
  const now = new Date();
  const stamp = `${p(now.getDate())}-${MON[now.getMonth()]}-${now.getFullYear()}-${p(now.getHours() % 12 || 12)}-${p(now.getMinutes())}`;
  const name = `${title}_${stamp}.xlsx`.replaceAll(' ', '');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.\-]/g, '_')}"`);
  await wb.xlsx.write(res);
  res.end();
}
