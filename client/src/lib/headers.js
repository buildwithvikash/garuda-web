// Column headers as people read them (display only: export and search keep the list's own names). Plain JS (no React),
// so the page scripts (scripts/page-texts.mjs) write the same texts a table shows.
const ACRONYMS = new Set(["QC", "BU", "UOM", "SO", "ID", "IP", "FG", "HSN", "ERP", "BOM", "RM", "PO", "NCMR", "SR"]);
const WHOLE = new Set(["BARCODE", "PASSCODE", "ZIPCODE"]); // words that only look like name + ending
const SUFFIXES = ["STATUS", "NAME", "CODE", "DATE", "TIME", "TYPE", "DESC", "QTY", "NO", "ID"];
/** one ALL-CAPS word split before a known ending: ORDERDATE -> ORDER DATE, CREATEDON -> CREATED ON */
function splitWord(w) {
  if (/^[A-Z]+ED(ON|BY)$/.test(w)) return [w.slice(0, -2), w.slice(-2)];
  if (WHOLE.has(w)) return [w];
  for (const s of SUFFIXES) {
    const rest = w.slice(0, -s.length);
    if (w.endsWith(s) && !ACRONYMS.has(w) && (rest.length >= 3 || ACRONYMS.has(rest))) return [...splitWord(rest), s];
  }
  return [w];
}
const word = (w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
/** "ORDERDATE" -> "Order Date", "PlanMaterial" -> "Plan Material", "QCSTATUS" -> "QC Status" */
export function prettyHeader(h) {
  const t = String(h ?? "").trim();
  if (!t) return t;
  const parts = /[a-z]/.test(t)
    ? t.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/\s+/) // BOMInput -> BOM Input
    : t.split(/[\s_]+/).flatMap(splitWord);
  return parts.filter(Boolean).map(word).join(" ");
}
