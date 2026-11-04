// WIP Capture: what the operator reads for a scan the station refuses (no database: tested on its own).

/** The words for a refused scan: here = { code, name } of this station's stage; route = the unit's stages in order,
 *  { code, name, status } (0 / 1 pending or in process, 2 done). */
export function pendingText(here, route) {
  const stage = here.name || 'this stage';
  const next = route.find((r) => r.status === 0 || r.status === 1);
  const mine = route.filter((r) => r.code === here.code);
  const now = next ? `It is now at: ${next.name}.` : 'All its stages are complete.';
  if (mine.some((r) => r.status === 2)) return { title: 'Already completed', text: `${stage} is already complete for this unit. ${now}` };
  if (!mine.length) return { title: "Not on this unit's route", text: `This unit does not go through ${stage}. ${now}` };
  return { title: 'Not at this stage yet', text: `This unit has not reached ${stage} yet. ${now}` };
}
