/** A table cell as plain text for export: the column's `text(row)`, else the raw field. */
export const textOf = (c, row) => {
  const v = c.text ? c.text(row) : row[c.key];
  return v === null || v === undefined ? '' : String(v);
};

/** Rows as a CSV file (opens in Excel) with the given columns ({ header, text?, key, export? }). */
export function downloadCsv(name, cols, rows) {
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const usable = cols.filter((c) => c.header && c.export !== false);
  const lines = [usable.map((c) => esc(c.header)).join(','), ...rows.map((r) => usable.map((c) => esc(textOf(c, r))).join(','))];
  // The byte-order mark makes Excel read the file as UTF-8.
  const blob = new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
