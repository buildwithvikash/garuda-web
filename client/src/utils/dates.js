/** A database date as the plant reads it (M/D/YYYY h:mm:ss AM). ISO strings are the server's wall-clock time, so they
 *  are formatted from their digits, not shifted to the browser's zone; anything else shows as sent. */
export function when(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(
    String(v ?? ""),
  );
  if (!m) return v ? String(v) : "-";
  const h = Number(m[4]);
  return `${Number(m[2])}/${Number(m[3])}/${m[1]} ${h % 12 || 12}:${m[5]}:${m[6]} ${h < 12 ? "AM" : "PM"}`;
}
