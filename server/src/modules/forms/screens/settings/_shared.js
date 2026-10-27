// Helpers used by several screens of settings (ported from the original pages' shared code).


/** The pages' own RowDeleting: the row with that DataKey leaves the grid (nothing is deleted in the table). */
export async function gridRemove(h, gridId, field, keyValue) {
  const t = await h.table(gridId);
  const i = t.rows.findIndex((r) => t.get(r, field) === keyValue);
  return t.rows.filter((_, j) => j !== i);
}
